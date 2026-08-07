# License API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the desktop app up to the real Codea Auth Server License API (device self-registration + verify) so the app enforces payment, replacing the project's own speculative `license-server/` + JWT-based `src/core/license/`.

**Architecture:** A framework-agnostic `src/core/license/` API client (`registerDevice`/`verifyLicense`) plus a pure offline-trust-window function (`evaluateLicenseCache`); a Tauri-only `src/platform/license.ts` for persisting credentials/cache to disk; a `runLicenseCheck()` orchestrator in `src/components/licenseCheck.ts`; and a `LicenseGate` component wrapping the app in `layout.tsx` that shows a full-screen locked-out state when blocked. HTTP calls run through `@tauri-apps/plugin-http` instead of the browser's `fetch` when in Tauri, since the live API's CORS config doesn't currently allow the packaged app's real origin (`tauri://localhost`) — only local web dev origins.

**Tech Stack:** Next.js client components, TypeScript, Vitest + Testing Library (existing patterns), `@tauri-apps/plugin-http` (new), `@tauri-apps/plugin-fs` (already installed).

## Global Constraints

- All user-facing copy lives in `src/app/messages.ts` only, in Bulgarian — no component hardcodes a string (existing project rule).
- `src/core/` stays framework-agnostic — no Tauri/Node-only APIs. Tauri-specific branching lives in `src/platform/` or components, following the existing `src/platform/dialog.ts` / `DownloadButton.tsx` `isTauri()` pattern.
- License enforcement is a desktop-only concern: outside Tauri (web dev, tests) the app renders normally with no network call and no persisted state beyond an in-memory fallback.
- The API base URL (`https://codea-auth-server.onrender.com`, moving to Azure soon) lives in exactly one place, `src/core/license/config.ts`, so switching it later is a one-line change (plus the matching `http:default` capability entry, which is static Tauri config and must be updated in lockstep — noted at the point it's introduced).
- Device IDs are random UUIDs generated once and persisted locally (not real hardware fingerprints) — confirmed decision, no interface for a future fingerprint implementation needed.
- No license-key entry UI — there is nothing for the user to type; granting paid access happens via `/api/license/grant/`, called directly against the API, not from this app.

---

### Task 1: Tauri HTTP plugin + filesystem capability setup

**Files:**
- Modify: `package.json` (root)
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the Tauri capability grants every later task's Tauri-side code (`src/core/license/httpClient.ts`, `src/platform/license.ts`) depends on to actually work at runtime — `@tauri-apps/plugin-http`'s `fetch` reaching `codea-auth-server.onrender.com`, and `@tauri-apps/plugin-fs` reading/writing a file directly under `$APPDATA` (today's capability only grants `fs:allow-write-file`, which works for `DownloadButton`'s dialog-selected paths but not an unprompted read/write to a fixed app-data path).

This task has no test of its own — Rust/capability config isn't unit-tested; it's verified by `cargo check` compiling and later tasks' Tauri code working when manually smoke-tested in Task 11.

- [ ] **Step 1: Add the `@tauri-apps/plugin-http` npm package**

```bash
npm install @tauri-apps/plugin-http
```

- [ ] **Step 2: Add the Rust dependency**

Edit `src-tauri/Cargo.toml`, adding this line under `[dependencies]` (after `tauri-plugin-fs = "2"`):

```toml
tauri-plugin-http = "2"
```

- [ ] **Step 3: Register the plugin**

Edit `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

- [ ] **Step 4: Grant the capabilities**

Replace the full contents of `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:allow-write-file",
    "fs:allow-appdata-read",
    "fs:allow-appdata-write",
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://codea-auth-server.onrender.com/*" }]
    }
  ]
}
```

`fs:allow-appdata-read`/`fs:allow-appdata-write` grant non-recursive read/write (including `exists`/`mkdir`) scoped to `$APPDATA` — exactly what `src/platform/license.ts` (Task 6) needs for a single file directly under the app's data dir. The `http:default` entry's `allow` URL is the one piece of static config that must be updated by hand alongside `LICENSE_API_BASE_URL` (Task 2) whenever the API's base URL changes — they can't share a single source of truth since one is compiled into the Tauri binary and the other is a JS constant.

- [ ] **Step 5: Verify the Rust side compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors (may take a while on first run as `tauri-plugin-http` and its dependencies build).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "Add Tauri HTTP plugin and appdata fs capabilities for license storage"
```

---

### Task 2: License core types + API base URL constant

