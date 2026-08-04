# Virtualized Declaration Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DeclarationTable` render only the rows currently scrolled
into view (row virtualization), so uploading a large source file (observed:
2724 rows) no longer produces tens of thousands of live DOM nodes and a
sluggish UI.

**Architecture:** Replace `DeclarationTable`'s native `<table>` markup with
a CSS Grid layout (fixed pixel column widths shared across header, body
rows, and totals footer) driven by `@tanstack/react-virtual`'s
`useVirtualizer` hook. Only rows within (or near) the scrolled viewport are
mounted; a spacer element sized to the full virtual content height keeps
the scrollbar accurate. `DeclarationTable`'s public props are unchanged, so
`page.tsx`'s two usages (working table, final table) get virtualization for
free.

**Tech Stack:** React 19, `@tanstack/react-virtual` (new dependency),
Tailwind CSS Grid utilities, Vitest + `@testing-library/react` (with jsdom
mocks for `getBoundingClientRect`/`ResizeObserver`, which `@tanstack/react-virtual`
needs to measure its scroll container).

## Global Constraints

- `DeclarationTable`'s props (`lines`, `onLineChange`, `showInvoiceNumber`,
  `renderRowAction`) do not change — this is an internal rendering change
  only.
- Every input keeps its existing `aria-label` pattern
  (`"{column label} row {index + 1}"`) so existing `getByLabelText` test
  queries keep working unmodified.
- Row height is a single fixed constant (`ROW_HEIGHT_PX = 40`) — no dynamic
  row measurement needed, since every row is one line of inputs.
- Header, body rows, and the totals footer all derive their
  `grid-template-columns` from one shared `COLUMN_WIDTHS`-style constant —
  never three independently-maintained width lists.
- The body's scroll container caps at `max-h-[65vh]` with
  `overflow-y-auto`; it does not force that height when there are few rows
  (no separate "small table" code path).
- Accessibility: `role="table"` / `role="rowgroup"` / `role="row"` /
  `role="columnheader"` / `role="cell"` replace native table semantics,
  since virtualization is incompatible with a real `<table>`'s layout
  algorithm.
- Do not touch `src/core` (parsing, mapping, export) — the slowdown is a
  rendering problem in the review UI only.
- Do not push this branch or merge it anywhere — all commits stay local
  (per explicit user instruction for this round of work).

---

### Task 1: Virtualize `DeclarationTable`

**Files:**
- Modify: `package.json` (new dependency, via `npm install`)
- Modify: `vitest.setup.ts` (jsdom mocks `@tanstack/react-virtual` needs)
- Modify: `src/components/DeclarationTable.tsx` (table → virtualized grid)
- Modify: `src/components/DeclarationTable.test.tsx` (existing tests
  adapted to the new mocks + one new virtualization-proof test)

**Interfaces:**
- Consumes: `HEADER_ROW`, `computeTotals` from `@/core/exportXlsx`
  (unchanged); `WorkingLine`, `IntrastatDeclarationLine` from `@/core/types`
  (unchanged); `MESSAGES` from `@/app/messages` (unchanged);
  `useVirtualizer` from `@tanstack/react-virtual` (new).
- Produces: `DeclarationTable` with the exact same props signature as
  today — no downstream task depends on any new exports from this file.

- [ ] **Step 1: Install the virtualization library**

Run: `npm install @tanstack/react-virtual`

This adds it to `dependencies` in `package.json` (it's used in app code,
not just tests).

- [ ] **Step 2: Add jsdom measurement mocks to `vitest.setup.ts`**

`@tanstack/react-virtual` measures its scroll container's real pixel size
via `getBoundingClientRect` and `ResizeObserver` to decide which rows are
"in view." jsdom implements neither with real layout (`getBoundingClientRect`
reports all-zero, and `ResizeObserver` doesn't exist at all) — this is the
standard, documented approach for testing `react-virtual` components:
stub both with a fixed, generous default so components render a realistic
set of rows under test. Individual tests can override the mocked rect
locally (via `vi.spyOn` again) when they need a smaller viewport to prove
virtualization is actually skipping rows.

Replace the full contents of `vitest.setup.ts` with:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// @tanstack/react-virtual (used by DeclarationTable) measures its scroll
// container's real pixel size via getBoundingClientRect and
// ResizeObserver to decide which rows are "in view" — jsdom implements
// neither with real layout. restoreAllMocks() runs first so each test
// starts from a clean slate before this default is re-applied; a test
// that needs a smaller mocked viewport (to assert virtualization itself)
// can call vi.spyOn(Element.prototype, "getBoundingClientRect") again
// within its own body to override this default for just that test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DEFAULT_MOCK_RECT: DOMRect = {
  width: 1000,
  height: 800,
  top: 0,
  left: 0,
  bottom: 800,
  right: 1000,
  x: 0,
  y: 0,
  toJSON: () => {},
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DEFAULT_MOCK_RECT,
  );
});

