import { SignJWT, importPKCS8 } from "jose";

const ALG = "RS256";

export interface IssueTokenParams {
  licenseKey: string;
  deviceId: string;
  privateKeyPem: string;
  ttlSeconds: number;
}

export async function issueLicenseToken(params: IssueTokenParams): Promise<string> {
  const privateKey = await importPKCS8(params.privateKeyPem, ALG);
  return new SignJWT({ deviceId: params.deviceId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(params.licenseKey)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + params.ttlSeconds)
    .sign(privateKey);
}
