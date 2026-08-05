# Subscription Licensing & Device Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small license server plus a framework-agnostic client-side verification library so the desktop app can prove "this is a paid, still-active subscription running on an authorized device" — working offline day-to-day, refreshing when online, and locking out after a grace period if it can't reach the server or the subscription lapses.

**Architecture:** A standalone Node/Express service (`license-server/`, deployed separately from the Next.js app, reachable at a company-owned custom domain) owns a small SQLite database of licenses and activated devices, and issues short-lived signed JWTs (RS256) on activation/refresh. Billing is handled entirely outside this system: no Stripe, no payment processor. A license's paid-through date (`paidUntil`) is set and extended by hand via an admin CLI script whenever the client pays directly (bank transfer, invoice, etc.). The desktop app never needs a live connection to function — it just verifies the JWT signature locally with an embedded public key. All client-side verification logic lives in `src/core/license/` as plain TypeScript with no Tauri/Node-only APIs, per the existing project rule that `src/core/` must stay framework-agnostic so it can move into a shared package later.

**Tech Stack:** Node.js + TypeScript + Express + better-sqlite3 (server); `jose` for JWT signing and verification (used on both server and client — it's isomorphic and built on Web Crypto, so the same verification code runs in Node tests today and inside a Tauri webview later); Vitest for tests on both sides, matching the existing repo.

## Global Constraints

- Code under `src/core/license/` must be plain TypeScript with no Node-only or Tauri-only APIs — it has to run inside a Tauri webview later without modification.
- The license server is a separate deployable unit, not part of the Next.js app — lives in a new top-level `license-server/` directory with its own `package.json`. It's hosted at a custom domain the company already owns; this plan doesn't set up DNS/TLS/hosting itself (see Follow-ups), but the future Tauri adapter will point at that base URL for `/activate` and `/refresh`.
- One accountant client for now: license keys are created manually via an admin CLI script, not a self-serve signup flow. Default seat limit is 1 device per license.
- No payment processor. A license is "active" purely based on `paidUntil`, a paid-through timestamp set at creation and updated on renewal — both via admin CLI, both by hand, whenever the client pays directly. There is no automatic billing, dunning, or proration; a multi-year prepayment is handled the exact same way as a 1-month one, just with a `paidUntil` further in the future.
- No email-based ownership check in this plan — deferred, not dropped. Leadership has since confirmed the phone-home URL flow *will* require email, but the flow itself isn't available yet to build against. Only touches Task 1's schema and Task 3's `/activate` handler when added (`/refresh` and the framework-agnostic client library, Tasks 7-8, don't reference identity at all), so it's a follow-up task once the real interface is known — see Follow-ups.
- Token lifetime is 14 days; the offline grace period after expiry is 10 days before the app must lock out. (Matches the previously-agreed 7–14 day range.) These numbers are intentionally unchanged from the original design — see the note on the `locked` state in Task 8: a "locked" client is not a client that must re-enter its license key, it's one that needs a single successful reconnect, so long offline stretches (e.g. a client on extended leave) resolve themselves the moment the app is opened with a network connection, without any user action.
- Use `jose` for all JWT signing/verification — do not hand-roll JWT parsing or crypto.
- This plan does not touch Tauri scaffolding, the license-key-entry UI, or an admin dashboard — see "Follow-ups" at the end.

---

## Follow-ups (explicitly out of scope for this plan)

