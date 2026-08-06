# shadcn/ui Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install shadcn/ui and restyle the app's chrome controls (buttons, form selects, file/search inputs, error alert, theme toggle) with it, per `docs/superpowers/specs/2026-08-06-shadcn-ui-adoption-design.md`.

**Architecture:** Chrome-only swap; `DeclarationTable`'s virtualized grid stays untouched. Dark mode moves from a `data-theme` attribute to shadcn's standard `.dark` class convention. Existing blue/green/red/gray button semantics are preserved via `className` overrides on top of shadcn's `Button`.

**Tech Stack:** shadcn CLI (current version installs Base UI primitives — `@base-ui/react` — not Radix, confirmed by running the real CLI against this repo), Tailwind v4, class-variance-authority, `cn()` helper via clsx/tailwind-merge.

## Global Constraints

- Scope is chrome-only: `ConfigForm`, `FileInput`, `SearchBar`, `ErrorBanner`, `ThemeToggle`, `page.tsx`'s three plain buttons, `DownloadButton`. `DeclarationTable` (including its `+`/`−` row-action buttons) is NOT touched.
- Preserve existing button colors exactly (blue = primary/file, green = add, red = remove, gray = secondary toggle) via `className` overrides.
- Preserve all user-facing copy from `src/app/messages.ts` unchanged.
- Full `npm test` suite must pass after every task that touches a tested file.
- No changes to app logic/behavior — visual/component swap only.

## Already completed (verified in a research spike before this plan was written)

`npx shadcn@latest init -p nova -y` was run against this repo and produced:
- `components.json` (style `base-nova`, base color `neutral`, css variables on)
- `src/lib/utils.ts` (the `cn()` helper)
- `src/app/globals.css` rewritten with shadcn's OKLCH variable theme, `.dark` class support added, **while preserving** the app's existing custom rules (`--button-secondary-*`, `.editable-input`, `select option` color pin) and the old `data-theme` rules (which Task 1 below removes as redundant).
- `package.json`/`package-lock.json` gained `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, `tw-animate-css`.

`npx shadcn@latest add button select input label alert -y` was run and produced `src/components/ui/{button,select,input,label,alert}.tsx`. Their real exported API (verified, not guessed):
- `button.tsx`: `Button` (props: `variant`: `default|outline|secondary|ghost|destructive|link`, `size`: `default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg`), plus `buttonVariants(...)` class-builder function. Renders a real `<button>` (via Base UI's `Button` primitive) — `getByRole("button", { name })` works.
- `select.tsx`: `Select` (root, controlled via `value`/`onValueChange={(value, eventDetails) => ...}`), `SelectTrigger` (renders as `role="combobox"`, accepts `aria-label`), `SelectValue` (accepts `placeholder`), `SelectContent`, `SelectItem` (`value` prop + children as accessible name, renders `role="option"`).
- `input.tsx`: `Input`, thin wrapper, same props as a native `<input>`.
- `label.tsx`: `Label`, thin wrapper around `<label>`.
- `alert.tsx`: `Alert` (`variant`: `default|destructive`, renders `role="alert"` already), `AlertTitle`, `AlertDescription`.

A scratch test confirmed `Button` and `Select` work with `@testing-library/user-event` in the existing jsdom setup **with no new polyfills** — `user.click` on the `SelectTrigger` opens the popup and `screen.findByRole("option", ...)` finds items, no `hasPointerCapture`/`scrollIntoView` shims needed (unlike the classic Radix-based shadcn Select).

If executing this plan in a fresh worktree where the above hasn't been run yet, Task 1 covers running these same two commands (idempotent — safe to (re-)run) before proceeding.

---

### Task 1: Verify/install shadcn and clean up globals.css dark-mode duplication

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `.dark` class-based theme (already present after `shadcn init`), with the old `data-theme` attribute rules removed so there's exactly one dark-mode mechanism.

- [ ] **Step 1: Confirm shadcn is installed**

Run: `cat components.json` (or `Get-Content components.json` on Windows). If the file doesn't exist, run:
```
npx shadcn@latest init -p nova -y
npx shadcn@latest add button select input label alert -y
```

- [ ] **Step 2: Remove the now-redundant `data-theme` rules from globals.css**

In `src/app/globals.css`, delete these three blocks (the `.dark` class block that shadcn's init added already covers dark mode; layout.tsx/ThemeToggle will be switched to the `.dark` class in Task 2):

```css
/* Explicit override from the theme toggle button — takes precedence over
   the system-preference media query above via attribute-selector specificity. */
