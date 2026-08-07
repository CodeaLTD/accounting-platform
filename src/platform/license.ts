import { isTauri } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const STORAGE_FILE = "license.json";

export interface LicenseState {
  credentials: DeviceCredentials | null;
  cached: CachedLicense | null;
}

// Desktop-only concern (see licenseCheck.ts, which only calls this while
// isTauri()) — web/dev/test just keeps state in memory for the life of the
// process, matching the existing DownloadButton/dialog.ts pattern of
// branching on isTauri() rather than modeling a real web backend.
let memoryState: LicenseState = { credentials: null, cached: null };

async function readState(): Promise<LicenseState> {
  const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
  if (!fileExists) return { credentials: null, cached: null };
  try {
    const raw = await readTextFile(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw) as Partial<LicenseState>;
    return {
      credentials: parsed.credentials ?? null,
      cached: parsed.cached ?? null,
    };
  } catch {
    // Malformed file — treat as no stored credentials rather than crashing;
    // a fresh registration will overwrite it on the next successful write.
    return { credentials: null, cached: null };
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
    await writeState({ ...state, credentials });
    return;
  }
  memoryState = { ...memoryState, credentials };
}

export async function saveCachedLicense(cached: CachedLicense): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, cached });
    return;
  }
  memoryState = { ...memoryState, cached };
}
