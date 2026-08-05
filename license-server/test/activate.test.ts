import { describe, expect, it } from "vitest";
import { openDb, createLicense } from "../src/db";
import { handleActivate } from "../src/routes/activate";
import { generateTestKeyPair } from "./testKeys";

const { privateKeyPem } = generateTestKeyPair();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("handleActivate", () => {
  it("returns not_found for an unknown license key", async () => {
    const db = openDb(":memory:");
    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-NOPE",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns inactive once paidUntil is in the past", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil: Date.now() - ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0001",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });

  it("issues a token for the first device within the seat limit", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0002",
      deviceId: "device-a",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a second device once the seat limit is reached", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-a",
    });
    const secondDevice = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-b",
    });

    expect(secondDevice).toEqual({ ok: false, reason: "seat_limit_reached" });
  });

  it("re-activating the same device does not consume a second seat", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0004",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0004",
      deviceId: "device-a",
    });
    const sameDeviceAgain = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0004",
      deviceId: "device-a",
    });

    expect(sameDeviceAgain.ok).toBe(true);
  });
});
