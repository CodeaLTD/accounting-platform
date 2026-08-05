import { describe, expect, it } from "vitest";
import { parseBgNumber } from "./parseNumber";

describe("parseBgNumber", () => {
  it("reads Bulgarian-formatted text cells", () => {
    expect(parseBgNumber("15,000")).toBe(15);
    expect(parseBgNumber("1,185")).toBe(1.185);
    expect(parseBgNumber("3.913,5")).toBe(3913.5);
    expect(parseBgNumber("0,085")).toBe(0.085);
    expect(parseBgNumber("934")).toBe(934);
  });

  it("handles more than one thousands separator", () => {
    expect(parseBgNumber("1.234.567,89")).toBe(1234567.89);
  });

  // Regression: stringifying a genuine number first made its decimal point
  // read as a thousands separator, so 1.185 kg parsed as 1185 kg. The source
  // file in use today stores these columns as text, so nothing caught it —
  // a re-save as .xlsx would have been enough to corrupt a declaration.
  it("returns cells that are already numbers untouched", () => {
    expect(parseBgNumber(1.185)).toBe(1.185);
    expect(parseBgNumber(3913.5)).toBe(3913.5);
    expect(parseBgNumber(15)).toBe(15);
    expect(parseBgNumber(0)).toBe(0);
  });

  it("is NaN for a blank cell, so the export guard can catch it", () => {
    expect(parseBgNumber("")).toBeNaN();
  });
});
