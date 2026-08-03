/**
 * Parses numbers formatted with Bulgarian/European conventions: "." as thousands
 * separator, "," as decimal separator (e.g. "3.913,5" -> 3913.5, "15,000" -> 15).
 */
export function parseBgNumber(raw: string): number {
  const normalized = raw.replaceAll(".", "").replace(",", ".");
  return parseFloat(normalized);
}