**Files:**
- Create: `src/core/license/config.ts`
- Create: `src/core/license/types.ts` (replaces the existing file's contents)

**Interfaces:**
- Consumes: nothing.
- Produces: `LICENSE_API_BASE_URL` (used by Task 5's `api.ts`); `DeviceCredentials`, `LicenseSnapshot`, `CachedLicense`, `RegisterOutcome`, `VerifyOutcome`, `LicenseBlockReason`, `LicenseDecision` — used by every later task in this plan. These exact names and shapes are load-bearing for Tasks 3, 5, 6, and 8.

This task is types + a constant, no runtime behavior — verified by the TypeScript compiler, matching the "no test to write first" pattern used for pure-type tasks elsewhere in this codebase's plans.

- [ ] **Step 1: Create the config constant**

Create `src/core/license/config.ts`:

```ts
// Base URL for the Codea Auth Server's License API. Update this — and the
// matching `http:default` allow-list entry in
// src-tauri/capabilities/default.json — together when the API moves (e.g.
// off Render's free tier onto Azure). They can't share a single source of
// truth: this one is a JS constant, the other is compiled into the Tauri
// binary as static capability config.
export const LICENSE_API_BASE_URL = "https://codea-auth-server.onrender.com";
```

- [ ] **Step 2: Replace the license types**

Replace the full contents of `src/core/license/types.ts`:

```ts
export interface DeviceCredentials {
  deviceId: string;
  apiKey: string;
}

export interface LicenseSnapshot {
  isPaid: boolean;
  expiresAt: string | null;
  planType: string | null;
}

export interface CachedLicense extends LicenseSnapshot {
  /** Epoch ms when this snapshot was written locally — not from the server. */
  verifiedAt: number;
  /** From the server's `cacheMaxAgeHours` on the response that produced this snapshot. */
  cacheMaxAgeHours: number;
}

export type RegisterOutcome =
  | { ok: true; deviceId: string; apiKey: string }
  | { ok: false; reason: "conflict" | "invalid_request" | "network_error" };

export type VerifyOutcome =
  | ({ ok: true; cacheMaxAgeHours: number } & LicenseSnapshot)
  | { ok: false; reason: "invalid_credentials" | "revoked" | "network_error" };

// "registration_failed" is only ever produced directly by
// src/components/licenseCheck.ts (Task 8) when device registration itself
// fails — evaluateLicenseCache (Task 3) never returns it, since it only
// ever sees an already-registered device's verify outcome.
export type LicenseBlockReason =
  | "unpaid"
  | "invalid_credentials"
  | "revoked"
  | "no_network_no_cache"
  | "no_network_cache_expired"
  | "registration_failed";

export type LicenseDecision =
  | ({ status: "allowed" } & LicenseSnapshot)
  | { status: "blocked"; reason: Exclude<LicenseBlockReason, "registration_failed"> };
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: errors in `src/core/license/verifyToken.ts`/`verifyToken.test.ts` and `src/core/license/licenseState.ts`/`licenseState.test.ts` (they reference the old `LicensePayload` type this replaces) — that's expected, those files are deleted in Task 10. No errors anywhere else.

- [ ] **Step 4: Commit**

```bash
git add src/core/license/config.ts src/core/license/types.ts
git commit -m "Replace JWT-era license types with the real API's device/verify shapes"
```

---

### Task 3: Offline trust-window logic (`evaluateLicenseCache`)

**Files:**
- Create: `src/core/license/cache.ts`
- Test: `src/core/license/cache.test.ts`

**Interfaces:**
- Consumes: `CachedLicense`, `LicenseDecision`, `VerifyOutcome` from Task 2.
- Produces: `evaluateLicenseCache(params: { liveResult: VerifyOutcome; cached: CachedLicense | null; now: number }): LicenseDecision` — a pure function with no `fetch`/storage, consumed by Task 8's `runLicenseCheck`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/license/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateLicenseCache } from "./cache";
import type { CachedLicense, VerifyOutcome } from "./types";

const NOW = 1_700_000_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function cachedAt(ageHours: number, overrides: Partial<CachedLicense> = {}): CachedLicense {
  return {
    isPaid: true,
    expiresAt: "2099-01-01T00:00:00Z",
    planType: "yearly",
    verifiedAt: NOW - ageHours * ONE_HOUR_MS,
    cacheMaxAgeHours: 24,
    ...overrides,
  };
}

describe("evaluateLicenseCache", () => {
  it("allows when the live call succeeds and isPaid is true", () => {
    const liveResult: VerifyOutcome = {
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "allowed",
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
    });
  });

  it("blocks with 'unpaid' when the live call succeeds but isPaid is false", () => {
    const liveResult: VerifyOutcome = {
      ok: true,
      isPaid: false,
      expiresAt: null,
      planType: null,
      cacheMaxAgeHours: 24,
    };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "blocked",
      reason: "unpaid",
    });
  });

  it("blocks with 'invalid_credentials' regardless of any cache", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "invalid_credentials" };
    expect(
      evaluateLicenseCache({ liveResult, cached: cachedAt(0), now: NOW }),
    ).toEqual({ status: "blocked", reason: "invalid_credentials" });
  });

  it("blocks with 'revoked' regardless of any cache", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "revoked" };
    expect(
      evaluateLicenseCache({ liveResult, cached: cachedAt(0), now: NOW }),
    ).toEqual({ status: "blocked", reason: "revoked" });
  });

  it("blocks with 'no_network_no_cache' on a network error with nothing cached", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    expect(evaluateLicenseCache({ liveResult, cached: null, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_no_cache",
    });
  });

  it("trusts a fresh cache on a network error", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1); // 1 hour old, cacheMaxAgeHours: 24
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "allowed",
      isPaid: true,
      expiresAt: cached.expiresAt,
      planType: cached.planType,
    });
  });

  it("blocks with 'no_network_cache_expired' once the cache is past cacheMaxAgeHours", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(25); // 25 hours old, cacheMaxAgeHours: 24
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "no_network_cache_expired",
    });
  });

  it("trusts a cached unpaid result within the window as 'unpaid', not a crash", () => {
    const liveResult: VerifyOutcome = { ok: false, reason: "network_error" };
    const cached = cachedAt(1, { isPaid: false, expiresAt: null, planType: null });
    expect(evaluateLicenseCache({ liveResult, cached, now: NOW })).toEqual({
      status: "blocked",
      reason: "unpaid",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/license/cache.test.ts`
Expected: FAIL — `./cache` does not exist yet.

- [ ] **Step 3: Implement `evaluateLicenseCache`**

Create `src/core/license/cache.ts`:

```ts
import type { CachedLicense, LicenseDecision, VerifyOutcome } from "./types";

export function evaluateLicenseCache(params: {
  liveResult: VerifyOutcome;
  cached: CachedLicense | null;
  now: number;
}): LicenseDecision {
  const { liveResult, cached, now } = params;

  if (liveResult.ok) {
    return liveResult.isPaid
      ? {
          status: "allowed",
          isPaid: true,
          expiresAt: liveResult.expiresAt,
          planType: liveResult.planType,
        }
      : { status: "blocked", reason: "unpaid" };
  }

  if (liveResult.reason === "invalid_credentials" || liveResult.reason === "revoked") {
    return { status: "blocked", reason: liveResult.reason };
  }

  if (!cached) {
    return { status: "blocked", reason: "no_network_no_cache" };
  }

  const cacheAgeMs = now - cached.verifiedAt;
  const maxAgeMs = cached.cacheMaxAgeHours * 60 * 60 * 1000;
  if (cacheAgeMs >= maxAgeMs) {
    return { status: "blocked", reason: "no_network_cache_expired" };
  }

  return cached.isPaid
    ? {
        status: "allowed",
        isPaid: true,
        expiresAt: cached.expiresAt,
        planType: cached.planType,
      }
    : { status: "blocked", reason: "unpaid" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/license/cache.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/license/cache.ts src/core/license/cache.test.ts
git commit -m "Add pure offline trust-window logic for cached license verification"
```

---

### Task 4: CORS-safe HTTP client (`licenseFetch`)

**Files:**
- Create: `src/core/license/httpClient.ts`
- Test: `src/core/license/httpClient.test.ts`

**Interfaces:**
- Consumes: `isTauri` from `@tauri-apps/api/core`; `fetch` from `@tauri-apps/plugin-http` (Task 1).
- Produces: `licenseFetch(url: string, init: RequestInit): Promise<Response>` — used by Task 5's `api.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/license/httpClient.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { licenseFetch } from "./httpClient";

const { isTauriMock, tauriFetchMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => false),
  tauriFetchMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetchMock }));

