import { describe, expect, it } from "vitest";
import { evaluateLicenseCache } from "./cache";
import type { CachedLicense, VerifyOutcome } from "./types";

const NOW = 1_700_000_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function cachedAt(ageHours: number, overrides: Partial<CachedLicense> = {}): CachedLicense {
  return {
    isPaid: true,
    expiresAt: "2099-01-01T00:00:00Z",
    planType: "yearly",
    verifiedAt: NOW - ageHours * ONE_HOUR_MS,
    cacheMaxAgeHours: 24,
    ...overrides,
  };
}

describe("evaluateLicenseCache", () => {
  it("allows when the live call succeeds and isPaid is true", () => {
    const liveResult: VerifyOutcome = {
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "allowed",
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
    });
  });

  it("blocks with 'unpaid' when the live call succeeds but isPaid is false", () => {
    const liveResult: VerifyOutcome = {
      ok: true,
      isPaid: false,
      expiresAt: null,
      planType: null,
      cacheMaxAgeHours: 24,
    };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "blocked",
      reason: "unpaid",
    });
  });

  it("blocks with 'invalid_credentials' regardless of any cache", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "invalid_credentials" };
    expect(
      evaluateLicenseCache({ liveResult, cached: cachedAt(0), now: NOW }),
    ).toEqual({ status: "blocked", reason: "invalid_credentials" });
  });

  it("blocks with 'revoked' regardless of any cache", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "revoked" };
    expect(
      evaluateLicenseCache({ liveResult, cached: cachedAt(0), now: NOW }),
    ).toEqual({ status: "blocked", reason: "revoked" });
  });

  it("blocks with 'no_network_no_cache' on a network error with nothing cached", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_no_cache",
    });
  });

  it("trusts a fresh cache on a network error", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1); // 1 hour old, cacheMaxAgeHours: 24
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "allowed",
      isPaid: true,
      expiresAt: cached.expiresAt,
      planType: cached.planType,
    });
  });

  it("blocks with 'no_network_cache_expired' once the cache is past cacheMaxAgeHours", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(25); // 25 hours old, cacheMaxAgeHours: 24
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_cache_expired",
    });
  });

  it("trusts a cached unpaid result within the window as 'unpaid', not a crash", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, { isPaid: false, expiresAt: null, planType: null });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "unpaid",
    });
  });

  it("reports 'unpaid', not 'no_network_cache_expired', for a lapsed-and-unpaid cache with a past expiresAt", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, {
      isPaid: false,
      expiresAt: new Date(NOW - ONE_HOUR_MS).toISOString(),
    });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "unpaid",
    });
  });

  it("blocks with 'no_network_cache_expired' when a paid cache's expiresAt is unparseable", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, { expiresAt: "not-a-date" });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_cache_expired",
    });
  });

  it("blocks with 'no_network_cache_expired' when verifiedAt is in the future (clock skew)", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    // verifiedAt 1 hour ahead of "now" — cacheAgeMs would be negative.
    const cached = cachedAt(-1);
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_cache_expired",
    });
  });

  it("blocks with 'no_network_cache_expired' when the cached license's own expiresAt has passed, even within the fresh cache window", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, { expiresAt: new Date(NOW - ONE_HOUR_MS).toISOString() });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_cache_expired",
    });
  });

  it("does not block on expiresAt when it is null (no expiry known)", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, { expiresAt: null });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "allowed",
      isPaid: true,
      expiresAt: null,
      planType: cached.planType,
    });
  });
});
