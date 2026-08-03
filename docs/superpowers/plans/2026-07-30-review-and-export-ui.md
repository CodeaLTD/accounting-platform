# Review & Export UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-side upload → review → download flow so the accountant can turn a source invoice `.xls` into a Bulgarian Intrastat declaration `.xlsx`, with an editable review table in between.

**Architecture:** A single client-side page in the existing Next.js app (`src/app/page.tsx`), composed of small focused components under `src/components/`, all reusing the existing `src/core` engine directly in the browser. No new Next.js routes or API layer — everything runs client-side so this same code works unmodified in a future Tauri desktop build.

**Tech Stack:** Next.js (App Router) + React 19 + TypeScript, `xlsx` (SheetJS, already a dependency), Tailwind for minimal styling, `vitest` + `@testing-library/react` + `jsdom` for tests (new dev dependencies added in Task 3).

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-30-review-and-export-ui-design.md` — every task's work implicitly includes these:

- All user-facing copy (error messages, labels) lives in `src/app/messages.ts` only. No component may hardcode a user-facing string.
- No server-side processing: all parsing/mapping/exporting happens in the browser via `src/core`.
- No row-level flagging/highlighting of notable values (e.g. blank origin, GB→XU) — deferred, not part of this plan.
- Stateless: no persistence of past uploads/declarations across sessions.
- The `FileInput` must be disabled until all three `ConfigForm` fields are filled in.
- Region of consumption is a free-text input for now (real dropdown values pending from the accountant) — not a blocker for this plan.
- Output must exactly match `за НАП.xls`'s header row (already implemented in `src/core/exportXlsx.ts`'s `HEADER_ROW` — reuse it, don't redefine column labels elsewhere).

---

### Task 1: Browser-compatible `ArrayBuffer` input for `parseSourceInvoiceWorkbook`

**Files:**
- Modify: `src/core/importXlsx.ts`
- Test: `src/core/importXlsx.test.ts` (new file)

**Interfaces:**
- Consumes: `makeColumnReader` from `./xlsxColumns` (existing), `parseBgNumber` from `./parseNumber` (existing), `SourceInvoiceLine` type from `./types` (existing) — none of these change.
- Produces: `parseSourceInvoiceWorkbook(data: Buffer | ArrayBuffer, options?: { sheetName?: string }): SourceInvoiceLine[]` — signature unchanged, but now actually works correctly for the `ArrayBuffer` branch (currently it always calls `XLSX.read` with `{ type: "buffer" }` regardless of the input type, which is wrong for real `ArrayBuffer` input — SheetJS's `type: "buffer"` expects a Node `Buffer`, not a raw `ArrayBuffer`).

- [ ] **Step 1: Write the failing test**

Create `src/core/importXlsx.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSourceInvoiceWorkbook } from "./importXlsx";

const FILE_PATH = path.join(
  process.cwd(),
  "Invoice Details Inquiry.xls",
);

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe("parseSourceInvoiceWorkbook", () => {
  it("parses identically from a Buffer and from an ArrayBuffer", () => {
    const buffer = readFileSync(FILE_PATH);
    const fromBuffer = parseSourceInvoiceWorkbook(buffer);
    const fromArrayBuffer = parseSourceInvoiceWorkbook(
      toArrayBuffer(buffer),
    );

    expect(fromArrayBuffer).toHaveLength(14);
    expect(fromArrayBuffer).toEqual(fromBuffer);
  });

  it("throws when the requested sheet doesn't exist", () => {
    const buffer = readFileSync(FILE_PATH);
    expect(() =>
      parseSourceInvoiceWorkbook(buffer, { sheetName: "Nope" }),
    ).toThrow('Sheet not found: "Nope"');
  });
});
```

- [ ] **Step 2: Run test to verify the ArrayBuffer case fails**

Run: `npx vitest run src/core/importXlsx.test.ts`
Expected: The "parses identically from a Buffer and from an ArrayBuffer" test FAILS (either throws inside `XLSX.read` or produces an empty/wrong result), because `parseSourceInvoiceWorkbook` currently always reads with `{ type: "buffer" }` even when given a raw `ArrayBuffer`. The "throws when the requested sheet doesn't exist" test should already PASS (unrelated to this change) — confirm it does, so you know the failure is isolated to the ArrayBuffer path.

- [ ] **Step 3: Fix `parseSourceInvoiceWorkbook` to branch on input type**

In `src/core/importXlsx.ts`, replace:

```typescript
  const workbook = XLSX.read(data, { type: "buffer", codepage: 1251 });
