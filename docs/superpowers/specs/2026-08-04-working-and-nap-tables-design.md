# Working Table / NAP Table Split — Design

Date: 2026-08-04
Status: Approved by user, pending spec review

## Purpose

The accountant sometimes needs to build one final Intrastat (NAP) declaration
out of invoice lines gathered from multiple uploaded source files, rather
than always exporting everything from a single upload. Today the app maps
one uploaded file straight into one downloadable table with no way to
accumulate or curate lines across uploads.

This design splits the single review table into two: a **working table**
(what's currently uploaded, replaced each time a new file is picked) and a
**final table** ("НАП таблица", what actually gets downloaded), with
explicit add/remove actions moving rows between them. This gives the
accountant a full CRUD workflow while keeping each screen showing only one
thing at a time, since the app is aimed at a non-technical user.

## Architecture

Still a single client-side page (`"use client"`), no new routes, no
persistence layer, no state management library — same architectural
constraints as the existing design (see
`2026-07-30-review-and-export-ui-design.md`). All changes are page-state and
UI; `src/core` (parsing, mapping, export) is untouched.

The final table is **session-only**, matching the app's existing stateless
design (closing/refreshing the tab loses it — same as today's behavior for
the single table). This was a deliberate choice: even though the app will
eventually be packaged as a desktop app via Tauri, and Tauri's webview does
support persistent `localStorage` across restarts, committing to a
persistence strategy now would be premature — the desktop packaging work may
call for file-based storage instead. Persistence stays an explicit
follow-up, as already flagged in the prior design's Out of Scope.

## State

- `profile: CustomerProfile | null` — unchanged.
- `workingLines: WorkingLine[] | null` — replaces today's `lines`. Produced
  by mapping the currently uploaded file. `WorkingLine` is
  `IntrastatDeclarationLine & { invoiceNumber: string }` — the mapped line
  plus the source row's invoice number, carried along purely for display and
  search in this table (not part of the export shape). Replaced wholesale
  each time a new file is uploaded and confirmed (see Error handling).
- `finalLines: WorkingLine[]` — the NAP table. Starts empty (`[]`), only
  changes via add/remove actions. This is what gets downloaded. Rows keep
  their `invoiceNumber` internally even here (not rendered, not exported) so
  that removing a row can restore it to `workingLines` with its original
  data intact.
- `view: "working" | "final"` — which table is currently shown. Defaults to
  `"working"`.
- `searchQuery: string` — filters `workingLines` by substring match on
  `invoiceNumber`. Only applies while `view === "working"`.
- `error: string | null` — unchanged.

## Components & data flow

- **`ConfigForm`** — unchanged.
- **`SearchBar`** *(new)* — positioned below the profile section. Rendered
  only while `view === "working"` (per user decision: search is deferred for
  the final view pending feedback on this new flow). Filters `workingLines`
  live, substring match against `invoiceNumber`.
- **`WorkingTable`** *(extends today's `ReviewTable`)* — shown when
  `view === "working"`, rendering `workingLines` filtered by `searchQuery`.
  Adds to the existing editable-row table:
  - An invoice number column (read-only) so filter results are visible.
  - A green "+" button as the leftmost column per row — moves that single
    row from `workingLines` to `finalLines`.
  - An "add all" button, positioned near the search bar — moves every
    currently *visible* (filtered) row from `workingLines` to `finalLines`.
- **`FinalTable`** *(new component, shares row-rendering with
  `WorkingTable` minus the invoice number column, search, and add
  controls)* — shown when `view === "final"`, rendering `finalLines`. Same
  editable cells as today's table, plus a remove button per row that deletes
  the row from `finalLines` and reinserts it into `workingLines`.
- **View toggle button** — single button, always rendered and always
  enabled (viewing an empty final table is fine — simpler and more
  predictable than a disabled state). Label is `виж НАП таблицата` while
  `view === "working"`, and `виж работната таблица` while
  `view === "final"`.
- **`FileInput`** — unchanged file-picking/parsing behavior, with one
  addition: if `workingLines` is non-empty when a new file is selected, show
  a confirmation dialog ("You have N unadded rows — they'll be lost.
  Continue?") before replacing `workingLines`. Declining leaves the current
  working table untouched and does not process the new file.
- **`DownloadButton`** — now renders/enables only when `view === "final"`
  and `finalLines` is non-empty; operates on `finalLines`.
- **`ErrorBanner`** — unchanged.

## Error handling & edge cases

- File-level errors (wrong type, unrecognized structure, empty file) —
  unchanged: still clear/block the working table via `ErrorBanner`.
- Unadded-rows-on-new-upload — a simple confirm dialog (no new modal
  component required), naming the row count about to be discarded.
- Invalid numeric values — the existing `hasInvalidNumericValue` check moves
  to apply to `finalLines`, checked while `view === "final"`, since that's
  the set that actually gets exported. Rows still in `workingLines` aren't
  validated until added.
- Empty final table — `DownloadButton` stays disabled when `finalLines` is
  empty, same disabled pattern as today, re-scoped to the new array.
- Search with no matches — the working table simply renders zero rows under
  the header; no dedicated empty state.

## Testing

- Extend `ReviewTable`'s existing tests (renamed/split into
  `WorkingTable`/`FinalTable`) to cover the invoice number column and the
  per-row add/remove buttons.
- New tests for the view toggle button (label flips, view switches).
- New tests for `SearchBar` filtering behavior on the working table.
- New tests for: add-all (respects active filter), add-single, and
  remove-with-restore (row reappears in the working table with its original
  data, including `invoiceNumber`).
- New test for the unadded-rows confirmation on file replace, covering both
  confirm and cancel.
- Update the existing integration test (`page.test.tsx`) to drive the full
  flow: upload → search → add some rows → toggle to NAP view → verify table
  contents → download; plus a remove → verify the row reappears in the
  working table.
- Update `DownloadButton` tests to assert it only renders/enables on the
  final view with a non-empty `finalLines`.

## Explicitly out of scope for this round

- Search functionality in the NAP/final view — deferred pending client
  feedback on how this new flow feels in practice.
- Persistence of the final table across reloads/sessions — stays
  session-only; revisit once the desktop (Tauri) packaging work settles on a
  storage approach.
- Any undo affordance beyond "removing from NAP restores the row to the
  working table" — no undo needed for the add action itself, since a
  mistaken add can be corrected by removing it (which restores it).
- Multi-select / bulk row picking beyond "add all" (e.g. checkboxes for a
  subset) — not requested; add-all + search-to-narrow + individual plus
  covers the stated need.
