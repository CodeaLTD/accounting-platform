import type { IntrastatDeclarationLine } from "./types";

// Numeric fields that must always hold a real number before export. A blank
// cell is stored as NaN (see DeclarationTable.tsx) rather than being coerced to 0,
// so we must scan for that before allowing an export — an exported `<v>NaN</v>`
// would make Excel flag the file as needing repair.
// supplementaryQuantity is deliberately excluded: it's also editable and
// also stores NaN when blank, but staying blank is a genuinely valid,
// common case for it (unlike the fields below), so it never blocks download.
const NUMERIC_FIELDS = [
  "netWeightKg",
  "value",
  "statisticalValue",
] as const satisfies readonly (keyof IntrastatDeclarationLine)[];

export function hasInvalidNumericValue(
  lines: IntrastatDeclarationLine[],
): boolean {
  return lines.some((line) =>
    NUMERIC_FIELDS.some((field) => Number.isNaN(line[field])),
  );
}