- Setting up the actual Tauri shell (`output: 'export'` in `next.config.ts`, Tauri project scaffold, packaging).
- The in-app UI for entering a license key, showing "grace period" warnings, and the locked-out screen — this UI must trigger an automatic background `/refresh` attempt when the app launches in a `locked` or `grace` state, rather than immediately prompting the user to re-enter a license key. Getting this wrong is what would make long offline absences (leave, travel) feel like a false lockout.
- A real device-fingerprint implementation (this plan defines the *interface* the future Tauri adapter must satisfy, not the OS-level fingerprinting itself).
- Secure token storage on disk (Tauri's filesystem/secure-storage APIs) — this plan defines a `LicenseStorage` interface but only ships an in-memory reference implementation for tests.
- An admin dashboard beyond the one-shot CLI scripts for creating/extending a license.
- DNS/TLS/process-hosting setup for `license-server` at the company's custom domain (the domain itself is already available; wiring it up is a deployment task, not a code task).
- Adding the email-based ownership check confirmed as required by the phone-home URL flow — blocked on seeing that flow's actual interface. When it lands: add an `email` column to Task 1's schema, an `email` param + `email_mismatch` reason to Task 3's `handleActivate`, and an `<email>` arg to Task 6's `createLicense.ts` CLI. `/refresh` and Tasks 7-8 are unaffected.

---

### Task 1: License server scaffold + SQLite schema

**Files:**
- Create: `license-server/package.json`
- Create: `license-server/tsconfig.json`
- Create: `license-server/vitest.config.ts`
- Create: `license-server/src/db.ts`
- Test: `license-server/test/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Database.Database`, `createLicense(db, license: License): void`, `getLicense(db, licenseKey: string): License | undefined`, `countDevices(db, licenseKey: string): number`, `isDeviceRegistered(db, licenseKey: string, deviceId: string): boolean`, `registerDevice(db, licenseKey: string, deviceId: string): void`, `setLicenseExpiry(db, licenseKey: string, paidUntil: number): void`, `setSeatLimit(db, licenseKey: string, seatLimit: number): void`, and the `License` interface `{ licenseKey: string; paidUntil: number; seatLimit: number }`. `paidUntil` is an epoch-millisecond timestamp; a license is active whenever `Date.now() <= paidUntil`, checked directly by Tasks 3/4 — there is no separate stored `status` field and no payment processor involved. `seatLimit` is set at creation and can be raised or lowered later via `setSeatLimit` — lowering it below the current device count doesn't retroactively deregister anyone, it just blocks new activations until the count drops back under the limit. All later tasks in `license-server/` depend on these exact names and signatures.

- [ ] **Step 1: Create the package**

```bash
mkdir -p license-server/src license-server/test
```

`license-server/package.json`:

```json
{
  "name": "license-server",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0",
    "jose": "^5.9.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^20",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "typescript": "^5",
    "vitest": "^4.1.10"
  }
}
```

`license-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`license-server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Install dependencies**

```bash
cd license-server && npm install
```

- [ ] **Step 3: Write the failing test for the DB layer**

`license-server/test/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  openDb,
  createLicense,
  getLicense,
  countDevices,
  isDeviceRegistered,
  registerDevice,
  setLicenseExpiry,
  setSeatLimit,
} from "../src/db";

function freshDb() {
  return openDb(":memory:");
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("license db", () => {
  it("creates and reads back a license", () => {
    const db = freshDb();
    const paidUntil = Date.now() + 365 * ONE_DAY_MS;
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil,
      seatLimit: 1,
    });

    expect(getLicense(db, "LIC-0001")).toEqual({
      licenseKey: "LIC-0001",
      paidUntil,
      seatLimit: 1,
    });
  });

  it("returns undefined for an unknown license", () => {
    const db = freshDb();
    expect(getLicense(db, "LIC-NOPE")).toBeUndefined();
  });

  it("registers devices and counts them, without double-counting a re-registration", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 2,
    });

    expect(countDevices(db, "LIC-0002")).toBe(0);
    expect(isDeviceRegistered(db, "LIC-0002", "device-a")).toBe(false);

    registerDevice(db, "LIC-0002", "device-a");
    registerDevice(db, "LIC-0002", "device-a"); // re-activation, same device

    expect(countDevices(db, "LIC-0002")).toBe(1);
    expect(isDeviceRegistered(db, "LIC-0002", "device-a")).toBe(true);
  });

  it("extends paidUntil by license key, e.g. on manual renewal", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 30 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const newPaidUntil = Date.now() + 3 * 365 * ONE_DAY_MS; // e.g. a 3-year prepay
    setLicenseExpiry(db, "LIC-0003", newPaidUntil);

    expect(getLicense(db, "LIC-0003")?.paidUntil).toBe(newPaidUntil);
  });

  it("updates seat limit by license key", () => {
    const db = freshDb();
    createLicense(db, {
      licenseKey: "LIC-0004",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    setSeatLimit(db, "LIC-0004", 3);

    expect(getLicense(db, "LIC-0004")?.seatLimit).toBe(3);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd license-server && npx vitest run`
Expected: FAIL — `src/db.ts` does not exist yet.

- [ ] **Step 5: Implement the DB layer**

`license-server/src/db.ts`:

```ts
import Database from "better-sqlite3";

export interface License {
  licenseKey: string;
  /** Epoch milliseconds. The license is active while `Date.now() <= paidUntil`. */
  paidUntil: number;
  seatLimit: number;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      license_key TEXT PRIMARY KEY,
      paid_until INTEGER NOT NULL,
      seat_limit INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS devices (
      license_key TEXT NOT NULL REFERENCES licenses(license_key),
      device_id TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      PRIMARY KEY (license_key, device_id)
    );
  `);
  return db;
}

