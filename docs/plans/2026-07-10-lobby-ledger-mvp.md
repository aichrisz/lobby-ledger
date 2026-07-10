# Lobby Ledger MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks (8–14) should also invoke the frontend-design skill and stay inside the Visual Spec below.

**Goal:** A mobile-first, local-first PWA for one hotel front desk that captures non-PII handover tasks and generates a print/export-friendly handover brief for the next shift.

**Architecture:** Pure TypeScript domain core (task model, shift resolution, brief generation) with zero DOM dependencies, a thin localStorage persistence layer with a versioned schema envelope, and a small Preact UI shell on top. A hand-written service worker provides offline app-shell caching. No server, no accounts, no network egress at runtime.

**Tech Stack:** Vite, TypeScript (strict), Preact + @preact/signals, plain CSS custom properties, Vitest + @testing-library/preact (happy-dom), Playwright + @axe-core/playwright, @fontsource-variable/fraunces (self-hosted font). Deploy as static files (GitHub Pages workflow provided; any static host works).

**Status:** Ready for execution. Date: 2026-07-10.

---

## 1. Scope

### In scope (approved MVP)

- Shift context: Früh (06:00–14:00), Spät (14:00–22:00), Nacht (22:00–06:00); clock-derived default, manual override that auto-expires at the next shift boundary.
- Tasks: free text (≤200 chars), optional room/task reference (≤24 chars), department (Front Office / Housekeeping / Restaurant), priority (Normal / Wichtig), status (Offen / Erledigt), created/done timestamps, capturing shift.
- One-tap quick capture: type text → Erfassen → saved with defaults (Front Office, Normal). Details (Ref/Abteilung/Wichtig) optional behind focus-expand.
- Task list with done-toggle, delete + undo, collapsed Erledigt section.
- Generated handover brief: open tasks grouped by department (Wichtig first), carryover age labels, "Erledigt diese Schicht" section, counts.
- Print (A4 stylesheet) and export (clipboard plain text, `.txt` download).
- PWA: installable, offline after first visit, update banner.
- German UI strings; English code/identifiers/docs.

### Out of scope (explicit — do not build)

No login, backend, sync, AI, third-party integrations, analytics, guest PII fields, push notifications, multi-property, i18n framework, JSON backup/import (deferred, see Risks), task filters/search, eslint/prettier config (deferred).

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Preact + signals (~4 KB) | Declarative rendering + mature testing (@testing-library), far less hand-rolled DOM-sync code than vanilla TS; React's weight and "SaaS gravity" avoided |
| CSS | Plain CSS + custom properties | Bespoke calm aesthetic; no Tailwind/UI-kit look; tokens double as theme mechanism |
| Storage | localStorage, versioned envelope | Data is small (≤ a few hundred tasks); synchronous read = no loading flash; IndexedDB complexity not justified |
| Service worker | Hand-written (~50 lines) | Auditable (privacy), zero deps; network-first for navigations, cache-first for hashed assets |
| Validation | Hand-rolled `parseTask` | Schema is tiny; avoids a runtime dep; fully unit-tested |
| Font | @fontsource-variable/fraunces (bundled) | Warm ledger/print character without any third-party request |
| Values vs labels | English enum values (`'open'`), German labels (`Offen`) | Stable stored data; UI language swappable |
| Time handling | Local device time, `Date` injected as `now()` | Single-device app; injection keeps domain pure and testable |
| e2e browser | Chromium only (mobile emulation + desktop) | Keeps CI simple; iOS Safari covered by manual QA checklist |

---

## 3. Data & Storage Spec

### Stored envelope

`localStorage["lobby-ledger.store"]`:

```json
{
  "schema": 1,
  "tasks": [
    {
      "id": "9f1c…uuid",
      "text": "Wasserkocher defekt, Technik informiert",
      "ref": "204",
      "department": "front-office",
      "priority": "wichtig",
      "status": "open",
      "createdAt": "2026-07-10T09:12:00.000Z",
      "createdShift": "frueh",
      "doneAt": null
    }
  ],
  "shiftOverride": { "shift": "spaet", "setAt": "2026-07-10T13:40:00.000Z" }
}
```

### Validation rules (enforced by `parseTask`, applied on every load)

| Field | Rule | On violation |
|---|---|---|
| `id` | non-empty string | drop task |
| `text` | string, trimmed length 1–200 | drop task |
| `ref` | string, length 0–24 | drop task |
| `department` | one of `front-office`, `housekeeping`, `restaurant` | drop task |
| `priority` | one of `normal`, `wichtig` | drop task |
| `status` | one of `open`, `done` | drop task |
| `createdAt` | ISO string parseable by `Date.parse` | drop task |
| `createdShift` | one of `frueh`, `spaet`, `nacht` | drop task |
| `doneAt` | `null` or ISO string | drop task |

Dropped tasks set `recovered: true` → UI shows the recovery banner. Whole-envelope failures (unparseable JSON, non-object, unknown/future schema, missing migration, `tasks` not an array) stash the raw string at `localStorage["lobby-ledger.recovered"]` (best effort), reset to an empty store, and set `recovered: true`. Data is never silently discarded without the stash attempt.

### Migrations

- `CURRENT_SCHEMA = 1`. `MIGRATIONS: Record<number, (old) => new>` maps schema N → N+1.
- Loader runs the chain `while (schema < CURRENT_SCHEMA)`; a missing step = corrupt path (stash + reset). The mechanism is unit-tested in Task 6 with a fake v1→v2 migration so future schema bumps are a one-line registry entry plus tests.
- After migration, every task still passes `parseTask` (migrations don't bypass validation).

### Retention

`pruneTasks` (applied on load): drop tasks with `status === 'done'` and `doneAt` older than 14 days (`DONE_RETENTION_DAYS = 14`). Open tasks are never pruned. Keeps storage bounded for a device that runs for years.

### Write path

Every state mutation persists synchronously via `saveStore` (serialize canonical typed state — unknown props never round-trip). `saveStore` returns `false` on quota/security errors → persistent "Speichern fehlgeschlagen" banner until the next successful save.

### Wipe

`wipeStore` removes both keys. Exposed in the UI as a two-step "Alle Daten löschen" control (no `window.confirm`).

---

## 4. UX Spec

### Views (hash-routed)

- `#/` **Aufgaben**: header (wordmark, shift control, Übergabe button with open-count badge), task list, bottom capture bar.
- `#/uebergabe` **Übergabe**: generated brief + actions (Drucken / Kopieren / Als .txt), Zurück in header, footer with wipe control.

Hash routing (`routeFromHash`) keeps the back button working with zero dependencies.

### Loading / Empty / Error states (all designed, none defaulted)

| Surface | Loading | Empty | Error |
|---|---|---|---|
| App boot | Synchronous localStorage read before first render — no spinner, no skeleton, first paint < 1 s | — | Recovery banner: "Gespeicherte Daten waren beschädigt. Die App wurde zurückgesetzt; eine Kopie liegt intern vor." (dismissible) |
| Task list | — | "Noch keine Aufgaben. Unten erfassen — Zimmer oder Stichwort genügt." (calm text block, arrow of copy points at capture bar) | Save-failure banner: "Speichern fehlgeschlagen. Letzte Änderung ist evtl. nicht gesichert." (persists until a save succeeds) |
| Open section, all done | — | "Alles erledigt. Neue Aufgaben unten erfassen." (done section still listed) | — |
| Brief | Instant (pure function) | "Keine offenen Aufgaben. Gute Übergabe!" (+ Erledigt-diese-Schicht section if present) | — |
| Copy button | — | — | Clipboard rejected → inline fallback panel: readonly auto-selected `<textarea>` + "Manuell kopieren (gedrückt halten und kopieren)" + Schließen |
| Delete | — | — | Undo toast "Aufgabe gelöscht." + "Rückgängig" (6 s), `role="status"` |
| Capture form | — | — | Empty/whitespace text: submit does nothing, input keeps focus; `maxlength` prevents overrun (no red alert) |
| Service worker | Registers silently in background | — | Registration failure is silent — app fully works without SW |
| SW update | — | — | "Neue Version verfügbar." + "Aktualisieren" bar (applies waiting SW, reloads) |

### Canonical German strings (single source, use exactly)

- Capture placeholder: `Neue Aufgabe … (keine Gastnamen)`
- PII hint (expanded form): `Keine Gastnamen oder Kontaktdaten – nur Zimmer und Sache.`
- Capture confirm (aria-live): `Aufgabe erfasst: {ref – }{text}`
- Status toggle labels: `Als erledigt markieren` / `Als offen markieren`
- Delete label: `Aufgabe löschen`; toast `Aufgabe gelöscht.` + `Rückgängig`
- Wipe: `Alle Daten löschen` → `Wirklich alle Daten löschen?` (second tap executes; any other interaction resets)

### Interaction rules

- Quick capture: Enter or Erfassen submits; text clears, focus stays in the text input (rapid multi-entry); chosen department persists for the next entry; Wichtig resets to off.
- Done toggle is reversible (tap again) — that plus undo-delete means no confirm dialogs anywhere except the wipe two-step.
- Shift control is a native radio group styled as a segmented control (arrow keys work for free).
- `refreshShift()` runs on load, on `visibilitychange`, and every 60 s so an idle device rolls into the next shift (manual override wins until the boundary).

---

## 5. Visual Spec & Acceptance Criteria

### Design tokens (exact values, `src/styles/tokens.css`)

Light (default): `--paper #F6F3EC`, `--paper-raised #FDFBF6`, `--ink #26241E`, `--ink-soft #5C5749`, `--hairline #D8D2C4`, `--accent #22453B` (lobby green), `--accent-ink #F6F3EC`, `--wichtig-text #7A5327`, `--wichtig-bg #F3E7D7`, `--brass #A8763E` (decorative only), `--danger-soft #B5543B` (delete icon only), `--focus #2F6DB0`.

Dark (`:root[data-theme='dark']`, used for Nacht + prefers-color-scheme): `--paper #191813`, `--paper-raised #23201A`, `--ink #EAE5D8`, `--ink-soft #A79F8D`, `--hairline #3A362C`, `--accent #8FBFAE`, `--accent-ink #14211D`, `--wichtig-text #E3B878`, `--wichtig-bg #3A2F1E`, `--brass #D9A45F`, `--danger-soft #D08A76`, `--focus #7FB0E8`.

Type: `--font-display: 'Fraunces Variable', Georgia, serif` (wordmark, view titles); `--font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (everything else). Sizes: base 1rem (16 px, never smaller on inputs), meta 0.875rem, titles 1.375rem. Room refs use `font-variant-numeric: tabular-nums` (`.nums`).

Spacing 4/8/12/16/24/32 px; `--radius: 10px`; `--tap: 44px`; `--col-max: 680px`.

Character: task rows read as ledger lines — hairline rules between rows, ref in tabular numerals left-aligned like a register column, Wichtig marked by a 3px brass left border + "Wichtig" text (never color alone, never red). No gradients, no drop-shadow cards, no cool grays.

**All text/background token pairs must pass WCAG AA 4.5:1** — enforced by axe in Task 17; adjust token values, not the requirement, if a pair fails.

### Hard acceptance criteria (encoded as Playwright assertions in Task 18)

Mobile project = Chromium, 390×844, `isMobile`, `hasTouch`, DPR 3. Desktop project = Chromium 1280×800. For each of: tasks-empty, tasks-filled (stress fixture: 200-char text + 24-char ref + 12 tasks), brief:

1. No horizontal overflow: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
2. Every visible `button, a, input, label.chip` bounding box ≥ 44×44 px (inputs: height ≥ 44).
3. Every `input` computed `font-size` ≥ 16 px (prevents iOS focus zoom).
4. Mobile: capture text input vertical center in the bottom 40% of the viewport (thumb reach).
5. Desktop: `main` content column ≤ 680 px wide and horizontally centered (±2 px).
6. Screenshots saved to `test-results/screens/{view}-{project}.png` for human review (no pixel-diff baselines in MVP; may be blessed later).

Plus (Task 1 onward): `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`; capture bar padded by `env(safe-area-inset-bottom)`.

---

## 6. Print Spec (Task 13)

- Trigger: "Drucken" button on `#/uebergabe` calls `window.print()`; browser-menu print of that route produces the same output.
- `@page { size: A4; margin: 15mm; }`; body forced `#fff`/`#000` (tokens overridden inside `@media print`, including dark theme), 11pt base.
- Hidden in print: header, capture bar, banners, toasts, brief action buttons, wipe footer (`.no-print` + structural selectors).
- `section { break-inside: avoid; }` so a department never splits mid-block; brief header (shifts, date, time, counts) prints as document title line.
- Verified by e2e with `page.emulateMedia({ media: 'print' })`: header hidden, white background, screenshot at 794×1123 for review.

## 7. Export Spec (Task 12)

- **Copy**: `navigator.clipboard.writeText(formatBriefText(brief))`; button flips to "Kopiert ✓" for 2 s (aria-live polite). Rejection → fallback textarea panel (see states table). Always bound to a user gesture (Safari requirement).
- **Download**: Blob `text/plain;charset=utf-8`, filename `uebergabe-YYYY-MM-DD-{shift}.txt` via temporary `<a download>`.
- **Text format** (exact, locked by unit test):

```
ÜBERGABE Früh → Spät · Mi, 08.07.2026 · 13:58

OFFEN (3)

Front Office
  ! 204 — Wasserkocher defekt, Technik informiert
  · 117 — Anreise ca. 23 Uhr, Schlüssel hinterlegt (seit 07.07. Spät)

Housekeeping
  · 310 — Extra Kissen gewünscht

ERLEDIGT DIESE SCHICHT (1)
  · 118 — Taxi 06:30 bestellt
```

`!` = Wichtig, `·` = Normal, `(seit DD.MM. Schicht)` only when the task predates the current clock shift window. No guest names anywhere, including examples.

## 8. Accessibility Spec (Task 17 + throughout)

- Zero axe violations (tags `wcag2a`, `wcag2aa`) on tasks-empty, tasks-filled, brief — in both themes.
- Landmarks: `header`, `main`, one `h1` per view. Shift control = native radios in a `fieldset` with visually-hidden `legend "Aktuelle Schicht"`; department chips likewise.
- Task add/delete/copy feedback via `aria-live="polite"` / `role="status"` — no focus stealing.
- All controls keyboard-operable; `:focus-visible` outline 2px `--focus`; done-section disclosure uses `aria-expanded`.
- `prefers-reduced-motion: reduce` disables all transitions/animations (single global rule).
- Icon-only buttons (status circle, delete) carry the exact aria-labels from §4.

## 9. Privacy & Robustness Spec (Task 16)

- CSP meta in `index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'` (`'unsafe-inline'` for style only — Vite dev-mode style injection; no inline scripts anywhere).
- e2e privacy test records every network request across a full user flow and asserts **all origins === the app origin**. This is the executable "no integrations, no telemetry" guarantee.
- No guest-PII fields exist structurally; copy nudges ("keine Gastnamen"); fixtures/tests never contain person names.
- Storage failure, corrupt-data recovery, and wipe behaviors per §3.

## 10. Deploy Spec (Task 19)

- `npm run build` → static `dist/` with **relative base** (`base: './'` in Vite) → deployable to any static host or subpath, no invented services.
- Primary route: GitHub Pages via `.github/workflows/deploy.yml` — runs unit + e2e tests, builds, publishes `dist/` with `actions/deploy-pages`. HTTPS (required for SW + clipboard) comes free.
- Fallback documented in README: copy `dist/` to any HTTPS static host; `npm run preview` for LAN demo (SW/clipboard require HTTPS or localhost — noted honestly).
- Update flow: bump `CACHE` version string in `public/sw.js` when shipping; users get the "Neue Version" bar.

---

## File Structure (final state)

```
index.html                      app shell, viewport + CSP + manifest link
package.json / tsconfig.json / vite.config.ts / playwright.config.ts
public/manifest.webmanifest     PWA manifest
public/sw.js                    hand-written service worker
public/icons/icon.svg           authored icon (+ generated icon-192.png, icon-512.png)
scripts/render-icons.mjs        rasterizes SVG → PNGs using Playwright
src/main.tsx                    entry: styles, createLedgerApp(localStorage), render, registerSW
src/domain/task.ts              enums, Task type, createTask, parseTask   [+ task.test.ts]
src/domain/labels.ts            German label maps
src/domain/shift.ts             shiftForTime, shiftWindowStart, resolveShift, nextShift  [+ shift.test.ts]
src/domain/brief.ts             buildBrief, carriedOverLabel, formatBriefText, briefFilename, date/time format helpers  [+ brief.test.ts]
src/storage/store.ts            envelope, loadStore, saveStore, MIGRATIONS, pruneTasks, wipeStore  [+ store.test.ts]
src/app/state.ts                LedgerApp interface, createLedgerApp (signals + actions)  [+ state.test.ts]
src/app/router.ts               routeFromHash, useRoute  [tested via Shell.test.tsx]
src/app/export.ts               copyText, downloadText  [+ export.test.ts]
src/app/theme.ts                themeFor, applyThemeEffect
src/app/sw-register.ts          registerSW, updateReady signal
src/app/components/App.tsx      shell composition, shift refresh wiring
src/app/components/Header.tsx   wordmark, ShiftControl, Übergabe button
src/app/components/CaptureBar.tsx           [+ CaptureBar.test.tsx]
src/app/components/TasksView.tsx  TasksView, TaskRow, EmptyState, sortOpenTasks  [+ TasksView.test.tsx]
src/app/components/BriefView.tsx  BriefView, CopyFallback, WipeButton  [+ BriefView.test.tsx]
src/app/components/Toasts.tsx   Banner, UndoToast, UpdateBar
src/styles/tokens.css / base.css / app.css / print.css
src/test/fake-storage.ts        fakeStorage, failingStorage helpers
e2e/fixtures.ts                 makeTask, seed(page, tasks)
e2e/flows.spec.ts, visual.spec.ts, a11y.spec.ts, print.spec.ts, offline.spec.ts, privacy.spec.ts
.github/workflows/deploy.yml
README.md
```

Execution rules: strict TDD (write test → watch it fail → minimal code → watch it pass), commit at the end of every task, `npm test && npm run typecheck` green before each commit. Code below is the reference implementation; **tests are authoritative** — if reference code and a test disagree, satisfy the test.

---

## Tasks

### Task 1: Scaffold & Toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/app/components/App.tsx` (stub), `src/styles/tokens.css` (empty placeholder comment), `src/app/components/App.test.tsx`, `e2e/flows.spec.ts` (smoke), `.gitignore`

- [ ] **Step 1: Init packages**

```bash
npm init -y
npm i preact @preact/signals @fontsource-variable/fraunces
npm i -D vite @preact/preset-vite typescript vitest happy-dom @testing-library/preact @playwright/test @axe-core/playwright
npx playwright install chromium
```

- [ ] **Step 2: Write config files**

`package.json` — replace `scripts` with:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "icons": "node scripts/render-icons.mjs"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "react-jsx", "jsxImportSource": "preact",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true,
    "types": ["vite/client"], "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
})
```

`index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'" />
    <meta name="theme-color" content="#F6F3EC" />
    <title>Lobby Ledger</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(`manifest` link and icon come in Task 15.)

