"use client";

import { useRef, useState } from "react";
import { MESSAGES } from "@/app/messages";

const ACCEPTED_EXTENSIONS = [".xls", ".xlsx"];

function hasAcceptedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

interface FileInputProps {
  disabled: boolean;
  onFileSelected: (file: File) => void;
  onInvalidFileType: () => void;
}

export function FileInput({
  disabled,
  onFileSelected,
  onInvalidFileType,
}: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (hasAcceptedExtension(file.name)) {
      setFileName(file.name);
      onFileSelected(file);
    } else {
      onInvalidFileType();
    }
    // Allow re-selecting the same file to re-trigger processing. This also
    // wipes the native input's own "chosen file" display, which is why its
    // name is tracked in state above and rendered separately below instead.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <label className="flex flex-col gap-1">
      {MESSAGES.labels.fileInput}
      <span className="flex items-center gap-2">
        <span
          className={`cursor-pointer rounded px-3 py-1 text-white ${
            disabled ? "bg-gray-400" : "bg-blue-600"
          }`}
        >
          {MESSAGES.labels.chooseFileButton}
        </span>
        {fileName && <span>{fileName}</span>}
      </span>
      <input
        ref={inputRef}
        type="file"
        aria-label={MESSAGES.labels.fileInput}
        accept=".xls,.xlsx"
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
    </label>
  );
}
