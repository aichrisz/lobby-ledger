# Lobby Ledger

Mobile-first, local-first PWA for a single hotel front desk: capture non-PII handover tasks during a shift and generate a clean handover brief (Übergabe) for the next shift. One shared device, no accounts, no server.

## Current state

Planning phase. No application source yet. The implementation plan lives at
`docs/plans/2026-07-10-lobby-ledger-mvp.md` and is the source of truth for the MVP build.

## Scope (approved MVP — do not widen without explicit decision)

- Shifts: Früh (06–14), Spät (14–22), Nacht (22–06), manual override with auto-expiry at shift boundary
- Tasks: text, optional room/task reference, department (Front Office / Housekeeping / Restaurant), priority (Normal / Wichtig), status (Offen / Erledigt)
- One-tap quick capture with sensible defaults; task list; generated handover brief
- Print (A4) and plain-text export (clipboard copy, `.txt` download)
- German UI strings; English identifiers, code comments, and docs

### Explicitly out of scope

No login, no backend, no sync, no AI, no third-party integrations, no analytics, no guest PII, no multi-property support, no i18n framework. Do not add runtime dependencies, network calls, or schema fields without recording the decision here first.

## Privacy rules (hard requirements)

1. **No guest PII.** No fields for guest names, phone numbers, emails, or notes about persons. Room number + task text only. Never add such fields. Example data in code, tests, and docs must never contain person names.
2. **No network egress.** No CDNs, no third-party fonts, no telemetry, no external requests of any kind. CSP is `default-src 'self'`. An e2e test asserts zero cross-origin requests — it must stay green.
3. **All data stays on the device** in `localStorage`. The app provides a user-facing wipe ("Alle Daten löschen").
4. **UI copy nudges against PII**: capture field hints say "keine Gastnamen". Keep those hints.

## Design constraints

- Calm, professional, print-adjacent "paper ledger" character. Explicitly NOT generic SaaS: no cool-gray dashboard look, no gradient cards, no marketing chrome, no emoji noise, no Tailwind-default aesthetics.
- Warm paper background, warm ink text, deep lobby-green accent, ochre/brass for "Wichtig" (never alarm red). All color via CSS custom properties in `src/styles/tokens.css`; text contrast ≥ 4.5:1.
- Type: self-hosted Fraunces (display/wordmark) + system sans (UI). Tabular numerals for room references. Base font size ≥ 16px (also prevents iOS input zoom).
- Mobile-first at 390 px; capture bar anchored bottom (thumb reach); touch targets ≥ 44 px; safe-area insets respected. Desktop is the same centered column, max-width 680 px.
- Dark theme automatically during Nacht shift and via `prefers-color-scheme`. Respect `prefers-reduced-motion`.
- States are designed, not defaulted: calm empty states, undo instead of confirm dialogs, inline hints instead of red alerts.

## Stack

Vite + TypeScript (strict) + Preact + `@preact/signals`. Plain CSS with custom properties (no CSS framework, no UI kit). Hand-written service worker (no Workbox). Tests: Vitest + `@testing-library/preact` (happy-dom) for unit/component; Playwright + `@axe-core/playwright` for e2e, accessibility, and visual acceptance. Deploy: static `dist/` to any static host; GitHub Pages workflow provided.

## Commands (available once plan Task 1 is executed)

```bash
npm run dev          # Vite dev server
npm test             # vitest run (unit + component)
npm run test:watch   # vitest watch mode
npm run test:e2e     # playwright (builds + serves preview on :4173 first)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build → dist/
npm run preview      # serve dist/ on :4173 (service worker active)
npm run icons        # regenerate PNG icons from public/icons/icon.svg
```

## Working rules

- **TDD, strictly.** Failing test → minimal code → refactor (superpowers:test-driven-development). No production code without a failing test first. Pure domain logic (`src/domain/`, `src/storage/`) carries most of the test weight.
- Execute the plan task-by-task (superpowers:subagent-driven-development or superpowers:executing-plans). Each task ends with `npm test` and `npm run typecheck` green.
- UI tasks: use the frontend-design skill; stay inside the design constraints above.
- Verify UI work at 390×844 before calling it done; e2e visual acceptance tests encode the hard limits.
- German UI strings live next to their components; enum labels map in `src/domain/labels.ts`.

## Key paths (planned)

```
src/domain/    pure logic: task model, shift resolution, brief generation (most tests here)
src/storage/   localStorage envelope, schema version, migrations, recovery
src/app/       Preact components, signals state, router, export, theme, SW registration
public/        manifest.webmanifest, sw.js, icons
e2e/           Playwright specs: flows, visual, a11y, print, offline, privacy
docs/plans/    implementation plans
```