`.gitignore`: `node_modules/`, `dist/`, `test-results/`, `playwright-report/`.

- [ ] **Step 3: Write the failing smoke tests**

`src/app/components/App.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { App } from './App'

describe('App shell', () => {
  test('renders the wordmark', () => {
    render(<App />)
    expect(screen.getByText('Lobby Ledger')).toBeTruthy()
  })
})
```

`e2e/flows.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('app boots and shows wordmark', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Lobby Ledger')).toBeVisible()
})
```

- [ ] **Step 4: Verify RED** — Run: `npm test` → FAIL (`App` not found / cannot resolve `./App`).

- [ ] **Step 5: Minimal implementation**

`src/app/components/App.tsx`:

```tsx
export function App() {
  return (
    <div class="app">
      <header class="header">
        <span class="wordmark">Lobby Ledger</span>
      </header>
      <main />
    </div>
  )
}
```

`src/main.tsx`:

```tsx
import { render } from 'preact'
import '@fontsource-variable/fraunces'
import './styles/tokens.css'
import { App } from './app/components/App'

render(<App />, document.getElementById('app')!)
```

`src/styles/tokens.css`: `/* design tokens land in Task 2 */`

- [ ] **Step 6: Verify GREEN** — Run: `npm test` → PASS. Run: `npm run typecheck` → clean. Run: `npm run test:e2e` → smoke passes on both projects.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "chore: scaffold vite+preact+vitest+playwright toolchain"`

---

### Task 2: Design Tokens & Base Styles

**Files:**
- Create: `src/styles/base.css`, `src/styles/app.css` (empty shell comment)
- Modify: `src/styles/tokens.css`, `src/main.tsx` (import base.css, app.css)

CSS is verified by e2e/axe later (Tasks 17–18); this task's "test" is the token contract used by every later component.

- [ ] **Step 1: Write `src/styles/tokens.css`** — exact values from §5:

```css
:root {
  --paper: #F6F3EC; --paper-raised: #FDFBF6;
  --ink: #26241E; --ink-soft: #5C5749; --hairline: #D8D2C4;
  --accent: #22453B; --accent-ink: #F6F3EC;
  --wichtig-text: #7A5327; --wichtig-bg: #F3E7D7; --brass: #A8763E;
  --danger-soft: #B5543B; --focus: #2F6DB0;
  --font-display: 'Fraunces Variable', Georgia, serif;
  --font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-title: 1.375rem;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --radius: 10px; --tap: 44px; --col-max: 680px;
}
:root[data-theme='dark'] {
  --paper: #191813; --paper-raised: #23201A;
  --ink: #EAE5D8; --ink-soft: #A79F8D; --hairline: #3A362C;
  --accent: #8FBFAE; --accent-ink: #14211D;
  --wichtig-text: #E3B878; --wichtig-bg: #3A2F1E; --brass: #D9A45F;
  --danger-soft: #D08A76; --focus: #7FB0E8;
}
```

- [ ] **Step 2: Write `src/styles/base.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
html { height: 100%; }
body {
  margin: 0; min-height: 100%;
  background: var(--paper); color: var(--ink);
  font-family: var(--font-ui); font-size: var(--text-base); line-height: 1.45;
}
button, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.nums { font-variant-numeric: tabular-nums; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  clip-path: inset(50%); overflow: hidden; white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 3: Import in `src/main.tsx`** after tokens.css: `import './styles/base.css'` and `import './styles/app.css'` (app.css starts as `/* component styles grow per task */`).

- [ ] **Step 4: Verify** — `npm run dev`, open on a 390px viewport: paper background, ink text, no horizontal scroll. `npm test && npm run typecheck` still green.

- [ ] **Step 5: Commit** — `git commit -am "feat: design tokens (paper/ink/lobby-green) and base styles"`

---

### Task 3: Domain — Task Model

**Files:**
- Create: `src/domain/task.ts`, `src/domain/labels.ts`
- Test: `src/domain/task.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/domain/task.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createTask, parseTask, TEXT_MAX, REF_MAX, type Task } from './task'

const NOW = new Date('2026-07-10T09:12:00.000Z')

describe('createTask', () => {
  test('creates an open front-office normal task by default', () => {
    const t = createTask({ text: '  Wasserkocher defekt  ' }, NOW, 'frueh')
    expect(t).not.toBeNull()
    expect(t!.text).toBe('Wasserkocher defekt')
    expect(t!.ref).toBe('')
    expect(t!.department).toBe('front-office')
    expect(t!.priority).toBe('normal')
    expect(t!.status).toBe('open')
    expect(t!.createdAt).toBe(NOW.toISOString())
    expect(t!.createdShift).toBe('frueh')
    expect(t!.doneAt).toBeNull()
    expect(t!.id.length).toBeGreaterThan(0)
  })
  test('honors explicit fields and trims ref', () => {
    const t = createTask({ text: 'Extra Kissen', ref: ' 310 ', department: 'housekeeping', priority: 'wichtig' }, NOW, 'spaet')
    expect(t!.ref).toBe('310')
    expect(t!.department).toBe('housekeeping')
    expect(t!.priority).toBe('wichtig')
  })
  test('rejects empty or whitespace-only text', () => {
    expect(createTask({ text: '   ' }, NOW, 'frueh')).toBeNull()
  })
  test('rejects overlong text and ref', () => {
    expect(createTask({ text: 'x'.repeat(TEXT_MAX + 1) }, NOW, 'frueh')).toBeNull()
    expect(createTask({ text: 'ok', ref: '9'.repeat(REF_MAX + 1) }, NOW, 'frueh')).toBeNull()
  })
})

describe('parseTask', () => {
  const valid: Task = {
    id: 'a1', text: 'Taxi 06:30 bestellt', ref: '118', department: 'front-office',
    priority: 'normal', status: 'done', createdAt: '2026-07-10T05:00:00.000Z',
    createdShift: 'nacht', doneAt: '2026-07-10T05:30:00.000Z',
  }
  test('round-trips a valid task', () => {
    expect(parseTask(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })
  test.each([
    ['non-object', 'nope'],
    ['missing id', { ...valid, id: undefined }],
    ['empty text', { ...valid, text: '  ' }],
    ['bad department', { ...valid, department: 'spa' }],
    ['bad priority', { ...valid, priority: 'urgent' }],
    ['bad status', { ...valid, status: 'blocked' }],
    ['bad createdAt', { ...valid, createdAt: 'yesterday' }],
    ['bad createdShift', { ...valid, createdShift: 'day' }],
    ['bad doneAt', { ...valid, doneAt: 42 }],
    ['overlong ref', { ...valid, ref: 'r'.repeat(REF_MAX + 1) }],
  ])('rejects %s', (_name, raw) => {
    expect(parseTask(raw)).toBeNull()
  })
  test('drops unknown extra properties', () => {
    const parsed = parseTask({ ...valid, guestName: 'NOPE' })
    expect(parsed).toEqual(valid)
    expect('guestName' in parsed!).toBe(false)
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./task`).

- [ ] **Step 3: Implement `src/domain/task.ts`**

```ts
export const SHIFTS = ['frueh', 'spaet', 'nacht'] as const
export type Shift = (typeof SHIFTS)[number]
export const DEPARTMENTS = ['front-office', 'housekeeping', 'restaurant'] as const
export type Department = (typeof DEPARTMENTS)[number]
export const PRIORITIES = ['normal', 'wichtig'] as const
export type Priority = (typeof PRIORITIES)[number]
export const STATUSES = ['open', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const TEXT_MAX = 200
export const REF_MAX = 24

export interface Task {
  id: string
  text: string
  ref: string
  department: Department
  priority: Priority
  status: Status
  createdAt: string
  createdShift: Shift
  doneAt: string | null
}

export interface NewTaskInput {
  text: string
  ref?: string
  department?: Department
  priority?: Priority
}

export function createTask(input: NewTaskInput, now: Date, shift: Shift): Task | null {
  const text = input.text.trim()
  const ref = (input.ref ?? '').trim()
  if (text.length === 0 || text.length > TEXT_MAX || ref.length > REF_MAX) return null
  return {
    id: crypto.randomUUID(),
    text, ref,
    department: input.department ?? 'front-office',
    priority: input.priority ?? 'normal',
    status: 'open',
    createdAt: now.toISOString(),
    createdShift: shift,
    doneAt: null,
  }
}

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}
function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

export function parseTask(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.text !== 'string' || r.text.trim().length === 0 || r.text.length > TEXT_MAX) return null
  if (typeof r.ref !== 'string' || r.ref.length > REF_MAX) return null
  if (!isOneOf(DEPARTMENTS, r.department)) return null
  if (!isOneOf(PRIORITIES, r.priority)) return null
  if (!isOneOf(STATUSES, r.status)) return null
  if (!isIso(r.createdAt)) return null
  if (!isOneOf(SHIFTS, r.createdShift)) return null
  if (r.doneAt !== null && !isIso(r.doneAt)) return null
  return {
    id: r.id, text: r.text, ref: r.ref, department: r.department,
    priority: r.priority, status: r.status, createdAt: r.createdAt,
    createdShift: r.createdShift, doneAt: r.doneAt as string | null,
  }
}
```

