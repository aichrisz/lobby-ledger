# Simple Pilot Reliability Hardening — Design

**Date:** 2026-08-10  
**Status:** Ready for user review  
**Project:** Lobby Ledger

## Goal

Restore a deterministic green baseline and close the same stale-response class across simple-pilot mutations, while tightening two existing trust boundaries. No production deployment is included.

## Root cause

The failing stale-load test provides a UTC instant while production `shiftFor()` reads browser-local hours. On a positive-offset test host, the initial shift becomes `spaet`; the test's intentionally pending Spät response blocks unlock, leaving the PIN screen visible. This is a fixture bug, not evidence that the stale-list sequence guard is broken.

## Design

### 1. Deterministic fixture

Construct the test clock as local 09:00 and assert the initial unlock load requests `frueh`. Preserve the Spät → Nacht delayed-response regression unchanged.

### 2. Stale mutation guards

Before create, status, or delete requests, capture the selected `date + shift` key. Apply returned task/message state only when that key still matches after the await. `UnauthorizedError` still invalidates authentication globally because an expired session is not view-local.

Add one regression where a delayed create finishes after the user changes shift; it must not appear in the newly selected task set.

### 3. Existing trust boundaries

- Require the already-sent `X-Lobby-Ledger: 1` request marker on `/api/pin`.
- Reuse one existing contact-data predicate for task text and room/reference validation.
- Keep all PIN values, credentials, guest data, and real procedures out of source, tests, and docs.

## Expected files

- `src/pilot/simple/SimplePilotApp.tsx`
- `src/pilot/simple/SimplePilotApp.test.tsx`
- `api/pin.ts`, `api/pin.test.ts`
- `api/_lib/validation.ts`, `api/_lib/validation.test.ts`
- `api/ledger.test.ts`

## Verification

```bash
npm test -- src/pilot/simple/SimplePilotApp.test.tsx -t "ignores a stale task-set response after the selected shift changes again"
npm test
npm run typecheck
npm run build
npm run build:pilot
npm run check:security
npm run test:e2e:pilot
```

## Deployment and safety boundary

Local tests, builds, and preview artifacts only. No Vercel/Supabase change, migration, secret, real dataset, production deployment, or authorized PIN-flow claim.

## Explicitly excluded

No new auth system, backend, dependency, broad UI redesign, guest PII workflow, rate-limit infrastructure, or employer-specific procedure.
