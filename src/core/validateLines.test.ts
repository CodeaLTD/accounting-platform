import { describe, expect, it } from "vitest";
import type { IntrastatDeclarationLine } from "./types";
import { hasInvalidNumericValue } from "./validateLines";

const validLine: IntrastatDeclarationLine = {
  sequenceNumber: null,
  commodityCode: "82084000",
  partnerCountry: "IT",
  countryOfOrigin: "FR",
  natureOfTransaction: "11",
  deliveryTerms: "CPT",
  modeOfTransport: "3",
  transportNationality: "BG",
  regionOfConsumption: "SZR",
  netWeightKg: 15,
  supplementaryQuantity: NaN,
  value: 560,
  statisticalValue: 560,
};

describe("hasInvalidNumericValue", () => {
  it("is false for an empty list", () => {
    expect(hasInvalidNumericValue([])).toBe(false);
  });

  it("is false when all numeric fields are valid numbers", () => {
    expect(hasInvalidNumericValue([validLine])).toBe(false);
  });

  it.each(["netWeightKg", "value", "statisticalValue"] as const)(
    "is true when %s is NaN",
    (field) => {
      const lines = [{ ...validLine, [field]: NaN }];
      expect(hasInvalidNumericValue(lines)).toBe(true);
    },
  );

  it("is true when any line (not just the first) has a NaN field", () => {
    const lines = [validLine, { ...validLine, value: NaN }];
    expect(hasInvalidNumericValue(lines)).toBe(true);
  });
});