`src/domain/labels.ts`:

```ts
import type { Department, Priority, Shift, Status } from './task'

export const SHIFT_LABELS: Record<Shift, string> = { frueh: 'Früh', spaet: 'Spät', nacht: 'Nacht' }
export const DEPARTMENT_LABELS: Record<Department, string> = {
  'front-office': 'Front Office', housekeeping: 'Housekeeping', restaurant: 'Restaurant',
}
export const PRIORITY_LABELS: Record<Priority, string> = { normal: 'Normal', wichtig: 'Wichtig' }
export const STATUS_LABELS: Record<Status, string> = { open: 'Offen', done: 'Erledigt' }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: task domain model with strict parse validation"`

---

### Task 4: Domain — Shift Resolution

**Files:**
- Create: `src/domain/shift.ts`
- Test: `src/domain/shift.test.ts`

All times below are **local** device time (construct `new Date(2026, 6, 10, H, M)` in tests, not ISO-Z strings, so tests are timezone-independent).

- [ ] **Step 1: Write the failing tests** — `src/domain/shift.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { nextShift, resolveShift, shiftForTime, shiftWindowStart } from './shift'

const at = (h: number, m = 0, day = 10) => new Date(2026, 6, day, h, m)

describe('shiftForTime boundaries', () => {
  test.each([
    [at(5, 59), 'nacht'], [at(6, 0), 'frueh'], [at(13, 59), 'frueh'],
    [at(14, 0), 'spaet'], [at(21, 59), 'spaet'], [at(22, 0), 'nacht'], [at(0, 30), 'nacht'],
  ])('%s → %s', (d, s) => expect(shiftForTime(d)).toBe(s))
})

describe('shiftWindowStart', () => {
  test('frueh window starts 06:00 same day', () => {
    expect(shiftWindowStart(at(9, 30))).toEqual(at(6, 0))
  })
  test('nacht after midnight started 22:00 the previous day', () => {
    expect(shiftWindowStart(at(1, 15))).toEqual(new Date(2026, 6, 9, 22, 0))
  })
  test('nacht before midnight started 22:00 same day', () => {
    expect(shiftWindowStart(at(23, 0))).toEqual(at(22, 0))
  })
})

describe('resolveShift with override', () => {
  test('no override → clock shift', () => {
    expect(resolveShift(at(10, 0), null)).toBe('frueh')
  })
  test('override set within current window wins', () => {
    expect(resolveShift(at(13, 30), { shift: 'spaet', setAt: at(13, 0).toISOString() })).toBe('spaet')
  })
  test('override expires at the next shift boundary', () => {
    expect(resolveShift(at(14, 5), { shift: 'frueh', setAt: at(13, 0).toISOString() })).toBe('spaet')
  })
  test('nacht override set at 23:00 still valid at 01:00 (spans midnight)', () => {
    expect(resolveShift(at(1, 0, 11), { shift: 'spaet', setAt: at(23, 0, 10).toISOString() })).toBe('spaet')
  })
  test('stale override from yesterday is ignored', () => {
    expect(resolveShift(at(6, 30, 11), { shift: 'spaet', setAt: at(23, 0, 10).toISOString() })).toBe('frueh')
  })
  test('garbage setAt is ignored', () => {
    expect(resolveShift(at(10, 0), { shift: 'nacht', setAt: 'not-a-date' })).toBe('frueh')
  })
})

describe('nextShift', () => {
  test.each([['frueh', 'spaet'], ['spaet', 'nacht'], ['nacht', 'frueh']] as const)(
    '%s → %s', (a, b) => expect(nextShift(a)).toBe(b))
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./shift`).

- [ ] **Step 3: Implement `src/domain/shift.ts`**

```ts
import type { Shift } from './task'

export interface ShiftOverride { shift: Shift; setAt: string }

export function shiftForTime(d: Date): Shift {
  const h = d.getHours()
  if (h >= 6 && h < 14) return 'frueh'
  if (h >= 14 && h < 22) return 'spaet'
  return 'nacht'
}

export function shiftWindowStart(now: Date): Date {
  const s = shiftForTime(now)
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  if (s === 'frueh') start.setHours(6)
  else if (s === 'spaet') start.setHours(14)
  else {
    start.setHours(22)
    if (now.getHours() < 6) start.setDate(start.getDate() - 1)
  }
  return start
}

export function resolveShift(now: Date, override: ShiftOverride | null): Shift {
  if (override) {
    const setAt = new Date(override.setAt)
    if (!Number.isNaN(setAt.getTime()) && setAt >= shiftWindowStart(now) && setAt <= now) {
      return override.shift
    }
  }
  return shiftForTime(now)
}

export function nextShift(s: Shift): Shift {
  return s === 'frueh' ? 'spaet' : s === 'spaet' ? 'nacht' : 'frueh'
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: shift resolution with auto-expiring manual override"`

---

### Task 5: Domain — Brief Generation & Text Format

**Files:**
- Create: `src/domain/brief.ts`
- Test: `src/domain/brief.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/domain/brief.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Task } from './task'
import { briefFilename, buildBrief, carriedOverLabel, formatBriefText } from './brief'

const base: Task = {
  id: 'x', text: 'Aufgabe', ref: '', department: 'front-office', priority: 'normal',
  status: 'open', createdAt: new Date(2026, 6, 8, 9, 12).toISOString(),
  createdShift: 'frueh', doneAt: null,
}
let n = 0
const mk = (o: Partial<Task>): Task => ({ ...base, id: `t${n++}`, ...o })
const NOW = new Date(2026, 6, 8, 13, 58) // Mi 08.07.2026, Früh window (06:00–14:00)

describe('buildBrief', () => {
  test('groups open tasks by department in fixed order, omitting empty departments', () => {
    const brief = buildBrief(
      [mk({ department: 'restaurant' }), mk({ department: 'front-office' })], 'frueh', NOW)
    expect(brief.sections.map((s) => s.department)).toEqual(['front-office', 'restaurant'])
  })
  test('sorts wichtig first, then oldest first within a department', () => {
    const old = mk({ createdAt: new Date(2026, 6, 7, 8, 0).toISOString() })
    const wichtig = mk({ priority: 'wichtig' })
    const brief = buildBrief([mk({}), old, wichtig], 'frueh', NOW)
    expect(brief.sections[0]!.tasks.map((t) => t.id)).toEqual([wichtig.id, old.id, 't0'])
  })
  test('doneThisShift only contains tasks completed inside the current clock window', () => {
    const inWindow = mk({ status: 'done', doneAt: new Date(2026, 6, 8, 7, 0).toISOString() })
    const before = mk({ status: 'done', doneAt: new Date(2026, 6, 8, 5, 0).toISOString() })
    const brief = buildBrief([inWindow, before], 'frueh', NOW)
    expect(brief.doneThisShift.map((t) => t.id)).toEqual([inWindow.id])
  })
  test('counts open, wichtig, doneThisShift; toShift follows rotation', () => {
    const brief = buildBrief(
      [mk({}), mk({ priority: 'wichtig' }),
       mk({ status: 'done', doneAt: new Date(2026, 6, 8, 7, 0).toISOString() })], 'frueh', NOW)
    expect(brief.counts).toEqual({ open: 2, wichtig: 1, doneThisShift: 1 })
    expect(brief.fromShift).toBe('frueh')
    expect(brief.toShift).toBe('spaet')
  })
})

describe('carriedOverLabel', () => {
  test('empty for tasks created in the current window', () => {
    expect(carriedOverLabel(mk({}), NOW)).toBe('')
  })
  test('labels older tasks with date and shift', () => {
    const t = mk({ createdAt: new Date(2026, 6, 7, 15, 0).toISOString(), createdShift: 'spaet' })
    expect(carriedOverLabel(t, NOW)).toBe('seit 07.07. Spät')
  })
})

describe('formatBriefText', () => {
  test('produces the exact handover text format', () => {
    const tasks = [
      mk({ text: 'Wasserkocher defekt, Technik informiert', ref: '204', priority: 'wichtig' }),
      mk({ text: 'Anreise ca. 23 Uhr, Schlüssel hinterlegt', ref: '117',
           createdAt: new Date(2026, 6, 7, 15, 0).toISOString(), createdShift: 'spaet' }),
      mk({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' }),
      mk({ text: 'Taxi 06:30 bestellt', ref: '118', status: 'done',
           doneAt: new Date(2026, 6, 8, 6, 30).toISOString() }),
    ]
    expect(formatBriefText(buildBrief(tasks, 'frueh', NOW))).toBe(
      [
        'ÜBERGABE Früh → Spät · Mi, 08.07.2026 · 13:58',
        '',
        'OFFEN (3)',
        '',
        'Front Office',
        '  ! 204 — Wasserkocher defekt, Technik informiert',
        '  · 117 — Anreise ca. 23 Uhr, Schlüssel hinterlegt (seit 07.07. Spät)',
        '',
        'Housekeeping',
        '  · 310 — Extra Kissen gewünscht',
        '',
        'ERLEDIGT DIESE SCHICHT (1)',
        '  · 118 — Taxi 06:30 bestellt',
      ].join('\n'),
    )
  })
  test('all-clear brief says so', () => {
    expect(formatBriefText(buildBrief([], 'nacht', NOW))).toContain('Keine offenen Aufgaben. Gute Übergabe!')
  })
})

describe('briefFilename', () => {
  test('is date- and shift-stamped', () => {
    expect(briefFilename(buildBrief([], 'frueh', NOW))).toBe('uebergabe-2026-07-08-frueh.txt')
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./brief`).

- [ ] **Step 3: Implement `src/domain/brief.ts`**

