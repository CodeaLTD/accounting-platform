"use client";

import { useState } from "react";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
  type ConfigFormValue,
} from "@/components/ConfigForm";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FileInput } from "@/components/FileInput";
import { ReviewTable } from "@/components/ReviewTable";
import { parseSourceInvoiceWorkbook } from "@/core/importXlsx";
import { mapInvoiceLinesToDeclaration } from "@/core/mapping";
import type { IntrastatDeclarationLine } from "@/core/types";
import { hasInvalidNumericValue } from "@/core/validateLines";
import { MESSAGES } from "./messages";

export default function Home() {
  const [configValue, setConfigValue] = useState<ConfigFormValue>(
    EMPTY_CONFIG_FORM_VALUE,
  );
  const [lines, setLines] = useState<IntrastatDeclarationLine[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    if (!isConfigComplete(configValue)) return;
    try {
      const buffer = await file.arrayBuffer();
      const sourceLines = parseSourceInvoiceWorkbook(buffer);
      if (sourceLines.length === 0) {
        setError(MESSAGES.errors.emptyFile);
        setLines(null);
        return;
      }
      setLines(mapInvoiceLinesToDeclaration(sourceLines, configValue));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(MESSAGES.errors.unrecognizedStructure);
      setLines(null);
    }
  }

  function handleInvalidFileType() {
    setError(MESSAGES.errors.invalidFileType);
    setLines(null);
  }

  const hasInvalidValues = lines !== null && hasInvalidNumericValue(lines);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <ConfigForm value={configValue} onChange={setConfigValue} />
      <FileInput
        disabled={!isConfigComplete(configValue)}
        onFileSelected={handleFileSelected}
        onInvalidFileType={handleInvalidFileType}
      />
      <ErrorBanner message={error} />
      {lines && (
        <>
          <ReviewTable lines={lines} onChange={setLines} />
          <DownloadButton lines={lines} disabled={hasInvalidValues} />
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
