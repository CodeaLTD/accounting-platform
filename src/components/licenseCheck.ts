import { getVersion } from "@tauri-apps/api/app";
import { registerDevice, verifyLicense } from "@/core/license/api";
import { evaluateLicenseCache } from "@/core/license/cache";
import type { DeviceCredentials, LicenseBlockReason } from "@/core/license/types";
import {
  loadLicenseState,
  saveCachedLicense,
  saveCredentials,
  savePendingDeviceId,
} from "@/platform/license";

export type GateResult =
  | { status: "allowed" }
  | { status: "blocked"; deviceId: string; reason: LicenseBlockReason };

export async function runLicenseCheck(): Promise<GateResult> {
  try {
    const stored = await loadLicenseState();
    let credentials: DeviceCredentials | null = stored.credentials;

    if (!credentials) {
      // Reuse a previously-generated-but-not-yet-registered device ID so a
      // retry after a failed registration presents the same ID to support,
      // instead of a fresh one on every attempt.
      const deviceId = stored.pendingDeviceId ?? crypto.randomUUID();
      if (!stored.pendingDeviceId) {
        try {
          await savePendingDeviceId(deviceId);
        } catch {
          // Persisting the pending ID failed — still usable for this
          // attempt, just won't survive a restart before registration
          // succeeds.
        }
      }

      const registerResult = await registerDevice({
        deviceId,
        // runLicenseCheck only ever runs inside Tauri (see LicenseGate's
        // isTauri() guard before it's ever called) — "desktop" is the only
        // value this can be. appVersion comes from Tauri's own runtime API
        // (the version declared in tauri.conf.json, the actual shipped
        // build) rather than the JS package.json version, which is a
        // separate number that isn't guaranteed to match it.
        platform: "desktop",
        appVersion: await getVersion(),
      });
      if (!registerResult.ok) {
        return { status: "blocked", deviceId, reason: "registration_failed" };
      }
      credentials = {
        deviceId: registerResult.deviceId,
        apiKey: registerResult.apiKey,
      };
      try {
        await saveCredentials(credentials);
      } catch {
        // Persisting failed — still usable this session; next launch will
        // just register a new device.
      }
    }

    const liveResult = await verifyLicense(credentials);
    if (liveResult.ok) {
      try {
        await saveCachedLicense({
          isPaid: liveResult.isPaid,
          expiresAt: liveResult.expiresAt,
          planType: liveResult.planType,
          verifiedAt: Date.now(),
          cacheMaxAgeHours: liveResult.cacheMaxAgeHours,
        });
      } catch {
        // Persisting failed — still usable this session.
      }
    }

    const decision = evaluateLicenseCache({
      liveResult,
      cached: stored.cached,
      now: Date.now(),
    });

    if (decision.status === "allowed") return { status: "allowed" };
    return { status: "blocked", deviceId: credentials.deviceId, reason: decision.reason };
  } catch {
    // Truly unexpected failure (e.g. loadLicenseState itself rejecting) —
    // never leave the caller with a hung promise; report the safest
    // possible answer instead of crashing the app's only entry screen.
    return { status: "blocked", deviceId: "", reason: "no_network_no_cache" };
  }
}