```ts
import { DEPARTMENTS, type Department, type Shift, type Task } from './task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from './labels'
import { nextShift, shiftWindowStart } from './shift'

export interface BriefSection { department: Department; tasks: Task[] }
export interface Brief {
  fromShift: Shift
  toShift: Shift
  generatedAt: string
  sections: BriefSection[]
  doneThisShift: Task[]
  counts: { open: number; wichtig: number; doneThisShift: number }
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
const pad = (v: number) => String(v).padStart(2, '0')

export function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const byPriorityThenOldest = (a: Task, b: Task) =>
  a.priority !== b.priority
    ? (a.priority === 'wichtig' ? -1 : 1)
    : a.createdAt.localeCompare(b.createdAt)

export function buildBrief(tasks: Task[], shift: Shift, now: Date): Brief {
  const open = tasks.filter((t) => t.status === 'open')
  const sections = DEPARTMENTS
    .map((d) => ({ department: d, tasks: open.filter((t) => t.department === d).sort(byPriorityThenOldest) }))
    .filter((s) => s.tasks.length > 0)
  const windowStart = shiftWindowStart(now).getTime()
  const doneThisShift = tasks
    .filter((t) => t.status === 'done' && t.doneAt !== null && Date.parse(t.doneAt) >= windowStart)
    .sort((a, b) => (b.doneAt as string).localeCompare(a.doneAt as string))
  return {
    fromShift: shift,
    toShift: nextShift(shift),
    generatedAt: now.toISOString(),
    sections,
    doneThisShift,
    counts: {
      open: open.length,
      wichtig: open.filter((t) => t.priority === 'wichtig').length,
      doneThisShift: doneThisShift.length,
    },
  }
}

export function carriedOverLabel(task: Task, now: Date): string {
  if (Date.parse(task.createdAt) >= shiftWindowStart(now).getTime()) return ''
  const d = new Date(task.createdAt)
  return `seit ${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${SHIFT_LABELS[task.createdShift]}`
}

export function formatBriefText(brief: Brief): string {
  const now = new Date(brief.generatedAt)
  const lines: string[] = [
    `ÜBERGABE ${SHIFT_LABELS[brief.fromShift]} → ${SHIFT_LABELS[brief.toShift]} · ${formatDateShort(brief.generatedAt)} · ${formatTimeShort(brief.generatedAt)}`,
    '',
    `OFFEN (${brief.counts.open})`,
  ]
  if (brief.sections.length === 0) lines.push('', 'Keine offenen Aufgaben. Gute Übergabe!')
  for (const s of brief.sections) {
    lines.push('', DEPARTMENT_LABELS[s.department])
    for (const t of s.tasks) {
      const mark = t.priority === 'wichtig' ? '!' : '·'
      const ref = t.ref ? `${t.ref} — ` : ''
      const age = carriedOverLabel(t, now)
      lines.push(`  ${mark} ${ref}${t.text}${age ? ` (${age})` : ''}`)
    }
  }
  if (brief.doneThisShift.length > 0) {
    lines.push('', `ERLEDIGT DIESE SCHICHT (${brief.doneThisShift.length})`)
    for (const t of brief.doneThisShift) {
      lines.push(`  · ${t.ref ? `${t.ref} — ` : ''}${t.text}`)
    }
  }
  return lines.join('\n')
}

export function briefFilename(brief: Brief): string {
  const d = new Date(brief.generatedAt)
  return `uebergabe-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${brief.fromShift}.txt`
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: handover brief generation and plain-text format"`

---

### Task 6: Storage — Envelope, Migrations, Recovery, Pruning

**Files:**
- Create: `src/storage/store.ts`, `src/test/fake-storage.ts`
- Test: `src/storage/store.test.ts`

- [ ] **Step 1: Write test helpers** — `src/test/fake-storage.ts`:

```ts
export interface FakeStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
  dump(): Record<string, string>
}

export function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}

export function failingStorage(): FakeStorage {
  const inner = fakeStorage()
  return {
    ...inner,
    setItem: () => { throw new DOMException('quota', 'QuotaExceededError') },
  }
}
```

- [ ] **Step 2: Write the failing tests** — `src/storage/store.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Task } from '../domain/task'
import { fakeStorage, failingStorage } from '../test/fake-storage'
import {
  CURRENT_SCHEMA, DONE_RETENTION_DAYS, RECOVERY_KEY, STORAGE_KEY,
  emptyStore, loadStore, pruneTasks, runMigrations, saveStore, wipeStore,
} from './store'

const NOW = new Date(2026, 6, 10, 12, 0)
const task = (o: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(), text: 'Aufgabe', ref: '', department: 'front-office',
  priority: 'normal', status: 'open', createdAt: NOW.toISOString(),
  createdShift: 'frueh', doneAt: null, ...o,
})

describe('loadStore', () => {
  test('fresh device → empty store, not recovered', () => {
    expect(loadStore(fakeStorage(), NOW)).toEqual({ data: emptyStore(), recovered: false })
  })
  test('round-trips a saved store', () => {
    const s = fakeStorage()
    const data = { schema: CURRENT_SCHEMA, tasks: [task()], shiftOverride: null }
    expect(saveStore(s, data)).toBe(true)
    expect(loadStore(s, NOW)).toEqual({ data, recovered: false })
  })
  test('unparseable JSON → stash to recovery key, reset, recovered=true', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{broken' })
    const { data, recovered } = loadStore(s, NOW)
    expect(recovered).toBe(true)
    expect(data).toEqual(emptyStore())
    expect(s.dump()[RECOVERY_KEY]).toBe('{broken')
  })
  test('future/unknown schema → recovery path', () => {
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ schema: 99, tasks: [] }) })
    expect(loadStore(s, NOW).recovered).toBe(true)
  })
  test('invalid tasks are dropped and flag recovery; valid ones survive', () => {
    const good = task()
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ schema: 1, tasks: [good, { junk: true }], shiftOverride: null }),
    })
    const { data, recovered } = loadStore(s, NOW)
    expect(data.tasks).toEqual([good])
    expect(recovered).toBe(true)
  })
  test('invalid shiftOverride becomes null without recovery', () => {
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ schema: 1, tasks: [], shiftOverride: { shift: 'day', setAt: 'x' } }),
    })
    const { data, recovered } = loadStore(s, NOW)
    expect(data.shiftOverride).toBeNull()
    expect(recovered).toBe(false)
  })
})

describe('pruneTasks', () => {
  const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
  test('drops done tasks older than the retention window, keeps everything else', () => {
    const oldDone = task({ status: 'done', doneAt: days(DONE_RETENTION_DAYS + 1) })
    const freshDone = task({ status: 'done', doneAt: days(2) })
    const oldOpen = task({ createdAt: days(60) })
    expect(pruneTasks([oldDone, freshDone, oldOpen], NOW)).toEqual([freshDone, oldOpen])
  })
})

describe('runMigrations', () => {
  test('applies chained migrations up to the target schema', () => {
    const out = runMigrations(
      { schema: 1, tasks: [] },
      { 1: (o) => ({ ...o, schema: 2, extra: true }) },
      2,
    )
    expect(out).toEqual({ schema: 2, tasks: [], extra: true })
  })
  test('missing migration step → null (corrupt path)', () => {
    expect(runMigrations({ schema: 1, tasks: [] }, {}, 2)).toBeNull()
  })
  test('schema below 1 or non-integer → null', () => {
    expect(runMigrations({ schema: 0, tasks: [] }, {}, 1)).toBeNull()
    expect(runMigrations({ schema: 'x', tasks: [] }, {}, 1)).toBeNull()
  })
})

describe('saveStore / wipeStore', () => {
  test('saveStore returns false when storage throws (quota)', () => {
    expect(saveStore(failingStorage(), emptyStore())).toBe(false)
  })
  test('wipeStore removes both keys', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{}', [RECOVERY_KEY]: '{}' })
    wipeStore(s)
    expect(s.dump()).toEqual({})
  })
})
```

- [ ] **Step 3: Verify RED** — `npm test` → FAIL (cannot resolve `./store`).

- [ ] **Step 4: Implement `src/storage/store.ts`**

```ts
import { SHIFTS, parseTask, type Shift, type Task } from '../domain/task'
import type { ShiftOverride } from '../domain/shift'

export const STORAGE_KEY = 'lobby-ledger.store'
export const RECOVERY_KEY = 'lobby-ledger.recovered'
export const CURRENT_SCHEMA = 1
export const DONE_RETENTION_DAYS = 14

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface StoreData {
  schema: number
  tasks: Task[]
  shiftOverride: ShiftOverride | null
}
export interface LoadResult { data: StoreData; recovered: boolean }

export function emptyStore(): StoreData {
  return { schema: CURRENT_SCHEMA, tasks: [], shiftOverride: null }
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>
// Registry of schema upgrades: MIGRATIONS[n] converts schema n → n+1.
export const MIGRATIONS: Record<number, Migration> = {}

export function runMigrations(
  obj: Record<string, unknown>,
  migrations: Record<number, Migration>,
  target: number,
): Record<string, unknown> | null {
  let current = obj
  let schema = typeof current.schema === 'number' ? current.schema : NaN
  if (!Number.isInteger(schema) || schema < 1 || schema > target) return null
  while (schema < target) {
    const step = migrations[schema]
    if (!step) return null
    current = step(current)
    schema = typeof current.schema === 'number' ? current.schema : NaN
    if (!Number.isInteger(schema)) return null
  }
  return current
}

function parseOverride(raw: unknown): ShiftOverride | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.shift !== 'string' || !(SHIFTS as readonly string[]).includes(r.shift)) return null
  if (typeof r.setAt !== 'string' || Number.isNaN(Date.parse(r.setAt))) return null
  return { shift: r.shift as Shift, setAt: r.setAt }
}

function recover(storage: StorageLike, raw: string): LoadResult {
  try {
    storage.setItem(RECOVERY_KEY, raw)
  } catch {
    // storage full — recovery copy skipped, reset still proceeds
  }
  return { data: emptyStore(), recovered: true }
}

export function loadStore(storage: StorageLike, now: Date): LoadResult {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return { data: emptyStore(), recovered: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recover(storage, raw)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return recover(storage, raw)
  const migrated = runMigrations(parsed as Record<string, unknown>, MIGRATIONS, CURRENT_SCHEMA)
  if (migrated === null || !Array.isArray(migrated.tasks)) return recover(storage, raw)
  const rawTasks = migrated.tasks as unknown[]
  const tasks = rawTasks.map(parseTask).filter((t): t is Task => t !== null)
  return {
    data: {
      schema: CURRENT_SCHEMA,
      tasks: pruneTasks(tasks, now),
      shiftOverride: parseOverride(migrated.shiftOverride),
    },
    recovered: tasks.length !== rawTasks.length,
  }
}

export function saveStore(storage: StorageLike, data: StoreData): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function pruneTasks(tasks: Task[], now: Date): Task[] {
  const cutoff = now.getTime() - DONE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return tasks.filter(
    (t) => t.status === 'open' || t.doneAt === null || Date.parse(t.doneAt) >= cutoff,
  )
}

export function wipeStore(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY)
  storage.removeItem(RECOVERY_KEY)
}
```

- [ ] **Step 5: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 6: Commit** — `git commit -am "feat: versioned localStorage envelope with migration, recovery, pruning"`

---

### Task 7: App State — Signals & Actions

**Files:**
- Create: `src/app/state.ts`
- Test: `src/app/state.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/app/state.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { fakeStorage, failingStorage } from '../test/fake-storage'
import { STORAGE_KEY } from '../storage/store'
import { createLedgerApp } from './state'

const mkApp = (t = new Date(2026, 6, 10, 9, 0)) => {
  const storage = fakeStorage()
  let now = t
  const app = createLedgerApp(storage, () => now)
  return { app, storage, setNow: (d: Date) => { now = d } }
}

describe('createLedgerApp', () => {
  test('boots on clock shift with empty tasks', () => {
    const { app } = mkApp()
    expect(app.shift.value).toBe('frueh')
    expect(app.tasks.value).toEqual([])
    expect(app.recovered.value).toBe(false)
  })
  test('addTask appends, stamps current shift, persists', () => {
    const { app, storage } = mkApp()
    const t = app.addTask({ text: 'Zimmer 204: Wasserkocher defekt', ref: '204' })
    expect(t).not.toBeNull()
    expect(app.tasks.value).toHaveLength(1)
    expect(app.tasks.value[0]!.createdShift).toBe('frueh')
    expect(JSON.parse(storage.dump()[STORAGE_KEY]!).tasks).toHaveLength(1)
  })
  test('addTask with blank text returns null and changes nothing', () => {
    const { app, storage } = mkApp()
    expect(app.addTask({ text: '   ' })).toBeNull()
    expect(app.tasks.value).toEqual([])
    expect(storage.dump()[STORAGE_KEY]).toBeUndefined()
  })
  test('setStatus done stamps doneAt; back to open clears it', () => {
    const { app } = mkApp()
    const t = app.addTask({ text: 'Taxi bestellen' })!
    app.setStatus(t.id, 'done')
    expect(app.tasks.value[0]!.doneAt).not.toBeNull()
    app.setStatus(t.id, 'open')
    expect(app.tasks.value[0]!.doneAt).toBeNull()
  })
  test('removeTask + undoRemove restores the task and persists both times', () => {
    const { app, storage } = mkApp()
    const t = app.addTask({ text: 'Blumen gießen' })!
    app.removeTask(t.id)
    expect(app.tasks.value).toEqual([])
    expect(app.lastDeleted.value?.id).toBe(t.id)
    app.undoRemove()
    expect(app.tasks.value.map((x) => x.id)).toEqual([t.id])
    expect(app.lastDeleted.value).toBeNull()
    expect(JSON.parse(storage.dump()[STORAGE_KEY]!).tasks).toHaveLength(1)
  })
  test('setShift overrides and persists; refreshShift honors override until boundary', () => {
    const { app, setNow } = mkApp(new Date(2026, 6, 10, 13, 30))
    app.setShift('spaet')
    expect(app.shift.value).toBe('spaet')
    app.refreshShift()
    expect(app.shift.value).toBe('spaet') // still inside frueh window, override holds
    setNow(new Date(2026, 6, 10, 14, 5))
    app.refreshShift()
    expect(app.shift.value).toBe('spaet') // now clock agrees
    setNow(new Date(2026, 6, 10, 22, 5))
    app.refreshShift()
    expect(app.shift.value).toBe('nacht') // override expired at boundary
  })
  test('saveFailed flips true when storage rejects writes', () => {
    const app = createLedgerApp(failingStorage(), () => new Date(2026, 6, 10, 9, 0))
    app.addTask({ text: 'irgendwas' })
    expect(app.saveFailed.value).toBe(true)
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./state`).

- [ ] **Step 3: Implement `src/app/state.ts`**

```ts
import { signal, type Signal } from '@preact/signals'
import type { NewTaskInput, Shift, Status, Task } from '../domain/task'
import { createTask } from '../domain/task'
import { resolveShift, type ShiftOverride } from '../domain/shift'
import { CURRENT_SCHEMA, loadStore, saveStore, type StorageLike } from '../storage/store'

export interface LedgerApp {
  tasks: Signal<Task[]>
  shift: Signal<Shift>
  recovered: Signal<boolean>
  saveFailed: Signal<boolean>
  lastDeleted: Signal<Task | null>
  now(): Date
  addTask(input: NewTaskInput): Task | null
  setStatus(id: string, status: Status): void
  removeTask(id: string): void
  undoRemove(): void
  setShift(shift: Shift): void
  refreshShift(): void
}

export function createLedgerApp(storage: StorageLike, now: () => Date = () => new Date()): LedgerApp {
  const loaded = loadStore(storage, now())
  let override: ShiftOverride | null = loaded.data.shiftOverride

  const tasks = signal(loaded.data.tasks)
  const shift = signal(resolveShift(now(), override))
  const recovered = signal(loaded.recovered)
  const saveFailed = signal(false)
  const lastDeleted = signal<Task | null>(null)

  const persist = () => {
    saveFailed.value = !saveStore(storage, {
      schema: CURRENT_SCHEMA,
      tasks: tasks.value,
      shiftOverride: override,
    })
  }

  return {
    tasks, shift, recovered, saveFailed, lastDeleted, now,
    addTask(input) {
      const task = createTask(input, now(), shift.value)
      if (task) {
        tasks.value = [...tasks.value, task]
        persist()
      }
      return task
    },
    setStatus(id, status) {
      tasks.value = tasks.value.map((t) =>
        t.id === id ? { ...t, status, doneAt: status === 'done' ? now().toISOString() : null } : t,
      )
      persist()
    },
    removeTask(id) {
      lastDeleted.value = tasks.value.find((t) => t.id === id) ?? null
      tasks.value = tasks.value.filter((t) => t.id !== id)
      persist()
    },
    undoRemove() {
      if (!lastDeleted.value) return
      tasks.value = [...tasks.value, lastDeleted.value]
      lastDeleted.value = null
      persist()
    },
    setShift(s) {
      override = { shift: s, setAt: now().toISOString() }
      shift.value = s
      persist()
    },
    refreshShift() {
      shift.value = resolveShift(now(), override)
    },
  }
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: signals-based app state with persistence and undo"`

---

### Task 8: UI Shell — Router, Header, Shift Control, Banners

**Files:**
- Create: `src/app/router.ts`, `src/app/components/Header.tsx`, `src/app/components/Toasts.tsx`
- Modify: `src/app/components/App.tsx`, `src/main.tsx`, `src/styles/app.css`
- Test: `src/app/components/App.test.tsx` (rewrite)

