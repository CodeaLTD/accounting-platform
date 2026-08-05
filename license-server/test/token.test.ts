import { importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { issueLicenseToken } from "../src/token";
import { generateTestKeyPair } from "./testKeys";

describe("issueLicenseToken", () => {
  it("issues a token whose signature verifies against the matching public key", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();

    const token = await issueLicenseToken({
      licenseKey: "LIC-TEST-0001",
      deviceId: "device-abc",
      privateKeyPem,
      ttlSeconds: 3600,
    });

    const publicKey = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey);

    expect(payload.sub).toBe("LIC-TEST-0001");
    expect(payload.deviceId).toBe("device-abc");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects verification against a different key pair", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const { publicKeyPem: wrongPublicKeyPem } = generateTestKeyPair();

    const token = await issueLicenseToken({
      licenseKey: "LIC-TEST-0002",
      deviceId: "device-xyz",
      privateKeyPem,
      ttlSeconds: 3600,
    });

    const wrongPublicKey = await importSPKI(wrongPublicKeyPem, "RS256");
    await expect(jwtVerify(token, wrongPublicKey)).rejects.toThrow();
  });
});