describe("licenseFetch", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    tauriFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the global fetch outside Tauri", async () => {
    const globalFetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));

    await licenseFetch("https://example.com", { method: "GET" });

    expect(globalFetchSpy).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
    });
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });

  it("uses the Tauri HTTP plugin's fetch when running in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    tauriFetchMock.mockResolvedValue(new Response("ok"));
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");

    await licenseFetch("https://example.com", { method: "GET" });

    expect(tauriFetchMock).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
    });
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/license/httpClient.test.ts`
Expected: FAIL — `./httpClient` does not exist yet.

- [ ] **Step 3: Implement `licenseFetch`**

Create `src/core/license/httpClient.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/license/httpClient.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/license/httpClient.ts src/core/license/httpClient.test.ts
git commit -m "Add CORS-safe fetch wrapper routing through the Tauri HTTP plugin"
```

---

### Task 5: License API client (`registerDevice` / `verifyLicense`)

**Files:**
- Create: `src/core/license/api.ts`
- Test: `src/core/license/api.test.ts`

**Interfaces:**
- Consumes: `LICENSE_API_BASE_URL` (Task 2), `licenseFetch` (Task 4), `DeviceCredentials`/`RegisterOutcome`/`VerifyOutcome` (Task 2).
- Produces: `registerDevice(params: { deviceId: string; platform?: string; appVersion?: string }): Promise<RegisterOutcome>` and `verifyLicense(credentials: DeviceCredentials): Promise<VerifyOutcome>` — both consumed by Task 8's `runLicenseCheck`.

- [ ] **Step 1: Write the failing tests**

Create `src/core/license/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDevice, verifyLicense } from "./api";