```

with:

```typescript
  const workbook =
    data instanceof ArrayBuffer
      ? XLSX.read(new Uint8Array(data), { type: "array", codepage: 1251 })
      : XLSX.read(data, { type: "buffer", codepage: 1251 });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/importXlsx.test.ts`
Expected: Both tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: All tests PASS (this change is additive/branching, existing Buffer-path tests in `mapping.test.ts` must be unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/core/importXlsx.ts src/core/importXlsx.test.ts
git commit -m "fix: correctly parse ArrayBuffer input in parseSourceInvoiceWorkbook"
```

---

### Task 2: Browser-compatible byte output from the export module

**Files:**
- Modify: `src/core/exportXlsx.ts`
- Modify: `src/core/exportXlsx.test.ts`

**Interfaces:**
- Consumes: `buildIntrastatWorkbook` (existing, unchanged), `IntrastatDeclarationLine` type from `./types` (existing).
- Produces:
  - `export const HEADER_ROW: string[]` — was a private `const`, now exported so `ReviewTable` (Task 7) can reuse the exact same column labels instead of redefining them.
  - `intrastatWorkbookToUint8Array(lines: IntrastatDeclarationLine[]): Uint8Array` — new function; `DownloadButton` (Task 8) uses this to build a browser `Blob`. (`intrastatWorkbookToBuffer` stays as-is for any Node-side usage.)

- [ ] **Step 1: Write the failing test**

In `src/core/exportXlsx.test.ts`, add a new `describe` block (keep the existing `sampleLines` fixture and `readBack` helper already in that file, reuse them):

```typescript
describe("intrastatWorkbookToUint8Array", () => {
  it("produces bytes that XLSX.read can parse back with the same content", () => {
    const bytes = intrastatWorkbookToUint8Array(sampleLines);
    expect(bytes).toBeInstanceOf(Uint8Array);

    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = readBack(workbook);
    expect(rows[0]).toEqual(HEADER_ROW);
    expect(rows[1][1]).toBe("82084000");
  });
});
```

