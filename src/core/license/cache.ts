import type { CachedLicense, LicenseDecision, VerifyOutcome } from "./types";

export function evaluateLicenseCache(params: {
  liveResult: VerifyOutcome;
  cached: CachedLicense | null;
  now: number;
}): LicenseDecision {
  const { liveResult, cached, now } = params;

  if (liveResult.ok) {
    return liveResult.isPaid
      ? {
          status: "allowed",
          isPaid: true,
          expiresAt: liveResult.expiresAt,
          planType: liveResult.planType,
        }
      : { status: "blocked", reason: "unpaid" };
  }

  if (liveResult.reason === "invalid_credentials" || liveResult.reason === "revoked") {
    return { status: "blocked", reason: liveResult.reason };
  }

  if (!cached) {
    return { status: "blocked", reason: "no_network_no_cache" };
  }

  const cacheAgeMs = now - cached.verifiedAt;
  const maxAgeMs = cached.cacheMaxAgeHours * 60 * 60 * 1000;
  if (cacheAgeMs >= maxAgeMs) {
    return { status: "blocked", reason: "no_network_cache_expired" };
  }

  return cached.isPaid
    ? {
        status: "allowed",
        isPaid: true,
        expiresAt: cached.expiresAt,
        planType: cached.planType,
      }
    : { status: "blocked", reason: "unpaid" };
}