const { licenseFetchMock } = vi.hoisted(() => ({ licenseFetchMock: vi.fn() }));
vi.mock("./httpClient", () => ({ licenseFetch: licenseFetchMock }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("registerDevice", () => {
  beforeEach(() => licenseFetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("returns ok with deviceId and apiKey on 201", async () => {
    licenseFetchMock.mockResolvedValue(
      jsonResponse(201, { deviceId: "A1B2", apiKey: "cda_xxx", isPaid: false }),
    );
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: true, deviceId: "A1B2", apiKey: "cda_xxx" });
  });

  it("returns 'conflict' on 409", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(409, { error: "x" }));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "conflict" });
  });

  it("returns 'invalid_request' on 400", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(400, { error: "x" }));
    const result = await registerDevice({ deviceId: "" });
    expect(result).toEqual({ ok: false, reason: "invalid_request" });
  });

  it("returns 'network_error' when the request throws", async () => {
    licenseFetchMock.mockRejectedValue(new Error("offline"));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });

  it("returns 'network_error' on an unexpected server error status", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(500, { error: "server_error" }));
    const result = await registerDevice({ deviceId: "A1B2" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });
});

describe("verifyLicense", () => {
  beforeEach(() => licenseFetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("returns the license snapshot on 200", async () => {
    licenseFetchMock.mockResolvedValue(
      jsonResponse(200, {
        isPaid: true,
        expiresAt: "2026-12-31T00:00:00+00:00",
        planType: "yearly",
        serverTime: "2026-08-05T09:14:22+00:00",
        cacheMaxAgeHours: 24,
      }),
    );
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({
      ok: true,
      isPaid: true,
      expiresAt: "2026-12-31T00:00:00+00:00",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });
  });

  it("returns 'invalid_credentials' on 401", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(401, { error: "x" }));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "wrong" });
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("returns 'revoked' on 403", async () => {
    licenseFetchMock.mockResolvedValue(jsonResponse(403, { error: "x" }));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("returns 'network_error' when the request throws", async () => {
    licenseFetchMock.mockRejectedValue(new Error("offline"));
    const result = await verifyLicense({ deviceId: "A1B2", apiKey: "cda_xxx" });
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/license/api.test.ts`
Expected: FAIL — `./api` does not exist yet.

- [ ] **Step 3: Implement the API client**

Create `src/core/license/api.ts`:

```ts
import { LICENSE_API_BASE_URL } from "./config";
import { licenseFetch } from "./httpClient";
import type { DeviceCredentials, RegisterOutcome, VerifyOutcome } from "./types";

export interface RegisterDeviceParams {
  deviceId: string;
  platform?: string;
  appVersion?: string;
}

export async function registerDevice(
  params: RegisterDeviceParams,
): Promise<RegisterOutcome> {
  let response: Response;
  try {
    response = await licenseFetch(`${LICENSE_API_BASE_URL}/api/device/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (response.status === 201) {
    const body = (await response.json()) as { deviceId: string; apiKey: string };
    return { ok: true, deviceId: body.deviceId, apiKey: body.apiKey };
  }
  if (response.status === 409) {
    return { ok: false, reason: "conflict" };
  }
  if (response.status === 400) {
    return { ok: false, reason: "invalid_request" };
  }
  return { ok: false, reason: "network_error" };
}

export async function verifyLicense(
  credentials: DeviceCredentials,
): Promise<VerifyOutcome> {
  let response: Response;
  try {
    response = await licenseFetch(`${LICENSE_API_BASE_URL}/api/license/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (response.status === 200) {
    const body = (await response.json()) as {
      isPaid: boolean;
      expiresAt: string | null;
      planType: string | null;
      cacheMaxAgeHours: number;
    };
    return {
      ok: true,
      isPaid: body.isPaid,
      expiresAt: body.expiresAt ?? null,
      planType: body.planType ?? null,
      cacheMaxAgeHours: body.cacheMaxAgeHours,
    };
  }
  if (response.status === 401) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (response.status === 403) {
    return { ok: false, reason: "revoked" };
  }
  return { ok: false, reason: "network_error" };
}
```

Any status outside the ones explicitly handled (e.g. the live server's current `500`s) falls through to `"network_error"` — deliberately, since Task 3's `evaluateLicenseCache` treats that as "couldn't get a real answer, fall back to cache" rather than crashing, which is exactly the right behavior whether the server is down for a real network reason or (as it is today) returning `500`s.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/license/api.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/license/api.ts src/core/license/api.test.ts
git commit -m "Add registerDevice/verifyLicense API client for the License endpoints"
```

---

### Task 6: Desktop credential/cache storage (`src/platform/license.ts`)

**Files:**
- Create: `src/platform/license.ts`
- Test: `src/platform/license.test.ts`

**Interfaces:**
- Consumes: `DeviceCredentials`, `CachedLicense` from Task 2.
- Produces: `LicenseState` (`{ credentials: DeviceCredentials | null; cached: CachedLicense | null }`), `loadLicenseState(): Promise<LicenseState>`, `saveCredentials(credentials: DeviceCredentials): Promise<void>`, `saveCachedLicense(cached: CachedLicense): Promise<void>` — all consumed by Task 8's `runLicenseCheck`.

- [ ] **Step 1: Write the failing tests**

Create `src/platform/license.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const { isTauriMock, existsMock, mkdirMock, readTextFileMock, writeTextFileMock } =
  vi.hoisted(() => ({
    isTauriMock: vi.fn(() => false),
    existsMock: vi.fn(),
    mkdirMock: vi.fn(),
    readTextFileMock: vi.fn(),
    writeTextFileMock: vi.fn(),
  }));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  exists: existsMock,
  mkdir: mkdirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

const credentials: DeviceCredentials = { deviceId: "A1B2", apiKey: "cda_xxx" };
const cached: CachedLicense = {
  isPaid: true,
  expiresAt: "2099-01-01T00:00:00Z",
  planType: "yearly",
  verifiedAt: 1_700_000_000_000,
  cacheMaxAgeHours: 24,
};

describe("platform/license", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    existsMock.mockReset();
    mkdirMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // license.ts keeps its non-Tauri fallback in module-level memoryState —
    // reset the module between tests so that state doesn't leak across them.
    vi.resetModules();
  });

  it("returns empty state outside Tauri before anything is saved", async () => {
    const { loadLicenseState } = await import("./license");
    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
  });

  it("round-trips credentials and cache through in-memory state outside Tauri", async () => {
    const { loadLicenseState, saveCredentials, saveCachedLicense } = await import(
      "./license"
    );
    await saveCredentials(credentials);
    await saveCachedLicense(cached);
    expect(await loadLicenseState()).toEqual({ credentials, cached });
  });

  it("returns empty state in Tauri when no file exists yet", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(false);
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it("reads and parses the stored file in Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({ credentials, cached }));
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials, cached });
  });

  it("treats a malformed stored file as no stored credentials", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue("not json");
    const { loadLicenseState } = await import("./license");

    expect(await loadLicenseState()).toEqual({ credentials: null, cached: null });
  });

  it("writes credentials to disk in Tauri, preserving any existing cache", async () => {
    isTauriMock.mockReturnValue(true);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({ credentials: null, cached }));
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    const { saveCredentials } = await import("./license");

    await saveCredentials(credentials);

    expect(mkdirMock).toHaveBeenCalledWith(".", {
      baseDir: "AppData",
      recursive: true,
    });
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "license.json",
      JSON.stringify({ credentials, cached }),
      { baseDir: "AppData" },
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/platform/license.test.ts`
Expected: FAIL — `./license` does not exist yet.

- [ ] **Step 3: Implement the storage layer**

Create `src/platform/license.ts`:

```ts
import { isTauri } from "@tauri-apps/api/core";
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";

const STORAGE_FILE = "license.json";

export interface LicenseState {
  credentials: DeviceCredentials | null;
  cached: CachedLicense | null;
}

// Desktop-only concern (see licenseCheck.ts, which only calls this while
// isTauri()) — web/dev/test just keeps state in memory for the life of the
// process, matching the existing DownloadButton/dialog.ts pattern of
// branching on isTauri() rather than modeling a real web backend.
let memoryState: LicenseState = { credentials: null, cached: null };

async function readState(): Promise<LicenseState> {
  const fileExists = await exists(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
  if (!fileExists) return { credentials: null, cached: null };
  try {
    const raw = await readTextFile(STORAGE_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw) as Partial<LicenseState>;
    return {
      credentials: parsed.credentials ?? null,
      cached: parsed.cached ?? null,
    };
  } catch {
    // Malformed file — treat as no stored credentials rather than crashing;
    // a fresh registration will overwrite it on the next successful write.
    return { credentials: null, cached: null };
  }
}

async function writeState(state: LicenseState): Promise<void> {
  await mkdir(".", { baseDir: BaseDirectory.AppData, recursive: true });
  await writeTextFile(STORAGE_FILE, JSON.stringify(state), {
    baseDir: BaseDirectory.AppData,
  });
}

export async function loadLicenseState(): Promise<LicenseState> {
  if (isTauri()) return readState();
  return memoryState;
}

export async function saveCredentials(credentials: DeviceCredentials): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, credentials });
    return;
  }
  memoryState = { ...memoryState, credentials };
}

export async function saveCachedLicense(cached: CachedLicense): Promise<void> {
  if (isTauri()) {
    const state = await readState();
    await writeState({ ...state, cached });
    return;
  }
  memoryState = { ...memoryState, cached };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/platform/license.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/license.ts src/platform/license.test.ts
git commit -m "Add Tauri filesystem storage for license credentials and cache"
```

---

### Task 7: Locked-out screen + its copy

**Files:**
- Modify: `src/app/messages.ts`
- Create: `src/components/LicenseLockedScreen.tsx`
- Test: `src/components/LicenseLockedScreen.test.tsx`

**Interfaces:**
- Consumes: `MESSAGES` (extended in this task).
- Produces: `LicenseLockedScreen` component with props `{ deviceId: string; onRetry: () => void }` — consumed by Task 9's `LicenseGate`.

- [ ] **Step 1: Add the license copy**

In `src/app/messages.ts`, add a new top-level key to the `MESSAGES` object (after the existing `confirmations` key, before the closing `} as const;`):

```ts
  license: {
    checkingMessage: "Проверка на лиценза...",
    lockedTitle: "Устройството не е активирано",
    lockedMessage:
      "Това устройство все още няма активен платен достъп. Моля, свържете се с поддръжката и посочете кода на устройството по-долу.",
    deviceIdLabel: "Код на устройството",
    retryButton: "Провери отново",
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/components/LicenseLockedScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseLockedScreen } from "./LicenseLockedScreen";

describe("LicenseLockedScreen", () => {
  it("shows the device id and locked message", () => {
    render(<LicenseLockedScreen deviceId="A1B2-C3D4" onRetry={vi.fn()} />);
    expect(screen.getByText(MESSAGES.license.lockedMessage)).toBeInTheDocument();
    expect(screen.getByLabelText(MESSAGES.license.deviceIdLabel)).toHaveTextContent(
      "A1B2-C3D4",
    );
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LicenseLockedScreen deviceId="A1B2-C3D4" onRetry={onRetry} />);

    await user.click(
      screen.getByRole("button", { name: MESSAGES.license.retryButton }),
    );

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/LicenseLockedScreen.test.tsx`
Expected: FAIL — `./LicenseLockedScreen` does not exist yet.

- [ ] **Step 4: Implement the component**

Create `src/components/LicenseLockedScreen.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/app/messages";

interface LicenseLockedScreenProps {
  deviceId: string;
  onRetry: () => void;
}

export function LicenseLockedScreen({ deviceId, onRetry }: LicenseLockedScreenProps) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
      <h1 className="text-xl font-bold">{MESSAGES.license.lockedTitle}</h1>
      <p>{MESSAGES.license.lockedMessage}</p>
      <p>
        <span className="font-semibold">{MESSAGES.license.deviceIdLabel}:</span>{" "}
        <span aria-label={MESSAGES.license.deviceIdLabel}>{deviceId}</span>
      </p>
      <Button type="button" onClick={onRetry}>
        {MESSAGES.license.retryButton}
      </Button>
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/LicenseLockedScreen.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/messages.ts src/components/LicenseLockedScreen.tsx src/components/LicenseLockedScreen.test.tsx
git commit -m "Add locked-out screen for unlicensed/unpaid devices"
```

---

### Task 8: License-check orchestration (`runLicenseCheck`)

**Files:**
- Create: `src/components/licenseCheck.ts`
- Test: `src/components/licenseCheck.test.ts`

**Interfaces:**
- Consumes: `registerDevice`/`verifyLicense` (Task 5), `evaluateLicenseCache` (Task 3), `loadLicenseState`/`saveCredentials`/`saveCachedLicense` (Task 6), `LicenseBlockReason`/`DeviceCredentials` (Task 2).
- Produces: `GateResult` (`{ status: "allowed" } | { status: "blocked"; deviceId: string; reason: LicenseBlockReason }`) and `runLicenseCheck(): Promise<GateResult>` — consumed by Task 9's `LicenseGate`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/licenseCheck.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedLicense, DeviceCredentials } from "@/core/license/types";
import { runLicenseCheck } from "./licenseCheck";

const {
  isTauriMock,
  registerDeviceMock,
  verifyLicenseMock,
  loadLicenseStateMock,
  saveCredentialsMock,
  saveCachedLicenseMock,
} = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  registerDeviceMock: vi.fn(),
  verifyLicenseMock: vi.fn(),
  loadLicenseStateMock: vi.fn(),
  saveCredentialsMock: vi.fn(),
  saveCachedLicenseMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("@/core/license/api", () => ({
  registerDevice: registerDeviceMock,
  verifyLicense: verifyLicenseMock,
}));
vi.mock("@/platform/license", () => ({
  loadLicenseState: loadLicenseStateMock,
  saveCredentials: saveCredentialsMock,
  saveCachedLicense: saveCachedLicenseMock,
}));

const credentials: DeviceCredentials = {
  deviceId: "existing-device",
  apiKey: "cda_existing",
};
const cached: CachedLicense = {
  isPaid: true,
  expiresAt: "2099-01-01T00:00:00Z",
  planType: "yearly",
  verifiedAt: 1_700_000_000_000,
  cacheMaxAgeHours: 24,
};

describe("runLicenseCheck", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    registerDeviceMock.mockReset();
    verifyLicenseMock.mockReset();
    loadLicenseStateMock.mockReset();
    saveCredentialsMock.mockReset();
    saveCachedLicenseMock.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "new-device-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("registers a new device when no credentials are stored, then verifies", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials: null, cached: null });
    registerDeviceMock.mockResolvedValue({
      ok: true,
      deviceId: "new-device-id",
      apiKey: "cda_new",
    });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(registerDeviceMock).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: "new-device-id" }),
    );
    expect(saveCredentialsMock).toHaveBeenCalledWith({
      deviceId: "new-device-id",
      apiKey: "cda_new",
    });
    expect(result).toEqual({ status: "allowed" });
  });

  it("blocks with 'registration_failed' when registration fails", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials: null, cached: null });
    registerDeviceMock.mockResolvedValue({ ok: false, reason: "network_error" });

    const result = await runLicenseCheck();

    expect(verifyLicenseMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "blocked",
      deviceId: "new-device-id",
      reason: "registration_failed",
    });
  });

  it("skips registration and verifies directly when credentials are already stored", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached: null });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: true,
      expiresAt: "2099-01-01T00:00:00Z",
      planType: "yearly",
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(registerDeviceMock).not.toHaveBeenCalled();
    expect(verifyLicenseMock).toHaveBeenCalledWith(credentials);
    expect(result).toEqual({ status: "allowed" });
  });

  it("persists a fresh cache entry whenever the live verify call succeeds", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached: null });
    verifyLicenseMock.mockResolvedValue({
      ok: true,
      isPaid: false,
      expiresAt: null,
      planType: null,
      cacheMaxAgeHours: 24,
    });

    const result = await runLicenseCheck();

    expect(saveCachedLicenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPaid: false, cacheMaxAgeHours: 24 }),
    );
    expect(result).toEqual({
      status: "blocked",
      deviceId: "existing-device",
      reason: "unpaid",
    });
  });

  it("falls back to a cached allowed result on a network error within the cache window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(cached.verifiedAt + 60 * 60 * 1000); // 1h later, well within 24h
    loadLicenseStateMock.mockResolvedValue({ credentials, cached });
    verifyLicenseMock.mockResolvedValue({ ok: false, reason: "network_error" });

    const result = await runLicenseCheck();

    expect(saveCachedLicenseMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "allowed" });
  });

  it("blocks with 'invalid_credentials' on a 401, even with a valid cache", async () => {
    loadLicenseStateMock.mockResolvedValue({ credentials, cached });
    verifyLicenseMock.mockResolvedValue({ ok: false, reason: "invalid_credentials" });

    const result = await runLicenseCheck();

    expect(result).toEqual({
      status: "blocked",
      deviceId: "existing-device",
      reason: "invalid_credentials",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/licenseCheck.test.ts`
Expected: FAIL — `./licenseCheck` does not exist yet.

- [ ] **Step 3: Implement `runLicenseCheck`**

Create `src/components/licenseCheck.ts`:

```ts
import { isTauri } from "@tauri-apps/api/core";
import packageJson from "../../package.json";
import { registerDevice, verifyLicense } from "@/core/license/api";
import { evaluateLicenseCache } from "@/core/license/cache";
import type { DeviceCredentials, LicenseBlockReason } from "@/core/license/types";
import {
  loadLicenseState,
  saveCachedLicense,
  saveCredentials,
} from "@/platform/license";

export type GateResult =
  | { status: "allowed" }
  | { status: "blocked"; deviceId: string; reason: LicenseBlockReason };

export async function runLicenseCheck(): Promise<GateResult> {
  const stored = await loadLicenseState();
  let credentials: DeviceCredentials | null = stored.credentials;

  if (!credentials) {
    const deviceId = crypto.randomUUID();
    const registerResult = await registerDevice({
      deviceId,
      platform: isTauri() ? "desktop" : undefined,
      appVersion: packageJson.version,
    });
    if (!registerResult.ok) {
      return { status: "blocked", deviceId, reason: "registration_failed" };
    }
    credentials = {
      deviceId: registerResult.deviceId,
      apiKey: registerResult.apiKey,
    };
    await saveCredentials(credentials);
  }

  const liveResult = await verifyLicense(credentials);
  if (liveResult.ok) {
    await saveCachedLicense({
      isPaid: liveResult.isPaid,
      expiresAt: liveResult.expiresAt,
      planType: liveResult.planType,
      verifiedAt: Date.now(),
      cacheMaxAgeHours: liveResult.cacheMaxAgeHours,
    });
  }

  const decision = evaluateLicenseCache({
    liveResult,
    cached: stored.cached,
    now: Date.now(),
  });

  if (decision.status === "allowed") return { status: "allowed" };
  return { status: "blocked", deviceId: credentials.deviceId, reason: decision.reason };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/licenseCheck.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/licenseCheck.ts src/components/licenseCheck.test.ts
git commit -m "Add runLicenseCheck orchestration (register-if-needed, verify, cache fallback)"
```

---

### Task 9: `LicenseGate` component + wiring into the app

**Files:**
- Create: `src/components/LicenseGate.tsx`
- Test: `src/components/LicenseGate.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `runLicenseCheck`/`GateResult` (Task 8), `LicenseLockedScreen` (Task 7), `MESSAGES.license.checkingMessage` (Task 7).
- Produces: `LicenseGate` component with props `{ children: React.ReactNode }`, wired into `src/app/layout.tsx` — the last task, nothing downstream depends on it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/LicenseGate.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { LicenseGate } from "./LicenseGate";

const { isTauriMock, runLicenseCheckMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(() => true),
  runLicenseCheckMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }));
vi.mock("./licenseCheck", () => ({ runLicenseCheck: runLicenseCheckMock }));

describe("LicenseGate", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true);
    runLicenseCheckMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children immediately outside Tauri, without calling runLicenseCheck", () => {
    isTauriMock.mockReturnValue(false);
    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(runLicenseCheckMock).not.toHaveBeenCalled();
  });

  it("shows the checking message, then renders children once allowed", async () => {
    let resolveCheck: (value: { status: "allowed" }) => void;
    runLicenseCheckMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    expect(screen.getByText(MESSAGES.license.checkingMessage)).toBeInTheDocument();

    resolveCheck!({ status: "allowed" });
    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
  });

  it("shows the locked screen with the device id when blocked", async () => {
    runLicenseCheckMock.mockResolvedValue({
      status: "blocked",
      deviceId: "A1B2-C3D4",
      reason: "unpaid",
    });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.license.lockedMessage)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(MESSAGES.license.deviceIdLabel)).toHaveTextContent(
      "A1B2-C3D4",
    );
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  it("re-runs the check when the retry button is clicked", async () => {
    const user = userEvent.setup();
    runLicenseCheckMock
      .mockResolvedValueOnce({
        status: "blocked",
        deviceId: "A1B2-C3D4",
        reason: "unpaid",
      })
      .mockResolvedValueOnce({ status: "allowed" });

    render(
      <LicenseGate>
        <p>App content</p>
      </LicenseGate>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: MESSAGES.license.retryButton }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: MESSAGES.license.retryButton }),
    );

    await waitFor(() => {
      expect(screen.getByText("App content")).toBeInTheDocument();
    });
    expect(runLicenseCheckMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/LicenseGate.test.tsx`
Expected: FAIL — `./LicenseGate` does not exist yet.

- [ ] **Step 3: Implement `LicenseGate`**

Create `src/components/LicenseGate.tsx`:

```tsx
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

  const check = useCallback(() => {
    if (!isTauri()) return;
    setState({ phase: "checking" });
    runLicenseCheck().then((result) => {
      setState(
        result.status === "allowed"
          ? { phase: "allowed" }
          : { phase: "blocked", deviceId: result.deviceId },
      );
    });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state.phase === "checking") {
    return <p className="p-8">{MESSAGES.license.checkingMessage}</p>;
  }
  if (state.phase === "blocked") {
    return <LicenseLockedScreen deviceId={state.deviceId} onRetry={check} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/LicenseGate.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `LicenseGate` into the root layout**

Modify `src/app/layout.tsx`: add the import and wrap `{children}`.

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LicenseGate } from "@/components/LicenseGate";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";
```

(Add the `LicenseGate` import alphabetically alongside the existing `ThemeToggle` import.) Then change the `<body>`:

```tsx
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        <LicenseGate>{children}</LicenseGate>
      </body>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LicenseGate.tsx src/components/LicenseGate.test.tsx src/app/layout.tsx
git commit -m "Wire LicenseGate into the root layout to enforce licensing on desktop"
```

---

### Task 10: Retire the JWT-era license server and client code

**Files:**
- Delete: `license-server/` (entire directory)
- Delete: `src/core/license/verifyToken.ts`, `src/core/license/verifyToken.test.ts`
- Delete: `src/core/license/licenseState.ts`, `src/core/license/licenseState.test.ts`
- Modify: `package.json` (root)

**Interfaces:** none — this task only removes code superseded by Tasks 2–9.

- [ ] **Step 1: Delete the standalone license server**

```bash
git rm -r license-server
```

- [ ] **Step 2: Delete the superseded JWT-based core license files**

```bash
git rm src/core/license/verifyToken.ts src/core/license/verifyToken.test.ts src/core/license/licenseState.ts src/core/license/licenseState.test.ts
```

- [ ] **Step 3: Remove the now-unused `jose` dependency and the license-server test script**

Edit `package.json` (root): remove the `"test:license-server": "npm --prefix license-server test"` line from `scripts`, then run:

```bash
npm uninstall jose
```

- [ ] **Step 4: Confirm nothing still references the deleted code**

Run: `npx tsc --noEmit`
Expected: no errors (the errors expected back in Task 2 Step 3, from `verifyToken.ts`/`licenseState.ts` referencing the old `LicensePayload` type, are gone now that those files are deleted).

Run: `npm test`
Expected: all remaining tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Remove the superseded license-server and JWT-based license verification code"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including everything added in Tasks 3–9 and the untouched pre-existing suite.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully (this also confirms `src/app/layout.tsx`'s new `LicenseGate` wiring is valid JSX/TS, since root layouts aren't otherwise unit-tested in this project).

- [ ] **Step 4: Manual desktop smoke test**

Run: `npm run tauri dev`

Expected, given the live API is currently returning `500`s on both endpoints (see plan context — a redeploy to Azure is in progress separately): the app should show the `LicenseLockedScreen` with a freshly generated device ID, **not** crash or hang — this is exactly the "server reachable but erroring" path exercised by `api.ts`'s fallback-to-`network_error`-on-unexpected-status handling (Task 5) and `evaluateLicenseCache`'s `no_network_no_cache` branch (Task 3, since a first-run device has nothing cached yet). Click the retry button to confirm it re-runs the check without restarting the app.

Once the API is redeployed and healthy, re-run this step and confirm: a fresh device shows the locked screen (device starts unpaid), and after granting it via `/api/license/grant/` directly against the API and clicking retry, the app unlocks and shows the normal UI. Also confirm a `license.json` file was created under the OS's app-data directory (Windows: `%APPDATA%/com.codea.accounting-platform/`) containing the stored `deviceId`/`apiKey`.

- [ ] **Step 5: If any step above required a fix, commit it**

```bash
git add -A
git commit -m "fix: address lint/typecheck/build/runtime issues from license API integration"
```

(Skip this step if nothing needed fixing.)
