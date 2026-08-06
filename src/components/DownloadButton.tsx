"use client";

import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { MESSAGES } from "@/app/messages";
import { intrastatWorkbookToUint8Array } from "@/core/exportXlsx";
import type { IntrastatDeclarationLine } from "@/core/types";

interface DownloadButtonProps {
  lines: IntrastatDeclarationLine[];
  disabled?: boolean;
}

const MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function saveViaTauri(bytes: Uint8Array) {
  const path = await save({
    defaultPath: MESSAGES.files.downloadFileName,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (path) {
    await writeFile(path, bytes);
  }
}

function saveViaBrowser(bytes: Uint8Array) {
  const blob = new Blob([bytes], { type: MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = MESSAGES.files.downloadFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function DownloadButton({ lines, disabled }: DownloadButtonProps) {
  async function handleClick() {
    const bytes = await intrastatWorkbookToUint8Array(lines);
    if (isTauri()) {
      await saveViaTauri(bytes);
    } else {
      saveViaBrowser(bytes);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={lines.length === 0 || disabled}
      className="self-start cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
    >
      {MESSAGES.labels.downloadButton}
    </button>
  );
}