Add `intrastatWorkbookToUint8Array` and `HEADER_ROW` to the existing import from `./exportXlsx` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/exportXlsx.test.ts`
Expected: FAIL with a TypeScript/runtime error — `intrastatWorkbookToUint8Array` is not exported yet, and `HEADER_ROW` is not exported yet.

- [ ] **Step 3: Export `HEADER_ROW` and add `intrastatWorkbookToUint8Array`**

In `src/core/exportXlsx.ts`, change:

```typescript
const HEADER_ROW = [
```

to:

```typescript
export const HEADER_ROW = [
```

And add, after `intrastatWorkbookToBuffer`:

```typescript
export function intrastatWorkbookToUint8Array(
  lines: IntrastatDeclarationLine[],
): Uint8Array {
  return XLSX.write(buildIntrastatWorkbook(lines), {
    type: "array",
    bookType: "xlsx",
  }) as Uint8Array;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/exportXlsx.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/exportXlsx.ts src/core/exportXlsx.test.ts
git commit -m "feat: export HEADER_ROW and add intrastatWorkbookToUint8Array for browser downloads"
```

---

### Task 3: UI test infrastructure and centralized copy

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/messages.ts`
- Modify: `package.json` (new devDependencies)

**Interfaces:**
- Produces: `MESSAGES` object from `@/app/messages`, shape:
  ```typescript
  export const MESSAGES = {
    errors: {
      invalidFileType: string,
      unrecognizedStructure: string,
      emptyFile: string,
    },
    labels: {
      partnerCountry: string,
      modeOfTransport: string,
      regionOfConsumption: string,
      fileInput: string,
      downloadButton: string,
    },
  } as const;
  ```
  All later tasks import strings from this object — no task after this one may write a literal user-facing string inline.
- Also produces: a working `jsdom` test environment with the `@/*` → `./src/*` path alias resolvable inside Vitest (Next.js resolves this alias natively already; Vitest needs its own `resolve.alias` entry, which is not automatic).

- [ ] **Step 1: Install new dev dependencies**

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Create `src/app/messages.ts`**

```typescript
// Centralized user-facing copy. Edit wording/language here only — no
// component should hardcode a user-facing string.
export const MESSAGES = {
  errors: {
    invalidFileType:
      "That doesn't look like an Excel file. Please choose the invoice export file (.xls or .xlsx).",
    unrecognizedStructure:
      "This file doesn't match the expected invoice format. Please check it's the right file and try again.",
    emptyFile: "No invoice lines were found in this file.",
  },
  labels: {
    partnerCountry: "Partner country",
    modeOfTransport: "Mode of transport",
    regionOfConsumption: "Region of consumption",
    fileInput: "Upload invoice file",
    downloadButton: "Download declaration",
  },
} as const;
```

- [ ] **Step 5: Run the full existing test suite under the new config to check for regressions**

Run: `npx vitest run`
Expected: All existing tests (core engine) still PASS under the `jsdom` environment — `jsdom` adds browser globals but doesn't remove Node's `fs`/`path`, so the existing file-reading tests are unaffected. This is the testable deliverable for this task: proof the new infrastructure doesn't break anything that already worked.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts vitest.setup.ts src/app/messages.ts package.json package-lock.json
git commit -m "chore: add UI test infrastructure and centralized user-facing copy"
```

---

### Task 4: `ErrorBanner` component

**Files:**
- Create: `src/components/ErrorBanner.tsx`
- Test: `src/components/ErrorBanner.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ErrorBanner({ message: string | null }): JSX.Element | null` — used by `page.tsx` in Task 9.

- [ ] **Step 1: Write the failing test**

Create `src/components/ErrorBanner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  it("renders the message when one is provided", () => {
    render(<ErrorBanner message="Something went wrong" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("renders nothing when message is null", () => {
    const { container } = render(<ErrorBanner message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ErrorBanner.test.tsx`
Expected: FAIL — `./ErrorBanner` doesn't exist yet. (This also confirms Task 3's `jsdom`/testing-library setup is being exercised for the first time; if the setup were broken, you'd see a jsdom/environment error instead of a plain "module not found" error — if so, stop and fix Task 3 first.)

- [ ] **Step 3: Implement `ErrorBanner`**

Create `src/components/ErrorBanner.tsx`:

```tsx
interface ErrorBannerProps {
  message: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ErrorBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBanner.tsx src/components/ErrorBanner.test.tsx
git commit -m "feat: add ErrorBanner component"
```

---

### Task 5: `ConfigForm` component and `isConfigComplete`

**Files:**
- Create: `src/components/ConfigForm.tsx`
- Test: `src/components/ConfigForm.test.tsx`

**Interfaces:**
- Consumes: `PARTNER_COUNTRIES`, `TRANSPORT_MODES`, `PartnerCountry`, `TransportMode` from `@/core/constants` (existing, unchanged); `MESSAGES` from `@/app/messages` (Task 3).
- Produces:
  - `interface ConfigFormValue { partnerCountry: PartnerCountry | ""; modeOfTransport: TransportMode | ""; regionOfConsumption: string }`
  - `const EMPTY_CONFIG_FORM_VALUE: ConfigFormValue`
  - `function isConfigComplete(value: ConfigFormValue): value is { partnerCountry: PartnerCountry; modeOfTransport: TransportMode; regionOfConsumption: string }` — a type predicate so callers get a narrowed, fully-populated type back.
  - `ConfigForm({ value: ConfigFormValue; onChange: (value: ConfigFormValue) => void }): JSX.Element`
  - All four are used by `page.tsx` (Task 9); `isConfigComplete` is also used by `FileInput`'s `disabled` prop wiring in Task 9.

- [ ] **Step 1: Write the failing test**

Create `src/components/ConfigForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
} from "./ConfigForm";

describe("isConfigComplete", () => {
  it("is false when any field is empty", () => {
    expect(isConfigComplete(EMPTY_CONFIG_FORM_VALUE)).toBe(false);
    expect(
      isConfigComplete({
        partnerCountry: "IT",
        modeOfTransport: "3",
        regionOfConsumption: "",
      }),
    ).toBe(false);
  });

  it("is true when all three fields are filled in", () => {
    expect(
      isConfigComplete({
        partnerCountry: "IT",
        modeOfTransport: "3",
        regionOfConsumption: "SZR",
      }),
    ).toBe(true);
  });
});

describe("ConfigForm", () => {
  it("reports the selected partner country via onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ConfigForm value={EMPTY_CONFIG_FORM_VALUE} onChange={handleChange} />,
    );

    await user.selectOptions(
      screen.getByLabelText(MESSAGES.labels.partnerCountry),
      "IT",
    );

    expect(handleChange).toHaveBeenCalledWith({
      ...EMPTY_CONFIG_FORM_VALUE,
      partnerCountry: "IT",
    });
  });

  it("reports typed region of consumption via onChange", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ConfigForm value={EMPTY_CONFIG_FORM_VALUE} onChange={handleChange} />,
    );

    await user.type(
      screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
      "S",
    );

    expect(handleChange).toHaveBeenCalledWith({
      ...EMPTY_CONFIG_FORM_VALUE,
      regionOfConsumption: "S",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ConfigForm.test.tsx`
Expected: FAIL — `./ConfigForm` doesn't exist yet.

- [ ] **Step 3: Implement `ConfigForm`**

Create `src/components/ConfigForm.tsx`:

```tsx
import { MESSAGES } from "@/app/messages";
import {
  PARTNER_COUNTRIES,
  TRANSPORT_MODES,
  type PartnerCountry,
  type TransportMode,
} from "@/core/constants";

export interface ConfigFormValue {
  partnerCountry: PartnerCountry | "";
  modeOfTransport: TransportMode | "";
  regionOfConsumption: string;
}

export const EMPTY_CONFIG_FORM_VALUE: ConfigFormValue = {
  partnerCountry: "",
  modeOfTransport: "",
  regionOfConsumption: "",
};

export function isConfigComplete(value: ConfigFormValue): value is {
  partnerCountry: PartnerCountry;
  modeOfTransport: TransportMode;
  regionOfConsumption: string;
} {
  return (
    value.partnerCountry !== "" &&
    value.modeOfTransport !== "" &&
    value.regionOfConsumption.trim() !== ""
  );
}

interface ConfigFormProps {
  value: ConfigFormValue;
  onChange: (value: ConfigFormValue) => void;
}

export function ConfigForm({ value, onChange }: ConfigFormProps) {
  return (
    <fieldset className="flex flex-col gap-4 sm:flex-row">
      <label className="flex flex-col gap-1">
        {MESSAGES.labels.partnerCountry}
        <select
          value={value.partnerCountry}
          onChange={(e) =>
            onChange({
              ...value,
              partnerCountry: e.target.value as PartnerCountry,
            })
          }
        >
          <option value="" disabled>
            —
          </option>
          {PARTNER_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        {MESSAGES.labels.modeOfTransport}
        <select
          value={value.modeOfTransport}
          onChange={(e) =>
            onChange({
              ...value,
              modeOfTransport: e.target.value as TransportMode,
            })
          }
        >
          <option value="" disabled>
            —
          </option>
          {TRANSPORT_MODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        {MESSAGES.labels.regionOfConsumption}
        {/* Free-text interim input: real city dropdown values are pending
            from the accountant — see docs/superpowers/specs/2026-07-30-review-and-export-ui-design.md */}
        <input
          type="text"
          value={value.regionOfConsumption}
          onChange={(e) =>
            onChange({ ...value, regionOfConsumption: e.target.value })
          }
        />
      </label>
    </fieldset>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ConfigForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfigForm.tsx src/components/ConfigForm.test.tsx
git commit -m "feat: add ConfigForm component and isConfigComplete helper"
```

---

### Task 6: `FileInput` component

**Files:**
- Create: `src/components/FileInput.tsx`
- Test: `src/components/FileInput.test.tsx`

**Interfaces:**
- Consumes: `MESSAGES` from `@/app/messages` (Task 3).
- Produces: `FileInput({ disabled: boolean; onFileSelected: (file: File) => void; onInvalidFileType: () => void }): JSX.Element` — used by `page.tsx` in Task 9, with `disabled` driven by `isConfigComplete` from Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/components/FileInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { FileInput } from "./FileInput";

function makeFile(name: string): File {
  return new File(["dummy"], name, { type: "application/octet-stream" });
}

describe("FileInput", () => {
  it("calls onFileSelected for a .xls file", async () => {
    const user = userEvent.setup();
    const onFileSelected = vi.fn();
    const onInvalidFileType = vi.fn();
    render(
      <FileInput
        disabled={false}
        onFileSelected={onFileSelected}
        onInvalidFileType={onInvalidFileType}
      />,
    );

    const file = makeFile("Invoice Details Inquiry.xls");
    await user.upload(screen.getByLabelText(MESSAGES.labels.fileInput), file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(onInvalidFileType).not.toHaveBeenCalled();
  });

  it("calls onInvalidFileType for a non-Excel file", async () => {
    const user = userEvent.setup();
    const onFileSelected = vi.fn();
    const onInvalidFileType = vi.fn();
    render(
      <FileInput
        disabled={false}
        onFileSelected={onFileSelected}
        onInvalidFileType={onInvalidFileType}
      />,
    );

    const file = makeFile("notes.txt");
    await user.upload(screen.getByLabelText(MESSAGES.labels.fileInput), file);

    expect(onInvalidFileType).toHaveBeenCalled();
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("is disabled when disabled=true", () => {
    render(
      <FileInput
        disabled={true}
        onFileSelected={vi.fn()}
        onInvalidFileType={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FileInput.test.tsx`
Expected: FAIL — `./FileInput` doesn't exist yet.

- [ ] **Step 3: Implement `FileInput`**

Create `src/components/FileInput.tsx`:

```tsx
"use client";

import { useRef } from "react";
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

  return (
    <label className="flex flex-col gap-1">
      {MESSAGES.labels.fileInput}
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!hasAcceptedExtension(file.name)) {
            onInvalidFileType();
          } else {
            onFileSelected(file);
          }
          // Allow re-selecting the same file to re-trigger processing.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </label>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FileInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FileInput.tsx src/components/FileInput.test.tsx
git commit -m "feat: add FileInput component"
```

---

### Task 7: `ReviewTable` component

**Files:**
- Create: `src/components/ReviewTable.tsx`
- Test: `src/components/ReviewTable.test.tsx`

**Interfaces:**
- Consumes: `HEADER_ROW` from `@/core/exportXlsx` (Task 2); `IntrastatDeclarationLine` type from `@/core/types` (existing); `PartnerCountry`, `TransportMode` types from `@/core/constants` (existing).
- Produces: `ReviewTable({ lines: IntrastatDeclarationLine[]; onChange: (lines: IntrastatDeclarationLine[]) => void }): JSX.Element` — used by `page.tsx` in Task 9.
- **Column order in this component's JSX must exactly match `HEADER_ROW`'s order** (see the comment inside the file) — this is what keeps the on-screen table and the downloaded `.xlsx` consistent.

- [ ] **Step 1: Write the failing test**

Create `src/components/ReviewTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { IntrastatDeclarationLine } from "@/core/types";
import { ReviewTable } from "./ReviewTable";

const sampleLines: IntrastatDeclarationLine[] = [
  {
    sequenceNumber: 1,
    commodityCode: "82084000",
    partnerCountry: "IT",
    countryOfOrigin: "FR",
    natureOfTransaction: "1",
    deliveryTerms: "CPT",
    modeOfTransport: "3",
    transportNationality: "BG",
    regionOfConsumption: "SZR",
    netWeightKg: 15,
    supplementaryQuantity: null,
    value: 560,
    statisticalValue: 560,
  },
];

describe("ReviewTable", () => {
  it("renders one row per line with correct values", () => {
    render(<ReviewTable lines={sampleLines} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(screen.getByLabelText("Нето тегло в кг row 1")).toHaveValue(15);
  });

  it("calls onChange with the edited value when a cell is edited", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReviewTable lines={sampleLines} onChange={onChange} />);

    const commodityCodeInput = screen.getByLabelText("Код на стоката row 1");
    await user.clear(commodityCodeInput);
    await user.type(commodityCodeInput, "99999999");

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall[0].commodityCode).toBe("99999999");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ReviewTable.test.tsx`
Expected: FAIL — `./ReviewTable` doesn't exist yet.

- [ ] **Step 3: Implement `ReviewTable`**

Create `src/components/ReviewTable.tsx`:

```tsx
"use client";

import { HEADER_ROW } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine } from "@/core/types";

// Column order below must exactly match HEADER_ROW (src/core/exportXlsx.ts),
// which in turn matches lineToRow's field order there. Keep them in sync.

interface ReviewTableProps {
  lines: IntrastatDeclarationLine[];
  onChange: (lines: IntrastatDeclarationLine[]) => void;
}

export function ReviewTable({ lines, onChange }: ReviewTableProps) {
  function updateLine(
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {HEADER_ROW.map((label) => (
            <th key={label} className="border px-2 py-1 text-left">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={index}>
            <td className="border px-1">
              <input
                type="number"
                aria-label={`${HEADER_ROW[0]} row ${index + 1}`}
                value={line.sequenceNumber}
                onChange={(e) =>
                  updateLine(index, {
                    sequenceNumber: Number(e.target.value),
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                value={line.commodityCode}
                onChange={(e) =>
                  updateLine(index, { commodityCode: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[2]} row ${index + 1}`}
                value={line.partnerCountry}
                onChange={(e) =>
                  updateLine(index, {
                    partnerCountry: e.target.value as PartnerCountry,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[3]} row ${index + 1}`}
                value={line.countryOfOrigin}
                onChange={(e) =>
                  updateLine(index, { countryOfOrigin: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                value={line.natureOfTransaction}
                onChange={(e) =>
                  updateLine(index, { natureOfTransaction: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                value={line.deliveryTerms}
                onChange={(e) =>
                  updateLine(index, { deliveryTerms: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[6]} row ${index + 1}`}
                value={line.modeOfTransport}
                onChange={(e) =>
                  updateLine(index, {
                    modeOfTransport: e.target.value as TransportMode,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[7]} row ${index + 1}`}
                value={line.transportNationality}
                onChange={(e) =>
                  updateLine(index, {
                    transportNationality: e.target.value,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[8]} row ${index + 1}`}
                value={line.regionOfConsumption}
                onChange={(e) =>
                  updateLine(index, {
                    regionOfConsumption: e.target.value,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="number"
                aria-label={`${HEADER_ROW[9]} row ${index + 1}`}
                value={line.netWeightKg}
                onChange={(e) =>
                  updateLine(index, {
                    netWeightKg: Number(e.target.value),
                  })
                }
              />
            </td>
            {/* Supplementary quantity: always empty, not editable — locked
                by the type system (IntrastatDeclarationLine.supplementaryQuantity
                is a literal `null`) per the accountant's submission process. */}
            <td
              className="border px-1"
              aria-label={`${HEADER_ROW[10]} row ${index + 1}`}
            />
            <td className="border px-1">
              <input
                type="number"
                aria-label={`${HEADER_ROW[11]} row ${index + 1}`}
                value={line.value}
                onChange={(e) =>
                  updateLine(index, { value: Number(e.target.value) })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="number"
                aria-label={`${HEADER_ROW[12]} row ${index + 1}`}
                value={line.statisticalValue}
                onChange={(e) =>
                  updateLine(index, {
                    statisticalValue: Number(e.target.value),
                  })
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ReviewTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReviewTable.tsx src/components/ReviewTable.test.tsx
git commit -m "feat: add ReviewTable component"
```

---

### Task 8: `DownloadButton` component

**Files:**
- Create: `src/components/DownloadButton.tsx`
- Test: `src/components/DownloadButton.test.tsx`

**Interfaces:**
- Consumes: `intrastatWorkbookToUint8Array` from `@/core/exportXlsx` (Task 2); `IntrastatDeclarationLine` type from `@/core/types` (existing); `MESSAGES` from `@/app/messages` (Task 3).
- Produces: `DownloadButton({ lines: IntrastatDeclarationLine[] }): JSX.Element` — used by `page.tsx` in Task 9.

- [ ] **Step 1: Write the failing test**

Create `src/components/DownloadButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "@/app/messages";
import type { IntrastatDeclarationLine } from "@/core/types";
import { DownloadButton } from "./DownloadButton";

const sampleLines: IntrastatDeclarationLine[] = [
  {
    sequenceNumber: 1,
    commodityCode: "82084000",
    partnerCountry: "IT",
    countryOfOrigin: "FR",
    natureOfTransaction: "1",
    deliveryTerms: "CPT",
    modeOfTransport: "3",
    transportNationality: "BG",
    regionOfConsumption: "SZR",
    netWeightKg: 15,
    supplementaryQuantity: null,
    value: 560,
    statisticalValue: 560,
  },
];

describe("DownloadButton", () => {
  let capturedBlob: Blob | null;

  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => {},
    );
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mock-url";
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds an xlsx blob containing the given lines when clicked", async () => {
    const user = userEvent.setup();
    render(<DownloadButton lines={sampleLines} />);

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    );

    expect(capturedBlob).not.toBeNull();
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets["Sheet1"],
      { header: 1, defval: "" },
    );
    expect(rows[1][1]).toBe("82084000");
  });

  it("is disabled when there are no lines", () => {
    render(<DownloadButton lines={[]} />);
    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DownloadButton.test.tsx`
Expected: FAIL — `./DownloadButton` doesn't exist yet.

- [ ] **Step 3: Implement `DownloadButton`**

Create `src/components/DownloadButton.tsx`:

```tsx
"use client";

import { MESSAGES } from "@/app/messages";
import { intrastatWorkbookToUint8Array } from "@/core/exportXlsx";
import type { IntrastatDeclarationLine } from "@/core/types";

interface DownloadButtonProps {
  lines: IntrastatDeclarationLine[];
}

const MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function DownloadButton({ lines }: DownloadButtonProps) {
  function handleClick() {
    const bytes = intrastatWorkbookToUint8Array(lines);
    const blob = new Blob([bytes], { type: MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "intrastat-declaration.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={lines.length === 0}
      className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
    >
      {MESSAGES.labels.downloadButton}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DownloadButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DownloadButton.tsx src/components/DownloadButton.test.tsx
git commit -m "feat: add DownloadButton component"
```

---

### Task 9: Wire up `page.tsx` and add the integration test

**Files:**
- Modify: `src/app/page.tsx` (replace the `create-next-app` boilerplate entirely)
- Test: `src/app/page.test.tsx` (new file)

**Interfaces:**
- Consumes: `ConfigForm`, `EMPTY_CONFIG_FORM_VALUE`, `isConfigComplete`, `ConfigFormValue` from `@/components/ConfigForm` (Task 5); `FileInput` from `@/components/FileInput` (Task 6); `ReviewTable` from `@/components/ReviewTable` (Task 7); `DownloadButton` from `@/components/DownloadButton` (Task 8); `ErrorBanner` from `@/components/ErrorBanner` (Task 4); `MESSAGES` from `@/app/messages` (Task 3); `parseSourceInvoiceWorkbook` from `@/core/importXlsx` (Task 1); `mapInvoiceLinesToDeclaration` from `@/core/mapping` (existing); `IntrastatDeclarationLine` type from `@/core/types` (existing).
- Produces: the working page — this is the final deliverable of the whole plan.

- [ ] **Step 1: Write the failing integration test**

Create `src/app/page.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "./messages";
import Home from "./page";

function loadSampleFile(): File {
  const buffer = readFileSync(
    path.join(process.cwd(), "Invoice Details Inquiry.xls"),
  );
  return new File([buffer], "Invoice Details Inquiry.xls", {
    type: "application/vnd.ms-excel",
  });
}

// Real header row from "Invoice Details Inquiry.xls" — used to build minimal
// synthetic workbooks for the empty-file and unrecognized-structure cases,
// so those two error paths don't depend on hand-maintained second copies of
// a real invoice file.
const SOURCE_HEADER = [
  "Customer Code",
  "Document type",
  "Order number",
  "Customer order number",
  "Subline number",
  "Invoice Number",
  "Invoice line",
  "Invoice Date",
  "Invoice due date",
  "Delivery document",
  "Delivery document date",
  "Part Number",
  "Part description",
  "Carrier Code",
  "Carrier Name",
  "Manufactured code",
  "Country of Origin",
  "Supersessions ",
  "Warehouse (shipping)",
  "Unit net weight",
  "Invoiced quantity",
  "Unit list price",
  "Unit net price",
  "Total invoice VAT",
  "Total invoice amount",
  "Surcharges: the sum of all surcharges for each line",
  "Cur",
  "Case Number",
  "Custom Code",
];

function buildXlsxFile(
  rows: (string | number)[][],
  fileName: string,
): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as Uint8Array;
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function fillConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.partnerCountry),
    "IT",
  );
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.modeOfTransport),
    "3",
  );
  await user.type(
    screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
    "SZR",
  );
}

describe("Home page", () => {
  it("maps an uploaded file and lets the user edit before download", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      loadSampleFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "82084000",
      );
    });
    // Confirmed golden-dataset value for row 1 — see src/core/mapping.test.ts.
    expect(screen.getByLabelText("Страна на проиозход row 1")).toHaveValue(
      "FR",
    );

    const commodityCodeInput = screen.getByLabelText("Код на стоката row 1");
    await user.clear(commodityCodeInput);
    await user.type(commodityCodeInput, "11111111");

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "11111111",
    );
    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeEnabled();
  });

  it("shows a plain-language error for a non-Excel file", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const badFile = new File(["not excel"], "notes.txt", {
      type: "text/plain",
    });
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      badFile,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      MESSAGES.errors.invalidFileType,
    );
  });

  it("shows a plain-language error for a file with no data rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const emptyFile = buildXlsxFile([SOURCE_HEADER], "empty.xlsx");
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      emptyFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.emptyFile,
      );
    });
  });

  it("shows a plain-language error for a file with the wrong columns", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    const malformedFile = buildXlsxFile(
      [["Not", "The", "Right", "Columns"], ["a", "b", "c", "d"]],
      "malformed.xlsx",
    );
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      malformedFile,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        MESSAGES.errors.unrecognizedStructure,
      );
    });
  });

  it("disables the file input until all config fields are filled in", () => {
    render(<Home />);
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/page.test.tsx`
Expected: FAIL — `page.tsx` still renders the `create-next-app` boilerplate, none of the expected labels/roles exist yet.

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
  type ConfigFormValue,
} from "@/components/ConfigForm";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FileInput } from "@/components/FileInput";
import { ReviewTable } from "@/components/ReviewTable";
import { parseSourceInvoiceWorkbook } from "@/core/importXlsx";
import { mapInvoiceLinesToDeclaration } from "@/core/mapping";
import type { IntrastatDeclarationLine } from "@/core/types";
import { MESSAGES } from "./messages";

export default function Home() {
  const [configValue, setConfigValue] = useState<ConfigFormValue>(
    EMPTY_CONFIG_FORM_VALUE,
  );
  const [lines, setLines] = useState<IntrastatDeclarationLine[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    if (!isConfigComplete(configValue)) return;
    try {
      const buffer = await file.arrayBuffer();
      const sourceLines = parseSourceInvoiceWorkbook(buffer);
      if (sourceLines.length === 0) {
        setError(MESSAGES.errors.emptyFile);
        setLines(null);
        return;
      }
      setLines(mapInvoiceLinesToDeclaration(sourceLines, configValue));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(MESSAGES.errors.unrecognizedStructure);
      setLines(null);
    }
  }

  function handleInvalidFileType() {
    setError(MESSAGES.errors.invalidFileType);
    setLines(null);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <ConfigForm value={configValue} onChange={setConfigValue} />
      <FileInput
        disabled={!isConfigComplete(configValue)}
        onFileSelected={handleFileSelected}
        onInvalidFileType={handleInvalidFileType}
      />
      <ErrorBanner message={error} />
      {lines && (
        <>
          <ReviewTable lines={lines} onChange={setLines} />
          <DownloadButton lines={lines} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/page.test.tsx`
Expected: All five tests PASS (happy path, wrong file type, empty file, malformed columns, disabled-until-configured).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests PASS (core + all components + integration), zero type errors.

- [ ] **Step 6: Manually verify in a real browser**

Run: `npm run dev`, open the printed local URL. Fill in the three dropdowns/field, upload the real `Invoice Details Inquiry.xls` from the project root, confirm the table appears with correct values, edit a cell, click "Download declaration", and confirm a real `.xlsx` file downloads and opens correctly in Excel/LibreOffice with the edited value present.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: wire up upload -> review -> download flow on the home page"
```
