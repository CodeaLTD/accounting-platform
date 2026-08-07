"use client";

import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/app/messages";

interface LicenseLockedScreenProps {
  deviceId: string;
  onRetry: () => void;
}

export function LicenseLockedScreen({ deviceId, onRetry }: LicenseLockedScreenProps) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-bold">{MESSAGES.license.lockedTitle}</h1>
      <p>{MESSAGES.license.lockedMessage}</p>
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
