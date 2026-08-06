# shadcn/ui adoption — design

## Goal

Install shadcn/ui and use it to restyle the app's chrome controls, improving visual
consistency and polish while the app is in its "visual improvement" pass at the end
of its dev cycle.

## Scope

**In scope** — components that are few in number and not performance-sensitive:

- `ConfigForm` (3 selects)
- `FileInput`
- `SearchBar`
- `ErrorBanner`
- `ThemeToggle`
- The plain `<button>` elements in `page.tsx` (view-toggle, add-all, remove-all) and
  `DownloadButton`

**Out of scope** — `DeclarationTable`'s virtualized grid. It renders up to thousands
of per-row `<input>` cells via `@tanstack/react-virtual`; swapping those for a
heavier component (Radix-based or otherwise) risks regressing scroll/render
performance for no visible benefit, since the grid's plain bordered-cell look
doesn't read as "chrome" to a user. Its inline `+`/`−` row-action buttons stay plain
`<button>` elements for the same reason.

## Install & configuration

- Run `npx shadcn@latest init`:
  - Tailwind v4 mode (already the project's setup — `@tailwindcss/postcss`, no
    `tailwind.config.*` file).
  - Base color: **neutral** (closest match to the current plain `#171717`/`#ededed`
    palette).
  - Style: **new-york**.
- This generates `components.json`, `src/lib/utils.ts` (`cn()` helper via
  `clsx`/`tailwind-merge`), and rewrites `src/app/globals.css` to shadcn's
  CSS-variable-driven theme (`--background`, `--foreground`, `--primary`,
  `--destructive`, `--border`, etc., wired through `@theme inline` for Tailwind v4).
- **Dark mode convention change**: shadcn's default is a `.dark` class on `<html>`,
  not this app's current `data-theme="dark"` attribute. Adopt shadcn's convention:
  - `src/app/layout.tsx`'s inline `SET_INITIAL_THEME_SCRIPT` changes from setting
    `document.documentElement.dataset.theme` to toggling the `dark` class
    (`classList.add("dark")` / `classList.remove("dark")`), still gated on the same
    `localStorage.getItem("theme")` read.
  - `ThemeToggle.tsx` changes from reading/writing `dataset.theme` to
    `classList.contains("dark")` / `classList.toggle("dark", ...)`. Behavior
    (localStorage persistence, no-flash-on-load, system-preference fallback) stays
    identical — only the DOM mechanism changes.
  - `globals.css`'s dark overrides move from `:root[data-theme="dark"]` to the
    standard `.dark` selector shadcn's generated CSS already uses.
  - The grid-only rules (`.editable-input` cursor, `select option` color pin) are
    untouched.
- Add components as needed: `npx shadcn add button select input label alert`.

## Component mapping

| File | Change |
|---|---|
| `ConfigForm.tsx` | Native `<select>` × 3 → shadcn `<Select>` (Radix), each wrapped with shadcn `<Label>`. Controlled value/onChange shape stays the same (`ConfigFormValue`, `onChange` callback unchanged). Per-field validation `<span>` unchanged. |
| `FileInput.tsx` | Visible "Изберете файл" pill restyled using shadcn's `buttonVariants()` class helper (it's a `<span>` inside a `<label>`, not a real `<button>`, so it can't become `<Button>` directly). Hidden native `<input type="file">` + ref pattern unchanged. Blue color kept via `className` override per the button-color decision below. |
| `SearchBar.tsx` | `<input>` → shadcn `<Input>`. |
| `ErrorBanner.tsx` | `<div role="alert">` → shadcn `<Alert variant="destructive">`. |
| `ThemeToggle.tsx` | `<button>` → shadcn `<Button variant="outline" size="icon">`. Same sun/moon emoji content. Dark-mode mechanism change described above. |
| `page.tsx` buttons (view-toggle, add-all, remove-all) | → shadcn `<Button>`. View-toggle uses `variant="secondary"` (closest to current gray). Add-all/remove-all use `variant="default"` with `className` color overrides (green/red) — see below. |
| `DownloadButton.tsx` | → shadcn `<Button>` with `className` override for blue — see below. |

## Button color policy

Keep today's semantic colors exactly as they are (blue = primary/file actions, green
= add, red = remove/destructive, gray = secondary view-toggle) rather than adopting
shadcn's default monochrome variant palette. Use shadcn `<Button>` for consistent
sizing, focus rings, hover/disabled states, but layer the existing `bg-*-600`
Tailwind classes on top via `className`, same as today's inline classes.

## Testing

Existing tests (`ConfigForm.test.tsx`, `FileInput.test.tsx`, `SearchBar.test.tsx`,
`ErrorBanner.test.tsx`, `DownloadButton.test.tsx`, `page.test.tsx`) query by role/
label via Testing Library, which shadcn's components (built on accessible native
elements or Radix primitives) preserve. Expected updates:

- `ConfigForm.test.tsx`: Radix `<Select>` doesn't render a native `<select>`, so
  `fireEvent.change` on a `<select>` element no longer works. Tests need to open the
  listbox (`getByRole("combobox")` → click/keyboard → `getByRole("option", ...)`)
  instead.
- Other component tests should need little to no change since they query by
  accessible role/label, which is preserved.

Run the full `npm test` suite after the swap and fix any breakage before
considering this done.

## Non-goals

- No changes to `DeclarationTable.tsx` internals or its tests.
- No new dependencies beyond what `shadcn add` installs (Radix primitives, `cn()`
  helper deps).
- No changes to user-facing copy (`messages.ts`) or app behavior/logic — purely a
  visual/component-library swap.
