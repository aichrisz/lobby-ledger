# Simple Pilot Reliability Hardening Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Restore a deterministic baseline, prevent stale mutation responses from contaminating another shift, and tighten two existing request boundaries.

**Architecture:** Keep existing request APIs and `loadSequence` behavior. Fix the timezone-sensitive fixture, add a minimal selected-view guard around mutation success state, and reuse one validation predicate at API boundaries.

**Tech Stack:** Preact, TypeScript, Vitest, Vercel functions, existing pilot security checks.

---

### Task 1: Fix the deterministic stale-load regression

**Files:** `src/pilot/simple/SimplePilotApp.test.tsx`

1. Change the injected clock to a local 09:00 constructor rather than a UTC instant.
2. Assert unlock first calls `list(date, 'frueh')`.
3. Run the existing stale Spät → Nacht test; confirm it now reaches the intended assertion and passes.
4. Commit with the rest of the slice, not separately.

### Task 2: Guard delayed mutation success

**Files:**
- Modify: `src/pilot/simple/SimplePilotApp.tsx`
- Test: `src/pilot/simple/SimplePilotApp.test.tsx`

1. Write a failing test: delay `create`, switch shifts, resolve it, and assert the created task/message is not inserted into the new view.
2. Confirm RED.
3. Capture `${date}:${shift}` before create/status/delete awaits. Apply successful view-local task/message updates only when the current selection still matches. Preserve global `UnauthorizedError` handling.
4. Run focused tests and confirm GREEN. Avoid a new abstraction unless all three mutations can reuse one tiny existing-pattern helper.

### Task 3: Tighten PIN marker and contact validation

**Files:**
- Modify: `api/pin.ts`, `api/_lib/validation.ts`
- Test: `api/pin.test.ts`, `api/_lib/validation.test.ts`, `api/ledger.test.ts`

1. Add RED endpoint tests for missing/wrong `X-Lobby-Ledger: 1` on `/api/pin`.
2. Add RED validation tests showing contact-like data is rejected from both task text and room/reference.
3. Require the already-sent marker and route both fields through one predicate. Add no dependency or rate limiter.
4. Confirm focused GREEN.

### Task 4: Full preview gate

Run:

```bash
npm test
npm run typecheck
npm run build
npm run build:pilot
npm run check:security
npm run test:e2e:pilot
```

Inspect the complete diff for credentials, real guest data, or production/deployment changes. Commit: `fix(pilot): harden stale responses and request validation`.

## Excluded

No production deploy, Vercel/Supabase mutation, secret, migration, auth redesign, guest PII feature, dependency, or broad UI work.
