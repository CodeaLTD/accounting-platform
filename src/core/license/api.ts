import { LICENSE_API_BASE_URL } from "./config";
import { licenseFetch } from "./httpClient";
import type { DeviceCredentials, RegisterOutcome, VerifyOutcome } from "./types";

export interface RegisterDeviceParams {
  deviceId: string;
  platform?: string;
  appVersion?: string;
  email?: string;
  username?: string;
}

export async function registerDevice(
  params: RegisterDeviceParams,
): Promise<RegisterOutcome> {
  let response: Response;
  try {
    response = await licenseFetch(`${LICENSE_API_BASE_URL}/api/device/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (response.status === 201) {
    const body = (await response.json()) as { deviceId: string; apiKey: string };
    return { ok: true, deviceId: body.deviceId, apiKey: body.apiKey };
  }
  if (response.status === 409) {
    return { ok: false, reason: "conflict" };
  }
  if (response.status === 400) {
    return { ok: false, reason: "invalid_request" };
  }
  return { ok: false, reason: "network_error" };
}

export async function verifyLicense(
  credentials: DeviceCredentials,
): Promise<VerifyOutcome> {
  let response: Response;
  try {
    response = await licenseFetch(`${LICENSE_API_BASE_URL}/api/license/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (response.status === 200) {
    const body = (await response.json()) as {
      isPaid: boolean;
      expiresAt: string | null;
      planType: string | null;
      cacheMaxAgeHours: number;
    };
    return {
      ok: true,
      isPaid: body.isPaid,
      expiresAt: body.expiresAt ?? null,
      planType: body.planType ?? null,
      cacheMaxAgeHours: body.cacheMaxAgeHours,
    };
  }
  if (response.status === 401) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (response.status === 403) {
    return { ok: false, reason: "revoked" };
  }
  return { ok: false, reason: "network_error" };
}
