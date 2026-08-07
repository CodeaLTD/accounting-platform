"use client";

import { useState } from "react";
import { MESSAGES } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RegistrationFormProps {
  onSubmit: (params: { email: string; username: string }) => void;
  error?: boolean;
}

export function RegistrationForm({ onSubmit, error }: RegistrationFormProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ email, username });
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-bold">{MESSAGES.registration.title}</h1>
      <p>{MESSAGES.registration.description}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {MESSAGES.registration.errorMessage}
        </p>
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
        <Button type="submit" className="self-start">
          {MESSAGES.registration.submitButton}
        </Button>
      </form>
    </main>
  );
}
