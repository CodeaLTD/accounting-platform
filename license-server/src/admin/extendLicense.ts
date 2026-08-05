import { pathToFileURL } from "node:url";
import { openDb, setLicenseExpiry, setSeatLimit } from "../db.js";

function main() {
  const [, , dbPath, licenseKey, paidUntilArg, seatLimitArg] = process.argv;
  if (!dbPath || !licenseKey || !paidUntilArg) {
    console.error(
      "Usage: tsx src/admin/extendLicense.ts <dbPath> <licenseKey> <paidUntilISO> [seatLimit]",
    );
    process.exit(1);
  }
  const db = openDb(dbPath);
  setLicenseExpiry(db, licenseKey, new Date(paidUntilArg).getTime());
  if (seatLimitArg) {
    setSeatLimit(db, licenseKey, Number(seatLimitArg));
  }
  console.log(
    `${licenseKey} paid through ${new Date(paidUntilArg).toISOString()}` +
      (seatLimitArg ? `, seat limit ${seatLimitArg}` : ""),
  );
}

// See createLicense.ts for why pathToFileURL is used instead of a raw
// `file://${...}` comparison (Windows path vs file:// URL never match).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
