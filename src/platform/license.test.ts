import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const { isTauriMock, existsMock, mkdirMock, readTextFileMock, writeTextFileMock } =
  vi.hoisted(() => ({
    isTauriMock: vi.fn(() => false),
    existsMock: vi.fn(),
    mkdirMock: vi.fn(),
    readTextFileMock: vi.fn(),
    writeTextFileMock: vi.fn(),
  }));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: existsMock,
  mkdir: mkdirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // license.ts keeps its non-Tauri fallback in module-level memoryState —
    // reset the module between tests so that state doesn't leak across them.
    vi.resetModules();
  });

  it("returns empty state outside Tauri before anything is saved", async () => {
    const { loadLicenseState } = await import("./license");
    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
  });

  it("round-trips credentials and cache through in-memory state outside Tauri", async () => {
    const { loadLicenseState, saveCredentials, saveCachedLicense } = await import(
      "./license"
    );
    await saveCredentials(credentials);
    await saveCachedLicense(cached);
    expect(await loadLicenseState()).toEqual({ credentials, cached });
  });

  it("returns empty state in Tauri when no file exists yet", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(false);
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("reads and parses the stored file in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({ credentials, cached }));
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials, cached });
  });

  it("treats a malformed stored file as no stored credentials", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue("not json");
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
  });

  it("writes credentials to disk in Tauri, preserving any existing cache", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({ credentials: null, cached }));
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
      JSON.stringify({ credentials, cached }),
      { baseDir: "AppData" },
    );
  });
});
