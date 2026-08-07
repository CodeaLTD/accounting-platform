import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// The webview's own fetch is subject to browser CORS, and the license API
// isn't (yet) configured to allow the packaged app's real origin
// (tauri://localhost / https://tauri.localhost) — only local web dev
// origins respond with an Access-Control-Allow-Origin header today.
// @tauri-apps/plugin-http makes the request from the Rust side instead,
// which isn't subject to browser CORS at all. Falls back to the regular
// fetch outside Tauri (web dev, tests).
export function licenseFetch(url: string, init: RequestInit): Promise<Response> {
  return isTauri() ? tauriFetch(url, init) : fetch(url, init);
}