- [ ] **Step 1: Rewrite the failing tests** — `src/app/components/App.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { STORAGE_KEY } from '../../storage/store'
import { createLedgerApp } from '../state'
import { App } from './App'

const at = (h: number) => () => new Date(2026, 6, 10, h, 0)

describe('App shell', () => {
  test('renders wordmark and clock-derived shift as checked radio', () => {
    render(<App app={createLedgerApp(fakeStorage(), at(9))} />)
    expect(screen.getByText('Lobby Ledger')).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Früh' }) as HTMLInputElement).checked).toBe(true)
  })
  test('tapping a shift radio overrides the shift', () => {
    const app = createLedgerApp(fakeStorage(), at(9))
    render(<App app={app} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Spät' }))
    expect(app.shift.value).toBe('spaet')
  })
  test('Übergabe link shows the open-task count badge', () => {
    const app = createLedgerApp(fakeStorage(), at(9))
    app.addTask({ text: 'Kissen für 310' })
    render(<App app={app} />)
    expect(screen.getByLabelText('1 offene Aufgaben')).toBeTruthy()
  })
  test('#/uebergabe renders the Übergabe view heading', () => {
    location.hash = '#/uebergabe'
    render(<App app={createLedgerApp(fakeStorage(), at(9))} />)
    expect(screen.getByRole('heading', { name: 'Übergabe' })).toBeTruthy()
    location.hash = ''
  })
  test('recovery banner appears when stored data was corrupt', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{broken' })
    render(<App app={createLedgerApp(storage, at(9))} />)
    expect(screen.getByText(/beschädigt/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (`App` has no `app` prop; radios missing).

- [ ] **Step 3: Implement**

`src/app/router.ts`:

```ts
import { useEffect, useState } from 'preact/hooks'

export type Route = 'tasks' | 'brief'

export function routeFromHash(hash: string): Route {
  return hash === '#/uebergabe' ? 'brief' : 'tasks'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}
```

`src/app/components/Header.tsx`:

```tsx
import type { LedgerApp } from '../state'
import type { Route } from '../router'
import { SHIFTS } from '../../domain/task'
import { SHIFT_LABELS } from '../../domain/labels'

export function Header({ app, route }: { app: LedgerApp; route: Route }) {
  const openCount = app.tasks.value.filter((t) => t.status === 'open').length
  return (
    <header class="header no-print">
      <div class="header-row">
        <span class="wordmark">Lobby Ledger</span>
        {route === 'tasks' ? (
          <a class="brief-link" href="#/uebergabe">
            Übergabe
            {openCount > 0 && (
              <span class="count nums" aria-label={`${openCount} offene Aufgaben`}>{openCount}</span>
            )}
          </a>
        ) : (
          <a class="brief-link" href="#/">Zurück</a>
        )}
      </div>
      <ShiftControl app={app} />
    </header>
  )
}

function ShiftControl({ app }: { app: LedgerApp }) {
  return (
    <fieldset class="shift-control">
      <legend class="visually-hidden">Aktuelle Schicht</legend>
      {SHIFTS.map((s) => (
        <label key={s} class={`shift-option${app.shift.value === s ? ' on' : ''}`}>
          <input
            type="radio" name="shift" value={s}
            checked={app.shift.value === s}
            onChange={() => app.setShift(s)}
          />
          <span>{SHIFT_LABELS[s]}</span>
        </label>
      ))}
    </fieldset>
  )
}
```

`src/app/components/Toasts.tsx`:

```tsx
import { useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { LedgerApp } from '../state'

export function Banner({ children, tone = 'info', onClose }: {
  children: ComponentChildren
  tone?: 'info' | 'warn'
  onClose?: () => void
}) {
  return (
    <div class={`banner banner-${tone} no-print`} role="status">
      <p>{children}</p>
      {onClose && <button onClick={onClose} aria-label="Hinweis schließen">OK</button>}
    </div>
  )
}

export function UndoToast({ app }: { app: LedgerApp }) {
  const deleted = app.lastDeleted.value
  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => (app.lastDeleted.value = null), 6000)
    return () => clearTimeout(timer)
  }, [deleted, app])
  if (!deleted) return null
  return (
    <div class="toast no-print" role="status">
      Aufgabe gelöscht.
      <button onClick={() => app.undoRemove()}>Rückgängig</button>
    </div>
  )
}
```

`src/app/components/App.tsx` (rewrite; placeholders marked below are replaced in Tasks 10/11):

```tsx
import { useEffect } from 'preact/hooks'
import type { LedgerApp } from '../state'
import { useRoute } from '../router'
import { Header } from './Header'
import { Banner, UndoToast } from './Toasts'

export function App({ app }: { app: LedgerApp }) {
  const route = useRoute()
  useEffect(() => {
    const refresh = () => app.refreshShift()
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [app])
  return (
    <div class="app">
      <Header app={app} route={route} />
      {app.recovered.value && (
        <Banner onClose={() => (app.recovered.value = false)}>
          Gespeicherte Daten waren beschädigt. Die App wurde zurückgesetzt; eine Kopie liegt intern vor.
        </Banner>
      )}
      {app.saveFailed.value && (
        <Banner tone="warn">Speichern fehlgeschlagen. Letzte Änderung ist evtl. nicht gesichert.</Banner>
      )}
      <main>
        {route === 'brief'
          ? <h1 class="view-title">Übergabe</h1> /* Task 11 replaces with <BriefView app={app} /> */
          : <h1 class="visually-hidden">Aufgaben</h1> /* Task 10 replaces with <TasksView app={app} /> */}
      </main>
      <UndoToast app={app} />
    </div>
  )
}
```

`src/main.tsx` — construct real state:

```tsx
import { render } from 'preact'
import '@fontsource-variable/fraunces'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { App } from './app/components/App'
import { createLedgerApp } from './app/state'

const app = createLedgerApp(localStorage)
render(<App app={app} />, document.getElementById('app')!)
```

Append to `src/styles/app.css`:

```css
.app { max-width: var(--col-max); margin-inline: auto; min-height: 100dvh; }
main { padding: var(--space-4); padding-bottom: 148px; }
.view-title { font-family: var(--font-display); font-size: var(--text-title); font-weight: 550; margin: 0 0 var(--space-3); }

.header { padding: var(--space-3) var(--space-4) var(--space-3); border-bottom: 1px solid var(--hairline); background: var(--paper); }
.header-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.wordmark { font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: 0.01em; }
.brief-link { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-4); border-radius: var(--radius); background: var(--accent); color: var(--accent-ink); text-decoration: none; font-weight: 600; }
.brief-link .count { background: var(--accent-ink); color: var(--accent); border-radius: 999px; min-width: 22px; text-align: center; padding: 1px 6px; font-size: var(--text-sm); }

.shift-control { display: flex; border: 1px solid var(--hairline); border-radius: var(--radius); padding: 0; margin: var(--space-3) 0 0; overflow: hidden; }
.shift-option { flex: 1; }
.shift-option input { position: absolute; opacity: 0; pointer-events: none; }
.shift-option span { display: flex; align-items: center; justify-content: center; min-height: var(--tap); color: var(--ink-soft); }
.shift-option.on span { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.shift-option input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: -2px; }

.banner { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-3) var(--space-4) 0; padding: var(--space-3) var(--space-4); border: 1px solid var(--hairline); border-left: 3px solid var(--brass); border-radius: var(--radius); background: var(--paper-raised); }
.banner p { margin: 0; }
.banner button { min-height: var(--tap); min-width: var(--tap); border: 1px solid var(--hairline); border-radius: var(--radius); background: transparent; margin-left: auto; }
.banner-warn { border-left-color: var(--danger-soft); }

.toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: var(--space-3); background: var(--ink); color: var(--paper); padding: var(--space-2) var(--space-4); border-radius: var(--radius); white-space: nowrap; }
.toast button { min-height: var(--tap); background: none; border: none; color: inherit; font-weight: 700; text-decoration: underline; }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. `npm run test:e2e` smoke still green.

- [ ] **Step 5: Commit** — `git commit -am "feat: app shell with hash router, shift control, banners, undo toast"`

---

### Task 9: Capture Bar

**Files:**
- Create: `src/app/components/CaptureBar.tsx`
- Modify: `src/app/components/App.tsx` (render on tasks route), `src/styles/app.css`
- Test: `src/app/components/CaptureBar.test.tsx`

- [ ] **Step 1: Write the failing tests** — `src/app/components/CaptureBar.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { CaptureBar } from './CaptureBar'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 9, 0))
const textInput = () => screen.getByLabelText('Neue Aufgabe, keine Gastnamen') as HTMLInputElement

describe('CaptureBar', () => {
  test('one-tap capture: text + Erfassen creates task with defaults and clears input', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.input(textInput(), { target: { value: 'Zimmer 204: Wasserkocher defekt' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Erfassen' }).closest('form')!)
    expect(app.tasks.value).toHaveLength(1)
    expect(app.tasks.value[0]!.department).toBe('front-office')
    expect(app.tasks.value[0]!.priority).toBe('normal')
    expect(textInput().value).toBe('')
  })
  test('whitespace-only text does nothing and keeps the input value', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.input(textInput(), { target: { value: '   ' } })
    fireEvent.submit(textInput().closest('form')!)
    expect(app.tasks.value).toHaveLength(0)
    expect(textInput().value).toBe('   ')
  })
  test('details expand on focus; ref, department and Wichtig are applied', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.focus(textInput())
    fireEvent.input(screen.getByLabelText('Zimmer oder Referenz'), { target: { value: '310' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Housekeeping' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wichtig' }))
    fireEvent.input(textInput(), { target: { value: 'Extra Kissen gewünscht' } })
    fireEvent.submit(textInput().closest('form')!)
    const t = app.tasks.value[0]!
    expect(t.ref).toBe('310')
    expect(t.department).toBe('housekeeping')
    expect(t.priority).toBe('wichtig')
  })
  test('after submit: department persists, Wichtig resets, confirmation is announced', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.focus(textInput())
    fireEvent.click(screen.getByRole('radio', { name: 'Restaurant' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wichtig' }))
    fireEvent.input(textInput(), { target: { value: 'Frühstück bis 11 Uhr verlängert' } })
    fireEvent.submit(textInput().closest('form')!)
    expect((screen.getByRole('radio', { name: 'Restaurant' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Wichtig' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/Aufgabe erfasst: Frühstück/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./CaptureBar`).

- [ ] **Step 3: Implement `src/app/components/CaptureBar.tsx`**

```tsx
import { useSignal } from '@preact/signals'
import type { LedgerApp } from '../state'
import { DEPARTMENTS, type Department } from '../../domain/task'
import { DEPARTMENT_LABELS } from '../../domain/labels'

export function CaptureBar({ app }: { app: LedgerApp }) {
  const text = useSignal('')
  const ref = useSignal('')
  const department = useSignal<Department>('front-office')
  const wichtig = useSignal(false)
  const expanded = useSignal(false)
  const confirmMsg = useSignal('')

  const submit = (e: Event) => {
    e.preventDefault()
    const task = app.addTask({
      text: text.value,
      ref: ref.value,
      department: department.value,
      priority: wichtig.value ? 'wichtig' : 'normal',
    })
    if (!task) return
    confirmMsg.value = `Aufgabe erfasst: ${task.ref ? `${task.ref} – ` : ''}${task.text}`
    text.value = ''
    ref.value = ''
    wichtig.value = false
    // department is intentionally kept — entries often repeat per department
  }

  return (
    <form class="capture no-print" onSubmit={submit}>
      <p aria-live="polite" class="visually-hidden">{confirmMsg.value}</p>
      <div class="capture-row">
        <input
          class="capture-text" type="text" maxLength={200}
          placeholder="Neue Aufgabe … (keine Gastnamen)"
          aria-label="Neue Aufgabe, keine Gastnamen"
          value={text.value}
          onInput={(e) => (text.value = e.currentTarget.value)}
          onFocus={() => (expanded.value = true)}
        />
        <button class="capture-add" type="submit">Erfassen</button>
      </div>
      {expanded.value && (
        <div class="capture-details">
          <input
            class="capture-ref nums" type="text" inputMode="numeric" maxLength={24}
            placeholder="Zimmer / Ref." aria-label="Zimmer oder Referenz"
            value={ref.value}
            onInput={(e) => (ref.value = e.currentTarget.value)}
          />
          <fieldset class="chips">
            <legend class="visually-hidden">Abteilung</legend>
            {DEPARTMENTS.map((d) => (
              <label key={d} class={`chip${department.value === d ? ' on' : ''}`}>
                <input
                  type="radio" name="department" value={d}
                  checked={department.value === d}
                  onChange={() => (department.value = d)}
                />
                <span>{DEPARTMENT_LABELS[d]}</span>
              </label>
            ))}
          </fieldset>
          <label class="wichtig-toggle">
            <input
              type="checkbox" checked={wichtig.value}
              onChange={(e) => (wichtig.value = e.currentTarget.checked)}
            />
            Wichtig
          </label>
          <p class="pii-hint">Keine Gastnamen oder Kontaktdaten – nur Zimmer und Sache.</p>
        </div>
      )}
    </form>
  )
}
```

In `App.tsx`, render it on the tasks route only — after `</main>`:

```tsx
{route === 'tasks' && <CaptureBar app={app} />}
```

Append to `src/styles/app.css`:

```css
.capture { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: min(100%, var(--col-max)); background: var(--paper-raised); border-top: 1px solid var(--hairline); padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); }
.capture-row { display: flex; gap: var(--space-2); }
.capture-text { flex: 1; min-height: var(--tap); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 0 var(--space-3); background: var(--paper); }
.capture-add { min-height: var(--tap); padding: 0 var(--space-4); border: none; border-radius: var(--radius); background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.capture-details { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); align-items: center; }
.capture-ref { width: 120px; min-height: var(--tap); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 0 var(--space-3); background: var(--paper); }
.chips { display: flex; gap: var(--space-1); border: none; padding: 0; margin: 0; }
.chip { display: inline-flex; }
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.chip span { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--space-3); border: 1px solid var(--hairline); border-radius: 999px; color: var(--ink-soft); }
.chip.on span { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.chip input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 2px; }
.wichtig-toggle { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-3); border: 1px solid var(--hairline); border-radius: 999px; }
.pii-hint { flex-basis: 100%; margin: 0; color: var(--ink-soft); font-size: var(--text-sm); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: bottom capture bar with one-tap quick add and optional details"`