:root[data-theme="light"] {
  --background: #ffffff;
  --foreground: #171717;
  color-scheme: light;
  --button-secondary-bg: #e5e7eb;
  --button-secondary-text: #171717;
}

:root[data-theme="dark"] {
  --background: #0a0a0a;
  --foreground: #ededed;
  color-scheme: dark;
  --button-secondary-bg: #374151;
  --button-secondary-text: #ededed;
}
```

Also delete the `@media (prefers-color-scheme: dark)` block that only sets `--button-secondary-*` (shadcn's own `.dark` class variables already handle the rest, and Task 9 removes the last `--button-secondary-*` usage from `page.tsx`):

```css
@media (prefers-color-scheme: dark) {
  :root {
    --button-secondary-bg: #374151;
    --button-secondary-text: #ededed;
  }
}
```

And remove the two `--button-secondary-*` lines from the top `:root { ... }` block.

Keep everything else as-is: `@import` lines, `@theme inline`, the `.dark { ... }` block shadcn generated, `@layer base`, the `select`/`select option` rules, and `.editable-input:hover`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (this step only touched CSS, no component logic).

- [ ] **Step 4: Commit**

```bash
git add components.json src/lib/utils.ts src/components/ui src/app/globals.css package.json package-lock.json
git commit -m "Install shadcn/ui and remove redundant data-theme CSS rules"
```

---

### Task 2: Migrate theme mechanism from `data-theme` attribute to `.dark` class

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/ThemeToggle.tsx`

**Interfaces:**
- Produces: `document.documentElement.classList` carries `dark` (or doesn't) instead of `dataset.theme`. `localStorage` key `"theme"` and stored values `"light"`/`"dark"` are unchanged.

- [ ] **Step 1: Update the inline theme script in `layout.tsx`**

Replace:
```ts
const SET_INITIAL_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch (e) {}
})();
`;
```
with:
```ts
const SET_INITIAL_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {}
})();
`;
```

- [ ] **Step 2: Update `ThemeToggle.tsx`'s theme read/write to use the `.dark` class**

Replace the `systemTheme`/`applyTheme` helpers and the `useEffect` body:
```ts
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
}
```
and in the component:
```ts
useEffect(() => {
  const current: Theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : systemTheme();
  setTheme(current);
}, []);
```
(`systemTheme()` is unchanged.)

- [ ] **Step 3: Swap the toggle button to shadcn's `Button`**

Replace the returned `<button>` with:
```tsx
import { Button } from "@/components/ui/button";
// ...
return (
  <Button
    type="button"
    variant="outline"
    size="icon"
    onClick={toggle}
    aria-label="Смяна на светла/тъмна тема"
    className="fixed top-4 right-4 z-50"
  >
    {theme === "dark" ? "☀️" : "🌙"}
  </Button>
);
```
Remove the now-unused inline `style={{ background/color/borderColor }}` — shadcn's `outline` variant already themes itself via `bg-background`/`text-foreground`/`border-input`, which follow the `.dark` class automatically.

- [ ] **Step 4: Manual check (no automated test exists for ThemeToggle)**

Run: `npm run dev`, open the app in a browser, click the theme toggle, confirm the page switches between light/dark, and reload to confirm the choice persists (localStorage).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (no existing test targets ThemeToggle directly, but this step must not break anything relying on `document.documentElement`).

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/components/ThemeToggle.tsx
git commit -m "Switch theme toggle from data-theme attribute to .dark class"
```

---

### Task 3: `ErrorBanner` → shadcn `Alert`

**Files:**
- Modify: `src/components/ErrorBanner.tsx`
- Test: `src/components/ErrorBanner.test.tsx` (no changes expected — verify only)

**Interfaces:**
- Consumes: `Alert`, `AlertDescription` from `@/components/ui/alert` (`Alert` already renders `role="alert"`).
- Produces: `ErrorBanner` keeps its existing `{ message: string | null }` props signature.

- [ ] **Step 1: Rewrite `ErrorBanner.tsx`**

```tsx
"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorBannerProps {
  message: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 2: Run this component's tests**

Run: `npx vitest run src/components/ErrorBanner.test.tsx`
Expected: both existing tests (`getByRole("alert")` with text content; renders nothing when `message` is `null`) pass unchanged, since `Alert` already sets `role="alert"`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ErrorBanner.tsx
git commit -m "Restyle ErrorBanner with shadcn Alert"
```

---

### Task 4: `SearchBar` → shadcn `Input`

**Files:**
- Modify: `src/components/SearchBar.tsx`
- Test: `src/components/SearchBar.test.tsx` (no changes expected — verify only)

**Interfaces:**
- Consumes: `Input` from `@/components/ui/input`.
- Produces: `SearchBar` keeps its existing `{ value, onChange }` props signature.

- [ ] **Step 1: Rewrite `SearchBar.tsx`**

```tsx
"use client";

