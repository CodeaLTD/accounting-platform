import { describe, expect, it } from "vitest";
import { computeLicenseStatus } from "./licenseState";
import type { LicensePayload } from "./types";

const NOW = 1_700_000_000_000; // arbitrary fixed reference point, in ms
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function payloadExpiringAt(expiresAtSeconds: number): LicensePayload {
  return { licenseKey: "LIC-0001", deviceId: "device-a", expiresAt: expiresAtSeconds };
}

describe("computeLicenseStatus", () => {
  it("is locked when there is no verified payload at all", () => {
    expect(
      computeLicenseStatus({ payload: null, lastRefreshAt: null, now: NOW }),
    ).toBe("locked");
  });

  it("is valid when the token has not expired yet", () => {
    const payload = payloadExpiringAt(Math.floor((NOW + ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({ payload, lastRefreshAt: NOW - ONE_DAY_MS, now: NOW }),
    ).toBe("valid");
  });

  it("is in grace when expired but within 10 days of the token's own expiry", () => {
    // Server issues a fresh token at each successful refresh, with
    // expiresAt = lastRefreshAt + 14 days. Model that here instead of
    // pretending expiresAt ~= lastRefreshAt.
    const lastRefreshAt = NOW - 15 * ONE_DAY_MS;
    const expiresAtMs = lastRefreshAt + 14 * ONE_DAY_MS; // NOW - 1 day
    const payload = payloadExpiringAt(Math.floor(expiresAtMs / 1000));
    expect(
      computeLicenseStatus({
        payload,
        lastRefreshAt,
        now: NOW,
      }),
    ).toBe("grace");
  });

  it("is locked once past the 10-day grace deadline", () => {
    const lastRefreshAt = NOW - 25 * ONE_DAY_MS;
    const expiresAtMs = lastRefreshAt + 14 * ONE_DAY_MS; // NOW - 11 days
    // grace deadline = expiresAt + 10 days = NOW - 1 day, so NOW is past it
    const payload = payloadExpiringAt(Math.floor(expiresAtMs / 1000));
    expect(
      computeLicenseStatus({
        payload,
        lastRefreshAt,
        now: NOW,
      }),
    ).toBe("locked");
  });

  it("is locked when expired and there is no recorded successful refresh", () => {
    const payload = payloadExpiringAt(Math.floor((NOW - ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({ payload, lastRefreshAt: null, now: NOW }),
    ).toBe("locked");
  });
});