afterEach(() => cleanup());
```

- [ ] **Step 3: Write the new virtualization-proof test (RED)**

Add this test to `src/components/DeclarationTable.test.tsx`, alongside the
existing tests (do not remove or rewrite the existing 6 — they continue to
pass unmodified under the new mocks, since 1-row test fixtures easily fit
within the default 800px mocked viewport):

```tsx
it("only mounts a subset of rows into the DOM when there are far more rows than fit the viewport", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1000,
    height: 300,
    top: 0,
    left: 0,
    bottom: 300,
    right: 1000,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  const manyLines: WorkingLine[] = Array.from({ length: 200 }, (_, i) => ({
    ...sampleLines[0],
    commodityCode: `ROW-${i}`,
  }));

  render(
    <DeclarationTable
      lines={manyLines}
      onLineChange={vi.fn()}
      showInvoiceNumber={false}
      renderRowAction={() => null}
    />,
  );

  // A 300px viewport at 40px/row fits well under 200 rows at once — if
  // virtualization is working, most of the 200 inputs never mount.
  const renderedInputs = screen.getAllByDisplayValue(/^ROW-/);
  expect(renderedInputs.length).toBeGreaterThan(0);
  expect(renderedInputs.length).toBeLessThan(200);
});
```

- [ ] **Step 4: Run the test suite to verify the new test fails and the existing ones still pass their current (pre-virtualization) implementation**

Run: `npx vitest run src/components/DeclarationTable.test.tsx`
Expected: the new "only mounts a subset of rows..." test FAILS (all 200
rows currently render, since the component doesn't virtualize yet — every
`ROW-*` commodity code is present). The existing 6 tests still PASS
(nothing about them depends on virtualization).

- [ ] **Step 5: Rewrite `DeclarationTable.tsx` as a virtualized grid**

Replace the full contents of `src/components/DeclarationTable.tsx` with:

```tsx
"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HEADER_ROW, computeTotals } from "@/core/exportXlsx";
import type { PartnerCountry, TransportMode } from "@/core/constants";
import type { IntrastatDeclarationLine, WorkingLine } from "@/core/types";
import { MESSAGES } from "@/app/messages";

// Column order below (after the leading action/invoice-number columns) must
// exactly match HEADER_ROW (src/core/exportXlsx.ts), which in turn matches
// lineToRow's field order there. Keep them in sync.

// Every row is a fixed single line of inputs, so the virtualizer can use a
// constant estimated size instead of dynamic per-row measurement.
const ROW_HEIGHT_PX = 40;

const ACTION_COLUMN_WIDTH = 40;
const INVOICE_NUMBER_COLUMN_WIDTH = 110;

