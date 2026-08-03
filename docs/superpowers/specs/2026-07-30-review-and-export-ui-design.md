# Review & Export UI — Design

Date: 2026-07-30
Status: Approved by user, pending spec review

## Purpose

Give the (non-technical) accountant a simple way to turn a source invoice
export into a Bulgarian Intrastat declaration: pick a few batch-level
options, upload a file, review/fix the mapped data in a table, download the
result. Accuracy is the product's core value, so the design favors a visible
review step over full automation, while keeping the number of
decisions/clicks she has to make to a minimum.

## Architecture

A single client-side React page (`"use client"`) added to the existing
Next.js app — no new routes, no server API layer. All processing (parsing,
mapping, exporting) runs in the browser, reusing `src/core` directly (it's
already framework-agnostic with no Next.js server dependency).

This is a deliberate choice, not just simplicity for its own sake: it keeps
the app's behavior identical whether it's running as a web page or later
packaged into a desktop app via Tauri (see project memory:
desktop-architecture-plan), since a desktop shell can't rely on a Next.js
server backend the same way.

The only new "core" work required is a small adaptation so `importXlsx.ts`
and `exportXlsx.ts` work with browser `ArrayBuffer`/`Blob` in addition to
Node `Buffer` — the underlying `xlsx` library supports both; this is a
mechanical extension, not a redesign of the existing parsing/export logic.

State lives in the page component, no global state library (this is a
strictly linear flow: config → upload → review → download, nothing shared
across unrelated components):

- `profile: CustomerProfile | null` — the three dropdown selections
- `lines: IntrastatDeclarationLine[] | null` — mapped, editable rows, or
  `null` before a file has been successfully processed
- `error: string | null` — a plain-language message, or `null`

## Components & data flow

- **`ConfigForm`** — three dropdowns: partner country (`IT`/`FR`), transport
  mode (`3`/`4`), region of consumption (values pending from the
  accountant — see Open Questions). Controlled inputs, reports changes to
  page state.
- **`FileInput`** — file picker restricted to `.xls`/`.xlsx`, disabled until
  all three `ConfigForm` dropdowns have a value (avoids the ambiguous case
  of a file being processed against an incomplete profile). Once enabled and
  a file is selected, the page parses and maps it automatically — no
  separate "Process" button, to minimize clicks.
- **`ReviewTable`** — one row per mapped invoice line, every cell editable
  inline via plain text/number inputs (no per-column specialized widgets).
  Edits update `lines` in place. No row-level flagging of notable values
  (e.g. blank country of origin, GB→XU conversions) for now — explicitly
  deferred, can be added later.
- **`ErrorBanner`** — displays the current `error` message, if any.
- **`DownloadButton`** — enabled once `lines` is populated; builds the
  `.xlsx` via `intrastatWorkbookToBuffer` and triggers a browser download
  (Blob + temporary anchor click).

Flow: fill dropdowns → pick file → table appears automatically → review/edit
→ download. Selecting a different file at any point re-runs parsing and
replaces the table.

The three batch-level config values are assumed to apply to the whole
uploaded file. The user has flagged this as an assumption pending a follow-up
conversation with the accountant about possible edge cases — see Open
Questions.

## Error handling

Three file-level failure cases (no row-level error surfacing), each shown as
a short plain-language message via `ErrorBanner`:

1. **Wrong file type** — checked on file selection, before parsing is
   attempted.
2. **Unrecognized structure** (missing/renamed columns) — `importXlsx.ts`
   already throws a specific `Column not found: "X"` error internally; the
   UI catches it and shows a generic message rather than the technical
   detail (which stays in the browser console for debugging).
3. **Empty file** (parses but has zero data rows).

Any error clears the table and disables the download button until a new,
valid file is selected.

**All user-facing copy (error messages, button/label text) lives in one
file, `src/app/messages.ts`.** This is a direct requirement from the user:
wording or language should be a one-file edit, not a code-wide search. No
other component should contain a hardcoded user-facing string.

## Testing

The core engine (`src/core`) already has full unit/golden-dataset test
coverage against the real reference files (`Invoice Details Inquiry.xls`,
`за НАП.xls`). For the UI layer:

- Add `@testing-library/react` and a `jsdom` test environment as new dev
  dependencies (existing tests only cover plain logic under Node).
- `ConfigForm` / `FileInput` — interaction tests (selecting dropdown values,
  rejecting non-Excel file types).
- `ReviewTable` — renders the correct row count from given data; editing a
  cell updates the underlying value.
- An integration test: construct a `File` from the real
  `Invoice Details Inquiry.xls` fixture, drive it through the full page
  flow, and assert the table shows the same mapped values already verified
  by the core golden-dataset tests; assert that editing a cell and
  downloading produces the edited data (not the original).

## Explicitly out of scope for this design

- Authentication, accounts, multi-user support (solo tier, no-auth, per
  desktop-architecture-plan).
- Persistence/history of past uploads — stateless for now, each session
  starts fresh. Flagged by the user as a likely future addition.
- Row-level flagging/highlighting of notable auto-mapped values — deferred.

## Open questions

- **Whether the three batch-level config values (partner country, transport
  mode, region) truly apply to the whole file in all cases**, or whether
  there are edge cases requiring per-line overrides — user is following up
  with the accountant on this.
