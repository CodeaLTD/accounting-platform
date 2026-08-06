# Working Table / NAP Table Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the app's single review table into a working table (from the
currently uploaded file) and a final NAP table (accumulated across uploads,
the thing that actually gets downloaded), with add/remove actions moving
rows between them and a search bar to find rows by invoice number.

**Architecture:** Purely a page-state and component change in the existing
Next.js client page (`src/app/page.tsx`) — no new routes, no persistence, no
state library, `src/core` untouched. One presentational table component
(renamed `ReviewTable` → `DeclarationTable`) is reused for both views via
props, rather than building two near-duplicate table components.

**Tech Stack:** Next.js (client component), React 19, TypeScript, Vitest +
`@testing-library/react` + `@testing-library/user-event`, Tailwind utility
classes (existing pattern — no new styling system).

## Global Constraints

- All user-facing copy lives in `src/app/messages.ts` only — no component may
  hardcode a user-facing string (existing project rule, see
  `docs/superpowers/specs/2026-07-30-review-and-export-ui-design.md`).
- All new copy is Bulgarian, matching the existing tone/register in
  `messages.ts`.
- The final table (`finalLines`) is session-only — no persistence, no
  `localStorage`, matches existing stateless design.
- Invoice number is tracked internally on every row (`WorkingLine`) but is
  never added to `HEADER_ROW` / the exported `.xlsx` — export shape in
  `src/core/exportXlsx.ts` stays untouched.
- No dedup logic — multiple rows may legitimately share an invoice number.
- Toggle button between views is always rendered, never disabled.
- Search only filters the working view; the final view has no search
  (explicitly deferred).
- Follow existing code patterns: numeric cells parse blank as `NaN` (never
  coerce to `0`), decimal formatting uses `"bg-BG"` locale with comma
  separators.

---

### Task 1: Shared type and copy additions

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/app/messages.ts`

**Interfaces:**
- Produces: `WorkingLine` (exported from `src/core/types.ts`) — used by
  every later task as the row type for both the working and final tables.
- Produces: `MESSAGES.labels.invoiceNumberColumn`,
  `MESSAGES.labels.searchInput`, `MESSAGES.labels.addAllButton`,
  `MESSAGES.labels.addRowButton`, `MESSAGES.labels.removeRowButton`,
  `MESSAGES.labels.viewFinalTableButton`,
  `MESSAGES.labels.viewWorkingTableButton`,
  `MESSAGES.confirmations.discardUnaddedRows(count: number): string`.

This task has no runtime behavior of its own (a type + string constants), so
there's no test to write first — instead it's verified by the TypeScript
compiler and the existing test suite staying green.

- [ ] **Step 1: Add the `WorkingLine` type**

Append to the end of `src/core/types.ts`:

```ts
// UI-only composition: a mapped declaration line paired with its source
// invoice number, used by the working/final tables for display and search.
// The invoice number is never part of the exported .xlsx (see exportXlsx.ts)
// and duplicates are expected (multiple line items can share one invoice).
export interface WorkingLine extends IntrastatDeclarationLine {
  invoiceNumber: string;
}
```

- [ ] **Step 2: Add the new copy to `messages.ts`**

Replace the full contents of `src/app/messages.ts` with:

```ts
// Centralized user-facing copy. Edit wording/language here only — no
// component should hardcode a user-facing string.
export const MESSAGES = {
  errors: {
    invalidFileType:
      "Това не прилича на Excel файл. Моля, изберете файла с фактурите (.xls или .xlsx).",
    unrecognizedStructure:
      "Този файл не съответства на очаквания формат на фактура. Моля, проверете дали е правилният файл и опитайте отново.",
    emptyFile: "В този файл не бяха намерени редове с фактури.",
    invalidNumericValue:
      "Моля, попълнете всички числови полета преди изтегляне.",
  },
  labels: {
    partnerCountry: "Страна партньор",
    modeOfTransport: "Вид транспорт",
    regionOfConsumption: "Регион на потребление",
    fileInput: "Качете файл с фактури",
    chooseFileButton: "Изберете файл",
    downloadButton: "Изтеглете декларация",
    invoiceNumberColumn: "Фактура №",
    searchInput: "Търсене по номер на фактура",
    addAllButton: "Добави всички",
    addRowButton: "Добави ред",
    removeRowButton: "Премахни ред",
    viewFinalTableButton: "Виж НАП таблицата",
    viewWorkingTableButton: "Виж работната таблица",
  },
  files: {
    downloadFileName: "intrastat-declaration.xlsx",
  },
  confirmations: {
    discardUnaddedRows: (count: number) =>
      `Имате ${count} реда, които не са добавени към НАП таблицата. Те ще бъдат загубени. Продължавате ли?`,
  },
} as const;
```

- [ ] **Step 3: Verify the project still typechecks and all existing tests pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all existing tests still pass (nothing consumes the new type/copy
yet, so behavior is unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/app/messages.ts
git commit -m "feat: add WorkingLine type and new working/NAP table copy"
```

