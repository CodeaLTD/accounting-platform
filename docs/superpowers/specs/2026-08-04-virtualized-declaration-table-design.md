# Virtualized Declaration Table — Design

Date: 2026-08-04
Status: Approved by user, pending spec review

## Purpose

Uploading a large source invoice file (observed: 2724 rows) makes the app
sluggish to the point of poor UX — every row renders as a real `<tr>` with
roughly 13 live `<input>` elements, so a large file produces 35,000+ DOM
nodes, and editing any single cell re-renders the whole table. This design
introduces row virtualization so only the rows actually scrolled into view
are ever mounted, regardless of how many rows the accountant has loaded.

## Architecture

`DeclarationTable` (`src/components/DeclarationTable.tsx`) moves from a
native `<table>`/`<tr>`/`<td>` layout to a CSS Grid layout driven by
`@tanstack/react-virtual`, chosen for its active maintenance, small React
hook API, and solid TypeScript support. This is purely an internal
rendering change — the component's public props
(`lines`, `onLineChange`, `showInvoiceNumber`, `renderRowAction`) are
unchanged, so `page.tsx`'s usage of the component does not need to change
beyond the memoization noted below.

Three stacked sections, all sharing one column-width scheme so they stay
aligned even though they're no longer a single native `<table>` (browsers
auto-size table columns per-table, which breaks alignment once the body
scrolls independently of the header):

- **Header** — one grid row, `role="row"`, rendered once, never virtualized
  (a single row is always cheap).
- **Body** — a scroll container capped at `max-h-[65vh]` with
  `overflow-y-auto`. `useVirtualizer` computes which rows are within (or
  near) the visible scroll range and renders only those as
  absolutely-positioned grid rows inside a spacer element sized to the full
  virtual content height. Row height is a fixed constant (`ROW_HEIGHT_PX`,
  40px) since every row is a single line of inputs — this lets the
  virtualizer use a fixed `estimateSize` instead of dynamic measurement.
- **Footer (totals)** — one grid row below the scroll container, always
  visible, computed via the existing `computeTotals(lines)` over the full
  `lines` array (not just the currently-visible/virtualized rows).

A single `COLUMN_WIDTHS` constant (fixed pixel width per column: the
leading action column, the invoice-number column, then each of the 13
`HEADER_ROW` columns) is shared by all three sections' `grid-template-columns`,
so header/body-rows/footer never drift out of alignment. This replaces
today's content-elastic auto-sizing with fixed widths — visually close to
today, but columns no longer grow/shrink to fit content.

### Accessibility

Native `<table>` semantics don't survive virtualization cleanly (a real
table's layout algorithm expects all rows present), so the grid uses
explicit ARIA table roles: `role="table"` on the outermost wrapper,
`role="rowgroup"` for header/body/footer groupings, `role="row"` per row,
and `role="columnheader"` / `role="cell"` for header and data cells
respectively. Every input keeps its existing `aria-label` pattern
(`"{column label} row {index + 1}"`), so `getByLabelText` queries in tests
are unaffected by the markup change.

## Sizing

- `ROW_HEIGHT_PX = 40` and `COLUMN_WIDTHS` are declared once at the top of
  `DeclarationTable.tsx` — the single source of truth for both the
  virtualizer's `estimateSize` and every section's grid template.
- The body's scroll container caps at `max-h-[65vh]` but does not force
  that height when there's less content than that: `overflow-y-auto` plus
  the virtualizer's real (small) content height means a 3-row table simply
  renders 3 rows' worth of height, while a 2724-row table scrolls within
  the capped region. No row-count threshold or separate "small table" code
  path is needed — one implementation handles every size.

## Page-level integration

In `src/app/page.tsx`, `filteredIndices` and `filteredWorkingLines`
(currently recomputed on every render via a bare `.map().filter()` over
`workingLines`) are wrapped in `useMemo`, keyed on
`[workingLines, searchQuery]`. This was previously flagged as a low-risk
deferred item while tables stayed small (13-14 rows); at 2724 rows,
recomputing on every render — including every keystroke in any cell, since
an edit creates a new `workingLines` array reference — is worth avoiding
now that it's a measurable cost.

No other page-level changes: `DeclarationTable`'s props are unchanged, and
both the working-table and final-table usages get virtualization for free.

## Testing

`@tanstack/react-virtual` measures its scroll container's real pixel height
to decide which rows are "in view," and jsdom (the test environment)
reports `0` for element dimensions since it performs no real layout. This
is handled via:

- A test-setup helper (added to `vitest.setup.ts` or a shared test util)
  that mocks `Element.prototype.getBoundingClientRect` and `ResizeObserver`
  (also absent in jsdom) to report a fixed, generous size — the standard,
  documented approach for testing `react-virtual` components, not an
  app-specific workaround.
- Existing tests (the sample file's 14 rows, and the various synthetic
  3-row fixtures across `DeclarationTable.test.tsx` and `page.test.tsx`)
  continue to pass unmodified, since a generous fixed mock viewport height
  (800px) is tall enough to render every row any existing test asserts on.
- One new test in `DeclarationTable.test.tsx` using a larger synthetic
  dataset (e.g. 200 rows) that asserts only a subset of rows exist in the
  DOM at once — proving virtualization is actually happening, not merely
  present in name. This test uses a smaller mocked viewport height than the
  800px default, specifically so the assertion ("not everything is
  rendered") is meaningful.

## Explicitly out of scope

- Virtualizing anything outside `DeclarationTable` (`ConfigForm`,
  `SearchBar`, etc.) — not part of the observed slowdown.
- Variable/dynamic row heights — every row is currently a fixed single line
  of inputs. If that changes later (e.g. a wrapping text field), the
  virtualizer would need `measureElement`-based dynamic sizing instead of
  the fixed `estimateSize` used here — not needed today.
- Persisting scroll position across the working/final view toggle — each
  view continues to render scrolled to the top, matching today's behavior
  of the page re-rendering fresh on toggle.
- Any change to `src/core` (parsing, mapping, export) — the slowdown is
  purely a rendering/DOM-size problem in the review UI, not in file
  processing.