---

### Task 10: Task List

**Files:**
- Create: `src/app/components/TasksView.tsx`
- Modify: `src/app/components/App.tsx` (replace tasks placeholder), `src/styles/app.css`
- Test: `src/app/components/TasksView.test.tsx`

- [ ] **Step 1: Write the failing tests** — `src/app/components/TasksView.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { sortOpenTasks, TasksView } from './TasksView'
import type { Task } from '../../domain/task'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 9, 0))
const mk = (o: Partial<Task>): Task => ({
  id: crypto.randomUUID(), text: 'Aufgabe', ref: '', department: 'front-office',
  priority: 'normal', status: 'open', createdAt: '2026-07-10T07:00:00.000Z',
  createdShift: 'frueh', doneAt: null, ...o,
})

describe('sortOpenTasks', () => {
  test('wichtig first, then newest first', () => {
    const oldNormal = mk({ createdAt: '2026-07-10T06:00:00.000Z' })
    const newNormal = mk({ createdAt: '2026-07-10T08:00:00.000Z' })
    const wichtig = mk({ priority: 'wichtig', createdAt: '2026-07-10T05:00:00.000Z' })
    expect(sortOpenTasks([oldNormal, newNormal, wichtig]).map((t) => t.id))
      .toEqual([wichtig.id, newNormal.id, oldNormal.id])
  })
})

describe('TasksView', () => {
  test('empty state shows calm guidance', () => {
    render(<TasksView app={mkApp()} />)
    expect(screen.getByText(/Noch keine Aufgaben/)).toBeTruthy()
  })
  test('renders ref, text, department and shift metadata', () => {
    const app = mkApp()
    app.addTask({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' })
    render(<TasksView app={app} />)
    expect(screen.getByText('310')).toBeTruthy()
    expect(screen.getByText('Extra Kissen gewünscht')).toBeTruthy()
    expect(screen.getByText(/Housekeeping/)).toBeTruthy()
  })
  test('status button toggles done and moves task to collapsed Erledigt section', () => {
    const app = mkApp()
    app.addTask({ text: 'Taxi bestellen' })
    render(<TasksView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Als erledigt markieren' }))
    expect(app.tasks.value[0]!.status).toBe('done')
    const disclosure = screen.getByRole('button', { name: /Erledigt \(1\)/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name: 'Als offen markieren' })).toBeTruthy()
  })
  test('all-done state appears when tasks exist but none are open', () => {
    const app = mkApp()
    app.addTask({ text: 'Taxi bestellen' })
    app.setStatus(app.tasks.value[0]!.id, 'done')
    render(<TasksView app={app} />)
    expect(screen.getByText(/Alles erledigt/)).toBeTruthy()
  })
  test('delete button removes the task and stages undo', () => {
    const app = mkApp()
    app.addTask({ text: 'Blumen gießen' })
    render(<TasksView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aufgabe löschen' }))
    expect(app.tasks.value).toHaveLength(0)
    expect(app.lastDeleted.value?.text).toBe('Blumen gießen')
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./TasksView`).

- [ ] **Step 3: Implement `src/app/components/TasksView.tsx`**

```tsx
import { useSignal } from '@preact/signals'
import type { LedgerApp } from '../state'
import type { Task } from '../../domain/task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'

export function sortOpenTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    a.priority !== b.priority
      ? (a.priority === 'wichtig' ? -1 : 1)
      : b.createdAt.localeCompare(a.createdAt),
  )
}

export function TasksView({ app }: { app: LedgerApp }) {
  const showDone = useSignal(false)
  const all = app.tasks.value
  const open = sortOpenTasks(all.filter((t) => t.status === 'open'))
  const done = [...all.filter((t) => t.status === 'done')]
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

  if (all.length === 0) {
    return (
      <div class="empty">
        <h1 class="visually-hidden">Aufgaben</h1>
        <p class="empty-title">Noch keine Aufgaben.</p>
        <p class="empty-hint">Unten erfassen — Zimmer oder Stichwort genügt.</p>
      </div>
    )
  }

  return (
    <div class="tasks">
      <h1 class="visually-hidden">Aufgaben</h1>
      {open.length === 0 ? (
        <p class="all-done">Alles erledigt. Neue Aufgaben unten erfassen.</p>
      ) : (
        <ul class="task-list">
          {open.map((t) => <TaskRow key={t.id} task={t} app={app} />)}
        </ul>
      )}
      {done.length > 0 && (
        <section class="done-section">
          <button
            class="done-toggle" aria-expanded={showDone.value}
            onClick={() => (showDone.value = !showDone.value)}
          >
            Erledigt ({done.length})
          </button>
          {showDone.value && (
            <ul class="task-list is-done">
              {done.map((t) => <TaskRow key={t.id} task={t} app={app} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function TaskRow({ task, app }: { task: Task; app: LedgerApp }) {
  const isDone = task.status === 'done'
  return (
    <li class={`row${task.priority === 'wichtig' ? ' wichtig' : ''}${isDone ? ' done' : ''}`}>
      <button
        class="row-status"
        aria-label={isDone ? 'Als offen markieren' : 'Als erledigt markieren'}
        onClick={() => app.setStatus(task.id, isDone ? 'open' : 'done')}
      >
        {isDone ? '✓' : ''}
      </button>
      <div class="row-main">
        <p class="row-text">
          {task.ref && <strong class="nums">{task.ref}</strong>} {task.text}
        </p>
        <p class="row-meta">
          {DEPARTMENT_LABELS[task.department]}
          {task.priority === 'wichtig' && ' · Wichtig'}
          {' · '}{SHIFT_LABELS[task.createdShift]}
        </p>
      </div>
      <button class="row-delete" aria-label="Aufgabe löschen" onClick={() => app.removeTask(task.id)}>
        ×
      </button>
    </li>
  )
}
```

In `App.tsx`: import `TasksView` and replace the tasks placeholder `<h1 class="visually-hidden">Aufgaben</h1>` with `<TasksView app={app} />`.

Append to `src/styles/app.css` — ledger-row styling:

```css
.empty { padding: var(--space-6) var(--space-4); text-align: center; color: var(--ink-soft); }
.empty-title { font-family: var(--font-display); font-size: var(--text-lg); color: var(--ink); margin: 0 0 var(--space-2); }
.empty-hint { margin: 0; }
.all-done { color: var(--ink-soft); padding: var(--space-4) 0; }

.task-list { list-style: none; margin: 0; padding: 0; }
.row { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--hairline); }
.row.wichtig { box-shadow: inset 3px 0 0 var(--brass); padding-left: var(--space-3); }
.row-status { width: var(--tap); height: var(--tap); flex: none; border: 2px solid var(--accent); border-radius: 50%; background: transparent; color: var(--accent); font-size: var(--text-lg); }
.row.done .row-status { background: var(--accent); color: var(--accent-ink); }
.row.done .row-text { color: var(--ink-soft); text-decoration: line-through; }
.row-main { flex: 1; min-width: 0; }
.row-text { margin: 0; overflow-wrap: anywhere; }
.row-text strong { margin-right: var(--space-1); }
.row-meta { margin: var(--space-1) 0 0; color: var(--ink-soft); font-size: var(--text-sm); }
.row.wichtig .row-meta { color: var(--wichtig-text); }
.row-delete { width: var(--tap); height: var(--tap); flex: none; border: none; background: transparent; color: var(--danger-soft); font-size: var(--text-lg); }
.done-section { margin-top: var(--space-5); }
.done-toggle { min-height: var(--tap); border: none; background: transparent; color: var(--ink-soft); font-weight: 600; padding: 0; }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: ledger-style task list with done toggle, delete and undo staging"`

---

### Task 11: Brief View

**Files:**
- Create: `src/app/components/BriefView.tsx`
- Modify: `src/app/components/App.tsx` (replace brief placeholder), `src/styles/app.css`
- Test: `src/app/components/BriefView.test.tsx`

- [ ] **Step 1: Write the failing tests** — `src/app/components/BriefView.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { BriefView } from './BriefView'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 13, 30))

describe('BriefView', () => {
  test('shows shift transition, date, time and counts', () => {
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204', priority: 'wichtig' })
    render(<BriefView app={app} />)
    expect(screen.getByText(/Früh → Spät/)).toBeTruthy()
    expect(screen.getByText(/13:30/)).toBeTruthy()
    expect(screen.getByText(/1 offen · 1 wichtig · 0 erledigt/)).toBeTruthy()
  })
  test('groups open tasks under department headings', () => {
    const app = mkApp()
    app.addTask({ text: 'Extra Kissen', ref: '310', department: 'housekeeping' })
    render(<BriefView app={app} />)
    expect(screen.getByRole('heading', { name: 'Housekeeping' })).toBeTruthy()
    expect(screen.getByText('310')).toBeTruthy()
  })
  test('all-clear message when nothing is open', () => {
    render(<BriefView app={mkApp()} />)
    expect(screen.getByText('Keine offenen Aufgaben. Gute Übergabe!')).toBeTruthy()
  })
  test('done-this-shift section lists completed tasks', () => {
    const app = mkApp()
    const t = app.addTask({ text: 'Taxi 06:30 bestellt', ref: '118' })!
    app.setStatus(t.id, 'done')
    render(<BriefView app={app} />)
    expect(screen.getByRole('heading', { name: /Erledigt diese Schicht \(1\)/ })).toBeTruthy()
  })
  test('wichtig tasks are announced for screen readers, not color-only', () => {
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204', priority: 'wichtig' })
    render(<BriefView app={app} />)
    expect(screen.getByText('Wichtig:')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./BriefView`).

- [ ] **Step 3: Implement `src/app/components/BriefView.tsx`**

```tsx
import type { LedgerApp } from '../state'
import { buildBrief, carriedOverLabel, formatDateShort, formatTimeShort } from '../../domain/brief'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'

export function BriefView({ app }: { app: LedgerApp }) {
  const now = app.now()
  const brief = buildBrief(app.tasks.value, app.shift.value, now)
  return (
    <article class="brief">
      <header class="brief-head">
        <h1 class="view-title">Übergabe</h1>
        <p class="brief-sub">
          {SHIFT_LABELS[brief.fromShift]} → {SHIFT_LABELS[brief.toShift]}
          {' · '}{formatDateShort(brief.generatedAt)}{' · '}{formatTimeShort(brief.generatedAt)}
        </p>
        <p class="brief-counts nums">
          {brief.counts.open} offen · {brief.counts.wichtig} wichtig · {brief.counts.doneThisShift} erledigt diese Schicht
        </p>
      </header>
      {brief.sections.length === 0 ? (
        <p class="brief-clear">Keine offenen Aufgaben. Gute Übergabe!</p>
      ) : (
        brief.sections.map((s) => (
          <section key={s.department} class="brief-section">
            <h2>{DEPARTMENT_LABELS[s.department]}</h2>
            <ul>
              {s.tasks.map((t) => {
                const age = carriedOverLabel(t, now)
                return (
                  <li key={t.id} class={t.priority === 'wichtig' ? 'wichtig' : ''}>
                    <span class="mark" aria-hidden="true">{t.priority === 'wichtig' ? '!' : '·'}</span>
                    {t.priority === 'wichtig' && <span class="visually-hidden">Wichtig: </span>}
                    {t.ref && <strong class="nums">{t.ref}</strong>} {t.text}
                    {age && <em class="age"> ({age})</em>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
      {brief.doneThisShift.length > 0 && (
        <section class="brief-section brief-done">
          <h2>Erledigt diese Schicht ({brief.doneThisShift.length})</h2>
          <ul>
            {brief.doneThisShift.map((t) => (
              <li key={t.id}>{t.ref && <strong class="nums">{t.ref}</strong>} {t.text}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
```

In `App.tsx`: import `BriefView` and replace the brief placeholder `<h1 class="view-title">Übergabe</h1>` with `<BriefView app={app} />`.

Append to `src/styles/app.css`:

```css
.brief-head { border-bottom: 2px solid var(--ink); padding-bottom: var(--space-3); margin-bottom: var(--space-4); }
.brief-sub { margin: 0; font-weight: 600; }
.brief-counts { margin: var(--space-1) 0 0; color: var(--ink-soft); font-size: var(--text-sm); }
.brief-clear { font-family: var(--font-display); font-size: var(--text-lg); color: var(--ink-soft); }
.brief-section { margin-bottom: var(--space-5); }
.brief-section h2 { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 550; margin: 0 0 var(--space-2); border-bottom: 1px solid var(--hairline); padding-bottom: var(--space-1); }
.brief-section ul { list-style: none; margin: 0; padding: 0; }
.brief-section li { display: flex; gap: var(--space-2); padding: var(--space-2) 0; overflow-wrap: anywhere; }
.brief-section li .mark { flex: none; width: 1em; text-align: center; }
.brief-section li.wichtig { color: var(--wichtig-text); font-weight: 600; }
.brief-section li .age { color: var(--ink-soft); font-style: normal; font-size: var(--text-sm); align-self: center; }
.brief-done { color: var(--ink-soft); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit** — `git commit -am "feat: handover brief view with sections, counts and all-clear state"`

---

### Task 12: Export — Copy, Fallback, .txt Download, Print Button

**Files:**
- Create: `src/app/export.ts`
- Modify: `src/app/components/BriefView.tsx` (actions + fallback), `src/styles/app.css`
- Test: `src/app/export.test.ts`, extend `src/app/components/BriefView.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/app/export.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { copyText, downloadText } from './export'

const stubClipboard = (impl: (t: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: impl }, configurable: true,
  })

