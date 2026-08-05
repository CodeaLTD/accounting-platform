import type Database from "better-sqlite3";
import { getLicense, isDeviceRegistered } from "../db";
import { issueLicenseToken } from "../token";

export interface RefreshRequest {
  licenseKey: string;
  deviceId: string;
}

export type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "inactive" | "device_not_registered" };

const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export async function handleRefresh(
  db: Database.Database,
  privateKeyPem: string,
  request: RefreshRequest,
): Promise<RefreshResult> {
  const license = getLicense(db, request.licenseKey);
  if (!license) return { ok: false, reason: "not_found" };
  if (!isDeviceRegistered(db, request.licenseKey, request.deviceId)) {
    return { ok: false, reason: "device_not_registered" };
  }
  if (Date.now() > license.paidUntil) return { ok: false, reason: "inactive" };

  const token = await issueLicenseToken({
    licenseKey: request.licenseKey,
    deviceId: request.deviceId,
    privateKeyPem,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  return { ok: true, token };
}
