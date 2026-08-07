// Tauri names the NSIS installer "{productName}_{version}_{arch}-setup.exe"
// with no config option to override it directly (as of Tauri v2 — the only
// alternatives are a custom NSIS template or this post-build rename).
// Run after `tauri build` to rename it to a fixed, version-free name.
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const NSIS_DIR = join("src-tauri", "target", "release", "bundle", "nsis");
const TARGET_NAME = "Codea Intrastat setup.exe";

if (!existsSync(NSIS_DIR)) {
  console.error(`NSIS bundle directory not found: ${NSIS_DIR} — did the build run?`);
  process.exit(1);
}

if (existsSync(join(NSIS_DIR, TARGET_NAME))) {
  console.log(`Installer already named "${TARGET_NAME}" — nothing to do.`);
  process.exit(0);
}

const installer = readdirSync(NSIS_DIR).find((file) => file.endsWith("-setup.exe"));
if (!installer) {
  console.error(`No NSIS installer (*-setup.exe) found in ${NSIS_DIR}`);
  process.exit(1);
}

renameSync(join(NSIS_DIR, installer), join(NSIS_DIR, TARGET_NAME));
console.log(`Renamed "${installer}" -> "${TARGET_NAME}"`);
