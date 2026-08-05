import { describe, expect, it } from "vitest";
import {
  openDb,
  createLicense,
  getLicense,
  countDevices,
  isDeviceRegistered,
  registerDevice,
  setLicenseExpiry,
  setSeatLimit,
} from "../src/db";

function freshDb() {
  return openDb(":memory:");
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("license db", () => {
  it("creates and reads back a license", () => {
    const db = freshDb();
    const paidUntil = Date.now() + 365 * ONE_DAY_MS;
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil,
      seatLimit: 1,
    });

    expect(getLicense(db, "LIC-0001")).toEqual({
      licenseKey: "LIC-0001",
      paidUntil,
      seatLimit: 1,
    });
  });

  it("returns undefined for an unknown license", () => {
    const db = freshDb();
    expect(getLicense(db, "LIC-NOPE")).toBeUndefined();
  });

  it("registers devices and counts them, without double-counting a re-registration", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 2,
    });

    expect(countDevices(db, "LIC-0002")).toBe(0);
    expect(isDeviceRegistered(db, "LIC-0002", "device-a")).toBe(false);

    registerDevice(db, "LIC-0002", "device-a");
    registerDevice(db, "LIC-0002", "device-a"); // re-activation, same device

    expect(countDevices(db, "LIC-0002")).toBe(1);
    expect(isDeviceRegistered(db, "LIC-0002", "device-a")).toBe(true);
  });

  it("extends paidUntil by license key, e.g. on manual renewal", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 30 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const newPaidUntil = Date.now() + 3 * 365 * ONE_DAY_MS; // e.g. a 3-year prepay
    setLicenseExpiry(db, "LIC-0003", newPaidUntil);

    expect(getLicense(db, "LIC-0003")?.paidUntil).toBe(newPaidUntil);
  });

  it("updates seat limit by license key", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0004",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    setSeatLimit(db, "LIC-0004", 3);

    expect(getLicense(db, "LIC-0004")?.seatLimit).toBe(3);
  });
});
