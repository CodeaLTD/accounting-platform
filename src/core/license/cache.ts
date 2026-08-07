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
  // A negative age means verifiedAt is in the future relative to now — a
  // clock was rolled back (or forward then back). Treat that the same as
  // an expired cache rather than trusting it indefinitely, since we can no
  // longer reason about how old the cached answer actually is.
  if (cacheAgeMs < 0 || cacheAgeMs >= maxAgeMs) {
    return { status: "blocked", reason: "no_network_cache_expired" };
  }

  if (!cached.isPaid) {
    return { status: "blocked", reason: "unpaid" };
  }

  // cacheMaxAgeHours only says how long the server's answer can be trusted
  // offline — it doesn't mean the license itself hasn't since expired.
  // Check the license's own expiresAt too, independent of cache freshness.
  // Only meaningful for a paid cache — an unpaid one already returned
  // above, so this never mislabels a lapsed subscription as "offline".
  // An unparseable expiresAt (NaN) fails closed rather than being trusted.
  if (cached.expiresAt !== null) {
    const expiresAtMs = new Date(cached.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
      return { status: "blocked", reason: "no_network_cache_expired" };
    }
  }

  return {
    status: "allowed",
    isPaid: true,
    expiresAt: cached.expiresAt,
    planType: cached.planType,
  };
}
