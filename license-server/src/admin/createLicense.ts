import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { openDb, createLicense } from "../db.js";

export function generateLicenseKey(): string {
  return `INTRA-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function main() {
  const [, , dbPath, paidUntilArg, seatLimitArg] = process.argv;
  if (!dbPath || !paidUntilArg) {
    console.error(
      "Usage: tsx src/admin/createLicense.ts <dbPath> <paidUntilISO> [seatLimit=1]",
    );
    process.exit(1);
  }
  const paidUntil = new Date(paidUntilArg).getTime();
  if (Number.isNaN(paidUntil)) {
    console.error(`Invalid date: ${paidUntilArg}`);
    process.exit(1);
  }

  const db = openDb(dbPath);
  const licenseKey = generateLicenseKey();
  createLicense(db, {
    licenseKey,
    paidUntil,
    seatLimit: seatLimitArg ? Number(seatLimitArg) : 1,
  });
  console.log(licenseKey);
}

// Only run when invoked directly (`node`/`tsx` on this file), not when
// imported by the test above. Compare via pathToFileURL rather than a raw
// `file://${...}` template, since process.argv[1] is a Windows-style path
// (C:\...) that never string-equals a file:// URL (file:///C:/...).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
