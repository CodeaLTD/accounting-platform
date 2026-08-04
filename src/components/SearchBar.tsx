"use client";

import { MESSAGES } from "@/app/messages";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex w-64 max-w-full flex-col gap-1 self-start">
      {MESSAGES.labels.searchInput}
      <input
        type="text"
        aria-label={MESSAGES.labels.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-2 py-1"
      />
    </label>
  );
}
