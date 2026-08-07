"use client";

import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/app/messages";
import type { LicenseBlockReason } from "@/core/license/types";

interface LicenseLockedScreenProps {
  deviceId: string;
  reason: LicenseBlockReason;
  onRetry: () => void;
}

function messageFor(reason: LicenseBlockReason): string {
  switch (reason) {
    case "invalid_credentials":
    case "revoked":
      return MESSAGES.license.credentialsMessage;
    case "no_network_no_cache":
    case "no_network_cache_expired":
      return MESSAGES.license.offlineMessage;
    case "unpaid":
    default:
      return MESSAGES.license.lockedMessage;
  }
}

export function LicenseLockedScreen({ deviceId, reason, onRetry }: LicenseLockedScreenProps) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-bold">{MESSAGES.license.lockedTitle}</h1>
      <p>{messageFor(reason)}</p>
      <p>
        <span className="font-semibold">{MESSAGES.license.deviceIdLabel}:</span>{" "}
        <span aria-label={MESSAGES.license.deviceIdLabel}>{deviceId}</span>
      </p>
      <Button type="button" onClick={onRetry}>
        {MESSAGES.license.retryButton}
      </Button>
    </main>
  );
}