---

### Task 2: `DeclarationTable` component (renamed from `ReviewTable`)

**Files:**
- Create: `src/components/DeclarationTable.tsx` (replaces
  `src/components/ReviewTable.tsx`)
- Create: `src/components/DeclarationTable.test.tsx` (replaces
  `src/components/ReviewTable.test.tsx`)
- Delete: `src/components/ReviewTable.tsx`, `src/components/ReviewTable.test.tsx`

**Interfaces:**
- Consumes: `WorkingLine`, `IntrastatDeclarationLine` from
  `@/core/types` (Task 1); `HEADER_ROW`, `computeTotals` from
  `@/core/exportXlsx` (unchanged); `MESSAGES` from `@/app/messages` (Task 1).
- Produces: `DeclarationTable` component with props
  `{ lines: WorkingLine[]; onLineChange: (index: number, patch: Partial<IntrastatDeclarationLine>) => void; showInvoiceNumber: boolean; renderRowAction: (index: number) => ReactNode }`.
  `index` in both `onLineChange` and `renderRowAction` refers to the
  position within the `lines` array *passed to this component* — the caller
  (Task 4) is responsible for mapping that back to its own array if it
  passed a filtered subset.

- [ ] **Step 1: Write the failing test file**

Create `src/components/DeclarationTable.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkingLine } from "@/core/types";
import { DeclarationTable } from "./DeclarationTable";

const sampleLines: WorkingLine[] = [
  {
    sequenceNumber: null,
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
    invoiceNumber: "INV-001",
  },
];

describe("DeclarationTable", () => {
  it("renders one row per line with correct values", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(screen.getByLabelText("Нето тегло в кг row 1")).toHaveValue("15");
  });

  it("calls onLineChange with the row index and the edited patch", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    const commodityCodeInput = screen.getByLabelText(
      "Код на стоката row 1",
    ) as HTMLInputElement;
    fireEvent.change(commodityCodeInput, { target: { value: "99999999" } });

    expect(onLineChange).toHaveBeenCalledWith(0, {
      commodityCode: "99999999",
    });
  });

  it("does not coerce a cleared numeric cell to 0", () => {
    const onLineChange = vi.fn();
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={onLineChange}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );

    const netWeightInput = screen.getByLabelText(
      "Нето тегло в кг row 1",
    ) as HTMLInputElement;
    fireEvent.change(netWeightInput, { target: { value: "" } });

    expect(onLineChange).toHaveBeenCalledWith(0, { netWeightKg: NaN });
  });

  it("shows the invoice number column when showInvoiceNumber is true", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber
        renderRowAction={() => null}
      />,
    );
    expect(screen.getByLabelText("Фактура № row 1")).toHaveTextContent(
      "INV-001",
    );
  });

  it("hides the invoice number column when showInvoiceNumber is false", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={() => null}
      />,
    );
    expect(
      screen.queryByLabelText("Фактура № row 1"),
    ).not.toBeInTheDocument();
  });

  it("renders the per-row action passed via renderRowAction", () => {
    render(
      <DeclarationTable
        lines={sampleLines}
        onLineChange={vi.fn()}
        showInvoiceNumber={false}
        renderRowAction={(index) => (
          <button aria-label={`add row ${index + 1}`}>+</button>
        )}
      />,
    );
    expect(
      screen.getByRole("button", { name: "add row 1" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/DeclarationTable.test.tsx`
