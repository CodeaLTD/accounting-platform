import { readFileSync } from "node:fs";
import path from "node:path";
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
