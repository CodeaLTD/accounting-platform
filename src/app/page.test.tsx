import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "./messages";
import Home from "./page";

// jsdom's File/Blob implementation doesn't implement arrayBuffer() (as of
// jsdom 26 in this project's test setup), but page.tsx calls
// `file.arrayBuffer()` — a standard, real-browser-supported API. Polyfill it
// here via FileReader (same technique already used in
// src/components/DownloadButton.test.tsx) so the app code under test can run
// unmodified; this is a test-environment gap, not an application bug.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

function loadSampleFile(): File {
  const buffer = readFileSync(
    path.join(process.cwd(), "Invoice Details Inquiry.xls"),
  );
  return new File([buffer], "Invoice Details Inquiry.xls", {
    type: "application/vnd.ms-excel",
  });
}

// Real header row from "Invoice Details Inquiry.xls" — used to build minimal
// synthetic workbooks for the empty-file and unrecognized-structure cases,
// so those two error paths don't depend on hand-maintained second copies of
// a real invoice file.
const SOURCE_HEADER = [
  "Customer Code",
  "Document type",
  "Order number",
  "Customer order number",
  "Subline number",
  "Invoice Number",
  "Invoice line",
  "Invoice Date",
  "Invoice due date",
  "Delivery document",
  "Delivery document date",
  "Part Number",
  "Part description",
  "Carrier Code",
  "Carrier Name",
  "Manufactured code",
  "Country of Origin",
  "Supersessions ",
  "Warehouse (shipping)",
  "Unit net weight",
  "Invoiced quantity",
  "Unit list price",
  "Unit net price",
  "Total invoice VAT",
  "Total invoice amount",
  "Surcharges: the sum of all surcharges for each line",
  "Cur",
  "Case Number",
  "Custom Code",
];

function buildXlsxFile(
  rows: (string | number)[][],
  fileName: string,
): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as Uint8Array<ArrayBuffer>;
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function fillConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.partnerCountry),
    "IT",
  );
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.modeOfTransport),
    "3",
  );
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
    "SZR",
  );
}

describe("Home page", () => {
  let capturedBlob: Blob | null;

  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => {},
    );
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock-url";
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an uploaded file and lets the user edit before download", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });
    // Confirmed golden-dataset value for row 1 — see src/core/mapping.test.ts.
    expect(screen.getByLabelText("Страна на проиозход row 1")).toHaveValue(
      "FR",
    );

    const commodityCodeInput = screen.getByLabelText("Код на стоката row 1");
    await user.clear(commodityCodeInput);
    await user.type(commodityCodeInput, "11111111");

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "11111111",
    );
    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();

    await user.click(downloadButton);

    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const arrayBuffer = await capturedBlob!.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    // Row 0 is the header row; row 1's commodity code column (index 1) must
    // reflect the edit made above, proving the downloaded bytes actually
    // contain the edited data rather than the original mapped value.
    expect(rows[1][1]).toBe("11111111");
  });

  it("shows a plain-language error for a non-Excel file", async () => {
    // applyAccept: false — a real browser's native file picker would hide a
    // .txt file given accept=".xls,.xlsx" before the user could even select
    // it; userEvent.upload() replicates that OS-level filtering by default
    // and silently drops the file (no change event at all). This test wants
    // to exercise FileInput's own JS-level extension check instead, so the
    // OS-level simulation is turned off — this doesn't touch app behavior.
    const user = userEvent.setup({ applyAccept: false });
    render(<Home />);
    await fillConfig(user);

    const badFile = new File(["not excel"], "notes.txt", {
      type: "text/plain",
    });
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      badFile,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      MESSAGES.errors.invalidFileType,
    );
  });

  it("shows a plain-language error for a file with no data rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const emptyFile = buildXlsxFile([SOURCE_HEADER], "empty.xlsx");
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      emptyFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.emptyFile,
      );
    });
  });

  it("shows a plain-language error for a file with the wrong columns", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const malformedFile = buildXlsxFile(
      [["Not", "The", "Right", "Columns"], ["a", "b", "c", "d"]],
      "malformed.xlsx",
    );
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      malformedFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.unrecognizedStructure,
      );
    });
  });

  it("disables the file input until all config fields are filled in", () => {
    render(<Home />);
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });

  it("disables the download button and shows a message while a numeric cell is blank, then re-enables it once fixed", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });

    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();

    const netWeightInput = screen.getByLabelText("Нето тегло в кг row 1");
    await user.clear(netWeightInput);

    expect(downloadButton).toBeDisabled();
    expect(
      screen.getByText(MESSAGES.errors.invalidNumericValue),
    ).toBeInTheDocument();

    await user.type(netWeightInput, "20");

    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();
  });
});
