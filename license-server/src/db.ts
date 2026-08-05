import Database from "better-sqlite3";

export interface License {
  licenseKey: string;
  /** Epoch milliseconds. The license is active while `Date.now() <= paidUntil`. */
  paidUntil: number;
  seatLimit: number;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      license_key TEXT PRIMARY KEY,
      paid_until INTEGER NOT NULL,
      seat_limit INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS devices (
      license_key TEXT NOT NULL REFERENCES licenses(license_key),
      device_id TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      PRIMARY KEY (license_key, device_id)
    );
  `);
  return db;
}

export function createLicense(db: Database.Database, license: License): void {
  db.prepare(
    "INSERT INTO licenses (license_key, paid_until, seat_limit) VALUES (?, ?, ?)",
  ).run(license.licenseKey, license.paidUntil, license.seatLimit);
}

export function getLicense(
  db: Database.Database,
  licenseKey: string,
): License | undefined {
  const row = db
    .prepare(
      `SELECT license_key as licenseKey,
              paid_until as paidUntil, seat_limit as seatLimit
       FROM licenses WHERE license_key = ?`,
    )
    .get(licenseKey) as License | undefined;
  return row;
}

export function countDevices(db: Database.Database, licenseKey: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM devices WHERE license_key = ?")
    .get(licenseKey) as { count: number };
  return row.count;
}

export function isDeviceRegistered(
  db: Database.Database,
  licenseKey: string,
  deviceId: string,
): boolean {
  const row = db
    .prepare("SELECT 1 FROM devices WHERE license_key = ? AND device_id = ?")
    .get(licenseKey, deviceId);
  return row !== undefined;
}

export function registerDevice(
  db: Database.Database,
  licenseKey: string,
  deviceId: string,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO devices (license_key, device_id, activated_at) VALUES (?, ?, ?)",
  ).run(licenseKey, deviceId, Date.now());
}

export function setLicenseExpiry(
  db: Database.Database,
  licenseKey: string,
  paidUntil: number,
): void {
  db.prepare("UPDATE licenses SET paid_until = ? WHERE license_key = ?").run(
    paidUntil,
    licenseKey,
  );
}

export function setSeatLimit(
  db: Database.Database,
  licenseKey: string,
  seatLimit: number,
): void {
  db.prepare("UPDATE licenses SET seat_limit = ? WHERE license_key = ?").run(
    seatLimit,
    licenseKey,
  );
}
