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

  // Runs the async check and applies its result — no synchronous setState
  // here, so this is safe to call directly from the mount effect below.
  const runCheck = useCallback(() => {
    if (!isTauri()) return;
    runLicenseCheck().then((result) => {
      setState(
        result.status === "allowed"
          ? { phase: "allowed" }
          : { phase: "blocked", deviceId: result.deviceId },
      );
    });
  }, []);

  // The retry button needs to flip back to "checking" before re-running —
  // that setState belongs in this event handler, not the mount effect
  // below, which must not call setState synchronously in its body.
  const retry = useCallback(() => {
    if (!isTauri()) return;
    setState({ phase: "checking" });
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  if (state.phase === "checking") {
    return <p className="p-8">{MESSAGES.license.checkingMessage}</p>;
  }
  if (state.phase === "blocked") {
    return <LicenseLockedScreen deviceId={state.deviceId} onRetry={retry} />;
  }
  return <>{children}</>;
}
