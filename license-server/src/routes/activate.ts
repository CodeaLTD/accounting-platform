import type Database from "better-sqlite3";
import {
  countDevices,
  getLicense,
  isDeviceRegistered,
  registerDevice,
} from "../db";
import { issueLicenseToken } from "../token";

export interface ActivateRequest {
  licenseKey: string;
  deviceId: string;
}

export type ActivateResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "inactive" | "seat_limit_reached" };

const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export async function handleActivate(
  db: Database.Database,
  privateKeyPem: string,
  request: ActivateRequest,
): Promise<ActivateResult> {
  const license = getLicense(db, request.licenseKey);
  if (!license) return { ok: false, reason: "not_found" };
  if (Date.now() > license.paidUntil) return { ok: false, reason: "inactive" };

  const alreadyRegistered = isDeviceRegistered(db, request.licenseKey, request.deviceId);
  if (!alreadyRegistered) {
    const deviceCount = countDevices(db, request.licenseKey);
    if (deviceCount >= license.seatLimit) {
      return { ok: false, reason: "seat_limit_reached" };
    }
    registerDevice(db, request.licenseKey, request.deviceId);
  }

  const token = await issueLicenseToken({
    licenseKey: request.licenseKey,
    deviceId: request.deviceId,
    privateKeyPem,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  return { ok: true, token };
}
