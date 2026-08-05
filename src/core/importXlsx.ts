import * as XLSX from "xlsx";
import { parseBgNumber } from "./parseNumber";
import type { SourceInvoiceLine } from "./types";
import {
  makeRawColumnReader,
  type RawColumnReader,
  type SheetCell,
} from "./xlsxColumns";

/**
 * Parses a source invoice workbook (same structure as the accountant's
 * "Invoice Details Inquiry.xls" reference file) into normalized line items.
 * Columns are matched by header name, not position, so column reordering in
 * the source file won't silently produce wrong data.
 */
export function parseSourceInvoiceWorkbook(
  data: Buffer | ArrayBuffer,
  options?: { sheetName?: string },
): SourceInvoiceLine[] {
  const workbook =
    data instanceof ArrayBuffer
      ? XLSX.read(new Uint8Array(data), {
          type: "array",
          codepage: 1251,
          cellDates: true,
        })
      : XLSX.read(data, { type: "buffer", codepage: 1251, cellDates: true });
  const sheetName = options?.sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: "${sheetName}"`);
  }

  const rows = XLSX.utils.sheet_to_json<SheetCell[]>(sheet, {
    header: 1,
    defval: "",
  });
  const [header, ...dataRows] = rows;
  const rawCol = makeRawColumnReader(header);

  return dataRows
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => rowToSourceInvoiceLine(row, rawCol));
}

function rowToSourceInvoiceLine(
  row: SheetCell[],
  rawCol: RawColumnReader,
): SourceInvoiceLine {
  const c = (name: string) => String(rawCol(row, name));
  // Numeric columns read the raw cell, not the stringified one — see
  // parseBgNumber for why stringifying a genuine number first corrupts it.
  const n = (name: string) => parseBgNumber(rawCol(row, name) as string | number);
  // Same reasoning applies to dates: today's reference file stores these as
  // text, but a genuine Excel date cell (cellDates: true, above) comes back
  // as a Date, not a string — stringifying that directly would emit its
  // full Date#toString() rather than a plain date.
  const d = (name: string) => {
    const value = rawCol(row, name);
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);
  };
  return {
    customerCode: c("Customer Code"),
    documentType: c("Document type"),
    orderNumber: c("Order number"),
    customerOrderNumber: c("Customer order number"),
    sublineNumber: c("Subline number"),
    invoiceNumber: c("Invoice Number"),
    invoiceLine: c("Invoice line"),
    invoiceDate: d("Invoice Date"),
    invoiceDueDate: d("Invoice due date"),
    deliveryDocument: c("Delivery document"),
    deliveryDocumentDate: d("Delivery document date"),
    partNumber: c("Part Number"),
    partDescription: c("Part description"),
    carrierCode: c("Carrier Code"),
    carrierName: c("Carrier Name"),
    manufacturedCode: c("Manufactured code"),
    countryOfOrigin: c("Country of Origin"),
    supersessions: c("Supersessions"),
    warehouse: c("Warehouse (shipping)"),
    unitNetWeightKg: n("Unit net weight"),
    invoicedQuantity: n("Invoiced quantity"),
    unitListPrice: n("Unit list price"),
    unitNetPrice: n("Unit net price"),
    totalInvoiceVat: n("Total invoice VAT"),
    totalInvoiceAmount: n("Total invoice amount"),
    surcharges: n("Surcharges: the sum of all surcharges for each line"),
    currency: c("Cur"),
    caseNumber: c("Case Number"),
    customsCode: c("Custom Code"),
  };
}