// Fixed pixel width per HEADER_ROW column, in the same order as
// HEADER_ROW. CSS Grid (unlike a native <table>, which auto-sizes columns
// per-table) needs explicit widths so the header, each virtualized body
// row, and the totals footer — three separate elements — stay aligned.
const DATA_COLUMN_WIDTHS = [
  60, // № по ред (always empty)
  100, // Код на стоката
  90, // Страна партньор
  90, // Страна на проиозход
  90, // Вид на сделката
  90, // Условия на доставка
  90, // Вид транспорт
  160, // Националност на транспортното средство
  110, // Регион на потребление
  110, // Нето тегло в кг
  110, // Количество по допълнителна мярка (always empty)
  110, // Стойност в лв
  140, // Статистическа стойност в лв
];

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
  const scrollRef = useRef<HTMLDivElement>(null);

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
  // leading span must grow to match, so the numeric totals still land
  // under the right data columns.
  const leadingColSpan = 9 + 1 + (showInvoiceNumber ? 1 : 0);

  const columnWidths = [
    ACTION_COLUMN_WIDTH,
    ...(showInvoiceNumber ? [INVOICE_NUMBER_COLUMN_WIDTH] : []),
    ...DATA_COLUMN_WIDTHS,
  ];
  const gridTemplateColumns = columnWidths.map((w) => `${w}px`).join(" ");

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });

  return (
    <div role="table" className="w-full text-sm">
      <div role="rowgroup">
        <div
          role="row"
          className="grid border-b font-bold"
          style={{ gridTemplateColumns }}
        >
          <div role="columnheader" className="border px-2 py-1" />
          {showInvoiceNumber && (
            <div role="columnheader" className="border px-2 py-1 text-left">
              {MESSAGES.labels.invoiceNumberColumn}
            </div>
          )}
          {HEADER_ROW.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="border px-2 py-1 text-left"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        role="rowgroup"
        className="max-h-[65vh] overflow-y-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const index = virtualRow.index;
            const line = lines[index];
            return (
              <div
                key={index}
                role="row"
                className="grid border-b"
                style={{
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div role="cell" className="border px-1">
                  {renderRowAction(index)}
                </div>
                {showInvoiceNumber && (
                  <div
                    role="cell"
                    className="border px-1"
                    aria-label={`${MESSAGES.labels.invoiceNumberColumn} row ${index + 1}`}
                  >
                    {line.invoiceNumber}
                  </div>
                )}
                {/* Sequence number: always empty, not editable — locked by
                    the type system (IntrastatDeclarationLine.sequenceNumber
                    is a literal `null`) per the accountant's request to
                    drop the auto-numbering. */}
                <div
                  role="cell"
                  className="border px-1"
                  aria-label={`${HEADER_ROW[0]} row ${index + 1}`}
                />
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[1]} row ${index + 1}`}
                    value={line.commodityCode}
                    onChange={(e) =>
                      onLineChange(index, { commodityCode: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[3]} row ${index + 1}`}
                    value={line.countryOfOrigin}
                    onChange={(e) =>
                      onLineChange(index, { countryOfOrigin: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[4]} row ${index + 1}`}
                    value={line.natureOfTransaction}
                    onChange={(e) =>
                      onLineChange(index, {
                        natureOfTransaction: e.target.value,
                      })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
                  <input
                    type="text"
                    aria-label={`${HEADER_ROW[5]} row ${index + 1}`}
                    value={line.deliveryTerms}
                    onChange={(e) =>
                      onLineChange(index, { deliveryTerms: e.target.value })
                    }
                  />
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
                {/* Supplementary quantity: always empty, not editable —
                    locked by the type system
                    (IntrastatDeclarationLine.supplementaryQuantity is a
                    literal `null`) per the accountant's submission
                    process. */}
                <div
                  role="cell"
                  className="border px-1"
                  aria-label={`${HEADER_ROW[10]} row ${index + 1}`}
                />
                <div role="cell" className="border px-1">
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
                </div>
                <div role="cell" className="border px-1">
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div role="rowgroup">
        <div
          role="row"
          className="grid border-t font-bold"
          style={{ gridTemplateColumns }}
        >
          <div
            role="cell"
            className="border px-1"
            style={{ gridColumn: `span ${leadingColSpan}` }}
          />
          <div role="cell" className="border px-1">
            {formatTotal(totals.netWeightKg, 3)}
          </div>
          <div role="cell" className="border px-1" />
          <div role="cell" className="border px-1">
            {formatTotal(totals.value, 2)}
          </div>
          <div role="cell" className="border px-1">
            {formatTotal(totals.statisticalValue, 2)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test suite to verify everything passes (GREEN)**

Run: `npx vitest run src/components/DeclarationTable.test.tsx`
Expected: all 7 tests PASS, including the new virtualization-proof test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.setup.ts src/components/DeclarationTable.tsx src/components/DeclarationTable.test.tsx
git commit -m "feat: virtualize DeclarationTable rows to keep large uploads responsive"
```

---

### Task 2: Memoize the working-table filter computation in `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: existing `workingLines`, `searchQuery` state (unchanged).
- Produces: no new exports; `filteredIndices` and `filteredWorkingLines`
  keep their existing names and shapes, just wrapped in `useMemo`. No
  downstream task depends on anything new here.

This task is a pure performance optimization with no observable behavior
change, so it's verified by the existing test suite continuing to pass
rather than a new test.

- [ ] **Step 1: Wrap `filteredIndices` and `filteredWorkingLines` in `useMemo`**

In `src/app/page.tsx`, add `useMemo` to the React import:

```ts
import { useMemo, useState } from "react";
```

Replace:

```ts
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
```

with:

```ts
  // Recomputing this by scanning workingLines on every render — including
  // every keystroke in any single cell's edit, since an edit produces a
  // new workingLines array reference — is wasted work once a file has a
  // few thousand rows. Only actually needs to change when the data or the
  // search query changes.
  const filteredIndices = useMemo(
    () =>
      workingLines
        ? workingLines
            .map((_, i) => i)
            .filter((i) =>
              workingLines[i].invoiceNumber
                .toLowerCase()
                .includes(searchQuery.trim().toLowerCase()),
            )
        : [],
    [workingLines, searchQuery],
  );
  const filteredWorkingLines = useMemo(
    () => filteredIndices.map((i) => workingLines![i]),
    [filteredIndices, workingLines],
  );
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

Run: `npm test`
Expected: all tests pass (this is a behavior-preserving change — the
`useMemo` dependency arrays cover every input the computations read).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "perf: memoize working-table search filtering in page.tsx"
```

---

### Task 3: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every existing `src/core` and
component/page test — the `vitest.setup.ts` mocks added in Task 1 apply
globally to the jsdom project, so no other test file should need changes.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors (the pre-existing, unrelated `ThemeToggle.tsx`
`react-hooks/set-state-in-effect` error may still appear — that's tracked
separately and out of scope for this plan).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: If any step above required a fix, commit it**

```bash
git add -A
git commit -m "fix: address lint/typecheck/build issues from table virtualization"
```

(Skip this step if nothing needed fixing.)

- [ ] **Step 5: Do not push**

This branch (`feat/dual-screen-flow`) stays local for now, per explicit
instruction — do not run `git push` at any point in this plan's execution.
