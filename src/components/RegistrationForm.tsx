"use client";

import { useState } from "react";
import { MESSAGES } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegistrationFailureReason } from "./licenseCheck";

interface RegistrationFormProps {
  onSubmit: (params: { email: string; username: string }) => void;
  // While a submission is in flight, the form stays mounted and the
  // button must be disabled — nothing else here changes state to signal
  // "in progress" (no phase change), so double-clicking submit would
  // otherwise fire two concurrent registration attempts for one device.
  pending?: boolean;
  error?: { deviceId: string; reason: RegistrationFailureReason };
}

function messageFor(reason: RegistrationFailureReason): string {
  switch (reason) {
    case "conflict":
      return MESSAGES.registration.conflictMessage;
    case "invalid_request":
    case "network_error":
      return MESSAGES.registration.errorMessage;
  }
}

export function RegistrationForm({ onSubmit, pending, error }: RegistrationFormProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Trimmed and re-checked here because `required` alone doesn't reject
    // a text input containing only whitespace — without this, a
    // space-only username would pass native validation, get trimmed to
    // an empty string, and still submit.
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    if (!trimmedEmail || !trimmedUsername) return;
    onSubmit({ email: trimmedEmail, username: trimmedUsername });
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-bold">{MESSAGES.registration.title}</h1>
      <p>{MESSAGES.registration.description}</p>
      {error && (
        <>
          <p role="alert" className="text-sm text-red-600">
            {messageFor(error.reason)}
          </p>
          <p>
            <span className="font-semibold">{MESSAGES.license.deviceIdLabel}:</span>{" "}
            <span aria-label={MESSAGES.license.deviceIdLabel}>{error.deviceId}</span>
          </p>
        </>
      )}
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <label className="flex flex-col gap-1">
          {MESSAGES.registration.emailLabel}
          <Input
            type="email"
            required
            aria-label={MESSAGES.registration.emailLabel}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          {MESSAGES.registration.usernameLabel}
          <Input
            type="text"
            required
            aria-label={MESSAGES.registration.usernameLabel}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={pending} className="self-start">
          {MESSAGES.registration.submitButton}
        </Button>
      </form>
    </main>
  );
}
