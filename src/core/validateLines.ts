import type { IntrastatDeclarationLine } from "./types";

// Numeric fields the accountant edits directly in the review table. A blank
// cell is stored as NaN (see ReviewTable.tsx) rather than being coerced to 0,
// so we must scan for that before allowing an export — an exported `<v>NaN</v>`
// would make Excel flag the file as needing repair.
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