describe('copyText', () => {
  test('resolves true when the clipboard accepts', async () => {
    stubClipboard(() => Promise.resolve())
    expect(await copyText('ÜBERGABE …')).toBe(true)
  })
  test('resolves false when the clipboard rejects (denied/insecure)', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    expect(await copyText('x')).toBe(false)
  })
})

describe('downloadText', () => {
  test('creates and clicks a temporary object-URL anchor', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadText('uebergabe-2026-07-10-frueh.txt', 'inhalt')
    expect(createUrl).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:x')
    createUrl.mockRestore(); revokeUrl.mockRestore(); click.mockRestore()
  })
})
```

Add to `src/app/components/BriefView.test.tsx`:

```tsx
// additional imports at top of file:
import { fireEvent, waitFor } from '@testing-library/preact'
import { vi } from 'vitest'

test('copy button confirms with "Kopiert ✓"', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.resolve() }, configurable: true,
  })
  const app = mkApp()
  app.addTask({ text: 'Wasserkocher defekt', ref: '204' })
  render(<BriefView app={app} />)
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  await waitFor(() => expect(screen.getByText('Kopiert ✓')).toBeTruthy())
})

test('clipboard rejection opens the manual-copy fallback with the brief text', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true,
  })
  const app = mkApp()
  app.addTask({ text: 'Wasserkocher defekt', ref: '204' })
  render(<BriefView app={app} />)
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  await waitFor(() => {
    const box = screen.getByRole('dialog', { name: 'Manuell kopieren' })
    expect((box.querySelector('textarea') as HTMLTextAreaElement).value).toContain('ÜBERGABE')
  })
})

test('print button calls window.print', () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  render(<BriefView app={mkApp()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Drucken' }))
  expect(print).toHaveBeenCalledOnce()
  print.mockRestore()
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./export`; buttons missing).

- [ ] **Step 3: Implement**

`src/app/export.ts`:

```ts
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

`BriefView.tsx` — add imports and actions:

```tsx
// new imports:
import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { briefFilename, formatBriefText } from '../../domain/brief'
import { copyText, downloadText } from '../export'

// inside BriefView, after `const brief = …`:
const copied = useSignal<'idle' | 'ok' | 'fail'>('idle')
const text = formatBriefText(brief)
useEffect(() => {
  if (copied.value !== 'ok') return
  const timer = setTimeout(() => (copied.value = 'idle'), 2000)
  return () => clearTimeout(timer)
}, [copied.value])

// inside <header class="brief-head">, after the counts line:
<div class="brief-actions no-print">
  <button onClick={() => window.print()}>Drucken</button>
  <button aria-live="polite"
    onClick={async () => (copied.value = (await copyText(text)) ? 'ok' : 'fail')}>
    {copied.value === 'ok' ? 'Kopiert ✓' : 'Kopieren'}
  </button>
  <button onClick={() => downloadText(briefFilename(brief), text)}>Als .txt</button>
</div>

// before the closing </article>:
{copied.value === 'fail' && <CopyFallback text={text} onClose={() => (copied.value = 'idle')} />}
```

Add to the same file:

```tsx
function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div class="copy-fallback no-print" role="dialog" aria-label="Manuell kopieren">
      <p>Manuell kopieren (gedrückt halten und kopieren):</p>
      <textarea readonly rows={8} value={text} onFocus={(e) => e.currentTarget.select()} />
      <button onClick={onClose}>Schließen</button>
    </div>
  )
}
```

Append to `src/styles/app.css`:

```css
.brief-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); flex-wrap: wrap; }
.brief-actions button { min-height: var(--tap); padding: 0 var(--space-4); border: 1px solid var(--accent); border-radius: var(--radius); background: transparent; color: var(--accent); font-weight: 600; }
.brief-actions button:first-child { background: var(--accent); color: var(--accent-ink); }
.copy-fallback { margin-top: var(--space-4); padding: var(--space-4); border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--paper-raised); }
.copy-fallback textarea { width: 100%; font: inherit; font-size: var(--text-base); background: var(--paper); color: var(--ink); border: 1px solid var(--hairline); border-radius: var(--radius); padding: var(--space-2); }
.copy-fallback button { min-height: var(--tap); padding: 0 var(--space-4); border: 1px solid var(--hairline); border-radius: var(--radius); background: transparent; margin-top: var(--space-2); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: e2e export flow** — append to `e2e/flows.spec.ts`:

```ts
test('capture → brief → copy produces the handover text', async ({ page, browserName }) => {
  await page.goto('/')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Wasserkocher defekt, Technik informiert')
  await page.getByLabel('Zimmer oder Referenz').fill('204')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await expect(page.getByRole('heading', { name: 'Übergabe' })).toBeVisible()
  await page.getByRole('button', { name: 'Kopieren' }).click()
  await expect(page.getByRole('button', { name: 'Kopiert ✓' })).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('ÜBERGABE')
  expect(clip).toContain('204 — Wasserkocher defekt, Technik informiert')
})
```

Run: `npm run test:e2e` → PASS on both projects.

- [ ] **Step 6: Commit** — `git commit -am "feat: brief export via clipboard, manual fallback and txt download"`

---

### Task 13: Print Stylesheet & Behavior

**Files:**
- Create: `src/styles/print.css`, `e2e/print.spec.ts`, `e2e/fixtures.ts`
- Modify: `src/main.tsx` (import print.css)

- [ ] **Step 1: Write the e2e fixtures helper** — `e2e/fixtures.ts`:

```ts
import type { Page } from '@playwright/test'
import type { Task } from '../src/domain/task'
import { STORAGE_KEY } from '../src/storage/store'

let n = 0
export function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date()
  return {
    id: `fixture-${n++}`, text: 'Wasserkocher defekt, Technik informiert', ref: '204',
    department: 'front-office', priority: 'normal', status: 'open',
    createdAt: now.toISOString(), createdShift: 'frueh', doneAt: null, ...overrides,
  }
}

export async function seed(page: Page, tasks: Task[]): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [STORAGE_KEY, JSON.stringify({ schema: 1, tasks, shiftOverride: null })],
  )
}
```

- [ ] **Step 2: Write the failing e2e test** — `e2e/print.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { makeTask, seed } from './fixtures'

test('print media shows only the brief on white paper', async ({ page }) => {
  await seed(page, [
    makeTask({ priority: 'wichtig' }),
    makeTask({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' }),
  ])
  await page.goto('/#/uebergabe')
  await expect(page.getByRole('heading', { name: 'Übergabe' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.header')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Drucken' })).toBeHidden()
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(255, 255, 255)')
  await page.setViewportSize({ width: 794, height: 1123 }) // A4 @ 96dpi
  await page.screenshot({ path: `test-results/screens/print-a4-${test.info().project.name}.png`, fullPage: true })
})
```

- [ ] **Step 3: Verify RED** — `npm run test:e2e -- print` → FAIL (header still visible in print media).

- [ ] **Step 4: Implement `src/styles/print.css`**

```css
@page { size: A4; margin: 15mm; }

@media print {
  /* Force paper-true light values regardless of active theme */
  :root, :root[data-theme='dark'] {
    --paper: #fff; --paper-raised: #fff;
    --ink: #000; --ink-soft: #333; --hairline: #999;
    --accent: #000; --accent-ink: #fff;
    --wichtig-text: #000; --wichtig-bg: #fff; --brass: #000;
  }
  body { background: #fff !important; color: #000 !important; font-size: 11pt; }
  .no-print, .header, .capture, .toast, .banner { display: none !important; }
  .app { max-width: none; }
  main { padding: 0; }
  .brief-section { break-inside: avoid; }
  .brief-head { border-bottom-width: 1pt; }
  .brief-section li.wichtig { font-weight: 700; }
}
```

Add `import './styles/print.css'` to `src/main.tsx` after `app.css`.

- [ ] **Step 5: Verify GREEN** — `npm run test:e2e -- print` → PASS. Eyeball `test-results/screens/print-a4-*.png`: brief only, black on white, department blocks unbroken.

- [ ] **Step 6: Commit** — `git commit -am "feat: A4 print stylesheet for the handover brief"`

---

### Task 14: Theming — Nacht Dark Mode

**Files:**
- Create: `src/app/theme.ts`
- Modify: `src/app/components/App.tsx`
- Test: `src/app/theme.test.ts`, extend `src/app/components/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/app/theme.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { themeFor } from './theme'

describe('themeFor', () => {
  test.each([
    ['frueh', false, 'light'], ['spaet', false, 'light'],
    ['nacht', false, 'dark'],  ['frueh', true, 'dark'],
  ] as const)('shift=%s prefersDark=%s → %s', (shift, prefers, want) => {
    expect(themeFor(shift, prefers)).toBe(want)
  })
})
```

Add to `src/app/components/App.test.tsx`:

```tsx
test('Nacht shift switches the document to the dark theme', () => {
  render(<App app={createLedgerApp(fakeStorage(), at(23))} />)
  expect(document.documentElement.dataset.theme).toBe('dark')
})
test('day shift uses the light theme', () => {
  render(<App app={createLedgerApp(fakeStorage(), at(9))} />)
  expect(document.documentElement.dataset.theme).toBe('light')
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./theme`; dataset.theme undefined).

- [ ] **Step 3: Implement**

`src/app/theme.ts`:

```ts
import type { Shift } from '../domain/task'

export type Theme = 'light' | 'dark'

export function themeFor(shift: Shift, prefersDark: boolean): Theme {
  return shift === 'nacht' || prefersDark ? 'dark' : 'light'
}
```

In `App.tsx`, add a second `useEffect` (import `themeFor`):

```tsx
useEffect(() => {
  const media = matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const theme = themeFor(app.shift.value, media.matches)
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#191813' : '#F6F3EC')
  }
  media.addEventListener('change', apply)
  const unsubscribe = app.shift.subscribe(apply) // fires immediately with current value
  return () => {
    media.removeEventListener('change', apply)
    unsubscribe()
  }
}, [app])
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. Manual check: `npm run dev`, tap Nacht → warm dark paper, tap Früh → light.

- [ ] **Step 5: Commit** — `git commit -am "feat: automatic dark theme for Nacht shift and prefers-color-scheme"`

---

### Task 15: PWA — Manifest, Icons, Service Worker, Update Banner

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon.svg`, `scripts/render-icons.mjs`, `public/sw.js`, `src/app/sw-register.ts`, `e2e/offline.spec.ts`, `src/app/components/Toasts.test.tsx`
- Modify: `index.html`, `src/main.tsx`, `src/app/components/App.tsx`, `src/app/components/Toasts.tsx`

- [ ] **Step 1: Write the failing e2e test** — `e2e/offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('app works offline after first visit, including capture', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByLabel('Neue Aufgabe, keine Gastnamen')).toBeVisible()
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Offline erfasst: Lampe Flur 2 defekt')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Offline erfasst: Lampe Flur 2 defekt')).toBeVisible()
  await context.setOffline(false)
})

test('manifest is served and linked', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const res = await request.get(href!)
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).name).toBe('Lobby Ledger')
})
```

And a component test for the update banner — `src/app/components/Toasts.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { updateReady } from '../sw-register'
import { UpdateBar } from './Toasts'

describe('UpdateBar', () => {
  test('hidden by default, shows and applies when an update is ready', () => {
    updateReady.value = null
    const { rerender } = render(<UpdateBar />)
    expect(screen.queryByText('Neue Version verfügbar.')).toBeNull()
    const apply = vi.fn()
    updateReady.value = apply
    rerender(<UpdateBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    expect(apply).toHaveBeenCalledOnce()
    updateReady.value = null
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (no `../sw-register`). `npm run test:e2e -- offline` → FAIL (reload offline gives net error).

- [ ] **Step 3: Implement**

`public/icons/icon.svg` (concierge bell over a ledger rule, maskable-safe content):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#F6F3EC"/>
  <circle cx="50" cy="30" r="4" fill="#A8763E"/>
  <path d="M50 36c-12.5 0-22.5 9.4-24 21.5h48C72.5 45.4 62.5 36 50 36Z" fill="#22453B"/>
  <rect x="22" y="61" width="56" height="6" rx="3" fill="#22453B"/>
  <rect x="30" y="74" width="40" height="3" rx="1.5" fill="#A8763E"/>
</svg>
```

`scripts/render-icons.mjs` (uses the already-installed Playwright Chromium — no new deps):

```js
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/icons/icon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>*{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`,
  )
  writeFileSync(`public/icons/icon-${size}.png`, await page.locator('svg').screenshot())
}
await browser.close()
console.log('wrote public/icons/icon-192.png and icon-512.png')
```

Run `npm run icons` once and commit the generated PNGs.

`public/manifest.webmanifest`:

```json
{
  "name": "Lobby Ledger",
  "short_name": "Ledger",
  "description": "Übergabe-Aufgaben für die Rezeption – lokal, ohne Konto.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F6F3EC",
  "theme_color": "#F6F3EC",
  "lang": "de",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`index.html` — add inside `<head>`:

```html
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="./icons/icon-192.png" />
```

`public/sw.js` — network-first navigations, cache-first assets, versioned cleanup:

```js
const CACHE = 'lobby-ledger-v1' // bump on every release

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})
```

`src/app/sw-register.ts`:

```ts
import { signal } from '@preact/signals'

export const updateReady = signal<(() => void) | null>(null)

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady.value = () => next.postMessage('SKIP_WAITING')
          }
        })
      })
    })
    .catch(() => {
      // app fully works without a service worker
    })
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload())
}
```

`src/app/components/Toasts.tsx` — add:

```tsx
import { updateReady } from '../sw-register'

