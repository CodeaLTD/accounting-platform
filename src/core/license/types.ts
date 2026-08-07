export interface DeviceCredentials {
  deviceId: string;
  apiKey: string;
}

export interface LicenseSnapshot {
  isPaid: boolean;
  expiresAt: string | null;
  planType: string | null;
}

export interface CachedLicense extends LicenseSnapshot {
  /** Epoch ms when this snapshot was written locally — not from the server. */
  verifiedAt: number;
  /** From the server's `cacheMaxAgeHours` on the response that produced this snapshot. */
  cacheMaxAgeHours: number;
}

export type RegisterOutcome =
  | { ok: true; deviceId: string; apiKey: string }
  | { ok: false; reason: "conflict" | "invalid_request" | "network_error" };

export type VerifyOutcome =
  | ({ ok: true; cacheMaxAgeHours: number } & LicenseSnapshot)
  | { ok: false; reason: "invalid_credentials" | "revoked" | "network_error" };

// "registration_failed" is only ever produced directly by
// src/components/licenseCheck.ts (Task 8) when device registration itself
// fails — evaluateLicenseCache (Task 3) never returns it, since it only
// ever sees an already-registered device's verify outcome.
export type LicenseBlockReason =
  | "unpaid"
  | "invalid_credentials"
  | "revoked"
  | "no_network_no_cache"
  | "no_network_cache_expired"
  | "registration_failed";

export type LicenseDecision =
  | ({ status: "allowed" } & LicenseSnapshot)
  | { status: "blocked"; reason: Exclude<LicenseBlockReason, "registration_failed"> };
