# Pilot date arrows and system dark mode — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Repair date navigation and add a warm, persisted system-aware dark theme to the private pilot.

**Architecture:** Keep `SimplePilotApp` as the sole presentation owner. Add a small theme-preference utility that resolves the DOM `data-theme` from a stored override or `matchMedia`, and use inline SVGs for date controls so their layout cannot be altered by font glyph metrics.

**Tech Stack:** Preact, TypeScript, existing CSS token system, Vitest, Vite.

---

### Task 1: Cover date navigation and theme resolution

**Files:**
- Create: `src/pilot/simple/theme.ts`
- Create: `src/pilot/simple/theme.test.ts`
- Modify: `src/pilot/simple/SimplePilotApp.test.tsx`

**Steps:**
1. Write failing unit tests for `resolveTheme('system', darkMatch)`, explicit light/dark overrides, and a `clear` return path.
2. Run `npx vitest run src/pilot/simple/theme.test.ts`; confirm expected failure.
3. Implement pure `ThemePreference` helpers and a DOM effect wrapper using `matchMedia` with safe fallback.
4. Add a component test asserting previous/next date buttons are labeled and rendered as buttons, plus a text-labeled theme control with `aria-pressed`.
5. Run focused tests, then commit.

### Task 2: Implement the one-row SVG date navigator

**Files:**
- Modify: `src/pilot/simple/SimplePilotApp.tsx`
- Modify: `src/pilot/simple/simple.css`
- Test: `src/pilot/simple/SimplePilotApp.test.tsx`

**Steps:**
1. Update the component test to assert chevron SVG markup is `aria-hidden`, while controls retain German accessible labels.
2. Run the focused component test and confirm it fails before markup changes.
3. Replace textual chevrons with two inline SVG chevrons, and wrap the date input between controls in a stable flex/grid row.
4. Add CSS ensuring 44px controls, consistent inline alignment, focus visibility, and no overlap at 390px.
5. Run focused tests and commit.

### Task 3: Add system theme with manual override

**Files:**
- Modify: `src/pilot/simple/SimplePilotApp.tsx`
- Modify: `src/pilot/simple/simple.css`
- Modify: `src/styles/tokens.css` only if token contrast adjustment is required
- Test: `src/pilot/simple/theme.test.ts`, `src/pilot/simple/SimplePilotApp.test.tsx`

**Steps:**
1. Write a failing component test for changing the header theme control and persisting a manual override.
2. Implement a compact header button with visible German text, not emojis, that cycles system → explicit dark/light (or presents a clear reset-to-system action) and preserves keyboard semantics.
3. Apply token-backed dark styles to inputs, selected controls, borders, fixed capture bar, and focus state; do not add gradients/neon.
4. Run focused tests; commit.

### Task 4: Verify, review, and ship

**Files:** no feature files beyond test or review fixes.

**Steps:**
1. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run build:pilot`, `npm run check:security`, and `git diff --check`.
2. Run a fresh independent review of the staged diff focused on the absence of credentials, theme persistence behavior, accessibility labels, and mobile control geometry.
3. Browser QA on production-like pilot build at 390×844 and desktop: inspect date row, toggle system/override behavior, dark contrast, no horizontal overflow, console error count.
4. Commit, push, deploy production, then recheck the unauthenticated PIN gate and static rendering.
