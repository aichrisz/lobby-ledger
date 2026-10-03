# Local handover receipt implementation plan

> **For Hermes:** Use strict test-driven-development for this thin slice. GPT-6 Luna implements; GPT-6.1 Sol reviews and verifies.

**Goal:** Freeze one local handover and record receipt without completing tasks.

**Architecture:** Reuse buildBrief, Task validation, existing storage envelope and BriefView. Persist only the last snapshot and optional receipt timestamp in localStorage; no account, identity assertion, network or pilot changes.

**Tech Stack:** Existing TypeScript, Preact signals, Vitest, Playwright and CSS only.

## Approved design

Abel approved on 2026-10-04: one latest snapshot, local receipt button “Übergabe erhalten”, receipt time; task changes do not change the snapshot; a new snapshot replaces the previous one and resets receipt. This is not staff identity evidence. No task completion is implied.

Keep the live brief/export controls usable. Show the saved snapshot separately and clearly, using existing brief rendering where practical. Replacing a snapshot must be explicit. Receipt must target the visible saved snapshot and be idempotent; no receipt before a snapshot exists. Wipe removes it. Reload restores it. Save failure must not claim durable snapshot creation/receipt; preserve the previous durable snapshot if writing fails.

## Task 1 — Persist a validated snapshot

Files: src/domain/brief.ts (reuse Brief type), src/storage/store.ts and their existing tests. Add minimum snapshot model and validation at the storage boundary. Old schema data loads without losing tasks; malformed snapshot data does not discard valid tasks. Reuse parseTask and recompute brief structure rather than trusting stored counters if appropriate. No general history model.

Write tests for old storage, reload, malformed data, immutable task copies, wipe. Run focused npm test -- src/storage/store.test.ts src/domain/brief.test.ts and record RED before implementation, then GREEN.

## Task 2 — State operations

Files: src/app/state.ts and state.test.ts. Add snapshot creation and receipt using existing persistence, no task changes. Test snapshot isolation after task completion/deletion/addition, receipt timestamp/idempotence, replacement resets receipt, reload, wipe and rejected writes. Run npm test -- src/app/state.test.ts; record RED then GREEN.

## Task 3 — Visible receipt flow

Files: src/app/components/BriefView.tsx, BriefView.test.tsx, src/styles/app.css only if required, e2e/flows.spec.ts. Add explicit snapshot creation/replacement and local receipt controls with German copy explaining same-browser/local-only and no identity proof. Distinguish live brief from saved snapshot; print/copy/download semantics must remain clear. Reuse existing labels/styles, 44px targets, accessible status and focus.

Write component and browser regression before production UI code. Test capture → snapshot → receipt → task remains open → reload → replacement clears receipt; task changes do not change snapshot. Also verify empty snapshot, clear-data and save-error paths at nearest practical boundaries.

## Task 4 — Verification and review

npm test; npm run typecheck; npm run build; full Playwright mobile + desktop on a dedicated port (4187) with reuseExistingServer=false because 4173 belongs to another app. Do not stop or reuse that server. QA 390×844: no horizontal overflow, readable controls ≥44px, screenshot before and after receipt, console errors, accessibility and offline/no-egress preservation. Existing scratch config /root/.hermes/cache/scratch/lobby-ledger-baseline.config.mjs targets this checkout on 4187. No lint script exists; do not invent one.

Update README and CLAUDE.md narrowly to document new stored field/behavior. No dependency, pilot, workflow, credential or deploy changes. Existing npm audit reports 6 vulnerabilities (3 moderate, 3 high); disclose, do not widen scope silently.

Worker leaves uncommitted source changes and returns exact diff, RED/GREEN evidence, full verification and screenshot paths. Parent reviews/reruns before feature commit and push to feat/local-handover-receipt. Never push main (auto-deploy). Never push or modify pilot/v2-foundation.
