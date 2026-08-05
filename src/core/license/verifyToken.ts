import { importSPKI, jwtVerify } from "jose";
import type { LicensePayload } from "./types";

export async function verifyLicenseToken(
  token: string,
  publicKeyPem: string,
): Promise<LicensePayload | null> {
  try {
    const publicKey = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.deviceId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return {
      licenseKey: payload.sub,
      deviceId: payload.deviceId,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
