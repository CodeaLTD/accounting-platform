export interface LicensePayload {
  licenseKey: string;
  deviceId: string;
  /** Epoch seconds, matching the JWT `exp` claim. */
  expiresAt: number;
}
