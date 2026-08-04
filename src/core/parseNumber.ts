/**
 * Parses numbers formatted with Bulgarian/European conventions: "." as thousands
 * separator, "," as decimal separator (e.g. "3.913,5" -> 3913.5, "15,000" -> 15).
 *
 * Cells the spreadsheet already stores as real numbers are returned untouched.
 * Stringifying one first would be actively wrong: the genuine decimal 1.185
 * becomes the string "1.185", whose "." then reads as a thousands separator and
 * parses to 1185. The reference "Invoice Details Inquiry.xls" happens to store
 * every numeric column as text, so that path never fires today — but one re-save
 * as .xlsx, or one ERP export change, would otherwise put weights and values off
 * by three orders of magnitude into a submitted declaration, silently.
 */
/**
 * Strips a locale's thousands separator and swaps its comma decimal
 * separator for a dot, producing a string JS can parse as a number. Shared
 * by parseBgNumber (spreadsheet cells, "." thousands separator) and the
 * declaration table's numeric inputs (typed/pasted text, U+00A0 thousands
 * separator) — the two contexts use different thousands separators, so
 * callers supply their own.
 */
export function toStandardDecimal(
  raw: string,
  thousandsSeparator: RegExp,
): string {
  return raw.replace(thousandsSeparator, "").replace(",", ".");
}

export function parseBgNumber(raw: string | number): number {
  if (typeof raw === "number") {
    return raw;
  }
  return parseFloat(toStandardDecimal(raw, /\./g));
}
