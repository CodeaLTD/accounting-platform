import type { LicensePayload } from "./types";

export type LicenseStatus = "valid" | "grace" | "locked";

const GRACE_PERIOD_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

export interface ComputeLicenseStatusParams {
  payload: LicensePayload | null;
  lastRefreshAt: number | null;
  now: number;
}

export function computeLicenseStatus(params: ComputeLicenseStatusParams): LicenseStatus {
  if (!params.payload) return "locked";

  const tokenExpiresAtMs = params.payload.expiresAt * 1000;
  if (params.now <= tokenExpiresAtMs) return "valid";

  if (params.lastRefreshAt === null) return "locked";
  const graceDeadline = params.lastRefreshAt + GRACE_PERIOD_MS;
  return params.now <= graceDeadline ? "grace" : "locked";
}
