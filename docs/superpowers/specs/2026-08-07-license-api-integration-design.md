# License API Integration — Design

Date: 2026-08-07
Status: Approved by user, pending spec review

## Purpose

The desktop app has no license enforcement today — anyone with the installer
can run it indefinitely. A real backend already exists at
`https://codea-auth-server.onrender.com` (Codea Auth Server) with a `License`
API surface built for exactly this: device self-registration, a manual
admin-granted paid flag, and a verify check the client calls on launch. This
design wires the desktop app up to that API, replacing the project's own
speculative `license-server/` + JWT-based `src/core/license/` (both built
before the real API existed, against different assumptions).

The real API has no license *keys* and no seat pool — a device registers
itself and starts unpaid; you (the admin) flip it to paid by hand via
`/api/license/grant/` once the client pays. There's no self-serve activation
UI to build.

## API surface used (License tag only)

- `POST /api/device/register/` — body `{ deviceId, platform?, appVersion?,
  username?, email? }` (`deviceId` required). No auth. Returns `201` with
  `{ deviceId, apiKey, isPaid: false }` — `apiKey` is shown only this once.
  `409` if `deviceId` already registered.
- `POST /api/license/verify/` — body `{ deviceId, apiKey }`. No auth (the
  `apiKey` *is* the credential). `200` always carries `isPaid`, plus
  `expiresAt`, `planType`, `serverTime`, `cacheMaxAgeHours`. `401` for
  unknown device/wrong key, `403` if the device's key was revoked.
- `/api/license/grant/` and `/api/license/revoke/` are admin-only
  (JWT + `admin`/`license_admin` role) and are **not called by the desktop
  app** — out of scope here, used by you directly against the API.

## Architecture

- `src/core/license/` (framework-agnostic, no Tauri/Node APIs, matching the
  existing project rule for `src/core`) holds the pure API client:
  `registerDevice()`, `verifyLicense()` (thin `fetch` wrappers returning
  typed results, translating HTTP status into a discriminated union rather
  than throwing on 401/403/409 — those are expected outcomes, not
  exceptions) and `evaluateLicenseCache()`, a pure function implementing the
  offline-trust window decision (see below), unit-testable with a fake
  clock and no network.
- `src/platform/license.ts` *(new, alongside the existing
  `src/platform/dialog.ts` desktop/web split pattern)* owns reading/writing
  the persisted `{ deviceId, apiKey }` and last verify result. On Tauri, this
  is a JSON file in the app's data dir via `@tauri-apps/plugin-fs`
  (`appDataDir()` + `readTextFile`/`writeTextFile`, creating the file on
  first write); on web (dev/test), an in-memory fallback — license
  enforcement is a desktop-only concern, matching how `DownloadButton`
  already branches on `isTauri()`.
- `src/components/LicenseGate.tsx` *(new)* wraps `{children}` in
  `src/app/layout.tsx`, alongside the existing `<ThemeToggle />`. On mount it
  runs the full check (load-or-register → verify → cache fallback) and
  renders one of: a loading state, the locked-out screen, or `children`.

## Offline trust window

Server response and local cache both carry `{ isPaid, expiresAt, planType,
verifiedAt, cacheMaxAgeHours }` (`verifiedAt` and `cacheMaxAgeHours` are
added locally, not from the server, to timestamp when *this* cache entry was
written and how long it was told to be trusted).

`evaluateLicenseCache(params: { liveResult: VerifyOutcome; cached:
CachedLicense | null; now: number }): LicenseDecision`:

- Live call succeeded (`200`) → decision is that result directly; persist it
  as the new cache (overwriting the old one).
- Live call returned `401`/`403` → hard-blocked, regardless of any cache.
  These mean "this device/key is not valid," not "server unreachable" — an
  offline grace period does not apply.
- Live call failed to complete (network error, timeout, `5xx`) → fall back
  to `cached`. If `cached` is `null`, blocked ("no cached license, can't
  reach server"). If `now - cached.verifiedAt < cached.cacheMaxAgeHours *
  3600_000`, trust `cached.isPaid`/`expiresAt`/`planType` as-is. Otherwise
  blocked ("cache expired, can't reach server").

This function is pure and takes its inputs as parameters (no `fetch`, no
storage) specifically so it can be unit-tested with fabricated clocks and
outcomes without mocking the network.

## Locked-out screen

Rendered by `LicenseGate` whenever the decision is "blocked" (unpaid,
401/403, or expired-cache-offline) — replaces the entire app, not a banner.
Shows:
- A short Bulgarian message explaining the app isn't currently licensed for
  this device, with a support contact line.
- The device's `deviceId`, so the accountant can send it to you.
- A retry button that re-runs the full `LicenseGate` check on click (for
  "I just paid, please recheck" or "wifi's back now").

No text input, no license-key entry — there's nothing for the user to type;
granting happens on your side via the API.

## Error handling

- `register` conflict (`409`, device already registered) — shouldn't happen
  in normal operation (we only call register when no local credentials are
  stored), but if it does, treat it the same as any other register failure:
  show the locked screen with a generic message rather than crashing, since
  there's no local `apiKey` to recover with anyway.
- Malformed/missing local storage file → treated as "no stored credentials,"
  triggers fresh registration.

## Retiring old code

Delete `license-server/` (entire directory) and the existing
`src/core/license/{types,verifyToken,licenseState}.ts` + their tests —
superseded by the real API and the design above. Also remove the `jose`
dependency from root `package.json`: confirmed via grep that only the
files being deleted (`verifyToken.ts`/`verifyToken.test.ts`) import it.

## Testing

- `src/core/license/api.test.ts` — `registerDevice`/`verifyLicense` against
  a mocked `fetch`, covering the success/409/401/403/network-error shapes
  above.
- `src/core/license/cache.test.ts` — `evaluateLicenseCache` with fabricated
  clocks/outcomes, covering all branches in "Offline trust window."
- `src/components/LicenseGate.test.tsx` — mocking `src/platform/license.ts`
  and the API module, covering: first-launch registration, paid → renders
  children, unpaid → locked screen, network-fail-within-cache → renders
  children from cache, network-fail-expired-cache → locked screen,
  401/403 → locked screen even with a fresh cache, retry button re-running
  the check.

## Out of scope (follow-ups)

- Any UI for you (the admin) to call `/api/license/grant/` — that stays a
  direct API call you make yourself, not part of this app.
- Real hardware fingerprinting for `deviceId` (using a random UUID persisted
  locally, per earlier decision — identifies the install, not the physical
  machine).
- Any change to `platform`/`appVersion`/`username`/`email` — sensible
  defaults are sent (`platform` from Tauri, `appVersion` from
  `package.json`), but there's no UI to edit them.