Expected: FAIL — `DeclarationTable` module not found (doesn't exist yet).

- [ ] **Step 3: Delete the old component and test, create the new component**

```bash
git rm src/components/ReviewTable.tsx src/components/ReviewTable.test.tsx
```

Create `src/components/DeclarationTable.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { MESSAGES } from "@/app/messages";

// Column order below (after the leading action/invoice-number columns) must
// exactly match HEADER_ROW (src/core/exportXlsx.ts), which in turn matches
// lineToRow's field order there. Keep them in sync.

interface DeclarationTableProps {
  lines: WorkingLine[];
  onLineChange: (
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) => void;
  showInvoiceNumber: boolean;
  renderRowAction: (index: number) => ReactNode;
}

export function DeclarationTable({
  lines,
  onLineChange,
  showInvoiceNumber,
  renderRowAction,
}: DeclarationTableProps) {
  // Numeric cells: `Number("")` is 0, which would silently snap a cleared
  // field to 0 while the accountant is retyping it. Parse blank input as
  // NaN instead, and render NaN back as an empty string so the field can
  // stay blank mid-edit. Also accept a comma as the decimal separator,
  // since that's what the fields display (Bulgarian convention) and what
  // she's used to typing.
  function parseNumericInput(raw: string): number {
    if (raw === "") return NaN;
    return Number(raw.replace(",", "."));
  }

  // Decimal fields (netWeightKg, value, statisticalValue) are shown with a
  // comma, not a point, to match Bulgarian convention — plain `<input
  // type="number">` can't do that, so these render as text inputs formatted
  // via this helper and reparsed by parseNumericInput above.
  function formatDecimal(value: number): string {
    if (Number.isNaN(value)) return "";
    return value.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
  }

  const totals = computeTotals(lines);

  // Summing floats leaves stray trailing digits (e.g. 45.56700000000001).
  // Round to the same precision the accountant enters before formatting, so
  // the on-screen total matches what she'd get adding the column by hand.
  function formatTotal(value: number, maximumFractionDigits: number): string {
    return value.toLocaleString("bg-BG", { maximumFractionDigits });
  }

  // Leading columns before HEADER_ROW's own 13 columns: the row action
  // button, plus the invoice number column when shown. The totals row's
  // leading blank span must grow to match, so the numeric totals still
  // land under the right data columns.
  const leadingColSpan = 9 + 1 + (showInvoiceNumber ? 1 : 0);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border px-2 py-1" />
          {showInvoiceNumber && (
            <th className="border px-2 py-1 text-left">
              {MESSAGES.labels.invoiceNumberColumn}
            </th>
          )}
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
            <td className="border px-1">{renderRowAction(index)}</td>
            {showInvoiceNumber && (
              <td
                className="border px-1"
                aria-label={`${MESSAGES.labels.invoiceNumberColumn} row ${index + 1}`}
              >
                {line.invoiceNumber}
              </td>
            )}
            {/* Sequence number: always empty, not editable — locked by the
                type system (IntrastatDeclarationLine.sequenceNumber is a
                literal `null`) per the accountant's request to drop the
                auto-numbering. */}
            <td
              className="border px-1"
              aria-label={`${HEADER_ROW[0]} row ${index + 1}`}
            />
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                value={line.commodityCode}
                onChange={(e) =>
                  onLineChange(index, { commodityCode: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[2]} row ${index + 1}`}
                value={line.partnerCountry}
                onChange={(e) =>
                  onLineChange(index, {
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
                  onLineChange(index, { countryOfOrigin: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                value={line.natureOfTransaction}
                onChange={(e) =>
                  onLineChange(index, { natureOfTransaction: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                value={line.deliveryTerms}
                onChange={(e) =>
                  onLineChange(index, { deliveryTerms: e.target.value })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                aria-label={`${HEADER_ROW[6]} row ${index + 1}`}
                value={line.modeOfTransport}
                onChange={(e) =>
                  onLineChange(index, {
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
                  onLineChange(index, {
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
                  onLineChange(index, {
                    regionOfConsumption: e.target.value,
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[9]} row ${index + 1}`}
                value={formatDecimal(line.netWeightKg)}
                onChange={(e) =>
                  onLineChange(index, {
                    netWeightKg: parseNumericInput(e.target.value),
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
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[11]} row ${index + 1}`}
                value={formatDecimal(line.value)}
                onChange={(e) =>
                  onLineChange(index, {
                    value: parseNumericInput(e.target.value),
                  })
                }
              />
            </td>
            <td className="border px-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${HEADER_ROW[12]} row ${index + 1}`}
                value={formatDecimal(line.statisticalValue)}
                onChange={(e) =>
                  onLineChange(index, {
                    statisticalValue: parseNumericInput(e.target.value),
                  })
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className="border px-1" colSpan={leadingColSpan} />
          <td className="border px-1">{formatTotal(totals.netWeightKg, 3)}</td>
          <td className="border px-1" />
          <td className="border px-1">{formatTotal(totals.value, 2)}</td>
          <td className="border px-1">
            {formatTotal(totals.statisticalValue, 2)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/DeclarationTable.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DeclarationTable.tsx src/components/DeclarationTable.test.tsx
git commit -m "feat: replace ReviewTable with DeclarationTable (invoice number column + row actions)"
```

---

### Task 3: `SearchBar` component

**Files:**
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/SearchBar.test.tsx`

**Interfaces:**
- Consumes: `MESSAGES.labels.searchInput` from `@/app/messages` (Task 1).
- Produces: `SearchBar` component with props
  `{ value: string; onChange: (value: string) => void }`.

- [ ] **Step 1: Write the failing test file**

Create `src/components/SearchBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/app/messages";
import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  it("renders with the given value", () => {
    render(<SearchBar value="INV-1" onChange={vi.fn()} />);
    expect(screen.getByLabelText(MESSAGES.labels.searchInput)).toHaveValue(
      "INV-1",
    );
  });

  it("calls onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(MESSAGES.labels.searchInput), {
      target: { value: "INV-2" },
    });
    expect(onChange).toHaveBeenCalledWith("INV-2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: FAIL — `SearchBar` module not found.

- [ ] **Step 3: Write the component**

Create `src/components/SearchBar.tsx`:

```tsx
"use client";

import { MESSAGES } from "@/app/messages";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex flex-col gap-1">
      {MESSAGES.labels.searchInput}
      <input
        type="text"
        aria-label={MESSAGES.labels.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border px-2 py-1"
      />
    </label>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx
git commit -m "feat: add SearchBar component for filtering the working table by invoice number"
```

---

### Task 4: Rewire `page.tsx` — working/final table split, view toggle, add/remove flow

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `DeclarationTable` (Task 2), `SearchBar` (Task 3), `WorkingLine`
  (Task 1), all new `MESSAGES` entries (Task 1). Also unchanged:
  `ConfigForm`, `FileInput`, `ErrorBanner`, `DownloadButton`,
  `parseSourceInvoiceWorkbook`, `mapInvoiceLinesToDeclaration`,
  `hasInvalidNumericValue`.
- Produces: the complete new page flow — this is the last task, nothing
  downstream depends on it.

This task is one cohesive deliverable (the split flow only works end-to-end,
not partially), so the "test then implement" cycle below covers the whole
rewrite in one pass rather than being subdivided further.

- [ ] **Step 1: Replace `src/app/page.test.tsx` with the full new test suite**

Replace the full contents of `src/app/page.test.tsx` with:

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MESSAGES } from "./messages";
import Home from "./page";

// jsdom's File/Blob implementation doesn't implement arrayBuffer() (as of
// jsdom 26 in this project's test setup), but page.tsx calls
// `file.arrayBuffer()` — a standard, real-browser-supported API. Polyfill it
// here via FileReader (same technique already used in
// src/components/DownloadButton.test.tsx) so the app code under test can run
// unmodified; this is a test-environment gap, not an application bug.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

function loadSampleFile(): File {
  const buffer = readFileSync(
    path.join(process.cwd(), "Invoice Details Inquiry.xls"),
  );
  return new File([buffer], "Invoice Details Inquiry.xls", {
    type: "application/vnd.ms-excel",
  });
}

// Real header row from "Invoice Details Inquiry.xls" — used to build minimal
// synthetic workbooks, so the error-path and search/add-flow tests don't
// depend on hand-maintained second copies of a real invoice file.
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
  }) as Uint8Array<ArrayBuffer>;
  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildSourceRow(overrides: {
  invoiceNumber: string;
  customsCode: string;
  unitNetWeightKg: number;
  invoicedQuantity: number;
  unitNetPrice: number;
}): (string | number)[] {
  return [
    "CUST1",
    "INV",
    "ORD1",
    "",
    "1",
    overrides.invoiceNumber,
    "1",
    "2026-01-01",
    "2026-01-15",
    "",
    "",
    "PART1",
    "Test part",
    "",
    "",
    "",
    "DE",
    "",
    "",
    overrides.unitNetWeightKg,
    overrides.invoicedQuantity,
    overrides.unitNetPrice,
    overrides.unitNetPrice,
    0,
    0,
    0,
    "EUR",
    "",
    overrides.customsCode,
  ];
}

// Three rows across two invoice numbers: two line items under "INV-1"
// (distinct commodity codes, since the same invoice can list several
// items) and one under "INV-2" — used to test search filtering and
// "add all" respecting the active filter.
function buildMultiInvoiceFile(): File {
  const rows: (string | number)[][] = [
    SOURCE_HEADER,
    buildSourceRow({
      invoiceNumber: "INV-1",
      customsCode: "90011000 - 0000",
      unitNetWeightKg: 1,
      invoicedQuantity: 2,
      unitNetPrice: 10,
    }),
    buildSourceRow({
      invoiceNumber: "INV-1",
      customsCode: "90012000 - 0000",
      unitNetWeightKg: 1,
      invoicedQuantity: 1,
      unitNetPrice: 5,
    }),
    buildSourceRow({
      invoiceNumber: "INV-2",
      customsCode: "90013000 - 0000",
      unitNetWeightKg: 3,
      invoicedQuantity: 1,
      unitNetPrice: 100,
    }),
  ];
  return buildXlsxFile(rows, "multi-invoice.xlsx");
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
  await user.selectOptions(
    screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
    "SZR",
  );
}

describe("Home page", () => {
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

  it("disables the file input until all config fields are filled in", () => {
    render(<Home />);
    expect(screen.getByLabelText(MESSAGES.labels.fileInput)).toBeDisabled();
  });

  it("shows a plain-language error for a non-Excel file", async () => {
    const user = userEvent.setup({ applyAccept: false });
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

  it("adds a single row via the plus button, toggles to the NAP view, and downloads only that row", async () => {
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

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );

    // Row 1 moved out of the working table — what's now labeled "row 1" is
    // a different line, proving the added row was removed from this view.
    expect(screen.getByLabelText("Код на стоката row 1")).not.toHaveValue(
      "82084000",
    );

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
    expect(
      screen.queryByLabelText(`${MESSAGES.labels.invoiceNumberColumn} row 1`),
    ).not.toBeInTheDocument();

    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();

    await user.click(downloadButton);

    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const arrayBuffer = await capturedBlob!.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    // Header + 1 data row + totals row = 3, proving only the added row
    // (not the other 13 mapped rows) made it into the download.
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("82084000");
  });

  it("filters the working table by invoice number and 'add all' only adds the visible rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await fillConfig(user);

    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );

    await user.type(
      screen.getByLabelText(MESSAGES.labels.searchInput),
      "INV-1",
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(
      screen.queryByLabelText("Код на стоката row 3"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: MESSAGES.labels.addAllButton }),
    );

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Код на стоката row 1"),
      ).not.toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText(MESSAGES.labels.searchInput));
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90013000",
    );

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "90011000",
    );
    expect(screen.getByLabelText("Код на стоката row 2")).toHaveValue(
      "90012000",
    );
    expect(
      screen.queryByLabelText("Код на стоката row 3"),
    ).not.toBeInTheDocument();
  });

  it("restores a removed NAP row back to the working table", async () => {
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

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.removeRowButton} 1`,
      }),
    );

    expect(
      screen.getByRole("button", { name: MESSAGES.labels.downloadButton }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewWorkingTableButton,
      }),
    );

    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );
  });

  it("asks for confirmation before replacing unadded working rows with a new upload", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
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

    confirmSpy.mockReturnValueOnce(false);
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      MESSAGES.confirmations.discardUnaddedRows(14),
    );
    expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
      "82084000",
    );

    confirmSpy.mockReturnValueOnce(true);
    await user.upload(
      screen.getByLabelText(MESSAGES.labels.fileInput),
      buildMultiInvoiceFile(),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Код на стоката row 1")).toHaveValue(
        "90011000",
      );
    });
    expect(screen.getByLabelText("Код на стоката row 3")).toHaveValue(
      "90013000",
    );
  });

  it("disables the download button and shows a message while a NAP row has a blank numeric cell, then re-enables it once fixed", async () => {
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

    await user.click(
      screen.getByRole("button", {
        name: `${MESSAGES.labels.addRowButton} 1`,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    const downloadButton = screen.getByRole("button", {
      name: MESSAGES.labels.downloadButton,
    });
    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();

    const netWeightInput = screen.getByLabelText("Нето тегло в кг row 1");
    await user.clear(netWeightInput);

    expect(downloadButton).toBeDisabled();
    expect(
      screen.getByText(MESSAGES.errors.invalidNumericValue),
    ).toBeInTheDocument();

    await user.type(netWeightInput, "20");

    expect(downloadButton).toBeEnabled();
    expect(
      screen.queryByText(MESSAGES.errors.invalidNumericValue),
    ).not.toBeInTheDocument();
  });

  it("does not show the search bar while viewing the NAP table", async () => {
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

    await user.click(
      screen.getByRole("button", {
        name: MESSAGES.labels.viewFinalTableButton,
      }),
    );

    expect(
      screen.queryByLabelText(MESSAGES.labels.searchInput),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/page.test.tsx`
Expected: FAIL — `page.tsx` doesn't yet expose the new buttons/labels
(`viewFinalTableButton`, `addRowButton`, invoice number column, etc.).

- [ ] **Step 3: Rewrite `src/app/page.tsx`**

Replace the full contents of `src/app/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import {
  ConfigForm,
  EMPTY_CONFIG_FORM_VALUE,
  isConfigComplete,
  type ConfigFormValue,
} from "@/components/ConfigForm";
import { DeclarationTable } from "@/components/DeclarationTable";
import { DownloadButton } from "@/components/DownloadButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FileInput } from "@/components/FileInput";
import { SearchBar } from "@/components/SearchBar";
import { parseSourceInvoiceWorkbook } from "@/core/importXlsx";
import { mapInvoiceLinesToDeclaration } from "@/core/mapping";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { hasInvalidNumericValue } from "@/core/validateLines";
import { MESSAGES } from "./messages";

type View = "working" | "final";

export default function Home() {
  const [configValue, setConfigValue] = useState<ConfigFormValue>(
    EMPTY_CONFIG_FORM_VALUE,
  );
  const [workingLines, setWorkingLines] = useState<WorkingLine[] | null>(
    null,
  );
  const [finalLines, setFinalLines] = useState<WorkingLine[]>([]);
  const [view, setView] = useState<View>("working");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    if (!isConfigComplete(configValue)) return;
    if (workingLines && workingLines.length > 0) {
      const confirmed = window.confirm(
        MESSAGES.confirmations.discardUnaddedRows(workingLines.length),
      );
      if (!confirmed) return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const sourceLines = parseSourceInvoiceWorkbook(buffer);
      if (sourceLines.length === 0) {
        setError(MESSAGES.errors.emptyFile);
        setWorkingLines(null);
        return;
      }
      const mapped = mapInvoiceLinesToDeclaration(sourceLines, configValue);
      const nextWorkingLines: WorkingLine[] = mapped.map((line, i) => ({
        ...line,
        invoiceNumber: sourceLines[i].invoiceNumber,
      }));
      setWorkingLines(nextWorkingLines);
      setError(null);
      setSearchQuery("");
      setView("working");
    } catch (err) {
      console.error(err);
      setError(MESSAGES.errors.unrecognizedStructure);
      setWorkingLines(null);
    }
  }

  function handleInvalidFileType() {
    setError(MESSAGES.errors.invalidFileType);
    setWorkingLines(null);
  }

  function toggleView() {
    setView((v) => (v === "working" ? "final" : "working"));
  }

  // Indices into `workingLines` currently matching the search query, kept
  // as indices (not a sliced copy) so add-single/add-all can map a display
  // position in the filtered table back to the real position in
  // `workingLines` for state updates.
  const filteredIndices = workingLines
    ? workingLines
        .map((_, i) => i)
        .filter((i) =>
          workingLines[i].invoiceNumber
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase()),
        )
    : [];
  const filteredWorkingLines = filteredIndices.map((i) => workingLines![i]);

  function handleWorkingLineChange(
    displayIndex: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    const originalIndex = filteredIndices[displayIndex];
    setWorkingLines((prev) =>
      prev!.map((line, i) =>
        i === originalIndex ? { ...line, ...patch } : line,
      ),
    );
  }

  function handleFinalLineChange(
    index: number,
    patch: Partial<IntrastatDeclarationLine>,
  ) {
    setFinalLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function handleAddRow(displayIndex: number) {
    if (!workingLines) return;
    const originalIndex = filteredIndices[displayIndex];
    const line = workingLines[originalIndex];
    setFinalLines((prev) => [...prev, line]);
    setWorkingLines((prev) => prev!.filter((_, i) => i !== originalIndex));
  }

  function handleAddAllVisible() {
    if (!workingLines) return;
    const indicesToAdd = new Set(filteredIndices);
    if (indicesToAdd.size === 0) return;
    const toAdd = workingLines.filter((_, i) => indicesToAdd.has(i));
    setFinalLines((prev) => [...prev, ...toAdd]);
    setWorkingLines((prev) => prev!.filter((_, i) => !indicesToAdd.has(i)));
  }

  function handleRemoveRow(index: number) {
    const line = finalLines[index];
    setWorkingLines((prev) => (prev ? [...prev, line] : [line]));
    setFinalLines((prev) => prev.filter((_, i) => i !== index));
  }

  const hasInvalidValues = hasInvalidNumericValue(finalLines);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <ConfigForm value={configValue} onChange={setConfigValue} />
      {view === "working" && (
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      )}
      <FileInput
        disabled={!isConfigComplete(configValue)}
        onFileSelected={handleFileSelected}
        onInvalidFileType={handleInvalidFileType}
      />
      <ErrorBanner message={error} />
      <button
        type="button"
        onClick={toggleView}
        className="self-start cursor-pointer rounded-md bg-gray-200 px-4 py-2"
      >
        {view === "working"
          ? MESSAGES.labels.viewFinalTableButton
          : MESSAGES.labels.viewWorkingTableButton}
      </button>
      {view === "working" && workingLines && (
        <>
          <button
            type="button"
            onClick={handleAddAllVisible}
            disabled={filteredWorkingLines.length === 0}
            className="self-start cursor-pointer rounded-md bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {MESSAGES.labels.addAllButton}
          </button>
          <DeclarationTable
            lines={filteredWorkingLines}
            onLineChange={handleWorkingLineChange}
            showInvoiceNumber
            renderRowAction={(index) => (
              <button
                type="button"
                aria-label={`${MESSAGES.labels.addRowButton} ${index + 1}`}
                onClick={() => handleAddRow(index)}
                className="cursor-pointer text-green-600"
              >
                +
              </button>
            )}
          />
        </>
      )}
      {view === "final" && (
        <>
          <DeclarationTable
            lines={finalLines}
            onLineChange={handleFinalLineChange}
            showInvoiceNumber={false}
            renderRowAction={(index) => (
              <button
                type="button"
                aria-label={`${MESSAGES.labels.removeRowButton} ${index + 1}`}
                onClick={() => handleRemoveRow(index)}
                className="cursor-pointer text-red-600"
              >
                −
              </button>
            )}
          />
          <DownloadButton lines={finalLines} disabled={hasInvalidValues} />
          {hasInvalidValues && (
            <p role="alert" className="text-sm text-red-600">
              {MESSAGES.errors.invalidNumericValue}
            </p>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/page.test.tsx`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: split review table into working table and NAP final table"
```

---

### Task 5: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the untouched `src/core` golden-dataset
tests and `DownloadButton.test.tsx` (unchanged — `DownloadButton` still
accepts `IntrastatDeclarationLine[]`, and `WorkingLine[]` satisfies that
structurally).

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: If any step above required a fix, commit it**

```bash
git add -A
git commit -m "fix: address lint/typecheck/build issues from working/NAP table split"
```

(Skip this step if nothing needed fixing.)
