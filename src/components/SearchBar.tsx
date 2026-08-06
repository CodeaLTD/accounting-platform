"use client";

import { MESSAGES } from "@/app/messages";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex w-64 max-w-full flex-col gap-1 self-start">
      {MESSAGES.labels.searchInput}
      <Input
        type="text"
        aria-label={MESSAGES.labels.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
