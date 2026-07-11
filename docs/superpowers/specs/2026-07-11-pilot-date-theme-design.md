# Lobby Ledger pilot — date navigation and dark-mode design

**Date:** 2026-07-11  
**Status:** approved by Abel in chat

## Goal

Repair the malformed service-date navigation visible in the pilot and add a calm, accessible dark theme without changing the PIN, database, or handover workflow.

## Date navigation

- Replace typographic `‹` / `›` glyph buttons with inline, decorative-free SVG chevrons.
- Render one unbroken horizontal control: previous-day button, native date input, next-day button.
- Use the existing `moveDate()` behavior; only the presentation and accessible labels change.
- Each arrow has a 44×44 px minimum target and labels `Vorheriger Tag` / `Nächster Tag`.
- Preserve keyboard focus and the native date picker.

## Theme behavior

- Default theme follows `prefers-color-scheme`.
- A compact, accessible header theme button lets the user override the system choice.
- Override state is stored locally under a pilot-specific key. Clearing/resetting it returns to the system theme.
- The button carries an explicit text label and `aria-pressed`; no ambiguous emoji or unlabeled icon-only control.
- Dark tokens remain warm-paper-ledger: charcoal brown canvas, raised warm surface, cream text, muted sage accent, brass priority signal. No gradients, neon, dashboard chrome, or a generic black/gray inversion.

## Scope / non-goals

- Do not change PIN/session/server/database behavior.
- Do not expose credentials or alter V1 public build behavior.
- Do not add dependencies.

## Verification

- Add test coverage for system/default, manual override, and date navigation semantics.
- Run `npm test`, typecheck, pilot build, security gate, and diff check.
- Browser QA on phone-sized and desktop viewport: no overflow, date row remains aligned, theme survives reload, console has no errors.
- Independent diff review before commit/deploy.
