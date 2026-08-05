import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyLicenseToken } from "./verifyToken";

function generateTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}

async function signToken(privateKeyPem: string, overrides: { exp?: number } = {}) {
  const { importPKCS8 } = await import("jose");
  const key = await importPKCS8(privateKeyPem, "RS256");
  return new SignJWT({ deviceId: "device-a" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("LIC-0001")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key);
}

describe("verifyLicenseToken", () => {
  it("returns the payload for a validly signed, unexpired token", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const token = await signToken(privateKeyPem);

    const payload = await verifyLicenseToken(token, publicKeyPem);

    expect(payload).toEqual({
      licenseKey: "LIC-0001",
      deviceId: "device-a",
      expiresAt: expect.any(Number),
    });
  });

  it("returns null for a token signed by a different key", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const { publicKeyPem: wrongPublicKeyPem } = generateTestKeyPair();
    const token = await signToken(privateKeyPem);

    expect(await verifyLicenseToken(token, wrongPublicKeyPem)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const expiredToken = await signToken(privateKeyPem, {
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(await verifyLicenseToken(expiredToken, publicKeyPem)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    const { publicKeyPem } = generateTestKeyPair();
    expect(await verifyLicenseToken("not-a-jwt", publicKeyPem)).toBeNull();
  });
});
