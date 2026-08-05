import { randomBytes } from "node:crypto";
import { openDb, createLicense } from "../db";

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
  const db = openDb(dbPath);
  const licenseKey = generateLicenseKey();
  createLicense(db, {
    licenseKey,
    paidUntil: new Date(paidUntilArg).getTime(),
    seatLimit: seatLimitArg ? Number(seatLimitArg) : 1,
  });
  console.log(licenseKey);
}

// Only run when invoked directly (`node`/`tsx` on this file), not when
// imported by the test above.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
