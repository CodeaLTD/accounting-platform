"use client";

import { useMemo, useState } from "react";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
  type ConfigFormValue,
} from "@/components/ConfigForm";
import { DeclarationTable } from "@/components/DeclarationTable";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FileInput } from "@/components/FileInput";
import { SearchBar } from "@/components/SearchBar";
import { parseSourceInvoiceWorkbook } from "@/core/importXlsx";
import { mapInvoiceLinesToDeclaration } from "@/core/mapping";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { hasInvalidNumericValue } from "@/core/validateLines";
import { MESSAGES } from "./messages";

type View = "working" | "final";

export default function Home() {
  const [configValue, setConfigValue] = useState<ConfigFormValue>(
    EMPTY_CONFIG_FORM_VALUE,
  );
  const [workingLines, setWorkingLines] = useState<WorkingLine[] | null>(
    null,
  );
  const [finalLines, setFinalLines] = useState<WorkingLine[]>([]);
  const [view, setView] = useState<View>("working");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    if (!isConfigComplete(configValue)) return;
    if (workingLines && workingLines.length > 0) {
      const confirmed = window.confirm(
        MESSAGES.confirmations.discardUnaddedRows(workingLines.length),
      );
      if (!confirmed) return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const sourceLines = parseSourceInvoiceWorkbook(buffer);
      if (sourceLines.length === 0) {
        setError(MESSAGES.errors.emptyFile);
        return;
      }
      const mapped = mapInvoiceLinesToDeclaration(sourceLines, configValue);
      // Relies on mapInvoiceLinesToDeclaration returning a 1:1,
      // order-preserving mapping of sourceLines (a bare .map with no
      // filtering) — if that ever changes, this zip by index would
      // silently misalign invoice numbers with their lines.
      const nextWorkingLines: WorkingLine[] = mapped.map((line, i) => ({
        ...line,
        invoiceNumber: sourceLines[i].invoiceNumber,
      }));
      setWorkingLines(nextWorkingLines);
      setError(null);
      setSearchQuery("");
      setView("working");
    } catch (err) {
      console.error(err);
      setError(MESSAGES.errors.unrecognizedStructure);
    }
  }

  function handleInvalidFileType() {
    setError(MESSAGES.errors.invalidFileType);
  }

  function toggleView() {
    setView((v) => (v === "working" ? "final" : "working"));
  }

  // Recomputing this by scanning workingLines on every render — including
  // every keystroke in any single cell's edit, since an edit produces a
  // new workingLines array reference — is wasted work once a file has a
  // few thousand rows. Only actually needs to change when the data or the
  // search query changes.
  const filteredIndices = useMemo(
    () =>
      workingLines
        ? workingLines
            .map((_, i) => i)
            .filter((i) =>
              workingLines[i].invoiceNumber
                .toLowerCase()
                .includes(searchQuery.trim().toLowerCase()),
            )
        : [],
    [workingLines, searchQuery],
  );
  const filteredWorkingLines = useMemo(
    () => filteredIndices.map((i) => workingLines![i]),
    [filteredIndices, workingLines],
  );

  function handleWorkingLineChange(
    displayIndex: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    const originalIndex = filteredIndices[displayIndex];
    setWorkingLines((prev) =>
      prev!.map((line, i) =>
        i === originalIndex ? { ...line, ...patch } : line,
      ),
    );
  }

  function handleFinalLineChange(
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    setFinalLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function handleAddRow(displayIndex: number) {
    if (!workingLines) return;
    const originalIndex = filteredIndices[displayIndex];
    const line = workingLines[originalIndex];
    setFinalLines((prev) => [...prev, line]);
    setWorkingLines((prev) => prev!.filter((_, i) => i !== originalIndex));
  }

  function handleAddAllVisible() {
    if (!workingLines) return;
    const indicesToAdd = new Set(filteredIndices);
    if (indicesToAdd.size === 0) return;
    const toAdd = workingLines.filter((_, i) => indicesToAdd.has(i));
    setFinalLines((prev) => [...prev, ...toAdd]);
    setWorkingLines((prev) => prev!.filter((_, i) => !indicesToAdd.has(i)));
  }

  function handleRemoveRow(index: number) {
    const line = finalLines[index];
    // Prepend (not append) so the restored row reappears at the top of the
    // working table — immediately visible without scrolling past the rest.
    setWorkingLines((prev) => (prev ? [line, ...prev] : [line]));
    setFinalLines((prev) => prev.filter((_, i) => i !== index));
  }

  const hasInvalidValues = hasInvalidNumericValue(finalLines);

  // The declaration table's columns are wide enough that a centered
  // max-w-5xl box (right for the config/upload screen) leaves a large dead
  // margin on the left once a table is showing. Widen the container to use
  // most of the viewport only while a table is actually on screen; the
  // config/upload-only state keeps the narrower centered layout.
  const showingTable =
    (view === "working" && workingLines) || view === "final";

  return (
    <main
      className={
        showingTable
          ? "mx-auto flex w-full max-w-full flex-col gap-6 p-8"
          : "mx-auto flex max-w-5xl flex-col gap-6 p-8"
      }
    >
      <ConfigForm value={configValue} onChange={setConfigValue} />
      <FileInput
        disabled={!isConfigComplete(configValue)}
        onFileSelected={handleFileSelected}
        onInvalidFileType={handleInvalidFileType}
      />
      {view === "working" && workingLines && (
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      )}
      <ErrorBanner message={error} />
      <button
        type="button"
        onClick={toggleView}
        className="self-start cursor-pointer rounded-md bg-gray-200 px-4 py-2"
      >
        {view === "working"
          ? MESSAGES.labels.viewFinalTableButton
          : MESSAGES.labels.viewWorkingTableButton}
      </button>
      {view === "working" && workingLines && (
        <>
          <button
            type="button"
            onClick={handleAddAllVisible}
            disabled={filteredWorkingLines.length === 0}
            className="self-start cursor-pointer rounded-md bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {MESSAGES.labels.addAllButton}
          </button>
          <DeclarationTable
            lines={filteredWorkingLines}
            onLineChange={handleWorkingLineChange}
            showInvoiceNumber
            renderRowAction={(index) => (
              <button
                type="button"
                aria-label={`${MESSAGES.labels.addRowButton} ${index + 1}`}
                onClick={() => handleAddRow(index)}
                className="cursor-pointer text-2xl font-bold leading-none text-green-600 hover:text-green-700"
              >
                +
              </button>
            )}
          />
        </>
      )}
      {view === "final" && (
        <>
          <DeclarationTable
            lines={finalLines}
            onLineChange={handleFinalLineChange}
            showInvoiceNumber={false}
            renderRowAction={(index) => (
              <button
                type="button"
                aria-label={`${MESSAGES.labels.removeRowButton} ${index + 1}`}
                onClick={() => handleRemoveRow(index)}
                className="cursor-pointer text-2xl font-bold leading-none text-red-600 hover:text-red-700"
              >
                −
              </button>
            )}
          />
          <DownloadButton lines={finalLines} disabled={hasInvalidValues} />
          {hasInvalidValues && (
            <p role="alert" className="text-sm text-red-600">
              {MESSAGES.errors.invalidNumericValue}
            </p>
          )}
        </>
      )}
    </main>
  );
}
