export function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, " ");
}

/** Column lookup by header name, tolerant of stray/doubled whitespace in the source file. */
export function makeColumnReader(header: (string | number)[]) {
  const normalized = header.map((h) => normalizeHeader(String(h)));
  return (row: (string | number)[], name: string): string => {
    const idx = normalized.indexOf(normalizeHeader(name));
    if (idx === -1) {
      throw new Error(`Column not found: "${name}"`);
    }
    return String(row[idx] ?? "");
  };
}
