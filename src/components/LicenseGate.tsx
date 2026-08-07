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
  // The initial render must be identical on the prerendered/server pass and
  // the client's first paint, or React logs a hydration-mismatch error and
  // discards the prerendered HTML. isTauri() returns false wherever this
  // page gets prerendered (no Tauri APIs exist there) but true once
  // hydrated inside the actual desktop webview — so it must never be read
  // synchronously during render, only inside the effect below, which runs
  // client-side, after hydration. Always start in "checking" regardless of
  // environment; the effect decides what happens next.
  const [state, setState] = useState<GateState>({ phase: "checking" });

  // Runs the async check and applies its result — no synchronous setState
  // here, so this is safe to call directly from the mount effect below.
  const runCheck = useCallback(() => {
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
    setState({ phase: "checking" });
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    // License enforcement is a desktop-only concern (see
    // src/platform/license.ts) — outside Tauri, render normally with no
    // network call at all. The setState is wrapped in a resolved-promise
    // callback (not called synchronously in the effect body) for the same
    // reason runCheck's is: react-hooks/set-state-in-effect.
    if (!isTauri()) {
      Promise.resolve().then(() => setState({ phase: "allowed" }));
      return;
    }
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
