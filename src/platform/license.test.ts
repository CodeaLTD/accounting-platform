import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const {
  isTauriMock,
  existsMock,
  mkdirMock,
  readTextFileMock,
  writeTextFileMock,
  copyFileMock,
} = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  copyFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: existsMock,
  mkdir: mkdirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  copyFile: copyFileMock,
}));

const credentials: DeviceCredentials = { deviceId: "A1B2", apiKey: "cda_xxx" };
const cached: CachedLicense = {
  isPaid: true,
  expiresAt: "2099-01-01T00:00:00Z",
  planType: "yearly",
  verifiedAt: 1_700_000_000_000,
  cacheMaxAgeHours: 24,
};

describe("platform/license", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    existsMock.mockReset();
    mkdirMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    copyFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // license.ts keeps its non-Tauri fallback in module-level memoryState —
    // reset the module between tests so that state doesn't leak across them.
    vi.resetModules();
  });

  it("returns empty state outside Tauri before anything is saved", async () => {
    const { loadLicenseState } = await import("./license");
    expect(await loadLicenseState()).toEqual({
      credentials: null,
      cached: null,
      pendingDeviceId: null,
    });
  });

  it("round-trips credentials and cache through in-memory state outside Tauri", async () => {
    const { loadLicenseState, saveCredentials, saveCachedLicense } = await import(
      "./license"
    );
    await saveCredentials(credentials);
    await saveCachedLicense(cached);
    expect(await loadLicenseState()).toEqual({
      credentials,
      cached,
      pendingDeviceId: null,
    });
  });

  it("returns empty state in Tauri when no file exists yet", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(false);
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({
      credentials: null,
      cached: null,
      pendingDeviceId: null,
    });
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("reads and parses the stored file in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({ credentials, cached }));
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({
      credentials,
      cached,
      pendingDeviceId: null,
    });
  });

  it("treats a malformed stored file as no stored credentials", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue("not json");
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({
      credentials: null,
      cached: null,
      pendingDeviceId: null,
    });
    expect(copyFileMock).toHaveBeenCalledWith("license.json", "license.json.bak", {
      fromPathBaseDir: "AppData",
      toPathBaseDir: "AppData",
    });
  });

  it("treats a rejecting exists() call as no stored state, not a crash", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockRejectedValue(new Error("permission denied"));
    const { loadLicenseState } = await import("./license");

    await expect(loadLicenseState()).resolves.toEqual({
      credentials: null,
      cached: null,
      pendingDeviceId: null,
    });
  });

  it("writes credentials to disk in Tauri, preserving any existing cache", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ credentials: null, cached, pendingDeviceId: null }),
    );
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    const { saveCredentials } = await import("./license");

    await saveCredentials(credentials);

    expect(mkdirMock).toHaveBeenCalledWith(".", {
      baseDir: "AppData",
      recursive: true,
    });
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "license.json",
      JSON.stringify({ credentials, cached, pendingDeviceId: null }),
      { baseDir: "AppData" },
    );
  });

  it("clears pendingDeviceId when saveCredentials saves real credentials", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ credentials: null, cached: null, pendingDeviceId: "old-pending" }),
    );
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    const { saveCredentials } = await import("./license");

    await saveCredentials(credentials);

    expect(writeTextFileMock).toHaveBeenCalledWith(
      "license.json",
      JSON.stringify({ credentials, cached: null, pendingDeviceId: null }),
      { baseDir: "AppData" },
    );
  });

  it("round-trips a pending device id in memory outside Tauri", async () => {
    const { loadLicenseState, savePendingDeviceId } = await import("./license");
    await savePendingDeviceId("pending-id");
    expect(await loadLicenseState()).toEqual({
      credentials: null,
      cached: null,
      pendingDeviceId: "pending-id",
    });
  });

  it("writes a pending device id to disk in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(false);
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    const { savePendingDeviceId } = await import("./license");

    await savePendingDeviceId("pending-id");

    expect(writeTextFileMock).toHaveBeenCalledWith(
      "license.json",
      JSON.stringify({ credentials: null, cached: null, pendingDeviceId: "pending-id" }),
      { baseDir: "AppData" },
    );
  });
});
