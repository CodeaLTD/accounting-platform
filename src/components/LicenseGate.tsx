"use client";

import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { MESSAGES } from "@/app/messages";
import { LicenseLockedScreen } from "./LicenseLockedScreen";
import { runLicenseCheck } from "./licenseCheck";

type GateState =
  | { phase: "checking" }
  | { phase: "allowed" }
  | { phase: "blocked"; deviceId: string };

interface LicenseGateProps {
  children: React.ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
  // License enforcement is a desktop-only concern (see src/platform/license.ts)
  // — running the app in a plain browser (e.g. `npm run dev` while iterating
  // on the web UI) always renders normally, with no network call at all.
  const [state, setState] = useState<GateState>(
    isTauri() ? { phase: "checking" } : { phase: "allowed" },
  );

  const check = useCallback(() => {
    if (!isTauri()) return;
    setState({ phase: "checking" });
    runLicenseCheck().then((result) => {
      setState(
        result.status === "allowed"
          ? { phase: "allowed" }
          : { phase: "blocked", deviceId: result.deviceId },
      );
    });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state.phase === "checking") {
    return <p className="p-8">{MESSAGES.license.checkingMessage}</p>;
  }
  if (state.phase === "blocked") {
    return <LicenseLockedScreen deviceId={state.deviceId} onRetry={check} />;
  }
  return <>{children}</>;
}
