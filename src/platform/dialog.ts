import { isTauri } from "@tauri-apps/api/core";
import { confirm as confirmTauri } from "@tauri-apps/plugin-dialog";

// tauri-plugin-dialog's window.confirm polyfill (init-iife.js) invokes an
// IPC command name that doesn't exist as of plugin 2.7.2 (it always fails
// with "dialog.confirm not allowed. Command not found"), so window.confirm
// must never be called while running in Tauri. Use this instead.
export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri()) {
    return confirmTauri(message);
  }
  return window.confirm(message);
}
