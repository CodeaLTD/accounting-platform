import { isTauri } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  copyFile,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const STORAGE_FILE = "license.json";
const BACKUP_FILE = "license.json.bak";

export interface LicenseState {
  credentials: DeviceCredentials | null;
  cached: CachedLicense | null;
  /**
   * A device ID generated locally but not yet confirmed by a successful
   * /api/device/register/ call — persisted immediately on generation so a
   * retry after a failed registration reuses the same ID instead of
   * minting a new one every attempt, which would otherwise orphan a device
   * record on the server for every failed attempt and make the ID shown
   * on the registration form's error state useless to support (it'd point
   * at a different, never-retried record each time). Cleared once real
   * credentials are saved.
   */
  pendingDeviceId: string | null;
}

const EMPTY_STATE: LicenseState = {
  credentials: null,
  cached: null,
  pendingDeviceId: null,
};

// Desktop-only concern (see licenseCheck.ts, which only calls this while
// isTauri()) — web/dev/test just keeps state in memory for the life of the
// process, matching the existing DownloadButton/dialog.ts pattern of
// branching on isTauri() rather than modeling a real web backend.
let memoryState: LicenseState = { ...EMPTY_STATE };

async function backupCorruptFile(): Promise<void> {
  // Best-effort — if even the backup copy fails, the caller still falls
  // through to the safe "no stored state" result rather than throwing.
  try {
    const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    if (fileExists) {
      await copyFile(STORAGE_FILE, BACKUP_FILE, {
        fromPathBaseDir: BaseDirectory.AppData,
        toPathBaseDir: BaseDirectory.AppData,
      });
    }
  } catch {
    // Nothing more we can do — see caller.
  }
}

async function readState(): Promise<LicenseState> {
  try {
    const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    if (!fileExists) return { ...EMPTY_STATE };
    const raw = await readTextFile(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw) as Partial<LicenseState>;
    return {
      credentials: parsed.credentials ?? null,
      cached: parsed.cached ?? null,
      pendingDeviceId: parsed.pendingDeviceId ?? null,
    };
  } catch {
    // Malformed file or unreadable filesystem — treat as no stored state
    // rather than crashing. Preserve a corrupted-but-present file under a
    // .bak name first, so a paying customer's device doesn't silently
    // re-register with zero trace of what happened to the old record.
    await backupCorruptFile();
    return { ...EMPTY_STATE };
  }
}

async function writeState(state: LicenseState): Promise<void> {
  await mkdir(".", { baseDir: BaseDirectory.AppData, recursive: true });
  await writeTextFile(STORAGE_FILE, JSON.stringify(state), {
    baseDir: BaseDirectory.AppData,
  });
}

export async function loadLicenseState(): Promise<LicenseState> {
  if (isTauri()) return readState();
  return memoryState;
}

export async function saveCredentials(credentials: DeviceCredentials): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, credentials, pendingDeviceId: null });
    return;
  }
  memoryState = { ...memoryState, credentials, pendingDeviceId: null };
}

export async function saveCachedLicense(cached: CachedLicense): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, cached });
    return;
  }
  memoryState = { ...memoryState, cached };
}

export async function savePendingDeviceId(deviceId: string): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, pendingDeviceId: deviceId });
    return;
  }
  memoryState = { ...memoryState, pendingDeviceId: deviceId };
}
