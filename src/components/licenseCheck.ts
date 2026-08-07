import { isTauri } from "@tauri-apps/api/core";
import packageJson from "../../package.json";
import { registerDevice, verifyLicense } from "@/core/license/api";
import { evaluateLicenseCache } from "@/core/license/cache";
import type { DeviceCredentials, LicenseBlockReason } from "@/core/license/types";
import {
  loadLicenseState,
  saveCachedLicense,
  saveCredentials,
} from "@/platform/license";

export type GateResult =
  | { status: "allowed" }
  | { status: "blocked"; deviceId: string; reason: LicenseBlockReason };

export async function runLicenseCheck(): Promise<GateResult> {
  const stored = await loadLicenseState();
  let credentials: DeviceCredentials | null = stored.credentials;

  if (!credentials) {
    const deviceId = crypto.randomUUID();
    const registerResult = await registerDevice({
      deviceId,
      platform: isTauri() ? "desktop" : undefined,
      appVersion: packageJson.version,
    });
    if (!registerResult.ok) {
      return { status: "blocked", deviceId, reason: "registration_failed" };
    }
    credentials = {
      deviceId: registerResult.deviceId,
      apiKey: registerResult.apiKey,
    };
    await saveCredentials(credentials);
  }

  const liveResult = await verifyLicense(credentials);
  if (liveResult.ok) {
    await saveCachedLicense({
      isPaid: liveResult.isPaid,
      expiresAt: liveResult.expiresAt,
      planType: liveResult.planType,
      verifiedAt: Date.now(),
      cacheMaxAgeHours: liveResult.cacheMaxAgeHours,
    });
  }

  const decision = evaluateLicenseCache({
    liveResult,
    cached: stored.cached,
    now: Date.now(),
  });

  if (decision.status === "allowed") return { status: "allowed" };
  return { status: "blocked", deviceId: credentials.deviceId, reason: decision.reason };
}
