import { describe, expect, it } from "vitest";
import { REGIONS_OF_CONSUMPTION } from "./constants";

describe("REGIONS_OF_CONSUMPTION", () => {
  it("contains all 30 codes from the accountant's reference list, no duplicates", () => {
    const codes = REGIONS_OF_CONSUMPTION.map((r) => r.code);
    expect(codes).toHaveLength(30);
    expect(new Set(codes).size).toBe(30);
  });

  it("maps SZR to Стара Загора, matching the sample data used throughout mapping.test.ts", () => {
    const region = REGIONS_OF_CONSUMPTION.find((r) => r.code === "SZR");
    expect(region?.label).toBe("Стара Загора");
  });

  it("includes the two special catch-all codes", () => {
    const codes = REGIONS_OF_CONSUMPTION.map((r) => r.code);
    expect(codes).toContain("XXX");
    expect(codes).toContain("ZZZ");
  });
});