export function UpdateBar() {
  const apply = updateReady.value
  if (!apply) return null
  return (
    <div class="banner no-print" role="status">
      <p>Neue Version verfügbar.</p>
      <button onClick={apply}>Aktualisieren</button>
    </div>
  )
}
```

`App.tsx`: render `<UpdateBar />` directly after the two `Banner` blocks.
`src/main.tsx` — register only for production builds (dev server must not be cached):

```tsx
import { registerSW } from './app/sw-register'
// after render(...):
if (import.meta.env.PROD) registerSW()
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run test:e2e` → offline + manifest tests PASS (webServer serves the production build, so the SW is active).

- [ ] **Step 5: Commit** — `git commit -am "feat: installable PWA with offline shell and update banner"`

---

### Task 16: Privacy Guarantee & Data Wipe

**Files:**
- Create: `e2e/privacy.spec.ts`
- Modify: `src/app/state.ts` (+ `wipe()`), `src/app/components/BriefView.tsx` (footer + WipeButton), `src/styles/app.css`
- Test: extend `src/app/state.test.ts`, `src/app/components/BriefView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/app/state.test.ts`:

```ts
test('wipe clears state and storage completely', () => {
  const { app, storage } = mkApp()
  app.addTask({ text: 'Zimmer 204: Wasserkocher defekt' })
  app.wipe()
  expect(app.tasks.value).toEqual([])
  expect(storage.dump()).toEqual({})
  expect(app.shift.value).toBe('frueh') // back to clock shift
})
```

Add to `src/app/components/BriefView.test.tsx`:

```tsx
test('wipe is two-step: arm, then confirm; cancel disarms', () => {
  const app = mkApp()
  app.addTask({ text: 'Zimmer 204: Wasserkocher defekt' })
  render(<BriefView app={app} />)
  fireEvent.click(screen.getByRole('button', { name: 'Alle Daten löschen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(app.tasks.value).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Alle Daten löschen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))
  expect(app.tasks.value).toHaveLength(0)
})
```

`e2e/privacy.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('zero cross-origin requests across a full user flow', async ({ page, baseURL }) => {
  const offsite: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin) offsite.push(r.url())
  })
  await page.goto('/')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Zimmer 204: Wasserkocher defekt')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await expect(page.getByRole('heading', { name: 'Übergabe' })).toBeVisible()
  await page.reload()
  expect(offsite).toEqual([])
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (`app.wipe` is not a function; wipe buttons missing).

- [ ] **Step 3: Implement**

`src/app/state.ts` — add to the `LedgerApp` interface: `wipe(): void`. Add to the returned object (import `wipeStore` from `../storage/store`):

```ts
wipe() {
  wipeStore(storage)
  override = null
  tasks.value = []
  lastDeleted.value = null
  recovered.value = false
  saveFailed.value = false
  shift.value = resolveShift(now(), null)
},
```

`BriefView.tsx` — add before `</article>`:

```tsx
<footer class="brief-foot no-print">
  <WipeButton app={app} />
</footer>
```

And the component:

```tsx
function WipeButton({ app }: { app: LedgerApp }) {
  const arming = useSignal(false)
  if (!arming.value) {
    return (
      <button class="wipe" onClick={() => (arming.value = true)}>Alle Daten löschen</button>
    )
  }
  return (
    <span class="wipe-confirm" role="alert">
      Wirklich alle Daten löschen?
      <button class="wipe-yes" onClick={() => { app.wipe(); arming.value = false }}>Ja, löschen</button>
      <button onClick={() => (arming.value = false)}>Abbrechen</button>
    </span>
  )
}
```

Append to `src/styles/app.css`:

```css
.brief-foot { margin-top: var(--space-6); border-top: 1px solid var(--hairline); padding-top: var(--space-4); }
.wipe, .wipe-confirm button { min-height: var(--tap); padding: 0 var(--space-4); border: 1px solid var(--hairline); border-radius: var(--radius); background: transparent; color: var(--ink-soft); }
.wipe-confirm { display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.wipe-yes { color: var(--danger-soft); border-color: var(--danger-soft); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run test:e2e` → privacy spec PASS on both projects.

- [ ] **Step 5: Commit** — `git commit -am "feat: two-step data wipe and executable zero-egress privacy test"`

---

### Task 17: Accessibility Sweep

**Files:**
- Create: `e2e/a11y.spec.ts`
- Modify: whatever the scans flag (tokens/labels/markup only — never the assertions)

- [ ] **Step 1: Write the failing e2e tests** — `e2e/a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeTask, seed } from './fixtures'

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

const filled = () => [
  makeTask({ priority: 'wichtig' }),
  makeTask({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' }),
  makeTask({ text: 'Taxi 06:30 bestellt', ref: '118', status: 'done', doneAt: new Date().toISOString() }),
]

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('tasks view (empty) has no violations', async ({ page }) => {
      await page.goto('/')
      expect((await scan(page)).violations).toEqual([])
    })
    test('tasks view (filled, details expanded) has no violations', async ({ page }) => {
      await seed(page, filled())
      await page.goto('/')
      await page.getByLabel('Neue Aufgabe, keine Gastnamen').focus()
      expect((await scan(page)).violations).toEqual([])
    })
    test('brief view has no violations', async ({ page }) => {
      await seed(page, filled())
      await page.goto('/#/uebergabe')
      expect((await scan(page)).violations).toEqual([])
    })
  })
}

test('keyboard-only capture works end to end', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').focus()
  await page.keyboard.type('Zimmer 204: Wasserkocher defekt')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Zimmer 204: Wasserkocher defekt')).toBeVisible()
})
```

- [ ] **Step 2: Run** — `npm run test:e2e -- a11y`. Expected on first run: possible contrast/label violations.

- [ ] **Step 3: Fix every violation at the source** — adjust token values in `tokens.css` (keep the palette's character: darken/lighten within the same hue), add missing labels/roles in components. Re-run until `violations: []` in both themes on both projects. Do not add axe rule exclusions and do not loosen assertions.

- [ ] **Step 4: Verify** — `npm run test:e2e` full suite green; `npm test` green.

- [ ] **Step 5: Commit** — `git commit -am "fix: WCAG AA pass (axe-clean in both themes) and keyboard capture"`

---

### Task 18: Visual Acceptance — 390 px Mobile + Desktop

**Files:**
- Create: `e2e/visual.spec.ts`

- [ ] **Step 1: Write the tests (encode §5 exactly)** — `e2e/visual.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { makeTask, seed } from './fixtures'

const stress = () => [
  makeTask({ text: 'X'.repeat(200), ref: 'R'.repeat(24), priority: 'wichtig' }),
  ...Array.from({ length: 10 }, (_, i) =>
    makeTask({
      text: `Aufgabe ${i}: längerer Beispieltext zur Prüfung von Zeilenumbruch und Lesbarkeit`,
      ref: String(100 + i),
      department: (['front-office', 'housekeeping', 'restaurant'] as const)[i % 3]!,
    })),
  makeTask({ text: 'Taxi 06:30 bestellt', ref: '118', status: 'done', doneAt: new Date().toISOString() }),
]

async function noHorizontalOverflow(page: Page) {
  const [scrollW, clientW] = await page.evaluate(() => [
    document.documentElement.scrollWidth, document.documentElement.clientWidth,
  ])
  expect(scrollW, 'no horizontal overflow').toBe(clientW)
}

async function tapTargets(page: Page) {
  const targets = page.locator(
    'button:visible, a:visible, input[type="text"]:visible, .shift-option span, .chip span, .wichtig-toggle',
  )
  for (const box of await targets.evaluateAll((els) =>
    els.map((el) => ({ h: el.getBoundingClientRect().height, name: (el.textContent ?? el.getAttribute('aria-label') ?? '?').slice(0, 24) })),
  )) {
    expect(box.h, `tap target too small: ${box.name}`).toBeGreaterThanOrEqual(44)
  }
}

async function inputFontSizes(page: Page) {
  for (const size of await page.locator('input[type="text"]').evaluateAll(
    (els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)),
  )) {
    expect(size, 'inputs must be ≥16px (iOS zoom)').toBeGreaterThanOrEqual(16)
  }
}

const VIEWS = [
  { name: 'tasks-empty', tasks: [], hash: '' },
  { name: 'tasks-filled', tasks: stress(), hash: '' },
  { name: 'brief', tasks: stress(), hash: '#/uebergabe' },
]

for (const view of VIEWS) {
  test(`${view.name}: layout acceptance + screenshot`, async ({ page }) => {
    if (view.tasks.length > 0) await seed(page, view.tasks)
    await page.goto(`/${view.hash}`)
    if (view.hash === '') await page.getByLabel('Neue Aufgabe, keine Gastnamen').focus() // expand details
    await noHorizontalOverflow(page)
    await tapTargets(page)
    await inputFontSizes(page)

    const project = test.info().project.name
    if (project === 'mobile' && view.hash === '') {
      const box = await page.getByLabel('Neue Aufgabe, keine Gastnamen').boundingBox()
      expect(box!.y + box!.height / 2, 'capture input in thumb zone').toBeGreaterThan(844 * 0.6)
    }
    if (project === 'desktop') {
      const app = await page.locator('.app').boundingBox()
      expect(app!.width, 'centered column').toBeLessThanOrEqual(680)
      expect(Math.abs(app!.x + app!.width / 2 - 640), 'column centered').toBeLessThanOrEqual(2)
    }
    await page.screenshot({ path: `test-results/screens/${view.name}-${project}.png`, fullPage: true })
  })
}
```

- [ ] **Step 2: Run** — `npm run test:e2e -- visual`. Fix any overflow/target/centering failure in `app.css` (typical culprits: unwrapped long refs → `overflow-wrap: anywhere` already set; toast width on 390px → `white-space: nowrap` may need removal if it overflows).

- [ ] **Step 3: Human review** — open the six PNGs in `test-results/screens/`. Judge against the design constraints: calm paper ledger, clear hierarchy, nothing resembling a generic SaaS dashboard. Iterate CSS if it fails the glance test.

- [ ] **Step 4: Verify** — full `npm run test:e2e` and `npm test` green.

- [ ] **Step 5: Commit** — `git commit -am "test: visual acceptance suite for 390px mobile and desktop column"`

---

### Task 19: Deploy — GitHub Pages Workflow, README, Final Gate

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`** (tests gate the deploy):

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Enable Pages (Settings → Pages → Source: GitHub Actions) — one-time manual step. Because Vite `base` is `'./'`, the app works at `https://<user>.github.io/lobby-ledger/` and at any other static host without config changes.

- [ ] **Step 2: Write `README.md`**

```markdown
# Lobby Ledger

Übergabe-Aufgaben für die Rezeption – mobil, lokal, ohne Konto. Non-PII by design:
Zimmernummer und Sache, keine Gastnamen. Alle Daten bleiben im Browser des Geräts.

## Entwicklung

npm ci             # einmalig
npm run dev        # Dev-Server
npm test           # Unit-/Komponententests (Vitest)
npm run test:e2e   # E2E, A11y, Visual, Print, Offline, Privacy (Playwright)
npm run typecheck  # TypeScript strict
npm run build      # Produktions-Build nach dist/

## Deployment

Statischer Build, kein Server. Zwei Wege:
1. GitHub Pages: Push auf main → Workflow testet, baut, veröffentlicht (HTTPS inklusive).
2. Beliebiger statischer HTTPS-Host: Inhalt von dist/ hochladen.

Hinweis: Service Worker und Zwischenablage benötigen HTTPS (oder localhost).
Bei jedem Release die Konstante CACHE in public/sw.js erhöhen.

## Datenschutz

Keine Netzwerk-Requests an Dritte (per CSP erzwungen und per E2E-Test belegt),
keine Analytics, keine Gastdaten. „Alle Daten löschen" in der Übergabe-Ansicht.
```

- [ ] **Step 3: Final gate** — run everything:

```bash
npm run typecheck && npm test && npm run test:e2e && npm run build
```

Expected: all green, `dist/` produced. Then walk the Manual QA Checklist below on a real phone.

- [ ] **Step 4: Commit** — `git commit -am "chore: GitHub Pages deploy workflow and README"`

---

## Manual QA Checklist (real-device, not automatable — run before first shift use)

- [ ] iPhone Safari: Teilen → Zum Home-Bildschirm; app launches standalone, icon correct
- [ ] Android Chrome: install prompt / menu install works
- [ ] Add task with on-screen keyboard open — capture bar stays visible (`interactive-widget=resizes-content`)
- [ ] Airplane mode after one visit: app opens, capture works, brief renders
- [ ] Print the brief on the hotel printer: A4, readable, one page for ~15 tasks, departments unbroken
- [ ] Copy → paste into a messenger: text format intact, umlauts correct
- [ ] `.txt` download opens with correct filename and content
- [ ] VoiceOver/TalkBack: capture a task, toggle done, read the brief — labels and announcements sensible
- [ ] Nacht shift in a dim lobby: dark theme readable, no glare
- [ ] Shift boundary: leave app open across 14:00 — shift rolls to Spät within a minute

## Risks & Open Items

| Risk / Item | Assessment | Mitigation |
|---|---|---|
| localStorage eviction (iOS: unused-site data cleanup) | Real but low for a daily-used installed PWA | Install to home screen (QA item); print/txt export each shift is the operational backup; JSON backup/restore is the first post-MVP candidate |
| Shared desk device: anyone can wipe/edit | Accepted — data is non-PII by design, low sensitivity | Two-step wipe; recovery stash for corruption |
| Undo buffer holds only the last deleted task | Accepted for MVP simplicity | Documented behavior; toast lasts 6 s |
| Wrong device clock → wrong default shift | Low | Manual shift override is one tap, persisted |
| Shift boundary times (06/14/22) and 14-day retention are assumptions | **Confirm with the hotel** | Both are single constants (`shiftForTime`, `DONE_RETENTION_DAYS`) — trivial to change |
| Department list fixed at three | **Confirm** (e.g. Technik?) | Adding one enum value + label + schema migration is a small, planned change path |
| Playwright e2e is Chromium-only | Accepted | iOS Safari covered by manual QA checklist |

## Execution Handoff

Plan complete. Execute with superpowers:subagent-driven-development (fresh subagent per task, review between tasks) or superpowers:executing-plans (inline with checkpoints). Task order is dependency-ordered; Tasks 3–7 are pure logic and parallelizable in worktrees if desired; UI tasks 8–14 are sequential.
