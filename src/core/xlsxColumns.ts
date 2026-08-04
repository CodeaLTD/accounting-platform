export function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, " ");
}

/** A cell as XLSX.read (with cellDates: true) may hand it back: text, a
 * genuine number, or a genuine date. */
export type SheetCell = string | number | Date;

export type RawColumnReader = (row: SheetCell[], name: string) => SheetCell;

export type ColumnReader = (row: SheetCell[], name: string) => string;

/**
 * Column lookup by header name, tolerant of stray/doubled whitespace in the
 * source file. Returns the cell as the sheet stored it — a string stays a
 * string, a number stays a number — so numeric parsing can tell the two apart
 * (see parseBgNumber). Use makeColumnReader for text columns.
 */
export function makeRawColumnReader(header: SheetCell[]): RawColumnReader {
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const key = normalizeHeader(String(h));
    if (!index.has(key)) index.set(key, i);
  });
  return (row, name) => {
    const idx = index.get(normalizeHeader(name));
    if (idx === undefined) {
      throw new Error(`Column not found: "${name}"`);
    }
    return row[idx] ?? "";
  };
}

/** As makeRawColumnReader, but coerces the cell to a string. */
export function makeColumnReader(header: SheetCell[]): ColumnReader {
  const readRaw = makeRawColumnReader(header);
  return (row, name) => String(readRaw(row, name));
}
