import { describe, expect, it } from "vitest";
import { generateLicenseKey } from "../../src/admin/createLicense";

describe("generateLicenseKey", () => {
  it("produces an INTRA-prefixed key with a 16-character hex suffix", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^INTRA-[0-9A-F]{16}$/);
  });

  it("produces a different key on each call", () => {
    expect(generateLicenseKey()).not.toBe(generateLicenseKey());
  });
});
