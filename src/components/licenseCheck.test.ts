import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";
import { runLicenseCheck } from "./licenseCheck";

const {
  isTauriMock,
  registerDeviceMock,
  verifyLicenseMock,
  loadLicenseStateMock,
  saveCredentialsMock,
  saveCachedLicenseMock,
} = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  registerDeviceMock: vi.fn(),
  verifyLicenseMock: vi.fn(),
  loadLicenseStateMock: vi.fn(),
  saveCredentialsMock: vi.fn(),
  saveCachedLicenseMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@/core/license/api", () => ({
  registerDevice: registerDeviceMock,
  verifyLicense: verifyLicenseMock,
}));
vi.mock("@/platform/license", () => ({
  loadLicenseState: loadLicenseStateMock,
  saveCredentials: saveCredentialsMock,
  saveCachedLicense: saveCachedLicenseMock,
}));

const credentials: DeviceCredentials = {
  deviceId: "existing-device",
  apiKey: "cda_existing",
};
const cached: CachedLicense = {
  isPaid: true,
  expiresAt: "2099-01-01T00:00:00Z",
  planType: "yearly",
  verifiedAt: 1_700_000_000_000,
  cacheMaxAgeHours: 24,
};

describe("runLicenseCheck", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    registerDeviceMock.mockReset();
    verifyLicenseMock.mockReset();
    loadLicenseStateMock.mockReset();
    saveCredentialsMock.mockReset();
    saveCachedLicenseMock.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "new-device-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("registers a new device when no credentials are stored, then verifies", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials: null, cached: null });
    registerDeviceMock.mockResolvedValue({
      ok: true,
      deviceId: "new-device-id",
      apiKey: "cda_new",
    });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(registerDeviceMock).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: "new-device-id" }),
    );
    expect(saveCredentialsMock).toHaveBeenCalledWith({
      deviceId: "new-device-id",
      apiKey: "cda_new",
    });
    expect(result).toEqual({ status: "allowed" });
  });

  it("blocks with 'registration_failed' when registration fails", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials: null, cached: null });
    registerDeviceMock.mockResolvedValue({ ok: false, reason: "network_error" });

    const result = await runLicenseCheck();

    expect(verifyLicenseMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "blocked",
      deviceId: "new-device-id",
      reason: "registration_failed",
    });
  });

  it("skips registration and verifies directly when credentials are already stored", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached: null });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(registerDeviceMock).not.toHaveBeenCalled();
    expect(verifyLicenseMock).toHaveBeenCalledWith(credentials);
    expect(result).toEqual({ status: "allowed" });
  });

  it("persists a fresh cache entry whenever the live verify call succeeds", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached: null });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: false,
      expiresAt: null,
      planType: null,
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(saveCachedLicenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPaid: false, cacheMaxAgeHours: 24 }),
    );
    expect(result).toEqual({
      status: "blocked",
      deviceId: "existing-device",
      reason: "unpaid",
    });
  });

  it("falls back to a cached allowed result on a network error within the cache window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(cached.verifiedAt + 60 * 60 * 1000); // 1h later, well within 24h
    loadLicenseStateMock.mockResolvedValue({ credentials, cached });
    verifyLicenseMock.mockResolvedValue({ ok: false, reason: "network_error" });

    const result = await runLicenseCheck();

    expect(saveCachedLicenseMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "allowed" });
  });

  it("blocks with 'invalid_credentials' on a 401, even with a valid cache", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached });
    verifyLicenseMock.mockResolvedValue({ ok: false, reason: "invalid_credentials" });

    const result = await runLicenseCheck();

    expect(result).toEqual({
      status: "blocked",
      deviceId: "existing-device",
      reason: "invalid_credentials",
    });
  });
});