export function createLicense(db: Database.Database, license: License): void {
  db.prepare(
    "INSERT INTO licenses (license_key, paid_until, seat_limit) VALUES (?, ?, ?)",
  ).run(license.licenseKey, license.paidUntil, license.seatLimit);
}

export function getLicense(
  db: Database.Database,
  licenseKey: string,
): License | undefined {
  const row = db
    .prepare(
      `SELECT license_key as licenseKey,
              paid_until as paidUntil, seat_limit as seatLimit
       FROM licenses WHERE license_key = ?`,
    )
    .get(licenseKey) as License | undefined;
  return row;
}

export function countDevices(db: Database.Database, licenseKey: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM devices WHERE license_key = ?")
    .get(licenseKey) as { count: number };
  return row.count;
}

export function isDeviceRegistered(
  db: Database.Database,
  licenseKey: string,
  deviceId: string,
): boolean {
  const row = db
    .prepare("SELECT 1 FROM devices WHERE license_key = ? AND device_id = ?")
    .get(licenseKey, deviceId);
  return row !== undefined;
}

export function registerDevice(
  db: Database.Database,
  licenseKey: string,
  deviceId: string,
): void {
  db.prepare(
    "INSERT OR IGNORE INTO devices (license_key, device_id, activated_at) VALUES (?, ?, ?)",
  ).run(licenseKey, deviceId, Date.now());
}

export function setLicenseExpiry(
  db: Database.Database,
  licenseKey: string,
  paidUntil: number,
): void {
  db.prepare("UPDATE licenses SET paid_until = ? WHERE license_key = ?").run(
    paidUntil,
    licenseKey,
  );
}

