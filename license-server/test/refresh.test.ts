import { describe, expect, it } from "vitest";
import { openDb, createLicense, registerDevice, setLicenseExpiry } from "../src/db";
import { handleRefresh } from "../src/routes/refresh";
import { generateTestKeyPair } from "./testKeys";

const { privateKeyPem } = generateTestKeyPair();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("handleRefresh", () => {
  it("returns not_found for an unknown license key", async () => {
    const db = openDb(":memory:");
    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-NOPE",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns device_not_registered if the device never activated", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0001",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "device_not_registered" });
  });

  it("returns inactive once paidUntil lapses, even for a registered device", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });
    registerDevice(db, "LIC-0002", "device-a");
    setLicenseExpiry(db, "LIC-0002", Date.now() - ONE_DAY_MS);

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0002",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });

  it("issues a new token for a registered device on an active license", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });
    registerDevice(db, "LIC-0003", "device-a");

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-a",
    });
    expect(result.ok).toBe(true);
  });
});
