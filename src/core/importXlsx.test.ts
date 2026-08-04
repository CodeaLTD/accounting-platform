import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseSourceInvoiceWorkbook } from "./importXlsx";

const FILE_PATH = path.join(
  process.cwd(),
  "Invoice Details Inquiry.xls",
);

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe("parseSourceInvoiceWorkbook", () => {
  it("parses identically from a Buffer and from an ArrayBuffer", () => {
    const buffer = readFileSync(FILE_PATH);
    const fromBuffer = parseSourceInvoiceWorkbook(buffer);
    const fromArrayBuffer = parseSourceInvoiceWorkbook(
      toArrayBuffer(buffer),
    );

    expect(fromArrayBuffer).toHaveLength(14);
    expect(fromArrayBuffer).toEqual(fromBuffer);
  });

  it("throws when the requested sheet doesn't exist", () => {
    const buffer = readFileSync(FILE_PATH);
    expect(() =>
      parseSourceInvoiceWorkbook(buffer, { sheetName: "Nope" }),
    ).toThrow('Sheet not found: "Nope"');
  });
});

// Real header row from "Invoice Details Inquiry.xls". Every column is read by
// the parser, so a synthetic workbook has to carry all of them.
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

/** Builds a one-data-row workbook, overriding columns by header name. */
function buildWorkbook(
  overrides: Record<string, string | number | Date>,
): ArrayBuffer {
  const row = SOURCE_HEADER.map((name) => overrides[name] ?? "");
  const sheet = XLSX.utils.aoa_to_sheet([SOURCE_HEADER, row]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  // SheetJS returns an ArrayBuffer for type: "array" (not a typed array), which
  // is exactly what parseSourceInvoiceWorkbook takes from File.arrayBuffer().
  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
}

// Regression for a silent 1000x corruption: numeric columns used to be
// stringified before parsing, so a cell genuinely holding 1.185 became the
// string "1.185", whose "." then read as a thousands separator -> 1185. The
// reference .xls stores these columns as text, so the golden-dataset test
// never exercised this path; a workbook re-saved as .xlsx would have.
describe("parseSourceInvoiceWorkbook with real numeric cells", () => {
  it("does not treat a genuine decimal point as a thousands separator", () => {
    const [line] = parseSourceInvoiceWorkbook(
      buildWorkbook({
        "Unit net weight": 1.185,
        "Invoiced quantity": 10,
        "Unit net price": 110.98,
        "Total invoice amount": 3913.5,
        "Custom Code": "8421298090 - 8090",
      }),
    );

    expect(line.unitNetWeightKg).toBe(1.185);
    expect(line.invoicedQuantity).toBe(10);
    expect(line.unitNetPrice).toBe(110.98);
    expect(line.totalInvoiceAmount).toBe(3913.5);
  });

  it("still reads Bulgarian-formatted text cells the same way", () => {
    const [line] = parseSourceInvoiceWorkbook(
      buildWorkbook({
        "Unit net weight": "1,185",
        "Invoiced quantity": "10",
        "Unit net price": "110,98",
        "Total invoice amount": "3.913,5",
      }),
    );

    expect(line.unitNetWeightKg).toBe(1.185);
    expect(line.invoicedQuantity).toBe(10);
    expect(line.unitNetPrice).toBe(110.98);
    expect(line.totalInvoiceAmount).toBe(3913.5);
  });
});

// Regression: the same String()-before-parsing corruption that hit numeric
// cells applies to dates. The reference .xls stores date columns as text, so
// this path never fires today — but a genuine Excel date cell would
// stringify straight to its raw serial number (e.g. "45871") without
// cellDates: true and a date-aware reader.
describe("parseSourceInvoiceWorkbook with a real date cell", () => {
  it("formats a genuine Excel date instead of emitting its serial number", () => {
    const [line] = parseSourceInvoiceWorkbook(
      buildWorkbook({
        "Invoice Date": new Date(Date.UTC(2026, 0, 15)),
        "Custom Code": "8421298090 - 8090",
      }),
    );

    expect(line.invoiceDate).toBe("2026-01-15");
  });

  it("still reads a text-stored date the same way", () => {
    const [line] = parseSourceInvoiceWorkbook(
      buildWorkbook({
        "Invoice Date": "15.01.2026",
      }),
    );

    expect(line.invoiceDate).toBe("15.01.2026");
  });
});