export function setSeatLimit(
  db: Database.Database,
  licenseKey: string,
  seatLimit: number,
): void {
  db.prepare("UPDATE licenses SET seat_limit = ? WHERE license_key = ?").run(
    seatLimit,
    licenseKey,
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd license-server && npx vitest run`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add license-server/package.json license-server/tsconfig.json license-server/vitest.config.ts license-server/src/db.ts license-server/test/db.test.ts license-server/package-lock.json
git commit -m "Scaffold license-server with SQLite-backed license/device storage"
```

---

### Task 2: Token issuance with `jose`

**Files:**
- Create: `license-server/src/token.ts`
- Test: `license-server/test/token.test.ts`
- Create: `license-server/test/testKeys.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `issueLicenseToken(params: { licenseKey: string; deviceId: string; privateKeyPem: string; ttlSeconds: number }): Promise<string>`, and the test helper `generateTestKeyPair(): { privateKeyPem: string; publicKeyPem: string }` (reused by Task 3; the core library's tests in Task 7 define their own local copy since `src/core/` can't import from `license-server/`). Token payload shape: `sub` = licenseKey, `deviceId` = deviceId, standard `iat`/`exp` claims.

- [ ] **Step 1: Write the test key-pair helper**

`license-server/test/testKeys.ts`:

```ts
import { generateKeyPairSync } from "node:crypto";

export function generateTestKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}
```

- [ ] **Step 2: Write the failing test for token issuance**

`license-server/test/token.test.ts`:

```ts
import { importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { issueLicenseToken } from "../src/token";
import { generateTestKeyPair } from "./testKeys";

describe("issueLicenseToken", () => {
  it("issues a token whose signature verifies against the matching public key", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();

    const token = await issueLicenseToken({
      licenseKey: "LIC-TEST-0001",
      deviceId: "device-abc",
      privateKeyPem,
      ttlSeconds: 3600,
    });

    const publicKey = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey);

    expect(payload.sub).toBe("LIC-TEST-0001");
    expect(payload.deviceId).toBe("device-abc");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects verification against a different key pair", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const { publicKeyPem: wrongPublicKeyPem } = generateTestKeyPair();

    const token = await issueLicenseToken({
      licenseKey: "LIC-TEST-0002",
      deviceId: "device-xyz",
      privateKeyPem,
      ttlSeconds: 3600,
    });

    const wrongPublicKey = await importSPKI(wrongPublicKeyPem, "RS256");
    await expect(jwtVerify(token, wrongPublicKey)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd license-server && npx vitest run test/token.test.ts`
Expected: FAIL — `src/token.ts` does not exist yet.

- [ ] **Step 4: Implement token issuance**

`license-server/src/token.ts`:

```ts
import { SignJWT, importPKCS8 } from "jose";

const ALG = "RS256";

export interface IssueTokenParams {
  licenseKey: string;
  deviceId: string;
  privateKeyPem: string;
  ttlSeconds: number;
}

export async function issueLicenseToken(params: IssueTokenParams): Promise<string> {
  const privateKey = await importPKCS8(params.privateKeyPem, ALG);
  return new SignJWT({ deviceId: params.deviceId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(params.licenseKey)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + params.ttlSeconds)
    .sign(privateKey);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd license-server && npx vitest run test/token.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add license-server/src/token.ts license-server/test/token.test.ts license-server/test/testKeys.ts
git commit -m "Issue RS256 license tokens with jose"
```

---

### Task 3: `/activate` — device seat enforcement

**Files:**
- Create: `license-server/src/routes/activate.ts`
- Test: `license-server/test/activate.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createLicense` from Task 1 (`../src/db`); `issueLicenseToken` from Task 2 (`../src/token`).
- Produces: `handleActivate(db, privateKeyPem: string, request: { licenseKey: string; deviceId: string }): Promise<ActivateResult>` where `ActivateResult = { ok: true; token: string } | { ok: false; reason: "not_found" | "inactive" | "seat_limit_reached" }`. Task 5 (server wiring) depends on this exact function name and return shape.

- [ ] **Step 1: Write the failing tests**

`license-server/test/activate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openDb, createLicense } from "../src/db";
import { handleActivate } from "../src/routes/activate";
import { generateTestKeyPair } from "./testKeys";

const { privateKeyPem } = generateTestKeyPair();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("handleActivate", () => {
  it("returns not_found for an unknown license key", async () => {
    const db = openDb(":memory:");
    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-NOPE",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns inactive once paidUntil is in the past", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil: Date.now() - ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0001",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });

  it("issues a token for the first device within the seat limit", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0002",
      deviceId: "device-a",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a second device once the seat limit is reached", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-a",
    });
    const secondDevice = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-b",
    });

    expect(secondDevice).toEqual({ ok: false, reason: "seat_limit_reached" });
  });

  it("re-activating the same device does not consume a second seat", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0004",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0004",
      deviceId: "device-a",
    });
    const sameDeviceAgain = await handleActivate(db, privateKeyPem, {
      licenseKey: "LIC-0004",
      deviceId: "device-a",
    });

    expect(sameDeviceAgain.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd license-server && npx vitest run test/activate.test.ts`
Expected: FAIL — `src/routes/activate.ts` does not exist yet.

- [ ] **Step 3: Implement `handleActivate`**

`license-server/src/routes/activate.ts`:

```ts
import type Database from "better-sqlite3";
import {
  countDevices,
  getLicense,
  isDeviceRegistered,
  registerDevice,
} from "../db";
import { issueLicenseToken } from "../token";

export interface ActivateRequest {
  licenseKey: string;
  deviceId: string;
}

export type ActivateResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "inactive" | "seat_limit_reached" };

const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export async function handleActivate(
  db: Database.Database,
  privateKeyPem: string,
  request: ActivateRequest,
): Promise<ActivateResult> {
  const license = getLicense(db, request.licenseKey);
  if (!license) return { ok: false, reason: "not_found" };
  if (Date.now() > license.paidUntil) return { ok: false, reason: "inactive" };

  const alreadyRegistered = isDeviceRegistered(db, request.licenseKey, request.deviceId);
  if (!alreadyRegistered) {
    const deviceCount = countDevices(db, request.licenseKey);
    if (deviceCount >= license.seatLimit) {
      return { ok: false, reason: "seat_limit_reached" };
    }
    registerDevice(db, request.licenseKey, request.deviceId);
  }

  const token = await issueLicenseToken({
    licenseKey: request.licenseKey,
    deviceId: request.deviceId,
    privateKeyPem,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  return { ok: true, token };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd license-server && npx vitest run test/activate.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add license-server/src/routes/activate.ts license-server/test/activate.test.ts
git commit -m "Add /activate handler enforcing per-license device seat limit"
```

---

### Task 4: `/refresh` — re-issue a token for an already-activated device

**Files:**
- Create: `license-server/src/routes/refresh.ts`
- Test: `license-server/test/refresh.test.ts`

**Interfaces:**
- Consumes: `getLicense`, `isDeviceRegistered`, `createLicense`, `registerDevice`, `openDb` from Task 1; `issueLicenseToken` from Task 2.
- Produces: `handleRefresh(db, privateKeyPem: string, request: { licenseKey: string; deviceId: string }): Promise<RefreshResult>` where `RefreshResult = { ok: true; token: string } | { ok: false; reason: "not_found" | "inactive" | "device_not_registered" }`. Task 5 depends on this exact shape.

- [ ] **Step 1: Write the failing tests**

`license-server/test/refresh.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openDb, createLicense, registerDevice, setLicenseExpiry } from "../src/db";
import { handleRefresh } from "../src/routes/refresh";
import { generateTestKeyPair } from "./testKeys";

const { privateKeyPem } = generateTestKeyPair();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("handleRefresh", () => {
  it("returns not_found for an unknown license key", async () => {
    const db = openDb(":memory:");
    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-NOPE",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns device_not_registered if the device never activated", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0001",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0001",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "device_not_registered" });
  });

  it("returns inactive once paidUntil lapses, even for a registered device", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0002",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });
    registerDevice(db, "LIC-0002", "device-a");
    setLicenseExpiry(db, "LIC-0002", Date.now() - ONE_DAY_MS);

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0002",
      deviceId: "device-a",
    });
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });

  it("issues a new token for a registered device on an active license", async () => {
    const db = openDb(":memory:");
    createLicense(db, {
      licenseKey: "LIC-0003",
      paidUntil: Date.now() + 365 * ONE_DAY_MS,
      seatLimit: 1,
    });
    registerDevice(db, "LIC-0003", "device-a");

    const result = await handleRefresh(db, privateKeyPem, {
      licenseKey: "LIC-0003",
      deviceId: "device-a",
    });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd license-server && npx vitest run test/refresh.test.ts`
Expected: FAIL — `src/routes/refresh.ts` does not exist yet.

- [ ] **Step 3: Implement `handleRefresh`**

`license-server/src/routes/refresh.ts`:

```ts
import type Database from "better-sqlite3";
import { getLicense, isDeviceRegistered } from "../db";
import { issueLicenseToken } from "../token";

export interface RefreshRequest {
  licenseKey: string;
  deviceId: string;
}

export type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "inactive" | "device_not_registered" };

const TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export async function handleRefresh(
  db: Database.Database,
  privateKeyPem: string,
  request: RefreshRequest,
): Promise<RefreshResult> {
  const license = getLicense(db, request.licenseKey);
  if (!license) return { ok: false, reason: "not_found" };
  if (!isDeviceRegistered(db, request.licenseKey, request.deviceId)) {
    return { ok: false, reason: "device_not_registered" };
  }
  if (Date.now() > license.paidUntil) return { ok: false, reason: "inactive" };

  const token = await issueLicenseToken({
    licenseKey: request.licenseKey,
    deviceId: request.deviceId,
    privateKeyPem,
    ttlSeconds: TOKEN_TTL_SECONDS,
  });
  return { ok: true, token };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd license-server && npx vitest run test/refresh.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add license-server/src/routes/refresh.ts license-server/test/refresh.test.ts
git commit -m "Add /refresh handler for already-activated devices"
```

---

### Task 5: Express server wiring

**Files:**
- Create: `license-server/src/server.ts`
- Test: `license-server/test/server.test.ts`

**Interfaces:**
- Consumes: `openDb` (Task 1), `handleActivate` (Task 3), `handleRefresh` (Task 4).
- Produces: `createServer(config: { dbPath: string; privateKeyPem: string }): express.Express`. This is the only export later deployment tooling needs — deployment just points it at the company's custom domain (see Global Constraints) and the SQLite file path.

- [ ] **Step 1: Write the failing smoke test**

`license-server/test/server.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { generateTestKeyPair } from "./testKeys";

describe("createServer", () => {
  it("responds to a health check", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const app = createServer({ dbPath: ":memory:", privateKeyPem });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("returns 403 for /activate with an unknown license key", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const app = createServer({ dbPath: ":memory:", privateKeyPem });

    const response = await request(app)
      .post("/activate")
      .send({ licenseKey: "LIC-NOPE", deviceId: "device-a" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ ok: false, reason: "not_found" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd license-server && npx vitest run test/server.test.ts`
Expected: FAIL — `src/server.ts` does not exist yet.

- [ ] **Step 3: Implement `createServer`**

`license-server/src/server.ts`:

```ts
import express from "express";
import { openDb } from "./db";
import { handleActivate } from "./routes/activate";
import { handleRefresh } from "./routes/refresh";

export interface ServerConfig {
  dbPath: string;
  privateKeyPem: string;
}

export function createServer(config: ServerConfig): express.Express {
  const db = openDb(config.dbPath);
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(express.json());

  app.post("/activate", async (req, res) => {
    const result = await handleActivate(db, config.privateKeyPem, req.body);
    res.status(result.ok ? 200 : 403).json(result);
  });

  app.post("/refresh", async (req, res) => {
    const result = await handleRefresh(db, config.privateKeyPem, req.body);
    res.status(result.ok ? 200 : 403).json(result);
  });

  return app;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd license-server && npx vitest run test/server.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add license-server/src/server.ts license-server/test/server.test.ts
git commit -m "Wire activate/refresh routes into an Express server"
```

---

### Task 6: Admin CLI to issue and extend a license manually

**Files:**
- Create: `license-server/src/admin/createLicense.ts`
- Create: `license-server/src/admin/extendLicense.ts`
- Test: `license-server/test/admin/createLicense.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createLicense`, `setLicenseExpiry`, `setSeatLimit` from Task 1.
- Produces: `generateLicenseKey(): string` (exported for testing) and two CLI entry points: `createLicense.ts` taking `<dbPath> <paidUntilISO> [seatLimit=1]` (issues a brand-new license), and `extendLicense.ts` taking `<dbPath> <licenseKey> <paidUntilISO> [seatLimit]` (renews an existing one — e.g. after the client pays for another year, or three — and optionally adjusts its seat count in the same call; omitting `seatLimit` leaves it unchanged). Both parse `paidUntilISO` as an ISO date string via `new Date(arg).getTime()`, so a multi-year prepay is just a date further out — no different code path. No other task depends on these files.

- [ ] **Step 1: Write the failing test**

`license-server/test/admin/createLicense.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateLicenseKey } from "../../src/admin/createLicense";

describe("generateLicenseKey", () => {
  it("produces an INTRA-prefixed key with a 16-character hex suffix", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^INTRA-[0-9A-F]{16}$/);
  });

  it("produces a different key on each call", () => {
    expect(generateLicenseKey()).not.toBe(generateLicenseKey());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd license-server && npx vitest run test/admin/createLicense.test.ts`
Expected: FAIL — `src/admin/createLicense.ts` does not exist yet.

- [ ] **Step 3: Implement the CLI script**

`license-server/src/admin/createLicense.ts`:

```ts
import { randomBytes } from "node:crypto";
import { openDb, createLicense } from "../db";

export function generateLicenseKey(): string {
  return `INTRA-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function main() {
  const [, , dbPath, paidUntilArg, seatLimitArg] = process.argv;
  if (!dbPath || !paidUntilArg) {
    console.error(
      "Usage: tsx src/admin/createLicense.ts <dbPath> <paidUntilISO> [seatLimit=1]",
    );
    process.exit(1);
  }
  const db = openDb(dbPath);
  const licenseKey = generateLicenseKey();
  createLicense(db, {
    licenseKey,
    paidUntil: new Date(paidUntilArg).getTime(),
    seatLimit: seatLimitArg ? Number(seatLimitArg) : 1,
  });
  console.log(licenseKey);
}

// Only run when invoked directly (`node`/`tsx` on this file), not when
// imported by the test above.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd license-server && npx vitest run test/admin/createLicense.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the renewal CLI script**

`license-server/src/admin/extendLicense.ts`:

```ts
import { openDb, setLicenseExpiry, setSeatLimit } from "../db";

function main() {
  const [, , dbPath, licenseKey, paidUntilArg, seatLimitArg] = process.argv;
  if (!dbPath || !licenseKey || !paidUntilArg) {
    console.error(
      "Usage: tsx src/admin/extendLicense.ts <dbPath> <licenseKey> <paidUntilISO> [seatLimit]",
    );
    process.exit(1);
  }
  const db = openDb(dbPath);
  setLicenseExpiry(db, licenseKey, new Date(paidUntilArg).getTime());
  if (seatLimitArg) {
    setSeatLimit(db, licenseKey, Number(seatLimitArg));
  }
  console.log(
    `${licenseKey} paid through ${new Date(paidUntilArg).toISOString()}` +
      (seatLimitArg ? `, seat limit ${seatLimitArg}` : ""),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

This wraps `setLicenseExpiry`/`setSeatLimit` (Task 1), already covered by `db.test.ts`'s renewal and seat-limit tests — no separate test file needed for what is a thin CLI shell around tested primitives.

- [ ] **Step 6: Commit**

```bash
git add license-server/src/admin/createLicense.ts license-server/src/admin/extendLicense.ts license-server/test/admin/createLicense.test.ts
git commit -m "Add admin CLI scripts to manually issue, renew, and adjust seat limits for a license"
```

---

### Task 7: Core license types + `verifyLicenseToken` (framework-agnostic)

**Files:**
- Create: `src/core/license/types.ts`
- Create: `src/core/license/verifyToken.ts`
- Test: `src/core/license/verifyToken.test.ts`
- Modify: `package.json` (repo root) — add `jose` to `dependencies`

**Interfaces:**
- Produces: `LicensePayload` type `{ licenseKey: string; deviceId: string; expiresAt: number }`, and `verifyLicenseToken(token: string, publicKeyPem: string): Promise<LicensePayload | null>`. Task 8 depends on `LicensePayload`.

- [ ] **Step 1: Add the `jose` dependency**

```bash
npm install jose
```

- [ ] **Step 2: Write the failing tests**

`src/core/license/verifyToken.test.ts`:

```ts
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyLicenseToken } from "./verifyToken";

function generateTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}

async function signToken(privateKeyPem: string, overrides: { exp?: number } = {}) {
  const { importPKCS8 } = await import("jose");
  const key = await importPKCS8(privateKeyPem, "RS256");
  return new SignJWT({ deviceId: "device-a" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("LIC-0001")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key);
}

describe("verifyLicenseToken", () => {
  it("returns the payload for a validly signed, unexpired token", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const token = await signToken(privateKeyPem);

    const payload = await verifyLicenseToken(token, publicKeyPem);

    expect(payload).toEqual({
      licenseKey: "LIC-0001",
      deviceId: "device-a",
      expiresAt: expect.any(Number),
    });
  });

  it("returns null for a token signed by a different key", async () => {
    const { privateKeyPem } = generateTestKeyPair();
    const { publicKeyPem: wrongPublicKeyPem } = generateTestKeyPair();
    const token = await signToken(privateKeyPem);

    expect(await verifyLicenseToken(token, wrongPublicKeyPem)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const expiredToken = await signToken(privateKeyPem, {
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(await verifyLicenseToken(expiredToken, publicKeyPem)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    const { publicKeyPem } = generateTestKeyPair();
    expect(await verifyLicenseToken("not-a-jwt", publicKeyPem)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/core/license/verifyToken.test.ts`
Expected: FAIL — `./verifyToken` does not exist yet.

- [ ] **Step 4: Implement types and verification**

`src/core/license/types.ts`:

```ts
export interface LicensePayload {
  licenseKey: string;
  deviceId: string;
  /** Epoch seconds, matching the JWT `exp` claim. */
  expiresAt: number;
}
```

`src/core/license/verifyToken.ts`:

```ts
import { importSPKI, jwtVerify } from "jose";
import type { LicensePayload } from "./types";

export async function verifyLicenseToken(
  token: string,
  publicKeyPem: string,
): Promise<LicensePayload | null> {
  try {
    const publicKey = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey);

    if (
      typeof payload.sub !== "string" ||
      typeof payload.deviceId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return {
      licenseKey: payload.sub,
      deviceId: payload.deviceId,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/core/license/verifyToken.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/license/types.ts src/core/license/verifyToken.ts src/core/license/verifyToken.test.ts
git commit -m "Add framework-agnostic license token verification (jose/Web Crypto)"
```

---

### Task 8: Core license status state machine (valid / grace / locked)

**Files:**
- Create: `src/core/license/licenseState.ts`
- Test: `src/core/license/licenseState.test.ts`

**Interfaces:**
- Consumes: `LicensePayload` from Task 7.
- Produces: `LicenseStatus = "valid" | "grace" | "locked"` and `computeLicenseStatus(params: { payload: LicensePayload | null; lastRefreshAt: number | null; now: number }): LicenseStatus`. This is what a future Tauri adapter calls every time the app starts, passing in the locally-stored token's verified payload (or `null` if verification failed/no token stored), the last time a refresh succeeded (`null` if never), and the current time. `locked` here means "no currently-valid cached token," not "invalid license" — `deviceId`/`licenseKey` never expire client-side, so the future adapter must respond to `grace`/`locked` by silently retrying `/refresh` in the background before ever prompting the user to re-enter a license key. That's what makes a long connectivity gap (e.g. a client on extended leave) self-heal on the next launch with internet, instead of presenting as a false lockout.

- [ ] **Step 1: Write the failing tests**

`src/core/license/licenseState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeLicenseStatus } from "./licenseState";
import type { LicensePayload } from "./types";

const NOW = 1_700_000_000_000; // arbitrary fixed reference point, in ms
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function payloadExpiringAt(expiresAtSeconds: number): LicensePayload {
  return { licenseKey: "LIC-0001", deviceId: "device-a", expiresAt: expiresAtSeconds };
}

describe("computeLicenseStatus", () => {
  it("is locked when there is no verified payload at all", () => {
    expect(
      computeLicenseStatus({ payload: null, lastRefreshAt: null, now: NOW }),
    ).toBe("locked");
  });

  it("is valid when the token has not expired yet", () => {
    const payload = payloadExpiringAt(Math.floor((NOW + ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({ payload, lastRefreshAt: NOW - ONE_DAY_MS, now: NOW }),
    ).toBe("valid");
  });

  it("is in grace when expired but within 10 days of the last successful refresh", () => {
    const payload = payloadExpiringAt(Math.floor((NOW - ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({
        payload,
        lastRefreshAt: NOW - ONE_DAY_MS,
        now: NOW,
      }),
    ).toBe("grace");
  });

  it("is locked once past the 10-day grace deadline", () => {
    const payload = payloadExpiringAt(Math.floor((NOW - 11 * ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({
        payload,
        lastRefreshAt: NOW - 11 * ONE_DAY_MS,
        now: NOW,
      }),
    ).toBe("locked");
  });

  it("is locked when expired and there is no recorded successful refresh", () => {
    const payload = payloadExpiringAt(Math.floor((NOW - ONE_DAY_MS) / 1000));
    expect(
      computeLicenseStatus({ payload, lastRefreshAt: null, now: NOW }),
    ).toBe("locked");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/license/licenseState.test.ts`
Expected: FAIL — `./licenseState` does not exist yet.

- [ ] **Step 3: Implement the state machine**

`src/core/license/licenseState.ts`:

```ts
import type { LicensePayload } from "./types";

export type LicenseStatus = "valid" | "grace" | "locked";

const GRACE_PERIOD_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

export interface ComputeLicenseStatusParams {
  payload: LicensePayload | null;
  lastRefreshAt: number | null;
  now: number;
}

export function computeLicenseStatus(params: ComputeLicenseStatusParams): LicenseStatus {
  if (!params.payload) return "locked";

  const tokenExpiresAtMs = params.payload.expiresAt * 1000;
  if (params.now <= tokenExpiresAtMs) return "valid";

  if (params.lastRefreshAt === null) return "locked";
  const graceDeadline = params.lastRefreshAt + GRACE_PERIOD_MS;
  return params.now <= graceDeadline ? "grace" : "locked";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/license/licenseState.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/license/licenseState.ts src/core/license/licenseState.test.ts
git commit -m "Add valid/grace/locked license status state machine"
```

---

## Self-Review Notes

- **Spec coverage:** subscription enforcement is now `paidUntil`-based with no payment processor (Task 1's schema, Task 3/4's `Date.now() > license.paidUntil` checks), device-limit enforcement to stop casual sharing with an adjustable seat count (Task 3's seat-limit logic + Task 1's `setSeatLimit`, exposed via Task 6's `extendLicense.ts`; lowering it below the current device count blocks new activations rather than retroactively deregistering anyone), manual issuance and renewal for the single current client (Task 6's two CLI scripts, `paidUntil` set/extended by hand whenever the client pays directly — a 3-year prepay is just a further-out date, no special-casing), the "locked ≠ re-enter license key" reconnect contract (Task 8, also called out in Global Constraints and the in-app-UI Follow-up), and the framework-agnostic constraint (Tasks 7-8 use only `jose`/Web Crypto, no Node-only APIs) are all covered by a task each. Email-based ownership checking was considered and deliberately dropped for now (see Global Constraints) — it's cheap to add back once the actual phone-home URL's requirements are known.
- **Placeholder scan:** no TBD/TODO markers; every step has real, runnable code.
- **Type consistency:** `ActivateResult`/`RefreshResult` shapes are defined once (Tasks 3/4) and consumed as-is by Task 5's server wiring without renaming; `LicensePayload` is defined once (Task 7) and consumed unchanged by Task 8; `License.paidUntil` (Task 1) flows unchanged into `createLicense`/`extendLicense` (Task 6) and `handleActivate`'s/`handleRefresh`'s comparisons (Tasks 3/4).