import { MESSAGES } from "@/app/messages";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex w-64 max-w-full flex-col gap-1 self-start">
      {MESSAGES.labels.searchInput}
      <Input
        type="text"
        aria-label={MESSAGES.labels.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
```

- [ ] **Step 2: Run this component's tests**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: both existing tests pass unchanged — `Input` forwards `value`/`onChange`/`aria-label` straight to a native `<input>`.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBar.tsx
git commit -m "Restyle SearchBar with shadcn Input"
```

---

### Task 5: `ConfigForm` → shadcn `Select` + `Label`

**Files:**
- Modify: `src/components/ConfigForm.tsx`
- Modify: `src/components/ConfigForm.test.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`; `Label` from `@/components/ui/label`.
- Produces: `ConfigForm`'s `ConfigFormValue`/`onChange`/`EMPTY_CONFIG_FORM_VALUE`/`isConfigComplete` exports are unchanged — this task only changes internal markup.

- [ ] **Step 1: Rewrite `ConfigForm.tsx`**

```tsx
"use client";

import { MESSAGES } from "@/app/messages";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PARTNER_COUNTRIES,
  REGIONS_OF_CONSUMPTION,
  TRANSPORT_MODES,
  type PartnerCountry,
  type RegionOfConsumption,
  type TransportMode,
} from "@/core/constants";
import type { CustomerProfile } from "@/core/types";

export interface ConfigFormValue {
  partnerCountry: PartnerCountry | "";
  modeOfTransport: TransportMode | "";
  regionOfConsumption: RegionOfConsumption | "";
}

export const EMPTY_CONFIG_FORM_VALUE: ConfigFormValue = {
  partnerCountry: "",
  modeOfTransport: "",
  regionOfConsumption: "",
};

export function isConfigComplete(
  value: ConfigFormValue,
): value is ConfigFormValue & CustomerProfile {
  return (
    value.partnerCountry !== "" &&
    value.modeOfTransport !== "" &&
    value.regionOfConsumption !== ""
  );
}

interface ConfigFormProps {
  value: ConfigFormValue;
  onChange: (value: ConfigFormValue) => void;
}

export function ConfigForm({ value, onChange }: ConfigFormProps) {
  return (
    <fieldset className="flex flex-col gap-4 sm:flex-row">
      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.partnerCountry}</Label>
        <Select
          value={value.partnerCountry}
          onValueChange={(next: PartnerCountry) =>
            onChange({ ...value, partnerCountry: next })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.partnerCountry}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PARTNER_COUNTRIES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.partnerCountry === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectPartnerCountry}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.modeOfTransport}</Label>
        <Select
          value={value.modeOfTransport}
          onValueChange={(next: TransportMode) =>
            onChange({ ...value, modeOfTransport: next })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.modeOfTransport}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {TRANSPORT_MODES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.modeOfTransport === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectModeOfTransport}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label>{MESSAGES.labels.regionOfConsumption}</Label>
        <Select
          value={value.regionOfConsumption}
          onValueChange={(next: RegionOfConsumption) =>
            onChange({ ...value, regionOfConsumption: next })
          }
        >
          <SelectTrigger aria-label={MESSAGES.labels.regionOfConsumption}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS_OF_CONSUMPTION.map(({ code, label }) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={`text-sm text-red-600 ${value.regionOfConsumption === "" ? "" : "invisible"}`}
        >
          {MESSAGES.errors.selectRegionOfConsumption}
        </span>
      </div>
    </fieldset>
  );
}
```

Note: `SelectItem`'s `value` prop is typed by the generic `Value` type param inferred from `Select`'s own `value`/`onValueChange` — passing `code` (a `PartnerCountry` etc.) directly is fine, no `as` cast needed for the item values themselves. `onValueChange`'s parameter needs the cast shown above (matching the pattern the original native-`<select>` code used with `e.target.value as X`) because Base UI's generic can't narrow away the `""` empty-state member on its own.

- [ ] **Step 2: Update `ConfigForm.test.tsx`'s two interaction tests**

Replace:
```ts
await user.selectOptions(
  screen.getByLabelText(MESSAGES.labels.partnerCountry),
  "IT",
);
```
with:
```ts
await user.click(screen.getByLabelText(MESSAGES.labels.partnerCountry));
await user.click(await screen.findByRole("option", { name: "IT" }));
```
and the analogous change for the region-of-consumption test (region code `"SZR"`'s label in `src/core/constants.ts`'s `REGIONS_OF_CONSUMPTION` is `"Стара Загора"`):
```ts
await user.click(
  screen.getByLabelText(MESSAGES.labels.regionOfConsumption),
);
await user.click(await screen.findByRole("option", { name: "Стара Загора" }));
```

- [ ] **Step 3: Run this component's tests**

Run: `npx vitest run src/components/ConfigForm.test.tsx`
Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConfigForm.tsx src/components/ConfigForm.test.tsx
git commit -m "Restyle ConfigForm with shadcn Select and Label"
```

---

### Task 6: `page.test.tsx`'s `fillConfig` helper — update for the new Select

**Files:**
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: same `Select`/`SelectItem` behavior verified in Task 5.
- Produces: `fillConfig(user)` helper used by ~15 other tests in this file keeps its same signature and effect (fills all three config fields), so no other test in the file needs to change.

- [ ] **Step 1: Update `fillConfig`**

Replace:
```ts
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
```
with:
```ts
async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: string,
  optionName: string,
) {
  await user.click(screen.getByLabelText(triggerLabel));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function fillConfig(user: ReturnType<typeof userEvent.setup>) {
  await selectOption(user, MESSAGES.labels.partnerCountry, "IT");
  await selectOption(user, MESSAGES.labels.modeOfTransport, "3");
  await selectOption(user, MESSAGES.labels.regionOfConsumption, "Стара Загора");
}
```

- [ ] **Step 2: Run the full page test suite**

Run: `npx vitest run src/app/page.test.tsx`
Expected: all tests pass — this file has the largest test count in the project (~15 tests), all gated behind `fillConfig`.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.test.tsx
git commit -m "Update page.test.tsx fillConfig helper for shadcn Select"
```

---

### Task 7: `FileInput` → shadcn `buttonVariants` styling

**Files:**
- Modify: `src/components/FileInput.tsx`
- Test: `src/components/FileInput.test.tsx` (no changes expected — verify only)

**Interfaces:**
- Consumes: `buttonVariants` from `@/components/ui/button`.
- Produces: `FileInput`'s existing `{ disabled, onFileSelected, onInvalidFileType }` props signature is unchanged.

- [ ] **Step 1: Rewrite the visible pill in `FileInput.tsx`**

Replace:
```tsx
<span
  className={`rounded px-3 py-1 text-white ${
    disabled ? "cursor-not-allowed bg-gray-400" : "cursor-pointer bg-blue-600"
  }`}
>
  {MESSAGES.labels.chooseFileButton}
</span>
```
with:
```tsx
<span
  className={cn(
    buttonVariants({ variant: "default" }),
    disabled
      ? "cursor-not-allowed bg-gray-400 hover:bg-gray-400"
      : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700",
  )}
>
  {MESSAGES.labels.chooseFileButton}
</span>
```
Add the two new imports at the top of the file:
```ts
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Run this component's tests**

Run: `npx vitest run src/components/FileInput.test.tsx`
Expected: all 4 tests pass unchanged — none of them query the visible pill span, only the underlying `<input type="file">` via `getByLabelText`.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileInput.tsx
git commit -m "Restyle FileInput's visible pill with shadcn buttonVariants"
```

---

### Task 8: `DownloadButton` → shadcn `Button`

**Files:**
- Modify: `src/components/DownloadButton.tsx`
- Test: `src/components/DownloadButton.test.tsx` (no changes expected — verify only)

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`.
- Produces: `DownloadButton`'s existing `{ lines, disabled, onError }` props signature is unchanged.

- [ ] **Step 1: Rewrite the returned button in `DownloadButton.tsx`**

Replace:
```tsx
import { MESSAGES } from "@/app/messages";
import { intrastatWorkbookToUint8Array } from "@/core/exportXlsx";
import type { IntrastatDeclarationLine } from "@/core/types";
```
with (add the `Button` import):
```tsx
import { MESSAGES } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { intrastatWorkbookToUint8Array } from "@/core/exportXlsx";
import type { IntrastatDeclarationLine } from "@/core/types";
```
and replace:
```tsx
<button
  type="button"
  onClick={handleClick}
  disabled={lines.length === 0 || disabled}
  className="self-start cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
>
  {MESSAGES.labels.downloadButton}
</button>
```
with:
```tsx
<Button
  type="button"
  onClick={handleClick}
  disabled={lines.length === 0 || disabled}
  className="self-start bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
>
  {MESSAGES.labels.downloadButton}
</Button>
```

- [ ] **Step 2: Run this component's tests**

Run: `npx vitest run src/components/DownloadButton.test.tsx`
Expected: all 5 tests pass unchanged — they query `getByRole("button", { name: MESSAGES.labels.downloadButton })` and check `toBeDisabled()`/`toBeEnabled()`, both of which `Button` (a real `<button>`) satisfies identically.

- [ ] **Step 3: Commit**

```bash
git add src/components/DownloadButton.tsx
git commit -m "Restyle DownloadButton with shadcn Button"
```

---

### Task 9: `page.tsx`'s view-toggle / add-all / remove-all buttons → shadcn `Button`

**Files:**
- Modify: `src/app/page.tsx`
- Test: `src/app/page.test.tsx` (no further changes expected beyond Task 6 — verify only)

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`.
- Produces: no change to `Home`'s external behavior or any handler signatures — markup only.

- [ ] **Step 1: Add the import**

At the top of `src/app/page.tsx`, add:
```ts
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Replace the view-toggle button**

Replace:
```tsx
<button
  type="button"
  onClick={toggleView}
  disabled={!workingLines}
  className="self-start cursor-pointer rounded-md bg-[var(--button-secondary-bg)] px-4 py-2 text-[var(--button-secondary-text)] disabled:cursor-not-allowed disabled:opacity-50"
>
  {view === "working"
    ? MESSAGES.labels.viewFinalTableButton
    : MESSAGES.labels.viewWorkingTableButton}
</button>
```
with:
```tsx
<Button
  type="button"
  variant="secondary"
  onClick={toggleView}
  disabled={!workingLines}
  className="self-start px-4 py-2"
>
  {view === "working"
    ? MESSAGES.labels.viewFinalTableButton
    : MESSAGES.labels.viewWorkingTableButton}
</Button>
```

- [ ] **Step 3: Replace the "add all" button**

Replace:
```tsx
<button
  type="button"
  onClick={handleAddAllVisible}
  disabled={filteredWorkingLines.length === 0}
  className="self-start cursor-pointer rounded-md bg-green-600 px-4 py-2 text-white disabled:opacity-50"
>
  {MESSAGES.labels.addAllButton}
</button>
```
with:
```tsx
<Button
  type="button"
  onClick={handleAddAllVisible}
  disabled={filteredWorkingLines.length === 0}
  className="self-start bg-green-600 px-4 py-2 text-white hover:bg-green-700"
>
  {MESSAGES.labels.addAllButton}
</Button>
```

- [ ] **Step 4: Replace the "remove all" button**

Replace:
```tsx
<button
  type="button"
  onClick={handleRemoveAllRows}
  disabled={finalLines.length === 0}
  className="self-start cursor-pointer rounded-md bg-red-600 px-4 py-2 text-white disabled:opacity-50"
>
  {MESSAGES.labels.removeAllButton}
</button>
```
with:
```tsx
<Button
  type="button"
  onClick={handleRemoveAllRows}
  disabled={finalLines.length === 0}
  className="self-start bg-red-600 px-4 py-2 text-white hover:bg-red-700"
>
  {MESSAGES.labels.removeAllButton}
</Button>
```

Leave the `+`/`−` row-action buttons inside `DeclarationTable`'s `renderRowAction` callbacks untouched (out of scope, per the design doc).

- [ ] **Step 5: Run the full page test suite**

Run: `npx vitest run src/app/page.test.tsx`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "Restyle page.tsx's view-toggle, add-all, and remove-all buttons with shadcn Button"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: every test file passes, including `src/components/DeclarationTable.test.tsx` (untouched, should be unaffected) and `src/core/**` (unaffected).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev`, open the app, and check:
- Config selects open/close, show the placeholder, and can be picked via mouse and keyboard.
- File input pill still looks like a button, opens the file picker, disabled state greys it out.
- Search input, error alert (trigger by uploading a `.txt` file), theme toggle (light/dark, including the numeric-cell pencil-cursor fix from earlier), view-toggle/add-all/remove-all/download buttons all render with their original colors and work.
- Toggle dark mode and confirm every restyled control still reads correctly (contrast, borders) in both themes.

- [ ] **Step 5: Final commit (if step 4 turned up fixes)**

```bash
git add -A
git commit -m "Fix issues found in shadcn adoption smoke test"
```
