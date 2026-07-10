# Lobby Ledger V2 — Team Handover Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks (20–25) should also invoke the frontend-design skill and stay inside the existing paper-ledger design constraints (project CLAUDE.md + MVP plan §5).

**Goal:** Turn Lobby Ledger into a shared team handover system for one hotel pilot: shared login, staff signatures (Kürzel), Europe/Berlin date/shift navigation, draft → published → acknowledged handovers, deliberate task carry-over, purpose-gated guest cases with 30-day retention and audit — backed by an EU-region Postgres with RLS.

**Architecture:** The existing local-first MVP stays untouched and keeps deploying to GitHub Pages as the public demo. The pilot is a second build target (`pilot.html` → `dist-pilot/`) in the same repo: pure TypeScript pilot domain logic in `src/pilot/domain/`, a thin typed API layer over `@supabase/supabase-js` in `src/pilot/api/`, and Preact UI in `src/pilot/app/`. All writes go through Postgres `SECURITY DEFINER` RPC functions that validate signatures, enforce lifecycle transitions, and write audit events in the same transaction. The `authenticated` role has SELECT-only table access under RLS; guest PII columns are unreadable except through a masked view and an audited reveal RPC. Retention runs as a `pg_cron` job.

**Tech Stack:** Existing stack (Vite, TypeScript strict, Preact + @preact/signals, plain CSS, Vitest, Playwright) plus: Supabase (managed Postgres 15+, GoTrue auth, PostgREST) in an EU region, `@supabase/supabase-js` (runtime dep), `supabase` CLI (dev dep) for local stack + migrations.

**Status:** Ready for execution after Abel approves. Date: 2026-07-10. Source spec: `docs/superpowers/specs/2026-07-10-team-handover-pilot-design.md` (approved concept).

**Execution ground rules (read first):**

- Execute on a branch (`pilot/v2-foundation` etc.), never directly on `main`. Do not push, change git remotes, or touch `.github/workflows/pages.yml` (the demo deploy) — the pilot gets its own new workflow file in Task 28.
- This plan *does* change application source and adds two dependencies when executed; that scope change is recorded in CLAUDE.md in Task 1, per CLAUDE.md's own rule.
- No secrets ever enter git, code, docs, or the client bundle: no database passwords, no `service_role` key, no access tokens. The only values the client build receives are the project URL and the **anon (publishable) key** via untracked `.env.local` / CI variables.
- No real guest data before every Phase 5 gate in Task 29 is signed off by the hotel.
- Strict TDD: failing test → minimal code → green → commit. `npm test && npm run typecheck` green before every commit. Database behavior is tested against the local Supabase stack (`npm run test:db`).

---

## 1. Scope

### In scope (per approved spec)

- One organization (one hotel), one shared email/password pilot account, usable from multiple devices.
- Staff signatures: `shortCode` (Kürzel, e.g. `AB`) + `displayName`, required for create/edit/publish/acknowledge/complete; admin flag on signatures.
- Date navigation in `Europe/Berlin`: previous days, today, future planned shifts, calendar selection. Shifts Früh/Spät/Nacht; departments Front Office/Housekeeping/Restaurant (existing enum values reused).
- Handover lifecycle draft → published → acknowledged; one handover per organization/date/source-shift/source-department/target-shift/target-department tuple; published core fields immutable; corrections as versioned amendments with reason.
- Tasks with author signature, completion signature, deliberate carry-over with visible provenance chain, capture templates (Technik, Zimmer prüfen, Rechnung/Beleg, Frühstück, Rückruf).
- Optional purpose-gated guest case per task: room reference, guest name, contact type/value, required purpose (`callback` | `arrival` | `complaint_follow_up` | `service_recovery` | `other` + note). Masked by default; audited reveal.
- 30-day retention after the last linked task completes; scheduled deletion job with health reporting; admin manual delete.
- Audit log for operational actions, never containing guest names/contact values/task text.
- Archive/search; non-PII pilot metrics export.
- EU-region hosting, TLS, RLS, backup/restore drill, private pilot deployment separate from GitHub Pages.

### Explicitly deferred (do not build)

Individual staff credentials/SSO, multi-hotel tenancy, PMS integration, email/SMS/WhatsApp/notifications, attachments, payment/ID/special-category data, AI summarisation, guest-facing access, offline sync of pilot data (pilot is online-first with explicit retry), realtime subscriptions, i18n framework.

### V1 demo invariants (must stay true)

- `npm run build` output and `#/` behavior unchanged; `pages.yml` untouched.
- Existing e2e suite (incl. zero-cross-origin privacy test) stays green for the demo build.
- The demo bundle contains no Supabase URL/key and makes no network requests (asserted in Task 27).

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Provider | Supabase, EU region (`eu-central-1`, Frankfurt) | Postgres + auth + RLS + `pg_cron` + PostgREST in one managed EU service; local dev stack via CLI; free tier fits a one-hotel pilot |
| Server logic | Postgres `SECURITY DEFINER` RPC functions | Mutation + audit insert are one transaction (spec §9: failed audit ⇒ failed mutation); no separate API service to host/secure |
| Client DB privileges | `authenticated` = SELECT-only under RLS; all writes via RPC | Matches spec architecture "no direct privileged database access"; lifecycle invariants can't be bypassed by a hand-crafted request |
| Guest PII access | Column grants deny base PII columns; masked view + audited `reveal_guest_case` RPC | "Masked by default" enforced in the database, not the UI |
| Coexistence with V1 | Second Vite entry `pilot.html`, second config `vite.pilot.config.ts` → `dist-pilot/` | Demo `npm run build` (input `index.html`) provably cannot include pilot code or env; separate CSP per entry |
| Enum values | Reuse existing TS string literals (`'frueh'`, `'front-office'`, …) as Postgres enum labels | Zero mapping layer; `src/domain/labels.ts` keeps working for German labels |
| Timezone | `Intl.DateTimeFormat` with `timeZone: 'Europe/Berlin'`; service date as `YYYY-MM-DD` string | No date library dependency; DST correct via ICU; covered by DST boundary tests |
| Service date convention | Nacht (22–06) belongs to the calendar date it **starts**; Berlin 00:00–05:59 resolves to *previous* day's Nacht | One unambiguous rule for boards, uniqueness, carry-over |
| Concurrency | Integer `version` column; RPCs take `p_expected_version`, raise SQLSTATE `P0409` on mismatch | Spec §9 optimistic conflict handling; UI reloads latest state |
| Error contract | Custom SQLSTATEs: `P0403` forbidden, `P0404` not found, `P0409` conflict, `P0422` validation | PostgREST surfaces SQLSTATE as `error.code`; TS maps to typed errors |
| Admin gating | `staff_signatures.is_admin`; RPCs check the *acting signature* | Honest pilot compromise: shared auth cannot prove identity; recorded as accepted risk in runbook |
| Pilot deploy | CI builds `dist-pilot` artifact (manual `workflow_dispatch`); operator uploads to the hotel-chosen EU HTTPS static host | No new hosting credentials in the repo/CI; region choice stays a documented operator decision |
| Retention schedule | `pg_cron` daily 03:15 Europe/Berlin-equivalent (01:15 UTC in summer — job runs on UTC; window chosen inside Nacht) | Managed, in-database, audited; failures recorded in `retention_runs` |
| Free-text PII defense | Client heuristic (`containsLikelyContact`) blocks + explains; DB CHECK constraint mirrors it | Two layers; spec §5 "no names/contacts in free text" gets teeth |

---

## 3. Prerequisites (P0 — manual, before Task 3; NO SECRETS IN GIT)

Operator (Abel) performs these once. Record outcomes in `docs/pilot/provisioning.md` (created in Task 1) — names and regions only, never keys or passwords.

- [ ] **P0.1 Supabase account + project.** Create project `lobby-ledger-pilot` in region **eu-central-1 (Frankfurt)**. Record: project ref, region, Postgres version, creation date. The database password goes into the operator password manager only.
- [ ] **P0.2 Auth configuration.** In Dashboard → Auth: disable public signups; create the single shared pilot user (email + strong password, stored in the operator password manager). Email confirmations off (shared mailbox not required). Record the user's email (it is not a secret) in `provisioning.md`.
- [ ] **P0.3 Enable `pg_cron`.** Dashboard → Database → Extensions → enable `pg_cron`. (Migration 0008 schedules the job; enabling the extension is a dashboard toggle on Supabase.)
- [ ] **P0.4 Collect client config.** From Dashboard → Settings → API: project URL (`https://<ref>.supabase.co`) and **anon** key. These go into untracked `.env.local` (Task 2) and later into CI as repository secrets `PILOT_SUPABASE_URL` / `PILOT_SUPABASE_ANON_KEY` (Task 28). Never commit them; never touch the `service_role` key from this repo.
- [ ] **P0.5 Local toolchain.** Install Docker and the Supabase CLI (`supabase --version` ≥ 2.x). The local stack's well-known demo keys (printed by `supabase start`) are public defaults, not secrets — only they may appear in test configs, and only via env, not hardcoded.
- [ ] **P0.6 Backups.** Confirm provider daily backups are on (default). The restore drill happens in Task 28 with synthetic data only.
- [ ] **P0.7 Hotel sign-offs started.** Share `docs/pilot/pilot-gates.md` (Task 29) with the hotel: controller/processor responsibility, retention confirmation, access matrix. Real guest data waits for these.

---

## 4. Database Spec (source of truth for Tasks 3–6, 12–16)

Migrations live in `supabase/migrations/NNNN_name.sql`, applied in order by `supabase db reset` (local) / `supabase db push` (linked project, operator-run). Conventions: all tables have `organization_id` + RLS; `authenticated` gets SELECT only (except denied PII columns); all writes via `SECURITY DEFINER` functions owned by `postgres` with `set search_path = public, pg_temp`; every state change writes `audit_events` in the same transaction.

### Tables

```text
organizations        id uuid PK, name, timezone 'Europe/Berlin', created_at
pilot_accounts       user_id uuid PK → auth.users, organization_id → organizations
staff_signatures     id uuid PK, organization_id, short_code ~ '^[A-ZÄÖÜ]{2,4}$',
                     display_name (1–40), is_admin bool, active bool, created_at
                     UNIQUE (organization_id, short_code)
handovers            id, organization_id, service_date date, source_shift, source_department,
                     target_shift, target_department, status draft|published|acknowledged,
                     version int, author_signature_id, published_by_signature_id?, published_at?,
                     acknowledged_by_signature_id?, acknowledged_at?, created_at, updated_at
                     UNIQUE (organization_id, service_date, source_shift, source_department,
                             target_shift, target_department)
handover_amendments  id, organization_id, handover_id, author_signature_id, reason, body, created_at
handover_tasks       id, organization_id, handover_id, text (1–200, no-contact CHECK),
                     room_reference (≤24), department, priority, status open|done|carried,
                     version int, created_by_signature_id, completed_by_signature_id?, completed_at?,
                     carry_over_from_task_id? → handover_tasks, guest_case_id? → guest_cases,
                     created_at, updated_at
guest_cases          id, organization_id, room_reference?, guest_name?, contact_type? phone|email,
                     contact_value?, purpose (enum, NOT NULL), purpose_note (required iff 'other'),
                     expires_at?, deleted_at?, created_by_signature_id, created_at, updated_at
audit_events         id bigint identity, organization_id, actor_signature_id?, entity_type,
                     entity_id uuid, action, occurred_at, metadata jsonb (PII-key CHECK)
retention_runs       id bigint identity, ran_at, cases_deleted int, ok bool, error text?
```

### Lifecycle + carry-over rules (enforced by RPCs)

- `create_or_get_draft` is idempotent per tuple: returns the existing handover for the tuple or creates a draft (source ≠ target tuple-wise; same-department Früh→Spät handovers are the normal case, so only *identical shift AND identical department* is rejected).
- `publish_handover`: draft → published only; requires ≥ 0 tasks (empty publish allowed — "nichts zu übergeben" is information); stamps `published_by/at`; bumps version.
- `acknowledge_handover`: published → acknowledged only; stamps `acknowledged_by/at`. Acknowledging does not rewrite task authorship.
- Task text/fields editable via `update_task` only while its handover is `draft`. After publish, corrections are `amend_handover` entries (reason + body, immutable).
- `complete_task`: allowed in any handover status; `open → done` only; stamps signature + time. If the task has a guest case and no other task in `('open')` references that case, set `expires_at = completed_at + interval '30 days'`.
- `carry_over_task`: source task `open`, source handover `published` or `acknowledged`, target handover `draft`, same org. Copies text/room/department/priority/guest_case_id into a new open task with `carry_over_from_task_id` = source id; source becomes `carried`. If a guest case comes along, its `expires_at` is cleared (case active again). Origin chain = follow `carry_over_from_task_id`.
- Guest case values (`guest_name`, `contact_type`, `contact_value`) may only be non-null because `purpose` is NOT NULL by schema; `other` additionally requires `purpose_note`.
- `run_guest_case_retention()`: for every case with `expires_at <= now()` and `deleted_at IS NULL` → null out name/contact fields, set `deleted_at = now()`, audit `guest_case.expired`; always append a `retention_runs` row (ok/error). `admin_delete_guest_case` does the same immediately for one case, audit `guest_case.admin_deleted`.

### Access model

| Object | authenticated may | everything else |
|---|---|---|
| All tables | SELECT own-org rows via RLS | INSERT/UPDATE/DELETE revoked → RPCs only |
| `guest_cases` | SELECT only non-PII columns (column grant) | `guest_name`, `contact_type`, `contact_value` unreadable directly |
| `guest_case_view` | SELECT masked name/contact + `has_contact` flag | full values only via `reveal_guest_case` RPC (audited) |
| `audit_events` | nothing directly | `list_audit_events` RPC, admin signature required |
| RPC functions | EXECUTE | each validates signature ∈ caller's org + active |

### Audit actions (fixed vocabulary)

`signature.created`, `signature.deactivated`, `handover.created`, `handover.published`, `handover.acknowledged`, `handover.amended`, `task.created`, `task.updated`, `task.completed`, `task.carried_over`, `guest_case.created`, `guest_case.revealed`, `guest_case.expired`, `guest_case.admin_deleted`. Metadata carries ids/counts/tuple fields only — a CHECK constraint rejects metadata containing keys `guest_name`, `contact_value`, `contact_type`, `text`.

---

## 5. Client Spec (source of truth for Tasks 8–11, 18–25)

### New paths

```
pilot.html                          pilot entry (own CSP incl. Supabase origin, noindex)
vite.pilot.config.ts                pilot build config → dist-pilot/
playwright.pilot.config.ts          pilot e2e (port 4174, requires local Supabase)
.env.example                        variable NAMES only, placeholder values
src/pilot/domain/berlin.ts          Berlin clock, service date, shift context, date math   [+ berlin.test.ts]
src/pilot/domain/signature.ts       Kürzel/display-name validation, contact heuristic      [+ signature.test.ts]
src/pilot/domain/handover.ts        lifecycle transitions, tuple identity, defaults        [+ handover.test.ts]
src/pilot/domain/privacy.ts         maskName/maskContact, retentionExpiry                  [+ privacy.test.ts]
src/pilot/domain/labels.ts          German labels for pilot enums (status, purpose)
src/pilot/api/client.ts             createPilotClient (env-checked supabase-js)
src/pilot/api/errors.ts             SQLSTATE → typed PilotError mapping                    [+ errors.test.ts]
src/pilot/api/session.ts            signIn/signOut/currentSession wrappers                 [+ session.test.ts]
src/pilot/api/rpc.ts                typed RPC + query wrappers                             [+ rpc.test.ts]
src/pilot/app/main.tsx              pilot entry module
src/pilot/app/PilotApp.tsx          session gate + hash routes                             [+ PilotApp.test.tsx]
src/pilot/app/SignIn.tsx            shared-account login form
src/pilot/app/SignatureBar.tsx      select/create Kürzel, persisted locally               [+ SignatureBar.test.tsx]
src/pilot/app/ShiftBoard.tsx        date navigation + 3 shift columns                      [+ ShiftBoard.test.tsx]
src/pilot/app/HandoverEditor.tsx    draft editor: capture, templates, task list            [+ HandoverEditor.test.tsx]
src/pilot/app/GuestCaseDrawer.tsx   purpose-first guest case form, masked display          [+ GuestCaseDrawer.test.tsx]
src/pilot/app/ReviewPublish.tsx     summary + publish                                      [+ ReviewPublish.test.tsx]
src/pilot/app/Inbox.tsx             published handovers for target context, acknowledge    [+ Inbox.test.tsx]
src/pilot/app/Archive.tsx           search: date/shift/department/room/signature/status    [+ Archive.test.tsx]
src/pilot/app/AdminPanel.tsx        signatures, audit list, retention health, manual delete[+ AdminPanel.test.tsx]
src/pilot/app/pilot.css             pilot-only styles on top of existing tokens
src/test/fake-supabase.ts           in-memory fake of the supabase client surface we use
supabase/config.toml                supabase CLI project config (created by `supabase init`)
supabase/migrations/0001–0008_*.sql
supabase/seed.sql                   local-only synthetic seed (org, account link, signatures)
supabase/tests/helpers.ts           local-stack clients (anon + service role from env)
supabase/tests/rls.test.ts          isolation + grant tests
supabase/tests/lifecycle.test.ts    RPC behavior tests
supabase/tests/retention.test.ts    retention + audit-PII tests
vitest.db.config.ts                 vitest config for supabase/tests (sequential)
scripts/check-pilot-security.mjs    bundle/secret regression checks
e2e/pilot/flows.spec.ts             two-signature publish→acknowledge→carry-over flow
e2e/pilot/privacy.spec.ts           egress allowlist, masking, noindex
e2e/pilot/a11y.spec.ts              axe on board/editor/drawer/inbox
.github/workflows/pilot-ci.yml      unit + typecheck + db tests on PR touching pilot paths
.github/workflows/pilot-build.yml   manual artifact build (no deploy credentials)
docs/pilot/provisioning.md          region/config record (no secrets)
docs/pilot/runbook.md               operations: devices, retention health, off-boarding
docs/pilot/restore-drill.md         synthetic backup/restore drill script + log
docs/pilot/pilot-gates.md           manual go-live gates checklist
```

Existing files reused, not modified unless a task says so: `src/domain/task.ts` (`Shift`, `Department`, `Priority`, `TEXT_MAX`, `REF_MAX`), `src/domain/labels.ts`, `src/styles/*` tokens.

### Signature persistence

Last-used signature id + shortCode + displayName in `localStorage["lobby-ledger.pilot.signature"]`. Staff names are staff operational data (accepted in spec), never guest data. The wipe control on the pilot admin panel clears it.

### Canonical German strings (pilot)

- Sign-in title: `Team-Anmeldung` · button `Anmelden` · error `Anmeldung fehlgeschlagen. Zugangsdaten prüfen.`
- Signature bar: `Wer arbeitet gerade? Kürzel wählen oder anlegen.` · create fields `Kürzel` / `Anzeigename` · hint `Kürzel = 2–4 Buchstaben, z. B. AB`
- Board title: `Übergaben` · date nav aria-labels `Vorheriger Tag` / `Nächster Tag` · today button `Heute`
- Status labels: draft `Entwurf`, published `Veröffentlicht`, acknowledged `Übernommen`
- Editor context line: `{Quelle-Schicht} {Quelle-Abteilung} → {Ziel-Schicht} {Ziel-Abteilung} · {Datum}`
- Capture placeholder: `Neue Aufgabe … (keine Gastnamen)` · contact block hint: `Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.`
- Templates: `Technik`, `Zimmer prüfen`, `Rechnung/Beleg`, `Frühstück`, `Rückruf`
- Publish: `Übergabe veröffentlichen` · after publish `Veröffentlicht um {Zeit} Uhr`
- Acknowledge: `Übernahme bestätigen` · afterwards the status label `Übernommen`
- Carry-over: `In nächste Übergabe übernehmen` · origin label `übertragen aus {Datum} {Schicht}`
- Guest case: `Gastbezug (optional)` · purpose label `Zweck (erforderlich)` · purposes `Rückruf` / `Anreise` / `Beschwerde-Nachverfolgung` / `Service-Wiedergutmachung` / `Sonstiges (mit Begründung)` · masked hint `Aus Datenschutzgründen ausgeblendet` · reveal `Kontakt anzeigen (wird protokolliert)` · expiry `Wird gelöscht am {Datum}`
- PII block: `Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.`
- Conflict: `Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.`
- Offline/retry: `Keine Verbindung. Änderung nicht gespeichert.` + `Erneut versuchen`
- Admin: `Verwaltung` · retention health ok `Löschlauf zuletzt erfolgreich: {Datum}` · failure `Löschlauf fehlgeschlagen – bitte prüfen.` · manual delete `Gastdaten sofort löschen` (two-step like V1 wipe)

### Pilot UX rules

Same design tokens, 390px-first, ≥44px targets, ≥16px inputs, dark theme during Nacht, reduced motion respected. No red alerts; conflicts and blocks are inline ochre hints. Never show a success state before the server confirmed (spec §9): mutating buttons render a `…` pending state and only update on RPC success.

---

## 6. Phase plan

| Phase | Tasks | Output |
|---|---|---|
| 1 Foundation | 1–7 | decision record, toolchain, schema migrations, RLS, db test harness |
| 2 Domain | 8–11 | pure Berlin/lifecycle/signature/privacy logic, fully unit-tested |
| 3 Server functions | 12–17 | all RPCs + retention job, db behavior tests |
| 4 Client | 18–25 | session, API layer, all pilot surfaces |
| 5 Hardening | 26–29 | e2e, security regression, CI/deploy artifact, docs + gates |

---

## Tasks

### Task 1: Decision record & CLAUDE.md scope update

**Files:**
- Modify: `CLAUDE.md` (project)
- Create: `docs/pilot/provisioning.md`

- [ ] **Step 1: Record the scope change in CLAUDE.md.** Append this section verbatim at the end of `CLAUDE.md`:

```markdown
## V2 team-handover pilot (approved 2026-07-10)

The spec `docs/superpowers/specs/2026-07-10-team-handover-pilot-design.md` and plan
`docs/plans/2026-07-10-team-handover-pilot-v2.md` supersede the local-only constraints
**for the pilot build only** (`pilot.html` → `dist-pilot/`, code under `src/pilot/`,
`supabase/`). Approved deviations, recorded per the rule above:

- Runtime dependency `@supabase/supabase-js`; dev dependency `supabase` (CLI).
- Network egress in the pilot build to exactly one origin: the EU Supabase project
  (config via untracked `.env.local` / CI variables; never committed).
- Purpose-gated guest data (name/contact) in `guest_cases` only — masked by default,
  audited reveal, 30-day post-completion retention. Never in free-text task fields.
- Shared pilot login; operational attribution via staff signatures (Kürzel).

Unchanged for the V1 demo: `index.html` build has no network egress, no PII fields,
`localStorage` only; the Pages demo must never connect to the pilot database.
```

- [ ] **Step 2: Create `docs/pilot/provisioning.md`** with the no-secrets record template:

```markdown
# Pilot provisioning record (no secrets in this file)

| Item | Value | Date | By |
|---|---|---|---|
| Provider | Supabase | 2026-07-__ | |
| Project name | lobby-ledger-pilot | | |
| Project ref | (public ref, not a secret) | | |
| Region | eu-central-1 (Frankfurt) | | |
| Postgres version | | | |
| pg_cron enabled | yes/no | | |
| Public signups | disabled | | |
| Shared pilot user email | | | |
| Daily backups | enabled (provider default) | | |

Secrets (database password, shared-account password, anon key, service_role key)
live in the operator password manager and CI secrets only. The service_role key is
never used by this repository.
```

- [ ] **Step 3: Verify** — `npm test && npm run typecheck` still green (docs-only change).
- [ ] **Step 4: Commit** — `git add CLAUDE.md docs/pilot/provisioning.md && git commit -m "docs: record V2 pilot scope decisions and provisioning template"`

---

### Task 2: Pilot toolchain — deps, env plumbing, second entry, scripts

**Files:**
- Modify: `package.json`, `.gitignore`, `tsconfig.json`
- Create: `pilot.html`, `vite.pilot.config.ts`, `.env.example`, `src/pilot/app/main.tsx`, `src/pilot/app/PilotApp.tsx` (stub), `src/pilot/app/PilotApp.test.tsx`

- [ ] **Step 1: Install dependencies**

```bash
npm i @supabase/supabase-js
npm i -D supabase
npx supabase init   # creates supabase/config.toml — commit it
```

- [ ] **Step 2: Env plumbing.** Append to `.gitignore`:

```
.env
.env.*
!.env.example
dist-pilot/
supabase/.temp/
```

Create `.env.example` (names only):

```bash
# Pilot client config — copy to .env.local and fill from Supabase Dashboard → Settings → API.
# The anon key is the publishable client key. NEVER put the service_role key here.
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

- [ ] **Step 3: Scripts.** In `package.json`, add to `"scripts"` (leave existing ones untouched):

```json
{
  "dev:pilot": "vite --config vite.pilot.config.ts --port 5174",
  "build:pilot": "tsc --noEmit && vite build --config vite.pilot.config.ts",
  "preview:pilot": "vite preview --config vite.pilot.config.ts --port 4174 --strictPort",
  "db:start": "supabase start",
  "db:reset": "supabase db reset",
  "test:db": "vitest run --config vitest.db.config.ts",
  "test:e2e:pilot": "playwright test --config playwright.pilot.config.ts"
}
```

- [ ] **Step 4: Write the failing test** — `src/pilot/app/PilotApp.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { PilotApp } from './PilotApp'

describe('PilotApp shell', () => {
  test('renders the pilot wordmark', () => {
    render(<PilotApp />)
    expect(screen.getByText('Lobby Ledger · Team')).toBeTruthy()
  })
})
```

- [ ] **Step 5: Verify RED** — `npm test` → FAIL (cannot resolve `./PilotApp`).

- [ ] **Step 6: Minimal implementation.**

`src/pilot/app/PilotApp.tsx`:

```tsx
export function PilotApp() {
  return (
    <div class="app">
      <header class="header">
        <span class="wordmark">Lobby Ledger · Team</span>
      </header>
      <main />
    </div>
  )
}
```

`src/pilot/app/main.tsx`:

```tsx
import { render } from 'preact'
import '@fontsource-variable/fraunces'
import '../../styles/tokens.css'
import '../../styles/base.css'
import '../../styles/app.css'
import './pilot.css'
import { PilotApp } from './PilotApp'

render(<PilotApp />, document.getElementById('app')!)
```

`src/pilot/app/pilot.css`: `/* pilot styles grow per task */`

`pilot.html` (note: `%SUPABASE_ORIGIN%` is replaced at build time; `noindex` because the pilot host must not be indexed):

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' %SUPABASE_ORIGIN%; base-uri 'none'; form-action 'none'; object-src 'none'" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#F6F3EC" />
    <title>Lobby Ledger · Team</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/pilot/app/main.tsx"></script>
  </body>
</html>
```

`vite.pilot.config.ts`:

```ts
import { defineConfig, loadEnv, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

function pilotCsp(supabaseUrl: string): Plugin {
  return {
    name: 'pilot-csp',
    transformIndexHtml(html) {
      return html.replace('%SUPABASE_ORIGIN%', new URL(supabaseUrl).origin)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const url = env.VITE_SUPABASE_URL
  if (!url || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Pilot build requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)')
  }
  return {
    base: './',
    plugins: [preact(), pilotCsp(url)],
    build: {
      outDir: 'dist-pilot',
      rollupOptions: { input: resolve(__dirname, 'pilot.html') },
    },
  }
})
```

`tsconfig.json`: extend `"include"` to `["src", "e2e", "supabase/tests", "vite.config.ts", "vite.pilot.config.ts", "playwright.config.ts", "playwright.pilot.config.ts", "vitest.db.config.ts", "scripts"]` and add `"types": ["vite/client", "node"]` (needs `npm i -D @types/node` if not present transitively — check `npm ls @types/node` first, install only if missing).

- [ ] **Step 7: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. `npm run build` (demo) still succeeds and `dist/` contains **no** `pilot` chunk (`ls dist/assets | grep -i pilot` → empty). With a filled `.env.local`, `npm run build:pilot` produces `dist-pilot/pilot.html` whose CSP contains the Supabase origin.
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(pilot): second build target with env-gated Supabase config"`

---

### Task 3: Migration 0001 — organizations, accounts, signatures, RLS core

**Files:**
- Create: `supabase/migrations/0001_core.sql`, `supabase/seed.sql`

- [ ] **Step 1: Write `supabase/migrations/0001_core.sql`**

```sql
-- 0001_core: organizations, pilot account mapping, staff signatures, RLS helpers.
create extension if not exists pgcrypto;

create type shift as enum ('frueh', 'spaet', 'nacht');
create type department as enum ('front-office', 'housekeeping', 'restaurant');
create type task_priority as enum ('normal', 'wichtig');
create type task_status as enum ('open', 'done', 'carried');
create type handover_status as enum ('draft', 'published', 'acknowledged');
create type guest_purpose as enum
  ('callback', 'arrival', 'complaint_follow_up', 'service_recovery', 'other');
create type contact_type as enum ('phone', 'email');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default now()
);

create table pilot_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id)
);

create table staff_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  short_code text not null check (short_code ~ '^[A-ZÄÖÜ]{2,4}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, short_code)
);

-- The org of the calling session. SECURITY DEFINER so it can read pilot_accounts
-- regardless of RLS; STABLE so policies can inline it.
create function current_org_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select organization_id from pilot_accounts where user_id = auth.uid()
$$;
revoke all on function current_org_id() from public;
grant execute on function current_org_id() to authenticated;

alter table organizations enable row level security;
alter table pilot_accounts enable row level security;
alter table staff_signatures enable row level security;

create policy org_select on organizations
  for select to authenticated using (id = current_org_id());
create policy account_select on pilot_accounts
  for select to authenticated using (user_id = auth.uid());
create policy signatures_select on staff_signatures
  for select to authenticated using (organization_id = current_org_id());

-- Writes happen only through SECURITY DEFINER functions:
revoke insert, update, delete on organizations, pilot_accounts, staff_signatures
  from authenticated, anon;
revoke all on organizations, pilot_accounts, staff_signatures from anon;
```

- [ ] **Step 2: Write `supabase/seed.sql`** (LOCAL ONLY — synthetic, no real persons; `supabase db reset` runs it against the local stack; it is never pushed to the hosted project, where the operator creates the org row + account link once via the SQL editor using the same statements minus the fake user):

```sql
-- Local development seed. Synthetic data only.
insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Pilothotel (lokal)');

-- Local shared user: created via supabase auth admin API in tests/e2e setup;
-- this maps any locally created user with this fixed id.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        instance_id, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', 'pilot@example.test',
        crypt('local-dev-only-password', gen_salt('bf')), now(), 'authenticated',
        'authenticated', '00000000-0000-0000-0000-000000000000',
        '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into pilot_accounts (user_id, organization_id)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000001');

insert into staff_signatures (organization_id, short_code, display_name, is_admin)
values ('00000000-0000-0000-0000-000000000001', 'AB', 'Pilotleitung A', true),
       ('00000000-0000-0000-0000-000000000001', 'LK', 'Rezeption L', false);
```

- [ ] **Step 3: Verify** — `npm run db:start` then `npm run db:reset` → applies 0001 + seed without error. `supabase db reset` output lists `0001_core.sql`. Sanity: `supabase status` shows the local API URL.
- [ ] **Step 4: Commit** — `git add supabase && git commit -m "feat(pilot-db): core schema — orgs, shared account mapping, signatures, RLS"`

---

### Task 4: Migration 0002 — handovers, tasks, amendments

**Files:**
- Create: `supabase/migrations/0002_handovers.sql`

- [ ] **Step 1: Write `supabase/migrations/0002_handovers.sql`**

```sql
-- 0002_handovers: handover + task + amendment tables, uniqueness, RLS (select-only).
create table handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  service_date date not null,
  source_shift shift not null,
  source_department department not null,
  target_shift shift not null,
  target_department department not null,
  status handover_status not null default 'draft',
  version integer not null default 1,
  author_signature_id uuid not null references staff_signatures (id),
  published_by_signature_id uuid references staff_signatures (id),
  published_at timestamptz,
  acknowledged_by_signature_id uuid references staff_signatures (id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exactly one handover per routing tuple (spec §4 rule 2)
  unique (organization_id, service_date, source_shift, source_department,
          target_shift, target_department),
  -- a handover must actually hand something over to a different context
  check (source_shift <> target_shift or source_department <> target_department),
  check (status <> 'published' or (published_by_signature_id is not null and published_at is not null)),
  check (status <> 'acknowledged' or (acknowledged_by_signature_id is not null and acknowledged_at is not null))
);

create table handover_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  handover_id uuid not null references handovers (id),
  author_signature_id uuid not null references staff_signatures (id),
  reason text not null check (length(trim(reason)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table handover_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  handover_id uuid not null references handovers (id),
  text text not null check (length(trim(text)) between 1 and 200),
  -- free text must not carry contact data: no emails, no long digit runs (spec §5)
  check (text !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'
     and text !~ '\+?\d[\d\s/.\-]{7,}\d'),
  room_reference text not null default '' check (length(room_reference) <= 24),
  department department not null,
  priority task_priority not null default 'normal',
  status task_status not null default 'open',
  version integer not null default 1,
  created_by_signature_id uuid not null references staff_signatures (id),
  completed_by_signature_id uuid references staff_signatures (id),
  completed_at timestamptz,
  carry_over_from_task_id uuid references handover_tasks (id),
  guest_case_id uuid, -- FK added in 0003 after guest_cases exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'done' or (completed_by_signature_id is not null and completed_at is not null))
);

create index handovers_board_idx on handovers (organization_id, service_date);
create index tasks_by_handover_idx on handover_tasks (organization_id, handover_id);
create index tasks_by_guest_case_idx on handover_tasks (guest_case_id) where guest_case_id is not null;

alter table handovers enable row level security;
alter table handover_amendments enable row level security;
alter table handover_tasks enable row level security;

create policy handovers_select on handovers
  for select to authenticated using (organization_id = current_org_id());
create policy amendments_select on handover_amendments
  for select to authenticated using (organization_id = current_org_id());
create policy tasks_select on handover_tasks
  for select to authenticated using (organization_id = current_org_id());

revoke insert, update, delete on handovers, handover_amendments, handover_tasks
  from authenticated, anon;
revoke all on handovers, handover_amendments, handover_tasks from anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` → both migrations apply. Quick constraint probe in `supabase db psql`-equivalent (`psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"` or Studio SQL editor): inserting a task with text `'Rückruf 0171 2345678'` as `postgres` fails the CHECK; `'Anreise ca. 23 Uhr'` passes; a second handover with an identical tuple violates the UNIQUE constraint.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0002_handovers.sql && git commit -m "feat(pilot-db): handover, task, amendment schema with tuple uniqueness"`

---

### Task 5: Migration 0003 — guest cases, column grants, masked view

**Files:**
- Create: `supabase/migrations/0003_guest_cases.sql`

- [ ] **Step 1: Write `supabase/migrations/0003_guest_cases.sql`**

```sql
-- 0003_guest_cases: purpose-gated PII, column-level denial, masked view.
create table guest_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  room_reference text not null default '' check (length(room_reference) <= 24),
  guest_name text check (guest_name is null or length(trim(guest_name)) between 1 and 80),
  contact_type contact_type,
  contact_value text check (contact_value is null or length(trim(contact_value)) between 1 and 120),
  purpose guest_purpose not null,
  purpose_note text check (purpose_note is null or length(trim(purpose_note)) between 1 and 120),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_by_signature_id uuid not null references staff_signatures (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'other' needs a concise operational reason (spec §5)
  check (purpose <> 'other' or purpose_note is not null),
  -- a contact value never floats without its type
  check ((contact_value is null) = (contact_type is null))
);

alter table handover_tasks
  add constraint tasks_guest_case_fk
  foreign key (guest_case_id) references guest_cases (id);

create index guest_cases_retention_idx on guest_cases (expires_at)
  where expires_at is not null and deleted_at is null;

alter table guest_cases enable row level security;
create policy guest_cases_select on guest_cases
  for select to authenticated using (organization_id = current_org_id());

revoke all on guest_cases from anon;
revoke insert, update, delete on guest_cases from authenticated;
-- Column-level denial: the client role cannot read PII columns directly.
revoke select on guest_cases from authenticated;
grant select (id, organization_id, room_reference, purpose, purpose_note,
              expires_at, deleted_at, created_by_signature_id, created_at, updated_at)
  on guest_cases to authenticated;

-- Masked view: what the UI shows by default. Owned by postgres (bypasses RLS),
-- therefore it must filter by org itself.
create view guest_case_view with (security_barrier) as
select
  gc.id,
  gc.organization_id,
  gc.room_reference,
  gc.purpose,
  gc.purpose_note,
  gc.expires_at,
  gc.deleted_at,
  gc.created_at,
  case
    when gc.deleted_at is not null then null
    when gc.guest_name is null then null
    else (
      select string_agg(upper(left(w, 1)) || '.', ' ')
      from regexp_split_to_table(trim(gc.guest_name), '\s+') as w
    )
  end as masked_name,
  case
    when gc.deleted_at is not null or gc.contact_value is null then null
    when gc.contact_type = 'phone' then '••• ' || right(gc.contact_value, 2)
    else left(gc.contact_value, 1) || '•••'
  end as masked_contact,
  (gc.deleted_at is null and gc.contact_value is not null) as has_contact,
  (gc.deleted_at is null and gc.guest_name is not null) as has_name
from guest_cases gc
where gc.organization_id = current_org_id();

grant select on guest_case_view to authenticated;
revoke all on guest_case_view from anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` applies cleanly. Probe (Studio SQL editor, as `postgres`): insert a case with `purpose='other'` and no note → CHECK fails; with `contact_value` but no `contact_type` → CHECK fails. RLS/grant behavior gets automated tests in Task 7.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0003_guest_cases.sql && git commit -m "feat(pilot-db): purpose-gated guest cases with masked view and column denial"`

---

### Task 6: Migration 0004 — audit events & retention runs

**Files:**
- Create: `supabase/migrations/0004_audit.sql`

- [ ] **Step 1: Write `supabase/migrations/0004_audit.sql`**

```sql
-- 0004_audit: append-only audit trail + retention run log. No PII by construction.
create table audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations (id),
  actor_signature_id uuid references staff_signatures (id),
  entity_type text not null check (entity_type in
    ('signature', 'handover', 'task', 'guest_case')),
  entity_id uuid not null,
  action text not null check (action in
    ('signature.created', 'signature.deactivated',
     'handover.created', 'handover.published', 'handover.acknowledged', 'handover.amended',
     'task.created', 'task.updated', 'task.completed', 'task.carried_over',
     'guest_case.created', 'guest_case.revealed', 'guest_case.expired',
     'guest_case.admin_deleted')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  -- audit must never replicate guest values or task text (spec §5)
  check (not (metadata ?| array['guest_name', 'contact_value', 'contact_type', 'text']))
);

create index audit_by_org_time_idx on audit_events (organization_id, occurred_at desc);

create table retention_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  cases_deleted integer not null default 0,
  ok boolean not null,
  error text
);

alter table audit_events enable row level security;
alter table retention_runs enable row level security;
-- No direct client access at all; reads go through admin-gated RPCs (0005/0006).
revoke all on audit_events, retention_runs from authenticated, anon;

-- Single audit write path for every RPC (same transaction as the mutation).
create function write_audit(
  p_org uuid, p_actor uuid, p_entity_type text, p_entity_id uuid,
  p_action text, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into audit_events (organization_id, actor_signature_id, entity_type, entity_id, action, metadata)
  values (p_org, p_actor, p_entity_type, p_entity_id, p_action, coalesce(p_metadata, '{}'::jsonb))
$$;
revoke all on function write_audit(uuid, uuid, text, uuid, text, jsonb) from public, authenticated, anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` applies. Probe as `postgres`: inserting an audit row with `metadata = '{"guest_name":"x"}'` fails the CHECK; `'{"count":3}'` passes.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0004_audit.sql && git commit -m "feat(pilot-db): append-only audit and retention-run log with PII-key guard"`

---

### Task 7: DB test harness + RLS isolation tests

**Files:**
- Create: `vitest.db.config.ts`, `supabase/tests/helpers.ts`, `supabase/tests/rls.test.ts`

These tests run only against the **local** stack (`npm run db:start` first). They use the local service-role key to arrange fixtures (second org, users) and the anon key + password login to act as the client. Local keys come from `supabase status`; export them once per shell:

```bash
eval "$(supabase status -o env | sed 's/^/export /')"
# provides SUPABASE_URL? no — the CLI exports API_URL, ANON_KEY, SERVICE_ROLE_KEY
```

- [ ] **Step 1: Write `vitest.db.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    fileParallelism: false, // shared database state; run files sequentially
    testTimeout: 20_000,
  },
})
```

- [ ] **Step 2: Write `supabase/tests/helpers.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.API_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.ANON_KEY
const serviceKey = process.env.SERVICE_ROLE_KEY
if (!anonKey || !serviceKey) {
  throw new Error('Run `npm run db:start` and export local keys: eval "$(supabase status -o env | sed \'s/^/export /\')"')
}

export const ORG_A = '00000000-0000-0000-0000-000000000001' // seeded
export const ORG_B = '00000000-0000-0000-0000-000000000002' // created below

/** Service-role client: local-only fixture arrangement. Never used in app code. */
export function admin(): SupabaseClient {
  return createClient(url, serviceKey!, { auth: { persistSession: false } })
}

export async function anonSignedIn(email = 'pilot@example.test', password = 'local-dev-only-password'): Promise<SupabaseClient> {
  const c = createClient(url, anonKey!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return c
}

/** Second org + its own shared user, to prove isolation. Idempotent. */
export async function ensureOrgB(): Promise<void> {
  const a = admin()
  await a.from('organizations').upsert({ id: ORG_B, name: 'Anderes Hotel (lokal)' })
  const { data: created, error } = await a.auth.admin.createUser({
    email: 'other@example.test', password: 'local-dev-only-password', email_confirm: true,
  })
  const userId = created?.user?.id
    ?? (await a.auth.admin.listUsers()).data.users.find((u) => u.email === 'other@example.test')?.id
  if (!userId && error) throw error
  await a.from('pilot_accounts').upsert({ user_id: userId!, organization_id: ORG_B })
  await a.from('staff_signatures').upsert(
    { organization_id: ORG_B, short_code: 'XY', display_name: 'Fremdes Kürzel' },
    { onConflict: 'organization_id,short_code' },
  )
}

export async function signatureId(c: SupabaseClient, shortCode: string): Promise<string> {
  const { data, error } = await c.from('staff_signatures').select('id').eq('short_code', shortCode).single()
  if (error) throw error
  return data.id
}
```

- [ ] **Step 3: Write the failing tests** — `supabase/tests/rls.test.ts`:

```ts
import { beforeAll, describe, expect, test } from 'vitest'
import { admin, anonSignedIn, ensureOrgB, ORG_A, ORG_B } from './helpers'

beforeAll(async () => {
  await ensureOrgB()
})

describe('RLS isolation', () => {
  test('unauthenticated requests read nothing', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const c = createClient(process.env.API_URL ?? 'http://127.0.0.1:54321', process.env.ANON_KEY!)
    const { data } = await c.from('staff_signatures').select('id')
    expect(data).toEqual([]) // RLS filters everything for anon
  })

  test('org A session sees only org A signatures', async () => {
    const c = await anonSignedIn()
    const { data, error } = await c.from('staff_signatures').select('organization_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.organization_id === ORG_A)).toBe(true)
  })

  test('org B session cannot see org A rows', async () => {
    const c = await anonSignedIn('other@example.test')
    const { data } = await c.from('staff_signatures').select('organization_id')
    expect(data!.every((r) => r.organization_id === ORG_B)).toBe(true)
  })

  test('direct table writes are denied for the client role', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('staff_signatures')
      .insert({ organization_id: ORG_A, short_code: 'ZZ', display_name: 'Nope' })
    expect(error).not.toBeNull() // permission denied: writes go through RPCs only
  })

  test('guest case PII columns are unreadable directly', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('guest_cases').select('guest_name')
    expect(error).not.toBeNull() // column privilege denied
    const ok = await c.from('guest_cases').select('id, purpose, expires_at')
    expect(ok.error).toBeNull()
  })

  test('audit_events are not directly readable', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('audit_events').select('id')
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 4: Verify RED→GREEN** — `npm run db:reset && npm run test:db`. If any test fails, the migration (not the test) is wrong — fix the SQL, `db:reset`, rerun until green. (RED here is expected only if migrations 3–6 had gaps; the point of this task is executable proof of the access model.)
- [ ] **Step 5: Verify demo untouched** — `npm test && npm run typecheck` green (db tests are excluded from `npm test` by the separate config).
- [ ] **Step 6: Commit** — `git add vitest.db.config.ts supabase/tests && git commit -m "test(pilot-db): RLS isolation, write denial, PII column denial"`

---

### Task 8: Domain — Europe/Berlin service dates & shift context

**Files:**
- Create: `src/pilot/domain/berlin.ts`
- Test: `src/pilot/domain/berlin.test.ts`

All inputs are real instants (`Date`); all outputs are Berlin wall-clock facts. Tests use UTC ISO strings so they pass in any host timezone (CI runs UTC, dev machines vary).

- [ ] **Step 1: Write the failing tests** — `src/pilot/domain/berlin.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  addDays, formatServiceDate, nextTargetContext, serviceContext,
} from './berlin'

const at = (iso: string) => new Date(iso)

describe('serviceContext (CEST, UTC+2 in July)', () => {
  test.each([
    ['2026-07-10T04:00:00Z', { serviceDate: '2026-07-10', shift: 'frueh' }],  // 06:00 Berlin
    ['2026-07-10T11:59:00Z', { serviceDate: '2026-07-10', shift: 'frueh' }],  // 13:59
    ['2026-07-10T12:00:00Z', { serviceDate: '2026-07-10', shift: 'spaet' }],  // 14:00
    ['2026-07-10T20:00:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 22:00
    ['2026-07-10T23:30:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 01:30 on the 11th → previous day's Nacht
    ['2026-07-11T03:59:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 05:59
    ['2026-07-11T04:00:00Z', { serviceDate: '2026-07-11', shift: 'frueh' }],  // 06:00
  ])('%s → %o', (iso, expected) => {
    expect(serviceContext(at(iso))).toEqual(expected)
  })

  test('winter time (CET, UTC+1): 05:30 Berlin on Jan 10 is still Jan 9 Nacht', () => {
    expect(serviceContext(at('2026-01-10T04:30:00Z')))
      .toEqual({ serviceDate: '2026-01-09', shift: 'nacht' })
  })

  test('DST start night (2026-03-29, 02:00→03:00): whole night stays Nacht of the 28th', () => {
    expect(serviceContext(at('2026-03-29T00:30:00Z'))) // 01:30 CET
      .toEqual({ serviceDate: '2026-03-28', shift: 'nacht' })
    expect(serviceContext(at('2026-03-29T01:30:00Z'))) // 03:30 CEST (02:xx never exists)
      .toEqual({ serviceDate: '2026-03-28', shift: 'nacht' })
    expect(serviceContext(at('2026-03-29T04:00:00Z'))) // 06:00 CEST
      .toEqual({ serviceDate: '2026-03-29', shift: 'frueh' })
  })

  test('DST end night (2026-10-25, 03:00→02:00): repeated 02:xx hour stays Nacht of the 24th', () => {
    expect(serviceContext(at('2026-10-25T00:30:00Z'))) // 02:30 CEST (first pass)
      .toEqual({ serviceDate: '2026-10-24', shift: 'nacht' })
    expect(serviceContext(at('2026-10-25T01:30:00Z'))) // 02:30 CET (second pass)
      .toEqual({ serviceDate: '2026-10-24', shift: 'nacht' })
    expect(serviceContext(at('2026-10-25T05:00:00Z'))) // 06:00 CET
      .toEqual({ serviceDate: '2026-10-25', shift: 'frueh' })
  })
})

describe('addDays (pure calendar math, month/year rollover)', () => {
  test.each([
    ['2026-07-10', 1, '2026-07-11'],
    ['2026-07-31', 1, '2026-08-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-02-28', 1, '2026-03-01'],
  ])('%s %i → %s', (d, n, out) => expect(addDays(d, n)).toBe(out))
})

describe('nextTargetContext (default receiving context for a source)', () => {
  test('frueh hands to spaet same date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'frueh' }))
      .toEqual({ serviceDate: '2026-07-10', shift: 'spaet' })
  })
  test('spaet hands to nacht same date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'spaet' }))
      .toEqual({ serviceDate: '2026-07-10', shift: 'nacht' })
  })
  test('nacht hands to frueh of the NEXT date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'nacht' }))
      .toEqual({ serviceDate: '2026-07-11', shift: 'frueh' })
  })
})

describe('formatServiceDate', () => {
  test('German short weekday + dotted date', () => {
    expect(formatServiceDate('2026-07-08')).toBe('Mi, 08.07.2026')
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./berlin`).

- [ ] **Step 3: Implement `src/pilot/domain/berlin.ts`**

```ts
import type { Shift } from '../../domain/task'

export interface ShiftContext {
  serviceDate: string // 'YYYY-MM-DD' in Europe/Berlin
  shift: Shift
}

const BERLIN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Berlin wall clock for an instant: calendar date string + hour. */
export function berlinClock(now: Date): { date: string; hour: number; minute: number } {
  const p: Record<string, string> = {}
  for (const part of BERLIN.formatToParts(now)) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
}

/**
 * Service-date convention: Nacht (22:00–06:00) belongs to the calendar date it
 * STARTS on. Berlin 00:00–05:59 therefore resolves to the previous day's Nacht.
 */
export function serviceContext(now: Date): ShiftContext {
  const c = berlinClock(now)
  if (c.hour >= 6 && c.hour < 14) return { serviceDate: c.date, shift: 'frueh' }
  if (c.hour >= 14 && c.hour < 22) return { serviceDate: c.date, shift: 'spaet' }
  return { serviceDate: c.hour >= 22 ? c.date : addDays(c.date, -1), shift: 'nacht' }
}

export function addDays(serviceDate: string, delta: number): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

/** Default receiving context: shift rotation; Nacht rolls to the next date. */
export function nextTargetContext(ctx: ShiftContext): ShiftContext {
  if (ctx.shift === 'frueh') return { serviceDate: ctx.serviceDate, shift: 'spaet' }
  if (ctx.shift === 'spaet') return { serviceDate: ctx.serviceDate, shift: 'nacht' }
  return { serviceDate: addDays(ctx.serviceDate, 1), shift: 'frueh' }
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
const pad = (v: number) => String(v).padStart(2, '0')

export function formatServiceDate(serviceDate: string): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]
  return `${weekday}, ${pad(d!)}.${pad(m!)}.${y}`
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(pilot): Berlin service-date and shift-context domain logic"`

---

### Task 9: Domain — signature validation & contact heuristic

**Files:**
- Create: `src/pilot/domain/signature.ts`
- Test: `src/pilot/domain/signature.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/pilot/domain/signature.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { containsLikelyContact, parseSignatureInput } from './signature'

describe('parseSignatureInput', () => {
  test('uppercases and trims a valid Kürzel + name', () => {
    expect(parseSignatureInput({ shortCode: ' ab ', displayName: '  Rezeption A ' }))
      .toEqual({ shortCode: 'AB', displayName: 'Rezeption A' })
  })
  test('accepts umlauts, 2–4 letters', () => {
    expect(parseSignatureInput({ shortCode: 'ÖZ', displayName: 'Ö' })).not.toBeNull()
    expect(parseSignatureInput({ shortCode: 'ABCD', displayName: 'X' })).not.toBeNull()
  })
  test.each([
    ['too short', 'A', 'Name'],
    ['too long', 'ABCDE', 'Name'],
    ['digits', 'A1', 'Name'],
    ['empty name', 'AB', '   '],
    ['overlong name', 'AB', 'x'.repeat(41)],
  ])('rejects %s', (_n, shortCode, displayName) => {
    expect(parseSignatureInput({ shortCode, displayName })).toBeNull()
  })
})

describe('containsLikelyContact (free-text PII tripwire)', () => {
  test.each([
    'Bitte anna.schmidt@web.de zurückrufen',
    'Rückruf +49 171 2345678',
    'Nummer 0171/2345678 hinterlegt',
  ])('flags %s', (text) => expect(containsLikelyContact(text)).toBe(true))

  test.each([
    'Taxi 06:30 bestellt',
    'Zimmer 204 Wasserkocher defekt',
    'Rechnung 2026-4711 klären',
    'Anreise ca. 23 Uhr',
  ])('passes %s', (text) => expect(containsLikelyContact(text)).toBe(false))
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./signature`).

- [ ] **Step 3: Implement `src/pilot/domain/signature.ts`**

```ts
export const SHORT_CODE_PATTERN = /^[A-ZÄÖÜ]{2,4}$/
export const DISPLAY_NAME_MAX = 40

export interface SignatureInput { shortCode: string; displayName: string }

export function parseSignatureInput(raw: SignatureInput): SignatureInput | null {
  const shortCode = raw.shortCode.trim().toUpperCase()
  const displayName = raw.displayName.trim()
  if (!SHORT_CODE_PATTERN.test(shortCode)) return null
  if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) return null
  return { shortCode, displayName }
}

/**
 * Mirrors the DB CHECK on handover_tasks.text: emails and 9+-digit runs
 * (with separators) are contact data and belong in a purpose-gated guest case.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/
const PHONE = /\+?\d[\d\s/.\-]{7,}\d/

export function containsLikelyContact(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text)
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(pilot): signature validation and free-text contact tripwire"`

---

### Task 10: Domain — handover lifecycle & tuple identity

**Files:**
- Create: `src/pilot/domain/handover.ts`, `src/pilot/domain/labels.ts`
- Test: `src/pilot/domain/handover.test.ts`

The database is authoritative; this module gives the UI the same rules synchronously (button enablement, validation before a round-trip) and is the single place the tuple/lifecycle vocabulary lives client-side.

- [ ] **Step 1: Write the failing tests** — `src/pilot/domain/handover.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { canTransition, isValidTuple, tupleKey } from './handover'

describe('canTransition', () => {
  test.each([
    ['draft', 'published', true],
    ['published', 'acknowledged', true],
    ['draft', 'acknowledged', false],
    ['published', 'draft', false],
    ['acknowledged', 'published', false],
    ['acknowledged', 'acknowledged', false],
  ] as const)('%s → %s = %s', (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok)
  })
})

describe('isValidTuple', () => {
  const base = {
    serviceDate: '2026-07-10',
    sourceShift: 'frueh', sourceDepartment: 'front-office',
    targetShift: 'spaet', targetDepartment: 'front-office',
  } as const
  test('normal shift-to-next-shift same department is valid', () => {
    expect(isValidTuple(base)).toBe(true)
  })
  test('cross-department same shift is valid', () => {
    expect(isValidTuple({ ...base, targetShift: 'frueh', targetDepartment: 'housekeeping' })).toBe(true)
  })
  test('identical shift AND department is not a handover', () => {
    expect(isValidTuple({ ...base, targetShift: 'frueh' })).toBe(false)
  })
})

describe('tupleKey', () => {
  test('stable key for board grouping', () => {
    expect(tupleKey({
      serviceDate: '2026-07-10',
      sourceShift: 'frueh', sourceDepartment: 'front-office',
      targetShift: 'spaet', targetDepartment: 'front-office',
    })).toBe('2026-07-10|frueh|front-office|spaet|front-office')
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./handover`).

- [ ] **Step 3: Implement `src/pilot/domain/handover.ts`**

```ts
import type { Department, Shift } from '../../domain/task'

export const HANDOVER_STATUSES = ['draft', 'published', 'acknowledged'] as const
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number]

export const TASK_STATUSES = ['open', 'done', 'carried'] as const
export type PilotTaskStatus = (typeof TASK_STATUSES)[number]

export const GUEST_PURPOSES = [
  'callback', 'arrival', 'complaint_follow_up', 'service_recovery', 'other',
] as const
export type GuestPurpose = (typeof GUEST_PURPOSES)[number]

export interface HandoverTuple {
  serviceDate: string
  sourceShift: Shift
  sourceDepartment: Department
  targetShift: Shift
  targetDepartment: Department
}

const TRANSITIONS: Record<HandoverStatus, HandoverStatus[]> = {
  draft: ['published'],
  published: ['acknowledged'],
  acknowledged: [],
}

export function canTransition(from: HandoverStatus, to: HandoverStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** A handover must address a different shift or a different department. */
export function isValidTuple(t: HandoverTuple): boolean {
  return t.sourceShift !== t.targetShift || t.sourceDepartment !== t.targetDepartment
}

export function tupleKey(t: HandoverTuple): string {
  return [t.serviceDate, t.sourceShift, t.sourceDepartment, t.targetShift, t.targetDepartment].join('|')
}
```

`src/pilot/domain/labels.ts`:

```ts
import type { GuestPurpose, HandoverStatus, PilotTaskStatus } from './handover'

export const HANDOVER_STATUS_LABELS: Record<HandoverStatus, string> = {
  draft: 'Entwurf', published: 'Veröffentlicht', acknowledged: 'Übernommen',
}
export const PILOT_TASK_STATUS_LABELS: Record<PilotTaskStatus, string> = {
  open: 'Offen', done: 'Erledigt', carried: 'Übertragen',
}
export const PURPOSE_LABELS: Record<GuestPurpose, string> = {
  callback: 'Rückruf',
  arrival: 'Anreise',
  complaint_follow_up: 'Beschwerde-Nachverfolgung',
  service_recovery: 'Service-Wiedergutmachung',
  other: 'Sonstiges (mit Begründung)',
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(pilot): handover lifecycle, tuple identity, German labels"`

---

### Task 11: Domain — masking & retention math

**Files:**
- Create: `src/pilot/domain/privacy.ts`
- Test: `src/pilot/domain/privacy.test.ts`

These mirror the SQL masking in `guest_case_view` (Task 5) so unit tests document the exact masking contract; the UI renders server-masked values but uses these for optimistic previews and for the expiry label.

- [ ] **Step 1: Write the failing tests** — `src/pilot/domain/privacy.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { maskContact, maskName, retentionExpiry, RETENTION_DAYS } from './privacy'

describe('maskName', () => {
  test('initials with dots', () => {
    expect(maskName('Anna Schmidt')).toBe('A. S.')
    expect(maskName('  anna  ')).toBe('A.')
  })
})

describe('maskContact', () => {
  test('phone keeps last two digits', () => {
    expect(maskContact('phone', '+49 171 2345678')).toBe('••• 78')
  })
  test('email keeps first character only', () => {
    expect(maskContact('email', 'anna@web.de')).toBe('a•••')
  })
})

describe('retentionExpiry', () => {
  test(`is completion + ${RETENTION_DAYS} days`, () => {
    expect(retentionExpiry('2026-07-10T14:00:00.000Z')).toBe('2026-08-09T14:00:00.000Z')
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./privacy`).

- [ ] **Step 3: Implement `src/pilot/domain/privacy.ts`**

```ts
export const RETENTION_DAYS = 30

export function maskName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)
    .map((w) => `${w[0]!.toUpperCase()}.`).join(' ')
}

export function maskContact(type: 'phone' | 'email', value: string): string {
  return type === 'phone' ? `••• ${value.slice(-2)}` : `${value[0] ?? ''}•••`
}

export function retentionExpiry(completedAtIso: string): string {
  return new Date(Date.parse(completedAtIso) + RETENTION_DAYS * 86_400_000).toISOString()
}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(pilot): masking and 30-day retention domain rules"`

---

### Task 12: Migration 0005 — signature & draft-editing RPCs

**Files:**
- Create: `supabase/migrations/0005_workflow_rpcs.sql`

Error contract (used by every RPC, mapped in Task 19): `P0403` forbidden, `P0404` not found, `P0409` version conflict, `P0422` validation/lifecycle violation. Constraint violations (`23xxx`) also map to validation client-side.

- [ ] **Step 1: Write `supabase/migrations/0005_workflow_rpcs.sql`**

```sql
-- 0005_workflow_rpcs: signature bootstrap, draft creation, task capture/edit.

-- Capture templates (spec §8) — recorded for pilot metrics, never required.
alter table handover_tasks add column template text
  check (template is null or template in
    ('technik', 'zimmer_pruefen', 'rechnung_beleg', 'fruehstueck', 'rueckruf'));

-- Validates the acting signature: caller's org, active. Runs as owner.
create function assert_signature(p_signature_id uuid) returns staff_signatures
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures;
  org uuid := current_org_id();
begin
  if org is null then
    raise exception 'no pilot account for session' using errcode = 'P0403';
  end if;
  select * into sig from staff_signatures
   where id = p_signature_id and organization_id = org and active;
  if not found then
    raise exception 'signature missing, foreign, or inactive' using errcode = 'P0403';
  end if;
  return sig;
end $$;
revoke all on function assert_signature(uuid) from public, authenticated, anon;

-- Select-or-create the caller's Kürzel. Audited only on creation.
create function ensure_signature(p_short_code text, p_display_name text)
returns staff_signatures
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  org uuid := current_org_id();
  code text := upper(trim(p_short_code));
  name text := trim(p_display_name);
  sig staff_signatures;
begin
  if org is null then
    raise exception 'no pilot account for session' using errcode = 'P0403';
  end if;
  if code !~ '^[A-ZÄÖÜ]{2,4}$' or length(name) not between 1 and 40 then
    raise exception 'invalid short code or display name' using errcode = 'P0422';
  end if;
  select * into sig from staff_signatures
   where organization_id = org and short_code = code;
  if found then
    if not sig.active then
      raise exception 'signature was deactivated by the administrator' using errcode = 'P0422';
    end if;
    return sig;
  end if;
  insert into staff_signatures (organization_id, short_code, display_name)
  values (org, code, name) returning * into sig;
  perform write_audit(org, sig.id, 'signature', sig.id, 'signature.created',
                      jsonb_build_object('short_code', code));
  return sig;
end $$;
grant execute on function ensure_signature(text, text) to authenticated;
revoke all on function ensure_signature(text, text) from public, anon;

-- Idempotent per tuple: returns the existing handover or creates a draft.
create function create_or_get_draft(
  p_service_date date, p_source_shift shift, p_source_department department,
  p_target_shift shift, p_target_department department, p_signature_id uuid
) returns handovers
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
begin
  if p_source_shift = p_target_shift and p_source_department = p_target_department then
    raise exception 'handover must target a different shift or department' using errcode = 'P0422';
  end if;
  select * into h from handovers
   where organization_id = sig.organization_id and service_date = p_service_date
     and source_shift = p_source_shift and source_department = p_source_department
     and target_shift = p_target_shift and target_department = p_target_department;
  if found then return h; end if;
  begin
    insert into handovers (organization_id, service_date, source_shift, source_department,
                           target_shift, target_department, author_signature_id)
    values (sig.organization_id, p_service_date, p_source_shift, p_source_department,
            p_target_shift, p_target_department, sig.id)
    returning * into h;
  exception when unique_violation then
    select * into h from handovers
     where organization_id = sig.organization_id and service_date = p_service_date
       and source_shift = p_source_shift and source_department = p_source_department
       and target_shift = p_target_shift and target_department = p_target_department;
    return h;
  end;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.created',
                      jsonb_build_object('service_date', p_service_date,
                                         'source_shift', p_source_shift,
                                         'target_shift', p_target_shift));
  return h;
end $$;
grant execute on function create_or_get_draft(date, shift, department, shift, department, uuid) to authenticated;
revoke all on function create_or_get_draft(date, shift, department, shift, department, uuid) from public, anon;

-- Capture a task into a DRAFT handover. Optional guest case link.
create function add_task(
  p_handover_id uuid, p_signature_id uuid, p_text text,
  p_room_reference text default '', p_department department default 'front-office',
  p_priority task_priority default 'normal', p_guest_case_id uuid default null,
  p_template text default null
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
  t handover_tasks;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status <> 'draft' then
    raise exception 'tasks can only be added to a draft; use amendments after publish'
      using errcode = 'P0422';
  end if;
  if p_guest_case_id is not null then
    -- case must exist in-org and be undeleted; it becomes active again
    update guest_cases set expires_at = null, updated_at = now()
     where id = p_guest_case_id and organization_id = sig.organization_id and deleted_at is null;
    if not found then raise exception 'guest case not found' using errcode = 'P0404'; end if;
  end if;
  insert into handover_tasks (organization_id, handover_id, text, room_reference,
                              department, priority, created_by_signature_id,
                              guest_case_id, template)
  values (sig.organization_id, p_handover_id, trim(p_text), trim(coalesce(p_room_reference, '')),
          p_department, p_priority, sig.id, p_guest_case_id, p_template)
  returning * into t;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.created',
                      jsonb_build_object('handover_id', p_handover_id,
                                         'has_guest_case', p_guest_case_id is not null));
  return t;
end $$;
grant execute on function add_task(uuid, uuid, text, text, department, task_priority, uuid, text) to authenticated;
revoke all on function add_task(uuid, uuid, text, text, department, task_priority, uuid, text) from public, anon;

-- Edit task fields while the handover is still a draft. Optimistic version.
create function update_task(
  p_task_id uuid, p_signature_id uuid, p_expected_version integer,
  p_text text, p_room_reference text, p_department department, p_priority task_priority
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  t handover_tasks;
  h_status handover_status;
begin
  select * into t from handover_tasks
   where id = p_task_id and organization_id = sig.organization_id
   for update;
  if not found then raise exception 'task not found' using errcode = 'P0404'; end if;
  select status into h_status from handovers where id = t.handover_id;
  if h_status <> 'draft' then
    raise exception 'published handovers are corrected via amendments' using errcode = 'P0422';
  end if;
  if t.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'P0409';
  end if;
  update handover_tasks
     set text = trim(p_text), room_reference = trim(coalesce(p_room_reference, '')),
         department = p_department, priority = p_priority,
         version = version + 1, updated_at = now()
   where id = p_task_id
   returning * into t;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.updated',
                      jsonb_build_object('version', t.version));
  return t;
end $$;
grant execute on function update_task(uuid, uuid, integer, text, text, department, task_priority) to authenticated;
revoke all on function update_task(uuid, uuid, integer, text, text, department, task_priority) from public, anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` applies. `npm run test:db` still green (Task 7 suite).
- [ ] **Step 3: Commit** — `git add supabase/migrations/0005_workflow_rpcs.sql && git commit -m "feat(pilot-db): signature bootstrap and draft-editing RPCs with audit"`

---

### Task 13: Migration 0006 — publish, acknowledge, amend, complete, carry-over

**Files:**
- Create: `supabase/migrations/0006_lifecycle_rpcs.sql`

- [ ] **Step 1: Write `supabase/migrations/0006_lifecycle_rpcs.sql`**

```sql
-- 0006_lifecycle_rpcs: state transitions. Audit write shares the transaction —
-- if audit fails, the mutation fails (spec §9).

create function publish_handover(
  p_handover_id uuid, p_signature_id uuid, p_expected_version integer
) returns handovers
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
  open_count integer;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status <> 'draft' then
    raise exception 'only drafts can be published' using errcode = 'P0422';
  end if;
  if h.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'P0409';
  end if;
  select count(*) into open_count from handover_tasks
   where handover_id = h.id and status = 'open';
  update handovers
     set status = 'published', published_by_signature_id = sig.id, published_at = now(),
         version = version + 1, updated_at = now()
   where id = h.id returning * into h;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.published',
                      jsonb_build_object('open_tasks', open_count));
  return h;
end $$;
grant execute on function publish_handover(uuid, uuid, integer) to authenticated;
revoke all on function publish_handover(uuid, uuid, integer) from public, anon;

create function acknowledge_handover(p_handover_id uuid, p_signature_id uuid)
returns handovers
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status <> 'published' then
    raise exception 'only published handovers can be acknowledged' using errcode = 'P0422';
  end if;
  update handovers
     set status = 'acknowledged', acknowledged_by_signature_id = sig.id,
         acknowledged_at = now(), version = version + 1, updated_at = now()
   where id = h.id returning * into h;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.acknowledged', '{}');
  return h;
end $$;
grant execute on function acknowledge_handover(uuid, uuid) to authenticated;
revoke all on function acknowledge_handover(uuid, uuid) from public, anon;

create function amend_handover(
  p_handover_id uuid, p_signature_id uuid, p_reason text, p_body text
) returns handover_amendments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
  a handover_amendments;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status = 'draft' then
    raise exception 'drafts are edited directly, not amended' using errcode = 'P0422';
  end if;
  insert into handover_amendments (organization_id, handover_id, author_signature_id, reason, body)
  values (sig.organization_id, h.id, sig.id, trim(p_reason), trim(p_body))
  returning * into a;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.amended',
                      jsonb_build_object('amendment_id', a.id));
  return a;
end $$;
grant execute on function amend_handover(uuid, uuid, text, text) to authenticated;
revoke all on function amend_handover(uuid, uuid, text, text) from public, anon;

create function complete_task(
  p_task_id uuid, p_signature_id uuid, p_expected_version integer
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  t handover_tasks;
  retention_armed boolean := false;
begin
  select * into t from handover_tasks
   where id = p_task_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0404'; end if;
  if t.status <> 'open' then
    raise exception 'only open tasks can be completed' using errcode = 'P0422';
  end if;
  if t.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'P0409';
  end if;
  update handover_tasks
     set status = 'done', completed_by_signature_id = sig.id, completed_at = now(),
         version = version + 1, updated_at = now()
   where id = t.id returning * into t;
  -- Arm 30-day retention when the LAST open task for the case completes (spec §6).
  if t.guest_case_id is not null and not exists (
       select 1 from handover_tasks
        where guest_case_id = t.guest_case_id and status = 'open'
     ) then
    update guest_cases
       set expires_at = t.completed_at + interval '30 days', updated_at = now()
     where id = t.guest_case_id and deleted_at is null;
    retention_armed := true;
  end if;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.completed',
                      jsonb_build_object('guest_case_retention_armed', retention_armed));
  return t;
end $$;
grant execute on function complete_task(uuid, uuid, integer) to authenticated;
revoke all on function complete_task(uuid, uuid, integer) from public, anon;

-- Deliberate carry-over: copies the task into a target DRAFT, keeps provenance,
-- marks the source as 'carried'. A linked guest case travels with it.
create function carry_over_task(
  p_task_id uuid, p_signature_id uuid, p_target_handover_id uuid
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  src handover_tasks;
  src_status handover_status;
  tgt handovers;
  t handover_tasks;
begin
  select * into src from handover_tasks
   where id = p_task_id and organization_id = sig.organization_id
   for update;
  if not found then raise exception 'task not found' using errcode = 'P0404'; end if;
  select status into src_status from handovers where id = src.handover_id;
  if src.status <> 'open' then
    raise exception 'only open tasks can be carried over' using errcode = 'P0422';
  end if;
  if src_status = 'draft' then
    raise exception 'carry-over starts from a published handover' using errcode = 'P0422';
  end if;
  select * into tgt from handovers
   where id = p_target_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'target handover not found' using errcode = 'P0404'; end if;
  if tgt.status <> 'draft' then
    raise exception 'carry-over target must be a draft' using errcode = 'P0422';
  end if;
  insert into handover_tasks (organization_id, handover_id, text, room_reference, department,
                              priority, created_by_signature_id, carry_over_from_task_id,
                              guest_case_id, template)
  values (sig.organization_id, tgt.id, src.text, src.room_reference, src.department,
          src.priority, sig.id, src.id, src.guest_case_id, src.template)
  returning * into t;
  update handover_tasks
     set status = 'carried', version = version + 1, updated_at = now()
   where id = src.id;
  if src.guest_case_id is not null then
    -- the case is live again until the carried task completes
    update guest_cases set expires_at = null, updated_at = now()
     where id = src.guest_case_id and deleted_at is null;
  end if;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.carried_over',
                      jsonb_build_object('from_task_id', src.id, 'to_handover_id', tgt.id));
  return t;
end $$;
grant execute on function carry_over_task(uuid, uuid, uuid) to authenticated;
revoke all on function carry_over_task(uuid, uuid, uuid) from public, anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` applies; `npm run test:db` green.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0006_lifecycle_rpcs.sql && git commit -m "feat(pilot-db): lifecycle RPCs — publish/acknowledge/amend/complete/carry-over"`

---

### Task 14: Migration 0007 — guest case RPCs (create, reveal, admin delete)

**Files:**
- Create: `supabase/migrations/0007_guest_rpcs.sql`

- [ ] **Step 1: Write `supabase/migrations/0007_guest_rpcs.sql`**

```sql
-- 0007_guest_rpcs: purpose-gated PII entry, audited reveal, admin manual delete.

create function create_guest_case(
  p_signature_id uuid, p_purpose guest_purpose,
  p_purpose_note text default null, p_room_reference text default '',
  p_guest_name text default null, p_contact_type contact_type default null,
  p_contact_value text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  gc_id uuid;
begin
  if p_purpose = 'other' and length(trim(coalesce(p_purpose_note, ''))) = 0 then
    raise exception 'purpose "other" requires a concise operational reason' using errcode = 'P0422';
  end if;
  if p_guest_name is null and p_contact_value is null then
    raise exception 'guest case without name or contact is pointless — use a plain task'
      using errcode = 'P0422';
  end if;
  insert into guest_cases (organization_id, room_reference, guest_name, contact_type,
                           contact_value, purpose, purpose_note, created_by_signature_id)
  values (sig.organization_id, trim(coalesce(p_room_reference, '')),
          nullif(trim(coalesce(p_guest_name, '')), ''),
          p_contact_type, nullif(trim(coalesce(p_contact_value, '')), ''),
          p_purpose, nullif(trim(coalesce(p_purpose_note, '')), ''))
  returning id into gc_id;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', gc_id, 'guest_case.created',
                      jsonb_build_object('purpose', p_purpose,
                                         'has_name', p_guest_name is not null,
                                         'has_contact', p_contact_value is not null));
  return gc_id;
end $$;
grant execute on function create_guest_case(uuid, guest_purpose, text, text, text, contact_type, text) to authenticated;
revoke all on function create_guest_case(uuid, guest_purpose, text, text, text, contact_type, text) from public, anon;

-- The only path to unmasked values. Every call is audited.
create function reveal_guest_case(p_case_id uuid, p_signature_id uuid)
returns table (guest_name text, contact_type contact_type, contact_value text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  gc guest_cases;
begin
  select * into gc from guest_cases
   where id = p_case_id and organization_id = sig.organization_id and deleted_at is null;
  if not found then raise exception 'guest case not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', gc.id, 'guest_case.revealed', '{}');
  return query select gc.guest_name, gc.contact_type, gc.contact_value;
end $$;
grant execute on function reveal_guest_case(uuid, uuid) to authenticated;
revoke all on function reveal_guest_case(uuid, uuid) from public, anon;

-- Immediate manual deletion (pilot administrator): masks values, keeps non-PII shell.
create function admin_delete_guest_case(p_case_id uuid, p_signature_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  update guest_cases
     set guest_name = null, contact_type = null, contact_value = null,
         deleted_at = now(), expires_at = null, updated_at = now()
   where id = p_case_id and organization_id = sig.organization_id and deleted_at is null;
  if not found then raise exception 'guest case not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', p_case_id, 'guest_case.admin_deleted', '{}');
end $$;
grant execute on function admin_delete_guest_case(uuid, uuid) to authenticated;
revoke all on function admin_delete_guest_case(uuid, uuid) from public, anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset`; `npm run test:db` green.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0007_guest_rpcs.sql && git commit -m "feat(pilot-db): guest case RPCs — purpose gate, audited reveal, admin delete"`

---

### Task 15: Migration 0008 — retention job, admin & metrics RPCs

**Files:**
- Create: `supabase/migrations/0008_retention_admin.sql`

- [ ] **Step 1: Write `supabase/migrations/0008_retention_admin.sql`**

```sql
-- 0008_retention_admin: scheduled deletion, health surface, audit listing, metrics.

-- Deletes (masks) expired guest cases. Records every run — success or failure —
-- in retention_runs so failure is never silent (spec §9).
create function run_guest_case_retention() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id, organization_id from guest_cases
     where expires_at <= now() and deleted_at is null
     for update skip locked
  loop
    update guest_cases
       set guest_name = null, contact_type = null, contact_value = null,
           deleted_at = now(), updated_at = now()
     where id = r.id;
    perform write_audit(r.organization_id, null, 'guest_case', r.id, 'guest_case.expired', '{}');
    n := n + 1;
  end loop;
  insert into retention_runs (cases_deleted, ok) values (n, true);
  return n;
exception when others then
  -- the failed sweep rolled back to the block start; record the failure itself
  insert into retention_runs (cases_deleted, ok, error) values (0, false, sqlerrm);
  return 0;
end $$;
revoke all on function run_guest_case_retention() from public, authenticated, anon;
-- cron (as postgres) and operator/service tooling may run it; the client role may not
grant execute on function run_guest_case_retention() to service_role;

-- Daily at 02:15 UTC (03:15/04:15 Berlin — inside Nacht, before Früh).
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('guest-case-retention');
exception when others then null; -- not scheduled yet
end $$;
select cron.schedule('guest-case-retention', '15 2 * * *',
                     $$select public.run_guest_case_retention()$$);

-- Admin: audit inspection (no PII exists in audit rows by construction).
create function list_audit_events(
  p_signature_id uuid, p_limit integer default 100, p_before timestamptz default null
) returns setof audit_events
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  return query
    select * from audit_events
     where organization_id = sig.organization_id
       and (p_before is null or occurred_at < p_before)
     order by occurred_at desc
     limit least(greatest(p_limit, 1), 500);
end $$;
grant execute on function list_audit_events(uuid, integer, timestamptz) to authenticated;
revoke all on function list_audit_events(uuid, integer, timestamptz) from public, anon;

-- Admin: last retention run + count of pending expired cases.
create function retention_health(p_signature_id uuid)
returns table (last_ran_at timestamptz, last_ok boolean, last_error text, overdue_cases bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  return query
    select rr.ran_at, rr.ok, rr.error,
           (select count(*) from guest_cases
             where expires_at <= now() and deleted_at is null)
      from retention_runs rr order by rr.ran_at desc limit 1;
end $$;
grant execute on function retention_health(uuid) to authenticated;
revoke all on function retention_health(uuid) from public, anon;

create function admin_deactivate_signature(p_signature_id uuid, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  update staff_signatures set active = false
   where id = p_target_id and organization_id = sig.organization_id and active;
  if not found then raise exception 'signature not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'signature', p_target_id, 'signature.deactivated', '{}');
end $$;
grant execute on function admin_deactivate_signature(uuid, uuid) to authenticated;
revoke all on function admin_deactivate_signature(uuid, uuid) from public, anon;

-- Non-PII pilot summary (spec §8 pilot export): counts only.
create function pilot_metrics(p_signature_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  result jsonb;
begin
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'handovers', count(*),
    'published', count(*) filter (where h.status in ('published', 'acknowledged')),
    'acknowledged', count(*) filter (where h.status = 'acknowledged'),
    'tasks', coalesce(sum(tc.total), 0),
    'carried_over', coalesce(sum(tc.carried), 0),
    'template_usage', coalesce(
      (select jsonb_object_agg(template, uses) from (
        select ht.template, count(*) as uses from handover_tasks ht
         join handovers h2 on h2.id = ht.handover_id
        where ht.organization_id = sig.organization_id
          and h2.service_date between p_from and p_to and ht.template is not null
        group by ht.template) tu), '{}'::jsonb))
  into result
  from handovers h
  left join lateral (
    select count(*) as total,
           count(*) filter (where ht.carry_over_from_task_id is not null) as carried
      from handover_tasks ht where ht.handover_id = h.id
  ) tc on true
  where h.organization_id = sig.organization_id
    and h.service_date between p_from and p_to;
  return result;
end $$;
grant execute on function pilot_metrics(uuid, date, date) to authenticated;
revoke all on function pilot_metrics(uuid, date, date) from public, anon;
```

- [ ] **Step 2: Verify** — `npm run db:reset` applies (pg_cron available in the local stack). In Studio SQL editor: `select * from cron.job;` shows `guest-case-retention`.
- [ ] **Step 3: Commit** — `git add supabase/migrations/0008_retention_admin.sql && git commit -m "feat(pilot-db): retention job with health log, admin and metrics RPCs"`

---

### Task 16: DB tests — lifecycle, conflicts, purpose gate

**Files:**
- Create: `supabase/tests/lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests** — `supabase/tests/lifecycle.test.ts` (each run uses a fresh service date so reruns don't collide with the tuple uniqueness; `db:reset` between full runs is the clean path):

```ts
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonSignedIn, signatureId } from './helpers'

let c: SupabaseClient
let sigAB: string
let sigLK: string
let day = 0
const date = () => `2031-01-${String(++day).padStart(2, '0')}` // far-future test dates, one per test

async function draft(client: SupabaseClient, sig: string, serviceDate: string) {
  const { data, error } = await client.rpc('create_or_get_draft', {
    p_service_date: serviceDate, p_source_shift: 'frueh', p_source_department: 'front-office',
    p_target_shift: 'spaet', p_target_department: 'front-office', p_signature_id: sig,
  })
  if (error) throw error
  return data
}

beforeAll(async () => {
  c = await anonSignedIn()
  sigAB = await signatureId(c, 'AB')
  sigLK = await signatureId(c, 'LK')
})

describe('draft creation', () => {
  test('is idempotent per tuple', async () => {
    const d = date()
    const a = await draft(c, sigAB, d)
    const b = await draft(c, sigLK, d)
    expect(b.id).toBe(a.id)
    expect(a.status).toBe('draft')
  })
  test('rejects identical source and target', async () => {
    const { error } = await c.rpc('create_or_get_draft', {
      p_service_date: date(), p_source_shift: 'frueh', p_source_department: 'front-office',
      p_target_shift: 'frueh', p_target_department: 'front-office', p_signature_id: sigAB,
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('publish → acknowledge', () => {
  test('happy path stamps signatures and bumps versions', async () => {
    const h = await draft(c, sigAB, date())
    const pub = await c.rpc('publish_handover', {
      p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version,
    })
    expect(pub.error).toBeNull()
    expect(pub.data.status).toBe('published')
    expect(pub.data.published_by_signature_id).toBe(sigAB)
    const ack = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    expect(ack.data.status).toBe('acknowledged')
    expect(ack.data.acknowledged_by_signature_id).toBe(sigLK)
  })
  test('stale version → P0409', async () => {
    const h = await draft(c, sigAB, date())
    const { error } = await c.rpc('publish_handover', {
      p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version + 5,
    })
    expect(error?.code).toBe('P0409')
  })
  test('acknowledging a draft → P0422; double acknowledge → P0422', async () => {
    const h = await draft(c, sigAB, date())
    const first = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    expect(first.error?.code).toBe('P0422')
    await c.rpc('publish_handover', { p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version })
    await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    const again = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigAB })
    expect(again.error?.code).toBe('P0422')
  })
})

describe('tasks', () => {
  test('contact data in free text is rejected by the DB', async () => {
    const h = await draft(c, sigAB, date())
    const { error } = await c.rpc('add_task', {
      p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Rückruf +49 171 2345678',
    })
    expect(error).not.toBeNull() // 23514 check_violation
  })
  test('editing after publish → P0422; amendment works instead', async () => {
    const h = await draft(c, sigAB, date())
    const t = (await c.rpc('add_task', {
      p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Zimmer 204 prüfen',
    })).data
    await c.rpc('publish_handover', { p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version })
    const upd = await c.rpc('update_task', {
      p_task_id: t.id, p_signature_id: sigAB, p_expected_version: t.version,
      p_text: 'Geändert', p_room_reference: '', p_department: 'front-office', p_priority: 'normal',
    })
    expect(upd.error?.code).toBe('P0422')
    const amend = await c.rpc('amend_handover', {
      p_handover_id: h.id, p_signature_id: sigAB,
      p_reason: 'Korrektur', p_body: 'Zimmer 204: Technik war schon informiert.',
    })
    expect(amend.error).toBeNull()
  })
  test('carry-over: published source → new draft task with provenance, source becomes carried', async () => {
    const d1 = date(); const d2 = date()
    const h1 = await draft(c, sigAB, d1)
    const t = (await c.rpc('add_task', {
      p_handover_id: h1.id, p_signature_id: sigAB, p_text: 'Wasserkocher defekt', p_room_reference: '204',
    })).data
    await c.rpc('publish_handover', { p_handover_id: h1.id, p_signature_id: sigAB, p_expected_version: h1.version })
    const h2 = await draft(c, sigLK, d2)
    const carried = await c.rpc('carry_over_task', {
      p_task_id: t.id, p_signature_id: sigLK, p_target_handover_id: h2.id,
    })
    expect(carried.error).toBeNull()
    expect(carried.data.carry_over_from_task_id).toBe(t.id)
    expect(carried.data.status).toBe('open')
    const src = await c.from('handover_tasks').select('status').eq('id', t.id).single()
    expect(src.data!.status).toBe('carried')
  })
  test('carry-over from a draft → P0422', async () => {
    const h1 = await draft(c, sigAB, date())
    const t = (await c.rpc('add_task', {
      p_handover_id: h1.id, p_signature_id: sigAB, p_text: 'Noch im Entwurf',
    })).data
    const h2 = await draft(c, sigAB, date())
    const { error } = await c.rpc('carry_over_task', {
      p_task_id: t.id, p_signature_id: sigAB, p_target_handover_id: h2.id,
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('signatures', () => {
  test('ensure_signature normalizes and is idempotent', async () => {
    const a = await c.rpc('ensure_signature', { p_short_code: ' mn ', p_display_name: 'Nachtdienst M' })
    const b = await c.rpc('ensure_signature', { p_short_code: 'MN', p_display_name: 'anders' })
    expect(a.error).toBeNull()
    expect(b.data.id).toBe(a.data.id)
    expect(a.data.short_code).toBe('MN')
  })
  test('invalid Kürzel → P0422', async () => {
    const { error } = await c.rpc('ensure_signature', { p_short_code: 'M1', p_display_name: 'X' })
    expect(error?.code).toBe('P0422')
  })
})
```

- [ ] **Step 2: Verify** — `npm run db:reset && npm run test:db` → all green. Any failure is a defect in migrations 0005–0006: fix the SQL migration file (they have not shipped anywhere yet), `db:reset`, rerun.
- [ ] **Step 3: Commit** — `git add supabase/tests/lifecycle.test.ts && git commit -m "test(pilot-db): lifecycle transitions, conflicts, carry-over, free-text guard"`

---

### Task 17: DB tests — guest cases, retention, audit hygiene

**Files:**
- Create: `supabase/tests/retention.test.ts`

- [ ] **Step 1: Write the failing tests** — `supabase/tests/retention.test.ts`:

```ts
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anonSignedIn, signatureId } from './helpers'

let c: SupabaseClient
let sigAB: string
let day = 0
const date = () => `2032-03-${String(++day).padStart(2, '0')}`

async function caseWithCompletedTask() {
  const gcId = (await c.rpc('create_guest_case', {
    p_signature_id: sigAB, p_purpose: 'callback', p_room_reference: '117',
    p_guest_name: 'Testgast Synthetisch', p_contact_type: 'phone', p_contact_value: '+49 000 111',
  })).data as string
  const h = (await c.rpc('create_or_get_draft', {
    p_service_date: date(), p_source_shift: 'spaet', p_source_department: 'front-office',
    p_target_shift: 'nacht', p_target_department: 'front-office', p_signature_id: sigAB,
  })).data
  const t = (await c.rpc('add_task', {
    p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Rückruf erledigen — Details im Gastfall',
    p_guest_case_id: gcId,
  })).data
  const done = (await c.rpc('complete_task', {
    p_task_id: t.id, p_signature_id: sigAB, p_expected_version: t.version,
  })).data
  return { gcId, task: done }
}

beforeAll(async () => {
  c = await anonSignedIn()
  sigAB = await signatureId(c, 'AB')
})

describe('purpose gate', () => {
  test('other without note → P0422', async () => {
    const { error } = await c.rpc('create_guest_case', {
      p_signature_id: sigAB, p_purpose: 'other', p_guest_name: 'Testgast Synthetisch',
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('masking and reveal', () => {
  test('view returns masked values; reveal returns full values and audits', async () => {
    const { gcId } = await caseWithCompletedTask()
    const masked = await c.from('guest_case_view').select('*').eq('id', gcId).single()
    expect(masked.data!.masked_name).toBe('T. S.')
    expect(masked.data!.masked_contact).toBe('••• 11')
    expect(masked.data!.has_contact).toBe(true)

    const revealed = await c.rpc('reveal_guest_case', { p_case_id: gcId, p_signature_id: sigAB })
    expect(revealed.data![0].guest_name).toBe('Testgast Synthetisch')

    const a = admin()
    const audit = await a.from('audit_events').select('action, metadata')
      .eq('entity_id', gcId).eq('action', 'guest_case.revealed')
    expect(audit.data!.length).toBeGreaterThan(0)
  })
})

describe('retention', () => {
  test('completing the last linked task arms expires_at ≈ +30 days', async () => {
    const { gcId, task } = await caseWithCompletedTask()
    const a = admin()
    const gc = (await a.from('guest_cases').select('expires_at').eq('id', gcId).single()).data!
    const delta = Date.parse(gc.expires_at) - Date.parse(task.completed_at)
    expect(Math.round(delta / 86_400_000)).toBe(30)
  })

  test('retention run masks expired cases and audits guest_case.expired', async () => {
    const { gcId } = await caseWithCompletedTask()
    const a = admin()
    await a.from('guest_cases').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', gcId)
    const { data: deleted, error } = await a.rpc('run_guest_case_retention')
    expect(error).toBeNull()
    expect(deleted).toBeGreaterThanOrEqual(1)
    const gc = (await a.from('guest_cases').select('*').eq('id', gcId).single()).data!
    expect(gc.guest_name).toBeNull()
    expect(gc.contact_value).toBeNull()
    expect(gc.deleted_at).not.toBeNull()
    const runs = await a.from('retention_runs').select('ok').order('ran_at', { ascending: false }).limit(1)
    expect(runs.data![0].ok).toBe(true)
    const audit = await a.from('audit_events').select('id').eq('entity_id', gcId).eq('action', 'guest_case.expired')
    expect(audit.data!.length).toBe(1)
  })

  test('client role cannot call the retention function', async () => {
    const { error } = await c.rpc('run_guest_case_retention')
    expect(error).not.toBeNull()
  })
})

describe('audit hygiene', () => {
  test('no audit row ever contains guest values or task text', async () => {
    await caseWithCompletedTask()
    const a = admin()
    const rows = (await a.from('audit_events').select('metadata')).data!
    for (const row of rows) {
      const s = JSON.stringify(row.metadata)
      expect(s).not.toContain('Testgast')
      expect(s).not.toContain('+49')
      expect(s).not.toContain('Rückruf erledigen')
    }
  })
  test('non-admin cannot list audit events; admin signature can', async () => {
    const sigLK = await signatureId(c, 'LK')
    const denied = await c.rpc('list_audit_events', { p_signature_id: sigLK })
    expect(denied.error?.code).toBe('P0403')
    const allowed = await c.rpc('list_audit_events', { p_signature_id: sigAB }) // AB seeded is_admin
    expect(allowed.error).toBeNull()
    expect(allowed.data!.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Verify** — `npm run db:reset && npm run test:db` → green. (Synthetic guest values only — "Testgast Synthetisch" is deliberately non-person-like per privacy rules; never use realistic names.)
- [ ] **Step 3: Commit** — `git add supabase/tests/retention.test.ts && git commit -m "test(pilot-db): purpose gate, masking, 30-day retention, audit hygiene"`

---

### Task 18: API — client factory, session, error mapping

**Files:**
- Create: `src/pilot/api/client.ts`, `src/pilot/api/errors.ts`, `src/pilot/api/session.ts`, `src/test/fake-supabase.ts`
- Test: `src/pilot/api/errors.test.ts`, `src/pilot/api/session.test.ts`

- [ ] **Step 1: Write the failing tests.**

`src/pilot/api/errors.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { mapDbError } from './errors'

describe('mapDbError', () => {
  test.each([
    ['P0403', 'forbidden'],
    ['P0404', 'not-found'],
    ['P0409', 'conflict'],
    ['P0422', 'validation'],
    ['23514', 'validation'],
    ['23505', 'validation'],
  ] as const)('%s → %s', (code, kind) => {
    expect(mapDbError({ code, message: 'x' }).kind).toBe(kind)
  })
  test('fetch failure → network', () => {
    expect(mapDbError({ message: 'TypeError: Failed to fetch' }).kind).toBe('network')
  })
  test('anything else → unknown', () => {
    expect(mapDbError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown')
  })
})
```

`src/pilot/api/session.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createSession } from './session'
import { fakeSupabase } from '../../test/fake-supabase'

describe('createSession', () => {
  test('starts signed out, signs in, signs out', async () => {
    const fake = fakeSupabase()
    const s = createSession(fake.client)
    expect(s.user.value).toBeNull()
    const ok = await s.signIn('pilot@example.test', 'pw')
    expect(ok).toEqual({ ok: true })
    expect(s.user.value?.email).toBe('pilot@example.test')
    await s.signOut()
    expect(s.user.value).toBeNull()
  })
  test('bad credentials → typed error, stays signed out', async () => {
    const fake = fakeSupabase({ failAuth: true })
    const s = createSession(fake.client)
    const res = await s.signIn('pilot@example.test', 'wrong')
    expect(res.ok).toBe(false)
    expect(s.user.value).toBeNull()
  })
})
```

- [ ] **Step 2: Write the fake** — `src/test/fake-supabase.ts` (covers exactly the client surface the app uses: `auth.signInWithPassword/signOut/getSession/onAuthStateChange`, `rpc`, `from().select()` chains; RPC/table behavior is programmable per test):

```ts
export interface FakeSupabaseOptions {
  failAuth?: boolean
  rpc?: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message: string } | null }>
  tables?: Record<string, unknown[]>
}

export function fakeSupabase(opts: FakeSupabaseOptions = {}) {
  let currentUser: { email: string } | null = null
  const calls: Array<{ fn: string; args: unknown }> = []
  const client = {
    auth: {
      async signInWithPassword({ email }: { email: string; password: string }) {
        if (opts.failAuth) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
        currentUser = { email }
        return { data: { user: currentUser, session: {} }, error: null }
      },
      async signOut() { currentUser = null; return { error: null } },
      async getSession() {
        return { data: { session: currentUser ? { user: currentUser } : null }, error: null }
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      const impl = opts.rpc?.[fn]
      if (!impl) return { data: null, error: { message: `no fake for rpc ${fn}` } }
      const r = impl(args)
      return { data: r.data ?? null, error: r.error ?? null }
    },
    from(table: string) {
      const rows = (opts.tables?.[table] ?? []) as Record<string, unknown>[]
      const result = Promise.resolve({ data: rows, error: null })
      const builder: Record<string, unknown> = {
        select: () => builder, eq: () => builder, order: () => builder,
        limit: () => builder, ilike: () => builder, in: () => builder,
        gte: () => builder, lte: () => builder,
        single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
        then: result.then.bind(result), catch: result.catch.bind(result),
      }
      return builder
    },
  }
  return { client: client as never, calls }
}
```

- [ ] **Step 3: Verify RED** — `npm test` → FAIL (cannot resolve `./errors`, `./session`).

- [ ] **Step 4: Implement.**

`src/pilot/api/errors.ts`:

```ts
export type PilotErrorKind = 'forbidden' | 'not-found' | 'conflict' | 'validation' | 'network' | 'unknown'
export interface PilotError { kind: PilotErrorKind; message: string }

const BY_CODE: Record<string, PilotErrorKind> = {
  P0403: 'forbidden', P0404: 'not-found', P0409: 'conflict', P0422: 'validation',
  '23514': 'validation', '23505': 'validation', '23503': 'validation', '42501': 'forbidden',
}

export function mapDbError(err: { code?: string; message: string }): PilotError {
  if (err.code && BY_CODE[err.code]) return { kind: BY_CODE[err.code]!, message: err.message }
  if (/fetch|network/i.test(err.message)) return { kind: 'network', message: err.message }
  return { kind: 'unknown', message: err.message }
}
```

`src/pilot/api/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PilotClient = SupabaseClient

export function createPilotClient(
  url: string = import.meta.env.VITE_SUPABASE_URL as string,
  anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string,
): PilotClient {
  if (!url || !anonKey) throw new Error('Pilot config missing — see .env.example')
  return createClient(url, anonKey)
}
```

`src/pilot/api/session.ts`:

```ts
import { signal, type Signal } from '@preact/signals'
import type { PilotClient } from './client'

export interface SessionUser { email: string }
export interface PilotSession {
  user: Signal<SessionUser | null>
  ready: Signal<boolean>
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>
  signOut(): Promise<void>
}

export function createSession(client: PilotClient): PilotSession {
  const user = signal<SessionUser | null>(null)
  const ready = signal(false)
  void client.auth.getSession().then(({ data }) => {
    user.value = data.session?.user?.email ? { email: data.session.user.email } : null
    ready.value = true
  })
  client.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user?.email ? { email: session.user.email } : null
  })
  return {
    user, ready,
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error || !data.user?.email) return { ok: false, message: 'Anmeldung fehlgeschlagen. Zugangsdaten prüfen.' }
      user.value = { email: data.user.email }
      return { ok: true }
    },
    async signOut() {
      await client.auth.signOut()
      user.value = null
    },
  }
}
```

- [ ] **Step 5: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(pilot): supabase client, session signals, typed error mapping"`

---

### Task 19: API — typed RPC wrappers & queries

**Files:**
- Create: `src/pilot/api/rpc.ts`
- Test: `src/pilot/api/rpc.test.ts`

One module, one pattern: every call returns `Result<T> = { ok: true; value: T } | { ok: false; error: PilotError }` — the UI never touches supabase-js error shapes.

- [ ] **Step 1: Write the failing tests** — `src/pilot/api/rpc.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createPilotApi } from './rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const HANDOVER = {
  id: 'h1', organization_id: 'o1', service_date: '2026-07-10',
  source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office',
  status: 'draft', version: 1,
}

describe('createPilotApi', () => {
  test('createOrGetDraft passes the tuple and unwraps the row', async () => {
    const fake = fakeSupabase({ rpc: { create_or_get_draft: () => ({ data: HANDOVER }) } })
    const api = createPilotApi(fake.client)
    const res = await api.createOrGetDraft({
      serviceDate: '2026-07-10', sourceShift: 'frueh', sourceDepartment: 'front-office',
      targetShift: 'spaet', targetDepartment: 'front-office',
    }, 'sig-1')
    expect(res).toEqual({ ok: true, value: HANDOVER })
    expect(fake.calls[0]).toEqual({
      fn: 'create_or_get_draft',
      args: {
        p_service_date: '2026-07-10', p_source_shift: 'frueh', p_source_department: 'front-office',
        p_target_shift: 'spaet', p_target_department: 'front-office', p_signature_id: 'sig-1',
      },
    })
  })
  test('publish conflict surfaces as typed error', async () => {
    const fake = fakeSupabase({ rpc: { publish_handover: () => ({ error: { code: 'P0409', message: 'version conflict' } }) } })
    const api = createPilotApi(fake.client)
    const res = await api.publishHandover('h1', 'sig-1', 1)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('conflict')
  })
  test('boardForDate queries handovers by service_date', async () => {
    const fake = fakeSupabase({ tables: { handovers: [HANDOVER] } })
    const api = createPilotApi(fake.client)
    const res = await api.boardForDate('2026-07-10')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toEqual([HANDOVER])
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./rpc`).

- [ ] **Step 3: Implement `src/pilot/api/rpc.ts`**

```ts
import type { Department, Priority, Shift } from '../../domain/task'
import type { GuestPurpose, HandoverStatus, HandoverTuple, PilotTaskStatus } from '../domain/handover'
import type { PilotClient } from './client'
import { mapDbError, type PilotError } from './errors'

export type Result<T> = { ok: true; value: T } | { ok: false; error: PilotError }

export interface HandoverRow {
  id: string; organization_id: string; service_date: string
  source_shift: Shift; source_department: Department
  target_shift: Shift; target_department: Department
  status: HandoverStatus; version: number
  author_signature_id: string
  published_by_signature_id: string | null; published_at: string | null
  acknowledged_by_signature_id: string | null; acknowledged_at: string | null
}

export interface TaskRow {
  id: string; handover_id: string; text: string; room_reference: string
  department: Department; priority: Priority; status: PilotTaskStatus; version: number
  created_by_signature_id: string; completed_by_signature_id: string | null
  completed_at: string | null; carry_over_from_task_id: string | null
  guest_case_id: string | null; template: string | null; created_at: string
}

export interface SignatureRow {
  id: string; short_code: string; display_name: string; is_admin: boolean; active: boolean
}

export interface GuestCaseMasked {
  id: string; room_reference: string; purpose: GuestPurpose; purpose_note: string | null
  expires_at: string | null; deleted_at: string | null
  masked_name: string | null; masked_contact: string | null
  has_contact: boolean; has_name: boolean
}

type Raw = { data: unknown; error: { code?: string; message: string } | null }
const wrap = <T>(r: Raw): Result<T> =>
  r.error ? { ok: false, error: mapDbError(r.error) } : { ok: true, value: r.data as T }

export function createPilotApi(client: PilotClient) {
  return {
    async ensureSignature(shortCode: string, displayName: string): Promise<Result<SignatureRow>> {
      return wrap(await client.rpc('ensure_signature', { p_short_code: shortCode, p_display_name: displayName }))
    },
    async listSignatures(): Promise<Result<SignatureRow[]>> {
      return wrap(await client.from('staff_signatures').select('id, short_code, display_name, is_admin, active').order('short_code'))
    },
    async createOrGetDraft(t: HandoverTuple, signatureId: string): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('create_or_get_draft', {
        p_service_date: t.serviceDate, p_source_shift: t.sourceShift, p_source_department: t.sourceDepartment,
        p_target_shift: t.targetShift, p_target_department: t.targetDepartment, p_signature_id: signatureId,
      }))
    },
    async boardForDate(serviceDate: string): Promise<Result<HandoverRow[]>> {
      return wrap(await client.from('handovers').select('*').eq('service_date', serviceDate))
    },
    async tasksFor(handoverId: string): Promise<Result<TaskRow[]>> {
      return wrap(await client.from('handover_tasks').select('*').eq('handover_id', handoverId).order('created_at'))
    },
    async addTask(input: {
      handoverId: string; signatureId: string; text: string; roomReference?: string
      department?: Department; priority?: Priority; guestCaseId?: string | null; template?: string | null
    }): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('add_task', {
        p_handover_id: input.handoverId, p_signature_id: input.signatureId, p_text: input.text,
        p_room_reference: input.roomReference ?? '', p_department: input.department ?? 'front-office',
        p_priority: input.priority ?? 'normal', p_guest_case_id: input.guestCaseId ?? null,
        p_template: input.template ?? null,
      }))
    },
    async updateTask(taskId: string, signatureId: string, expectedVersion: number, fields: {
      text: string; roomReference: string; department: Department; priority: Priority
    }): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('update_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_expected_version: expectedVersion,
        p_text: fields.text, p_room_reference: fields.roomReference,
        p_department: fields.department, p_priority: fields.priority,
      }))
    },
    async publishHandover(handoverId: string, signatureId: string, expectedVersion: number): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('publish_handover', {
        p_handover_id: handoverId, p_signature_id: signatureId, p_expected_version: expectedVersion,
      }))
    },
    async acknowledgeHandover(handoverId: string, signatureId: string): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('acknowledge_handover', { p_handover_id: handoverId, p_signature_id: signatureId }))
    },
    async amendHandover(handoverId: string, signatureId: string, reason: string, body: string): Promise<Result<unknown>> {
      return wrap(await client.rpc('amend_handover', {
        p_handover_id: handoverId, p_signature_id: signatureId, p_reason: reason, p_body: body,
      }))
    },
    async completeTask(taskId: string, signatureId: string, expectedVersion: number): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('complete_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_expected_version: expectedVersion,
      }))
    },
    async carryOverTask(taskId: string, signatureId: string, targetHandoverId: string): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('carry_over_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_target_handover_id: targetHandoverId,
      }))
    },
    async createGuestCase(input: {
      signatureId: string; purpose: GuestPurpose; purposeNote?: string; roomReference?: string
      guestName?: string; contactType?: 'phone' | 'email'; contactValue?: string
    }): Promise<Result<string>> {
      return wrap(await client.rpc('create_guest_case', {
        p_signature_id: input.signatureId, p_purpose: input.purpose,
        p_purpose_note: input.purposeNote ?? null, p_room_reference: input.roomReference ?? '',
        p_guest_name: input.guestName ?? null, p_contact_type: input.contactType ?? null,
        p_contact_value: input.contactValue ?? null,
      }))
    },
    async guestCase(caseId: string): Promise<Result<GuestCaseMasked>> {
      return wrap(await client.from('guest_case_view').select('*').eq('id', caseId).single())
    },
    async revealGuestCase(caseId: string, signatureId: string): Promise<Result<Array<{
      guest_name: string | null; contact_type: 'phone' | 'email' | null; contact_value: string | null
    }>>> {
      return wrap(await client.rpc('reveal_guest_case', { p_case_id: caseId, p_signature_id: signatureId }))
    },
    async adminDeleteGuestCase(caseId: string, signatureId: string): Promise<Result<null>> {
      return wrap(await client.rpc('admin_delete_guest_case', { p_case_id: caseId, p_signature_id: signatureId }))
    },
    async listAuditEvents(signatureId: string, limit = 100): Promise<Result<unknown[]>> {
      return wrap(await client.rpc('list_audit_events', { p_signature_id: signatureId, p_limit: limit }))
    },
    async retentionHealth(signatureId: string): Promise<Result<Array<{
      last_ran_at: string; last_ok: boolean; last_error: string | null; overdue_cases: number
    }>>> {
      return wrap(await client.rpc('retention_health', { p_signature_id: signatureId }))
    },
    async deactivateSignature(signatureId: string, targetId: string): Promise<Result<null>> {
      return wrap(await client.rpc('admin_deactivate_signature', { p_signature_id: signatureId, p_target_id: targetId }))
    },
    async pilotMetrics(signatureId: string, from: string, to: string): Promise<Result<Record<string, unknown>>> {
      return wrap(await client.rpc('pilot_metrics', { p_signature_id: signatureId, p_from: from, p_to: to }))
    },
    async searchArchive(filter: {
      from?: string; to?: string; status?: HandoverStatus
    }): Promise<Result<HandoverRow[]>> {
      let q = client.from('handovers').select('*').order('service_date', { ascending: false }).limit(200)
      if (filter.from) q = q.gte('service_date', filter.from)
      if (filter.to) q = q.lte('service_date', filter.to)
      if (filter.status) q = q.eq('status', filter.status)
      return wrap(await q)
    },
  }
}

export type PilotApi = ReturnType<typeof createPilotApi>
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. (If `gte`/`lte` chaining fights the fake, extend `src/test/fake-supabase.ts` builder with `gte`/`lte` no-op chainers — keep the fake surface equal to what `rpc.ts` uses.)
- [ ] **Step 5: Commit** — `git commit -am "feat(pilot): typed RPC and query API with Result wrapper"`

---

### Task 20: UI — pilot shell, sign-in, signature bar

**Files:**
- Modify: `src/pilot/app/PilotApp.tsx`, `src/pilot/app/PilotApp.test.tsx` (from Task 2), `src/pilot/app/pilot.css`, `src/pilot/app/main.tsx`
- Create: `src/pilot/app/SignIn.tsx`, `src/pilot/app/SignatureBar.tsx`, `src/pilot/app/SignatureBar.test.tsx`

Dependency injection mirrors V1's `createLedgerApp(storage, now)` style: `PilotApp` takes `deps` (session, api, storage, now); `main.tsx` builds real ones. Unit tests pass fakes — no network in `npm test`, ever.

- [ ] **Step 1: Rewrite the failing tests** — `src/pilot/app/PilotApp.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { signal } from '@preact/signals'
import { PilotApp, type PilotDeps } from './PilotApp'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'
import { fakeStorage } from '../../test/fake-storage'

export function fakeDeps(overrides: Partial<PilotDeps> = {}): PilotDeps {
  const fake = fakeSupabase()
  return {
    session: {
      user: signal<{ email: string } | null>(null), ready: signal(true),
      signIn: async () => ({ ok: true as const }), signOut: async () => {},
    },
    api: createPilotApi(fake.client),
    storage: fakeStorage(),
    now: () => new Date('2026-07-10T09:00:00Z'),
    ...overrides,
  }
}

describe('PilotApp', () => {
  test('signed out → shows Team-Anmeldung', () => {
    render(<PilotApp deps={fakeDeps()} />)
    expect(screen.getByText('Team-Anmeldung')).toBeTruthy()
  })
  test('signed in → shows board title and signature prompt', () => {
    const deps = fakeDeps({
      session: {
        user: signal({ email: 'pilot@example.test' }), ready: signal(true),
        signIn: async () => ({ ok: true }), signOut: async () => {},
      },
    })
    render(<PilotApp deps={deps} />)
    expect(screen.getByText('Übergaben')).toBeTruthy()
    expect(screen.getByText(/Kürzel wählen oder anlegen/)).toBeTruthy()
  })
})
```

`src/pilot/app/SignatureBar.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { SignatureBar, loadStoredSignature, SIGNATURE_KEY } from './SignatureBar'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'
import { fakeStorage } from '../../test/fake-storage'

const SIG = { id: 's1', short_code: 'AB', display_name: 'Rezeption A', is_admin: false, active: true }

describe('SignatureBar', () => {
  test('creating a Kürzel calls ensure_signature and persists locally', async () => {
    const fake = fakeSupabase({ rpc: { ensure_signature: () => ({ data: SIG }) }, tables: { staff_signatures: [] } })
    const storage = fakeStorage()
    const onChange = vi_fn()
    render(<SignatureBar api={createPilotApi(fake.client)} storage={storage} value={null} onChange={onChange.fn} />)
    fireEvent.input(screen.getByLabelText('Kürzel'), { target: { value: 'ab' } })
    fireEvent.input(screen.getByLabelText('Anzeigename'), { target: { value: 'Rezeption A' } })
    fireEvent.click(screen.getByText('Übernehmen'))
    await waitFor(() => expect(onChange.calls[0]).toEqual(SIG))
    expect(JSON.parse(storage.getItem(SIGNATURE_KEY)!)).toMatchObject({ id: 's1', short_code: 'AB' })
  })
  test('loadStoredSignature rejects garbage', () => {
    const storage = fakeStorage({ [SIGNATURE_KEY]: '{broken' })
    expect(loadStoredSignature(storage)).toBeNull()
  })
})

function vi_fn() {
  const calls: unknown[] = []
  return { calls, fn: (v: unknown) => { calls.push(v) } }
}
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (missing exports / components).

- [ ] **Step 3: Implement.**

`src/pilot/app/SignIn.tsx`:

```tsx
import { useState } from 'preact/hooks'
import type { PilotSession } from '../api/session'

export function SignIn({ session }: { session: PilotSession }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (e: Event) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const data = new FormData(form)
    setPending(true)
    const res = await session.signIn(String(data.get('email')), String(data.get('password')))
    setPending(false)
    if (!res.ok) setError(res.message)
  }
  return (
    <main class="signin">
      <h1>Team-Anmeldung</h1>
      <form onSubmit={submit}>
        <label>E-Mail<input name="email" type="email" autocomplete="username" required /></label>
        <label>Passwort<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit" disabled={pending}>{pending ? '…' : 'Anmelden'}</button>
        {error && <p class="hint" role="status">{error}</p>}
      </form>
    </main>
  )
}
```

`src/pilot/app/SignatureBar.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks'
import type { StorageLike } from '../../storage/store'
import { parseSignatureInput } from '../domain/signature'
import type { PilotApi, SignatureRow } from '../api/rpc'

export const SIGNATURE_KEY = 'lobby-ledger.pilot.signature'

export function loadStoredSignature(storage: StorageLike): SignatureRow | null {
  try {
    const raw = storage.getItem(SIGNATURE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as SignatureRow
    return typeof p.id === 'string' && typeof p.short_code === 'string' ? p : null
  } catch { return null }
}

interface Props {
  api: PilotApi
  storage: StorageLike
  value: SignatureRow | null
  onChange(sig: SignatureRow): void
}

export function SignatureBar({ api, storage, value, onChange }: Props) {
  const [existing, setExisting] = useState<SignatureRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void api.listSignatures().then((r) => { if (r.ok) setExisting(r.value.filter((s) => s.active)) })
  }, [api])

  const pick = (sig: SignatureRow) => {
    storage.setItem(SIGNATURE_KEY, JSON.stringify(sig))
    onChange(sig)
  }
  const create = async (e: Event) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget as HTMLFormElement)
    const input = parseSignatureInput({
      shortCode: String(data.get('shortCode')), displayName: String(data.get('displayName')),
    })
    if (!input) { setError('Kürzel = 2–4 Buchstaben, z. B. AB'); return }
    const res = await api.ensureSignature(input.shortCode, input.displayName)
    if (res.ok) pick(res.value)
    else setError(res.error.kind === 'validation' ? 'Kürzel = 2–4 Buchstaben, z. B. AB' : 'Speichern fehlgeschlagen.')
  }

  if (value) {
    return (
      <div class="signature-bar" data-active>
        <span class="nums">{value.short_code}</span> · {value.display_name}
        <button type="button" onClick={() => { storage.removeItem(SIGNATURE_KEY); location.reload() }}>Wechseln</button>
      </div>
    )
  }
  return (
    <div class="signature-bar">
      <p>Wer arbeitet gerade? Kürzel wählen oder anlegen.</p>
      {existing.length > 0 && (
        <ul class="signature-list">
          {existing.map((s) => (
            <li key={s.id}><button type="button" onClick={() => pick(s)}>{s.short_code} · {s.display_name}</button></li>
          ))}
        </ul>
      )}
      <form onSubmit={create}>
        <label>Kürzel<input name="shortCode" maxlength={4} autocapitalize="characters" /></label>
        <label>Anzeigename<input name="displayName" maxlength={40} /></label>
        <button type="submit">Übernehmen</button>
      </form>
      {error && <p class="hint" role="status">{error}</p>}
    </div>
  )
}
```

`src/pilot/app/PilotApp.tsx` (session gate + route switch; routes filled by Tasks 21–25 — until then unknown routes fall back to the board placeholder):

```tsx
import { useEffect, useState } from 'preact/hooks'
import type { StorageLike } from '../../storage/store'
import type { PilotSession } from '../api/session'
import type { PilotApi, SignatureRow } from '../api/rpc'
import { SignIn } from './SignIn'
import { SignatureBar, loadStoredSignature } from './SignatureBar'

export interface PilotDeps {
  session: PilotSession
  api: PilotApi
  storage: StorageLike
  now(): Date
}

export type PilotRoute =
  | { view: 'board' } | { view: 'handover'; id: string }
  | { view: 'inbox' } | { view: 'archive' } | { view: 'admin' }

export function parsePilotRoute(hash: string): PilotRoute {
  const m = hash.match(/^#\/handover\/([\w-]+)$/)
  if (m) return { view: 'handover', id: m[1]! }
  if (hash === '#/inbox') return { view: 'inbox' }
  if (hash === '#/archive') return { view: 'archive' }
  if (hash === '#/admin') return { view: 'admin' }
  return { view: 'board' }
}

export function PilotApp({ deps }: { deps: PilotDeps }) {
  const [route, setRoute] = useState<PilotRoute>(parsePilotRoute(location.hash))
  const [signature, setSignature] = useState<SignatureRow | null>(loadStoredSignature(deps.storage))
  useEffect(() => {
    const onHash = () => setRoute(parsePilotRoute(location.hash))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  if (!deps.session.ready.value) return <main />
  if (!deps.session.user.value) return <SignIn session={deps.session} />

  return (
    <div class="app pilot">
      <header class="header">
        <span class="wordmark">Lobby Ledger · Team</span>
        <nav aria-label="Bereiche">
          <a href="#/">Übergaben</a> <a href="#/inbox">Eingang</a> <a href="#/archive">Archiv</a> <a href="#/admin">Verwaltung</a>
        </nav>
      </header>
      <SignatureBar api={deps.api} storage={deps.storage} value={signature} onChange={setSignature} />
      <main>
        {/* Tasks 21–25 mount ShiftBoard / HandoverEditor / Inbox / Archive / AdminPanel here */}
        {route.view === 'board' && <h1>Übergaben</h1>}
      </main>
    </div>
  )
}
```

`src/pilot/app/main.tsx` — replace the render call:

```tsx
import { render } from 'preact'
import '@fontsource-variable/fraunces'
import '../../styles/tokens.css'
import '../../styles/base.css'
import '../../styles/app.css'
import './pilot.css'
import { PilotApp } from './PilotApp'
import { createPilotClient } from '../api/client'
import { createSession } from '../api/session'
import { createPilotApi } from '../api/rpc'

const client = createPilotClient()
render(
  <PilotApp deps={{
    session: createSession(client),
    api: createPilotApi(client),
    storage: localStorage,
    now: () => new Date(),
  }} />,
  document.getElementById('app')!,
)
```

`src/pilot/app/pilot.css` — sign-in/signature styles on existing tokens (44px targets, 16px inputs):

```css
.signin, .signature-bar { max-width: var(--col-max); margin: 0 auto; padding: var(--space-4); }
.signature-bar { border-bottom: 1px solid var(--hairline); background: var(--paper-raised); }
.signature-bar[data-active] { display: flex; gap: var(--space-3); align-items: center; }
.signature-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.signature-list button, .signature-bar form button, .signin button {
  min-height: var(--tap); padding: 0 var(--space-4); border: 1px solid var(--hairline);
  border-radius: var(--radius); background: var(--paper-raised); color: var(--ink);
}
.signin input, .signature-bar input { min-height: var(--tap); font-size: var(--text-base); width: 100%; }
.hint { color: var(--wichtig-text); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. Manual: `npm run db:start`, `.env.local` pointed at the local stack (`API_URL` + local anon key), `npm run dev:pilot`, open `http://localhost:5174/pilot.html` at 390×844 → sign in with the local seed user → signature bar appears; created Kürzel survives reload.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): shell with shared sign-in and persisted staff signature"`

---

### Task 21: UI — shift board with Berlin date navigation

**Files:**
- Create: `src/pilot/app/ShiftBoard.tsx`, `src/pilot/app/ShiftBoard.test.tsx`
- Modify: `src/pilot/app/PilotApp.tsx` (mount), `src/pilot/app/pilot.css`

- [ ] **Step 1: Write the failing tests** — `src/pilot/app/ShiftBoard.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ShiftBoard } from './ShiftBoard'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'published', version: 2,
}

describe('ShiftBoard', () => {
  test('shows today (Berlin) with three shift columns and handover status', async () => {
    const fake = fakeSupabase({ tables: { handovers: [H] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={SIG}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    expect(screen.getByText('Fr, 10.07.2026')).toBeTruthy()
    expect(screen.getByText('Früh')).toBeTruthy()
    expect(screen.getByText('Spät')).toBeTruthy()
    expect(screen.getByText('Nacht')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Veröffentlicht')).toBeTruthy())
  })
  test('date navigation moves a day back and forward', async () => {
    const fake = fakeSupabase({ tables: { handovers: [] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={SIG}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    fireEvent.click(screen.getByLabelText('Vorheriger Tag'))
    expect(screen.getByText('Do, 09.07.2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Heute'))
    expect(screen.getByText('Fr, 10.07.2026')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Nächster Tag'))
    expect(screen.getByText('Sa, 11.07.2026')).toBeTruthy()
  })
  test('without a signature, creating a draft is blocked with a prompt', () => {
    const fake = fakeSupabase({ tables: { handovers: [] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={null}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    fireEvent.click(screen.getAllByText('Übergabe beginnen')[0]!)
    expect(screen.getByText(/Kürzel wählen oder anlegen/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./ShiftBoard`).

- [ ] **Step 3: Implement `src/pilot/app/ShiftBoard.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { SHIFTS, type Shift } from '../../domain/task'
import { SHIFT_LABELS } from '../../domain/labels'
import { addDays, formatServiceDate, nextTargetContext, serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null; now(): Date }

export function ShiftBoard({ api, signature, now }: Props) {
  const today = serviceContext(now()).serviceDate
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [needSignature, setNeedSignature] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void api.boardForDate(date).then((r) => {
      if (!live) return
      if (r.ok) { setRows(r.value); setError('') }
      else setError('Keine Verbindung. Änderung nicht gespeichert.')
    })
    return () => { live = false }
  }, [api, date])

  const begin = async (shift: Shift) => {
    if (!signature) { setNeedSignature(true); return }
    const target = nextTargetContext({ serviceDate: date, shift })
    const res = await api.createOrGetDraft({
      serviceDate: date, sourceShift: shift, sourceDepartment: 'front-office',
      targetShift: target.shift, targetDepartment: 'front-office',
    }, signature.id)
    if (res.ok) location.hash = `#/handover/${res.value.id}`
    else setError('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <section class="board">
      <h1>Übergaben</h1>
      <div class="date-nav">
        <button type="button" aria-label="Vorheriger Tag" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <span class="date-label">{formatServiceDate(date)}</span>
        <button type="button" aria-label="Nächster Tag" onClick={() => setDate(addDays(date, 1))}>›</button>
        {date !== today && <button type="button" onClick={() => setDate(today)}>Heute</button>}
        <label class="visually-hidden" for="board-date">Datum wählen</label>
        <input id="board-date" type="date" value={date}
               onChange={(e) => setDate((e.currentTarget as HTMLInputElement).value || today)} />
      </div>
      {needSignature && <p class="hint" role="status">Wer arbeitet gerade? Kürzel wählen oder anlegen.</p>}
      {error && <p class="hint" role="status">{error}</p>}
      <div class="shift-columns">
        {SHIFTS.map((shift) => {
          const mine = rows.filter((h) => h.source_shift === shift)
          return (
            <section class="shift-col" key={shift}>
              <h2>{SHIFT_LABELS[shift]}</h2>
              {mine.length === 0 && <p class="empty">Noch keine Übergabe.</p>}
              <ul>
                {mine.map((h) => (
                  <li key={h.id}>
                    <a href={`#/handover/${h.id}`}>
                      → {SHIFT_LABELS[h.target_shift]} · <span class="status" data-status={h.status}>{HANDOVER_STATUS_LABELS[h.status]}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void begin(shift)}>Übergabe beginnen</button>
            </section>
          )
        })}
      </div>
    </section>
  )
}
```

Mount in `PilotApp.tsx` — replace the board placeholder line:

```tsx
{route.view === 'board' && <ShiftBoard api={deps.api} signature={signature} now={deps.now} />}
```

(add `import { ShiftBoard } from './ShiftBoard'`).

Append to `pilot.css`:

```css
.board, .editor, .inbox, .archive, .admin { max-width: var(--col-max); margin: 0 auto; padding: var(--space-4); }
.date-nav { display: flex; gap: var(--space-2); align-items: center; }
.date-nav button, .date-nav input { min-height: var(--tap); min-width: var(--tap); font-size: var(--text-base); }
.shift-columns { display: grid; gap: var(--space-4); }
@media (min-width: 680px) { .shift-columns { grid-template-columns: repeat(3, 1fr); } }
.shift-col h2 { font-family: var(--font-display); font-size: var(--text-lg); }
.shift-col ul { list-style: none; padding: 0; margin: 0; }
.shift-col a { display: block; min-height: var(--tap); padding: var(--space-3) 0; border-bottom: 1px solid var(--hairline); color: var(--ink); }
.status[data-status='published'] { color: var(--accent); }
.status[data-status='acknowledged'] { color: var(--ink-soft); }
.empty { color: var(--ink-soft); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. Manual at 390×844: date arrows, calendar input, Heute; no horizontal scroll.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): shift board with Berlin date navigation"`

---

### Task 22: UI — handover editor: capture, templates, task list, carry-over

**Files:**
- Create: `src/pilot/app/HandoverEditor.tsx`, `src/pilot/app/HandoverEditor.test.tsx`
- Modify: `src/pilot/app/PilotApp.tsx` (mount), `src/pilot/app/pilot.css`

- [ ] **Step 1: Write the failing tests** — `src/pilot/app/HandoverEditor.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { HandoverEditor } from './HandoverEditor'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'draft', version: 1,
}
const TASK = {
  id: 't1', handover_id: 'h1', text: 'Wasserkocher defekt', room_reference: '204',
  department: 'front-office', priority: 'wichtig', status: 'open', version: 1,
  created_by_signature_id: 's1', completed_by_signature_id: null, completed_at: null,
  carry_over_from_task_id: null, guest_case_id: null, template: 'technik', created_at: '2026-07-10T07:00:00Z',
}

function setup(tables = {}, rpc = {}) {
  const fake = fakeSupabase({
    tables: { handovers: [H], handover_tasks: [TASK], staff_signatures: [SIG], ...tables },
    rpc: { add_task: (a) => ({ data: { ...TASK, id: 't2', text: a.p_text } }), ...rpc },
  })
  render(<HandoverEditor api={createPilotApi(fake.client)} signature={SIG} handoverId="h1" />)
  return fake
}

describe('HandoverEditor', () => {
  test('shows routing context and existing tasks with priority', async () => {
    setup()
    await waitFor(() => expect(screen.getByText(/Früh Front Office → Spät Front Office/)).toBeTruthy())
    expect(screen.getByText('Wasserkocher defekt')).toBeTruthy()
    expect(screen.getByText('Wichtig')).toBeTruthy()
  })
  test('contact data in capture text blocks the save with the guest-case hint', async () => {
    const fake = setup()
    await waitFor(() => screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)'))
    fireEvent.input(screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)'),
      { target: { value: 'Rückruf +49 171 2345678' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Aufgabe erfassen' }))
    expect(screen.getByText('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')).toBeTruthy()
    expect(fake.calls.filter((c) => c.fn === 'add_task')).toHaveLength(0)
  })
  test('template chip prefills text and tags the task', async () => {
    const fake = setup()
    await waitFor(() => screen.getByText('Technik'))
    fireEvent.click(screen.getByText('Technik'))
    const input = screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)') as HTMLInputElement
    expect(input.value).toBe('Technik: ')
    fireEvent.input(input, { target: { value: 'Technik: Wasserkocher 204' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Aufgabe erfassen' }))
    await waitFor(() => {
      const call = fake.calls.find((c) => c.fn === 'add_task')!
      expect((call.args as Record<string, unknown>).p_template).toBe('technik')
    })
  })
  test('carried-over task shows its origin label', async () => {
    setup({
      handover_tasks: [{ ...TASK, carry_over_from_task_id: 't0', text: 'Anreise ca. 23 Uhr' }],
    })
    await waitFor(() => expect(screen.getByText(/übertragen aus/)).toBeTruthy())
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL (cannot resolve `./HandoverEditor`).

- [ ] **Step 3: Implement `src/pilot/app/HandoverEditor.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENTS, type Department, type Priority } from '../../domain/task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { formatServiceDate } from '../domain/berlin'
import { containsLikelyContact } from '../domain/signature'
import { HANDOVER_STATUS_LABELS, PILOT_TASK_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow, TaskRow } from '../api/rpc'
import { GuestCaseDrawer } from './GuestCaseDrawer'
import { ReviewPublish } from './ReviewPublish'

export const TEMPLATES: Array<{ key: string; label: string; prefill: string }> = [
  { key: 'technik', label: 'Technik', prefill: 'Technik: ' },
  { key: 'zimmer_pruefen', label: 'Zimmer prüfen', prefill: 'Zimmer prüfen: ' },
  { key: 'rechnung_beleg', label: 'Rechnung/Beleg', prefill: 'Rechnung/Beleg: ' },
  { key: 'fruehstueck', label: 'Frühstück', prefill: 'Frühstück: ' },
  { key: 'rueckruf', label: 'Rückruf', prefill: 'Rückruf: ' },
]

interface Props { api: PilotApi; signature: SignatureRow | null; handoverId: string }

export function HandoverEditor({ api, signature, handoverId }: Props) {
  const [handover, setHandover] = useState<HandoverRow | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [text, setText] = useState('')
  const [department, setDepartment] = useState<Department>('front-office')
  const [ref, setRef] = useState('')
  const [wichtig, setWichtig] = useState(false)
  const [template, setTemplate] = useState<string | null>(null)
  const [guestCaseId, setGuestCaseId] = useState<string | null>(null)
  const [hint, setHint] = useState('')

  useEffect(() => {
    let live = true
    void api.handoverById(handoverId).then((r) => { if (live && r.ok) setHandover(r.value) })
    void api.tasksFor(handoverId).then((r) => { if (live && r.ok) setTasks(r.value) })
    return () => { live = false }
  }, [api, handoverId])

  const refresh = () => void api.tasksFor(handoverId).then((r) => { if (r.ok) setTasks(r.value) })

  const capture = async (e: Event) => {
    e.preventDefault()
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const trimmed = text.trim()
    if (!trimmed) return
    if (containsLikelyContact(trimmed)) {
      setHint('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')
      return
    }
    const res = await api.addTask({
      handoverId, signatureId: signature.id, text: trimmed, roomReference: ref,
      department, priority: wichtig ? 'wichtig' : 'normal',
      guestCaseId, template,
    })
    if (res.ok) {
      setText(''); setRef(''); setWichtig(false); setTemplate(null); setGuestCaseId(null); setHint('')
      refresh()
    } else {
      setHint(res.error.kind === 'validation'
        ? 'Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.'
        : 'Keine Verbindung. Änderung nicht gespeichert.')
    }
  }

  const complete = async (t: TaskRow) => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const res = await api.completeTask(t.id, signature.id, t.version)
    if (!res.ok && res.error.kind === 'conflict') {
      setHint('Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.')
    }
    refresh()
  }

  if (!handover) return <section class="editor"><p class="empty">Lade Übergabe …</p></section>
  const isDraft = handover.status === 'draft'

  return (
    <section class="editor">
      <p class="context nums">
        {SHIFT_LABELS[handover.source_shift]} {DEPARTMENT_LABELS[handover.source_department]} → {SHIFT_LABELS[handover.target_shift]} {DEPARTMENT_LABELS[handover.target_department]} · {formatServiceDate(handover.service_date)}
      </p>
      <h1>Übergabe · {HANDOVER_STATUS_LABELS[handover.status]}</h1>

      <ul class="task-list">
        {tasks.map((t) => (
          <li key={t.id} class="task-row" data-priority={t.priority} data-status={t.status}>
            {t.room_reference && <span class="nums ref">{t.room_reference}</span>}
            <span class="text">{t.text}</span>
            {t.priority === 'wichtig' && <span class="badge">Wichtig</span>}
            {t.carry_over_from_task_id && <span class="origin">übertragen aus früherer Übergabe</span>}
            {t.guest_case_id && <GuestCaseDrawer api={api} signature={signature} caseId={t.guest_case_id} />}
            {t.status === 'open'
              ? <button type="button" onClick={() => void complete(t)}>Als erledigt markieren</button>
              : <span class="done-label">{PILOT_TASK_STATUS_LABELS[t.status]}</span>}
          </li>
        ))}
        {tasks.length === 0 && <li class="empty">Noch keine Aufgaben. Unten erfassen — Zimmer oder Stichwort genügt.</li>}
      </ul>

      {isDraft && (
        <form class="capture" aria-label="Aufgabe erfassen" onSubmit={capture}>
          <div class="templates" role="group" aria-label="Vorlagen">
            {TEMPLATES.map((tpl) => (
              <button type="button" key={tpl.key} class="chip" aria-pressed={template === tpl.key}
                      onClick={() => { setTemplate(tpl.key); setText(tpl.prefill) }}>
                {tpl.label}
              </button>
            ))}
          </div>
          <input value={text} maxlength={200} placeholder="Neue Aufgabe … (keine Gastnamen)"
                 onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} />
          <div class="capture-details">
            <label>Ref<input class="nums" value={ref} maxlength={24}
                   onInput={(e) => setRef((e.currentTarget as HTMLInputElement).value)} /></label>
            <fieldset><legend class="visually-hidden">Abteilung</legend>
              {DEPARTMENTS.map((d) => (
                <label class="chip" key={d}>
                  <input type="radio" name="department" checked={department === d}
                         onChange={() => setDepartment(d)} />{DEPARTMENT_LABELS[d]}
                </label>
              ))}
            </fieldset>
            <label class="chip"><input type="checkbox" checked={wichtig}
                   onChange={(e) => setWichtig((e.currentTarget as HTMLInputElement).checked)} />Wichtig</label>
            <GuestCaseDrawer api={api} signature={signature} caseId={guestCaseId}
                             onCreated={setGuestCaseId} creatable />
          </div>
          <button type="submit">Erfassen</button>
          {hint && <p class="hint" role="status">{hint}</p>}
        </form>
      )}

      <ReviewPublish api={api} signature={signature} handover={handover} tasks={tasks}
                     onChanged={(h) => setHandover(h)} />
    </section>
  )
}
```

Also in this step add to `src/pilot/api/rpc.ts` (single query the editor needs):

```ts
    async handoverById(id: string): Promise<Result<HandoverRow>> {
      return wrap(await client.from('handovers').select('*').eq('id', id).single())
    },
```

The editor imports two components that get their real TDD treatment in Tasks 23–24. Create them now as render-nothing stubs so this task compiles and its tests stay focused (their test files arrive with the real implementations):

`src/pilot/app/ReviewPublish.tsx` (stub, replaced in Task 23):

```tsx
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface TaskSummary { status: string; priority: string; carry_over_from_task_id: string | null }
export function ReviewPublish(_props: {
  api: PilotApi; signature: SignatureRow | null; handover: HandoverRow
  tasks: TaskSummary[]; onChanged(h: HandoverRow): void
}) {
  return null // Task 23 implements review + publish
}
```

`src/pilot/app/GuestCaseDrawer.tsx` (stub, replaced in Task 24):

```tsx
import type { PilotApi, SignatureRow } from '../api/rpc'

export function GuestCaseDrawer(_props: {
  api: PilotApi; signature: SignatureRow | null; caseId: string | null
  creatable?: boolean; onCreated?(id: string): void
}) {
  return null // Task 24 implements the purpose-gated drawer
}
```

Mount in `PilotApp.tsx`:

```tsx
{route.view === 'handover' && <HandoverEditor api={deps.api} signature={signature} handoverId={route.id} />}
```

Append to `pilot.css`:

```css
.context { color: var(--ink-soft); font-size: var(--text-sm); }
.task-list { list-style: none; margin: 0; padding: 0; }
.task-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;
  padding: var(--space-3) 0; border-bottom: 1px solid var(--hairline); }
.task-row[data-priority='wichtig'] { border-left: 3px solid var(--brass); padding-left: var(--space-2); }
.task-row[data-status='done'] .text, .task-row[data-status='carried'] .text { color: var(--ink-soft); }
.badge { color: var(--wichtig-text); background: var(--wichtig-bg); padding: 0 var(--space-2); border-radius: var(--radius); }
.origin, .done-label { color: var(--ink-soft); font-size: var(--text-sm); }
.templates { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--tap);
  padding: 0 var(--space-3); border: 1px solid var(--hairline); border-radius: var(--radius); }
.capture input[type='text'], .capture input:not([type]) { width: 100%; min-height: var(--tap); font-size: var(--text-base); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): handover editor with templates, capture guard, carry-over origin"`

---

### Task 23: UI — review/publish & receiving inbox with acknowledge

**Files:**
- Modify: `src/pilot/app/ReviewPublish.tsx` (replace Task 22 stub), `src/pilot/app/PilotApp.tsx` (mount inbox), `src/pilot/app/pilot.css`
- Create: `src/pilot/app/ReviewPublish.test.tsx`, `src/pilot/app/Inbox.tsx`, `src/pilot/app/Inbox.test.tsx`

- [ ] **Step 1: Write the failing tests.**

`src/pilot/app/ReviewPublish.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ReviewPublish } from './ReviewPublish'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'draft', version: 1,
  published_at: null, published_by_signature_id: null,
}
const OPEN = { id: 't1', status: 'open', priority: 'wichtig', carry_over_from_task_id: null }
const CARRIED_IN = { id: 't2', status: 'open', priority: 'normal', carry_over_from_task_id: 't0' }

describe('ReviewPublish', () => {
  test('summarises open/wichtig/carry-over counts and publishes with version', async () => {
    const fake = fakeSupabase({
      rpc: { publish_handover: () => ({ data: { ...H, status: 'published', version: 2 } }) },
    })
    const changed: unknown[] = []
    render(<ReviewPublish api={createPilotApi(fake.client)} signature={SIG}
                          handover={H} tasks={[OPEN, CARRIED_IN]} onChanged={(h) => changed.push(h)} />)
    expect(screen.getByText('Offen: 2 · Wichtig: 1 · Übertragen: 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Übergabe veröffentlichen'))
    await waitFor(() => expect(changed).toHaveLength(1))
    expect(fake.calls[0]!.args).toMatchObject({ p_handover_id: 'h1', p_expected_version: 1 })
  })
  test('conflict shows the reload hint, no success state', async () => {
    const fake = fakeSupabase({
      rpc: { publish_handover: () => ({ error: { code: 'P0409', message: 'conflict' } }) },
    })
    render(<ReviewPublish api={createPilotApi(fake.client)} signature={SIG}
                          handover={H} tasks={[]} onChanged={() => {}} />)
    fireEvent.click(screen.getByText('Übergabe veröffentlichen'))
    await waitFor(() =>
      expect(screen.getByText('Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.')).toBeTruthy())
  })
})
```

`src/pilot/app/Inbox.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Inbox } from './Inbox'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's2', short_code: 'LK', display_name: 'L', is_admin: false, active: true }
const PUBLISHED = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'published', version: 2,
}

describe('Inbox', () => {
  test('lists published handovers for the current target context and acknowledges', async () => {
    const fake = fakeSupabase({
      tables: { handovers: [PUBLISHED] },
      rpc: { acknowledge_handover: () => ({ data: { ...PUBLISHED, status: 'acknowledged' } }) },
    })
    render(<Inbox api={createPilotApi(fake.client)} signature={SIG}
                  now={() => new Date('2026-07-10T13:00:00Z')} />) // 15:00 Berlin = Spät
    await waitFor(() => expect(screen.getByText(/Früh Front Office/)).toBeTruthy())
    fireEvent.click(screen.getByText('Übernahme bestätigen'))
    await waitFor(() => expect(screen.getByText('Übernommen')).toBeTruthy())
    expect(fake.calls.find((c) => c.fn === 'acknowledge_handover')!.args)
      .toMatchObject({ p_handover_id: 'h1', p_signature_id: 's2' })
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL.

- [ ] **Step 3: Implement.**

`src/pilot/app/ReviewPublish.tsx` (replaces the stub):

```tsx
import { useState } from 'preact/hooks'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface TaskSummary { status: string; priority: string; carry_over_from_task_id: string | null }
interface Props {
  api: PilotApi
  signature: SignatureRow | null
  handover: HandoverRow
  tasks: TaskSummary[]
  onChanged(h: HandoverRow): void
}

export function ReviewPublish({ api, signature, handover, tasks, onChanged }: Props) {
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  if (handover.status !== 'draft') {
    return handover.published_at
      ? <p class="publish-stamp">Veröffentlicht um {new Date(handover.published_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
      : null
  }
  const open = tasks.filter((t) => t.status === 'open').length
  const wichtig = tasks.filter((t) => t.status === 'open' && t.priority === 'wichtig').length
  const carried = tasks.filter((t) => t.carry_over_from_task_id !== null).length

  const publish = async () => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    setPending(true)
    const res = await api.publishHandover(handover.id, signature.id, handover.version)
    setPending(false)
    if (res.ok) onChanged(res.value)
    else setHint(res.error.kind === 'conflict'
      ? 'Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.'
      : 'Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <div class="review">
      <p class="nums">Offen: {open} · Wichtig: {wichtig} · Übertragen: {carried}</p>
      <button type="button" disabled={pending} onClick={() => void publish()}>
        {pending ? '…' : 'Übergabe veröffentlichen'}
      </button>
      {hint && <p class="hint" role="status">{hint}</p>}
    </div>
  )
}
```

`src/pilot/app/Inbox.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null; now(): Date }

export function Inbox({ api, signature, now }: Props) {
  const ctx = serviceContext(now())
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [hint, setHint] = useState('')

  const load = () => void api.boardForDate(ctx.serviceDate).then((r) => {
    if (r.ok) setRows(r.value.filter((h) => h.target_shift === ctx.shift && h.status !== 'draft'))
  })
  useEffect(load, [api, ctx.serviceDate, ctx.shift])

  const acknowledge = async (h: HandoverRow) => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const res = await api.acknowledgeHandover(h.id, signature.id)
    if (res.ok) setRows((prev) => prev.map((row) => (row.id === h.id ? res.value : row)))
    else setHint('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <section class="inbox">
      <h1>Eingang · {SHIFT_LABELS[ctx.shift]}</h1>
      {rows.length === 0 && <p class="empty">Keine veröffentlichten Übergaben für diese Schicht.</p>}
      <ul class="task-list">
        {rows.map((h) => (
          <li key={h.id} class="task-row">
            <a href={`#/handover/${h.id}`}>
              {SHIFT_LABELS[h.source_shift]} {DEPARTMENT_LABELS[h.source_department]} → {SHIFT_LABELS[h.target_shift]} {DEPARTMENT_LABELS[h.target_department]}
            </a>
            {h.status === 'published'
              ? <button type="button" onClick={() => void acknowledge(h)}>Übernahme bestätigen</button>
              : <span class="status" data-status="acknowledged">{HANDOVER_STATUS_LABELS[h.status]}</span>}
          </li>
        ))}
      </ul>
      {hint && <p class="hint" role="status">{hint}</p>}
    </section>
  )
}
```

Mount in `PilotApp.tsx`: `{route.view === 'inbox' && <Inbox api={deps.api} signature={signature} now={deps.now} />}`.

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): publish review and receiving inbox with acknowledgement"`

---

### Task 24: UI — guest case drawer (purpose gate, masking, audited reveal)

**Files:**
- Modify: `src/pilot/app/GuestCaseDrawer.tsx` (replace Task 22 stub), `src/pilot/app/pilot.css`
- Create: `src/pilot/app/GuestCaseDrawer.test.tsx`

- [ ] **Step 1: Write the failing tests** — `src/pilot/app/GuestCaseDrawer.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { GuestCaseDrawer } from './GuestCaseDrawer'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const MASKED = {
  id: 'g1', room_reference: '117', purpose: 'callback', purpose_note: null,
  expires_at: '2026-08-09T14:00:00Z', deleted_at: null,
  masked_name: 'T. S.', masked_contact: '••• 11', has_contact: true, has_name: true,
}

describe('GuestCaseDrawer — creation', () => {
  test('name/contact fields stay disabled until a purpose is chosen', () => {
    const fake = fakeSupabase()
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId={null} creatable onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Gastbezug (optional)'))
    expect((screen.getByLabelText('Gastname') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Zweck (erforderlich)'), { target: { value: 'callback' } })
    expect((screen.getByLabelText('Gastname') as HTMLInputElement).disabled).toBe(false)
  })
  test('saving calls create_guest_case and reports the id', async () => {
    const fake = fakeSupabase({ rpc: { create_guest_case: () => ({ data: 'g1' }) } })
    const created: string[] = []
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId={null} creatable onCreated={(id) => created.push(id)} />)
    fireEvent.click(screen.getByText('Gastbezug (optional)'))
    fireEvent.change(screen.getByLabelText('Zweck (erforderlich)'), { target: { value: 'callback' } })
    fireEvent.input(screen.getByLabelText('Gastname'), { target: { value: 'Testgast Synthetisch' } })
    fireEvent.click(screen.getByText('Gastfall speichern'))
    await waitFor(() => expect(created).toEqual(['g1']))
    expect(fake.calls[0]!.args).toMatchObject({ p_purpose: 'callback', p_guest_name: 'Testgast Synthetisch' })
  })
})

describe('GuestCaseDrawer — display', () => {
  test('shows masked values, expiry, and reveals only on the audited action', async () => {
    const fake = fakeSupabase({
      tables: { guest_case_view: [MASKED] },
      rpc: { reveal_guest_case: () => ({ data: [{ guest_name: 'Testgast Synthetisch', contact_type: 'phone', contact_value: '+49 000 111' }] }) },
    })
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId="g1" />)
    await waitFor(() => expect(screen.getByText('T. S.')).toBeTruthy())
    expect(screen.getByText('••• 11')).toBeTruthy()
    expect(screen.getByText(/Wird gelöscht am/)).toBeTruthy()
    expect(screen.queryByText('+49 000 111')).toBeNull()
    fireEvent.click(screen.getByText('Kontakt anzeigen (wird protokolliert)'))
    await waitFor(() => expect(screen.getByText('+49 000 111')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL.

- [ ] **Step 3: Implement `src/pilot/app/GuestCaseDrawer.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { GUEST_PURPOSES, type GuestPurpose } from '../domain/handover'
import { PURPOSE_LABELS } from '../domain/labels'
import { formatServiceDate } from '../domain/berlin'
import type { GuestCaseMasked, PilotApi, SignatureRow } from '../api/rpc'

interface Props {
  api: PilotApi
  signature: SignatureRow | null
  caseId: string | null
  creatable?: boolean
  onCreated?(id: string): void
}

export function GuestCaseDrawer({ api, signature, caseId, creatable, onCreated }: Props) {
  return caseId
    ? <ExistingCase api={api} signature={signature} caseId={caseId} />
    : creatable ? <CreateCase api={api} signature={signature} onCreated={onCreated!} /> : null
}

function CreateCase({ api, signature, onCreated }: { api: PilotApi; signature: SignatureRow | null; onCreated(id: string): void }) {
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState<GuestPurpose | ''>('')
  const [hint, setHint] = useState('')
  if (!open) return <button type="button" class="chip" onClick={() => setOpen(true)}>Gastbezug (optional)</button>

  const save = async (e: Event) => {
    e.preventDefault()
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    if (!purpose) { setHint('Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.'); return }
    const form = new FormData((e.currentTarget as HTMLElement).closest('form') as HTMLFormElement)
    const res = await api.createGuestCase({
      signatureId: signature.id, purpose,
      purposeNote: String(form.get('purposeNote') ?? '') || undefined,
      roomReference: String(form.get('room') ?? ''),
      guestName: String(form.get('guestName') ?? '') || undefined,
      contactType: (form.get('contactType') as 'phone' | 'email') || undefined,
      contactValue: String(form.get('contactValue') ?? '') || undefined,
    })
    if (res.ok) { setOpen(false); onCreated(res.value) }
    else setHint(res.error.kind === 'validation'
      ? 'Zweck „Sonstiges“ braucht eine kurze Begründung.'
      : 'Keine Verbindung. Änderung nicht gespeichert.')
  }

  const gated = purpose === ''
  return (
    <form class="guest-case" onSubmit={save}>
      <label>Zweck (erforderlich)
        <select value={purpose} onChange={(e) => setPurpose((e.currentTarget as HTMLSelectElement).value as GuestPurpose | '')}>
          <option value="">– wählen –</option>
          {GUEST_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
        </select>
      </label>
      {purpose === 'other' && <label>Begründung<input name="purposeNote" maxlength={120} /></label>}
      {gated && <p class="hint">Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.</p>}
      <label>Zimmer<input name="room" class="nums" maxlength={24} disabled={gated} /></label>
      <label>Gastname<input name="guestName" maxlength={80} disabled={gated} /></label>
      <label>Kontaktart
        <select name="contactType" disabled={gated}>
          <option value="">–</option><option value="phone">Telefon</option><option value="email">E-Mail</option>
        </select>
      </label>
      <label>Kontakt<input name="contactValue" maxlength={120} disabled={gated} /></label>
      <button type="submit" disabled={gated}>Gastfall speichern</button>
      {hint && <p class="hint" role="status">{hint}</p>}
    </form>
  )
}

function ExistingCase({ api, signature, caseId }: { api: PilotApi; signature: SignatureRow | null; caseId: string }) {
  const [masked, setMasked] = useState<GuestCaseMasked | null>(null)
  const [revealed, setRevealed] = useState<{ guest_name: string | null; contact_value: string | null } | null>(null)
  const [hint, setHint] = useState('')
  useEffect(() => {
    void api.guestCase(caseId).then((r) => { if (r.ok) setMasked(r.value) })
  }, [api, caseId])
  if (!masked) return null
  if (masked.deleted_at) return <p class="guest-case">Gastdaten gelöscht.</p>

  const reveal = async () => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const res = await api.revealGuestCase(caseId, signature.id)
    if (res.ok && res.value[0]) setRevealed(res.value[0])
    else setHint('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <div class="guest-case" data-masked={!revealed}>
      <span class="badge">Gastbezug · {PURPOSE_LABELS[masked.purpose]}</span>
      {masked.room_reference && <span class="nums">{masked.room_reference}</span>}
      {revealed ? (
        <>
          <span>{revealed.guest_name}</span>
          <span class="nums">{revealed.contact_value}</span>
        </>
      ) : (
        <>
          {masked.masked_name && <span>{masked.masked_name}</span>}
          {masked.masked_contact && <span class="nums">{masked.masked_contact}</span>}
          <span class="hint">Aus Datenschutzgründen ausgeblendet</span>
          {(masked.has_contact || masked.has_name) && (
            <button type="button" onClick={() => void reveal()}>Kontakt anzeigen (wird protokolliert)</button>
          )}
        </>
      )}
      {masked.expires_at && <span class="origin">Wird gelöscht am {formatServiceDate(masked.expires_at.slice(0, 10))}</span>}
      {hint && <p class="hint" role="status">{hint}</p>}
    </div>
  )
}
```

Append to `pilot.css`:

```css
.guest-case { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;
  padding: var(--space-3); border: 1px solid var(--hairline); border-radius: var(--radius);
  background: var(--paper-raised); width: 100%; }
.guest-case label { display: block; width: 100%; }
.guest-case input, .guest-case select { width: 100%; min-height: var(--tap); font-size: var(--text-base); }
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): purpose-gated guest case drawer with masking and audited reveal"`

---

### Task 25: UI — archive/search, pilot metrics export, admin panel

**Files:**
- Create: `src/pilot/app/Archive.tsx`, `src/pilot/app/Archive.test.tsx`, `src/pilot/app/AdminPanel.tsx`, `src/pilot/app/AdminPanel.test.tsx`
- Modify: `src/pilot/app/PilotApp.tsx` (mount), `src/pilot/app/pilot.css`

- [ ] **Step 1: Write the failing tests.**

`src/pilot/app/Archive.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Archive } from './Archive'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-08', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'acknowledged', version: 3,
}

describe('Archive', () => {
  test('lists prior handovers and copies a non-PII metrics summary', async () => {
    const fake = fakeSupabase({
      tables: { handovers: [H] },
      rpc: { pilot_metrics: () => ({ data: { handovers: 1, published: 1, acknowledged: 1, tasks: 4, carried_over: 1, template_usage: { technik: 2 } } }) },
    })
    render(<Archive api={createPilotApi(fake.client)} signature={SIG} />)
    await waitFor(() => expect(screen.getByText(/Mi, 08.07.2026/)).toBeTruthy())
    fireEvent.click(screen.getByText('Pilot-Kennzahlen kopieren'))
    await waitFor(() => expect(screen.getByText('Kopiert ✓')).toBeTruthy())
  })
})
```

`src/pilot/app/AdminPanel.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { AdminPanel } from './AdminPanel'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const ADMIN = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: true, active: true }

describe('AdminPanel', () => {
  test('non-admin signature sees the block message', () => {
    const fake = fakeSupabase()
    render(<AdminPanel api={createPilotApi(fake.client)} signature={{ ...ADMIN, is_admin: false }} />)
    expect(screen.getByText('Nur für die Pilotleitung (Admin-Kürzel).')).toBeTruthy()
  })
  test('admin sees retention health and audit list; failure is called out', async () => {
    const fake = fakeSupabase({
      rpc: {
        retention_health: () => ({ data: [{ last_ran_at: '2026-07-10T02:15:00Z', last_ok: false, last_error: 'boom', overdue_cases: 2 }] }),
        list_audit_events: () => ({ data: [{ id: 1, action: 'handover.published', occurred_at: '2026-07-10T06:10:00Z', entity_type: 'handover', entity_id: 'h1' }] }),
      },
      tables: { staff_signatures: [ADMIN] },
    })
    render(<AdminPanel api={createPilotApi(fake.client)} signature={ADMIN} />)
    await waitFor(() => expect(screen.getByText('Löschlauf fehlgeschlagen – bitte prüfen.')).toBeTruthy())
    expect(screen.getByText('handover.published')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify RED** — `npm test` → FAIL.

- [ ] **Step 3: Implement.**

`src/pilot/app/Archive.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { formatServiceDate, serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import { copyText } from '../../app/export'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null }

export function Archive({ api, signature }: Props) {
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void api.searchArchive({}).then((r) => { if (r.ok) setRows(r.value) })
  }, [api])

  const copyMetrics = async () => {
    if (!signature) return
    const to = serviceContext(new Date()).serviceDate
    const from = `${to.slice(0, 8)}01`
    const res = await api.pilotMetrics(signature.id, from, to)
    if (!res.ok) return
    const m = res.value
    const ok = await copyText(
      [`PILOT-KENNZAHLEN ${from} – ${to}`,
       `Übergaben: ${m.handovers} · veröffentlicht: ${m.published} · übernommen: ${m.acknowledged}`,
       `Aufgaben: ${m.tasks} · übertragen: ${m.carried_over}`,
       `Vorlagen: ${JSON.stringify(m.template_usage)}`].join('\n'))
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  return (
    <section class="archive">
      <h1>Archiv</h1>
      <button type="button" onClick={() => void copyMetrics()}>
        {copied ? 'Kopiert ✓' : 'Pilot-Kennzahlen kopieren'}
      </button>
      <ul class="task-list">
        {rows.map((h) => (
          <li key={h.id} class="task-row">
            <a href={`#/handover/${h.id}`}>
              {formatServiceDate(h.service_date)} · {SHIFT_LABELS[h.source_shift]} {DEPARTMENT_LABELS[h.source_department]} → {SHIFT_LABELS[h.target_shift]} · {HANDOVER_STATUS_LABELS[h.status]}
            </a>
          </li>
        ))}
        {rows.length === 0 && <li class="empty">Noch keine archivierten Übergaben.</li>}
      </ul>
    </section>
  )
}
```

(`copyText` already exists in `src/app/export.ts` from the MVP — reused, not modified. Room/author filtering happens client-side over the loaded rows in a follow-up if the pilot needs it; the RPC-side filter contract is date/status, which `searchArchive` already sends.)

`src/pilot/app/AdminPanel.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks'
import type { PilotApi, SignatureRow } from '../api/rpc'

interface Health { last_ran_at: string; last_ok: boolean; last_error: string | null; overdue_cases: number }
interface AuditRow { id: number; action: string; occurred_at: string; entity_type: string; entity_id: string }
interface Props { api: PilotApi; signature: SignatureRow | null }

export function AdminPanel({ api, signature }: Props) {
  const [health, setHealth] = useState<Health | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [signatures, setSignatures] = useState<SignatureRow[]>([])
  const [caseId, setCaseId] = useState('')
  const [armed, setArmed] = useState(false)
  const [status, setStatus] = useState('')

  const isAdmin = signature?.is_admin === true
  useEffect(() => {
    if (!isAdmin || !signature) return
    void api.retentionHealth(signature.id).then((r) => { if (r.ok && r.value[0]) setHealth(r.value[0]) })
    void api.listAuditEvents(signature.id).then((r) => { if (r.ok) setAudit(r.value as AuditRow[]) })
    void api.listSignatures().then((r) => { if (r.ok) setSignatures(r.value) })
  }, [api, signature, isAdmin])

  if (!isAdmin) return <section class="admin"><p class="hint">Nur für die Pilotleitung (Admin-Kürzel).</p></section>

  const deleteCase = async () => {
    if (!armed) { setArmed(true); return }
    const res = await api.adminDeleteGuestCase(caseId.trim(), signature!.id)
    setArmed(false)
    setStatus(res.ok ? 'Gastdaten gelöscht.' : 'Löschen fehlgeschlagen – ID prüfen.')
  }

  return (
    <section class="admin">
      <h1>Verwaltung</h1>
      <h2>Löschläufe</h2>
      {health ? (
        health.last_ok
          ? <p>Löschlauf zuletzt erfolgreich: {new Date(health.last_ran_at).toLocaleDateString('de-DE')}</p>
          : <p class="hint" role="status">Löschlauf fehlgeschlagen – bitte prüfen. ({health.last_error}) Überfällige Fälle: {health.overdue_cases}</p>
      ) : <p class="empty">Noch kein Löschlauf protokolliert.</p>}

      <h2>Gastdaten sofort löschen</h2>
      <label>Gastfall-ID<input class="nums" value={caseId}
             onInput={(e) => { setCaseId((e.currentTarget as HTMLInputElement).value); setArmed(false) }} /></label>
      <button type="button" onClick={() => void deleteCase()}>
        {armed ? 'Wirklich sofort löschen?' : 'Gastdaten sofort löschen'}
      </button>
      {status && <p role="status">{status}</p>}

      <h2>Kürzel</h2>
      <ul class="task-list">
        {signatures.map((s) => (
          <li key={s.id} class="task-row">
            <span class="nums">{s.short_code}</span> {s.display_name} {s.is_admin && <span class="badge">Admin</span>}
            {s.active && !s.is_admin && (
              <button type="button" onClick={() => void api.deactivateSignature(signature!.id, s.id).then(() => location.reload())}>
                Deaktivieren
              </button>
            )}
            {!s.active && <span class="origin">deaktiviert</span>}
          </li>
        ))}
      </ul>

      <h2>Protokoll</h2>
      <ul class="task-list audit">
        {audit.map((a) => (
          <li key={a.id} class="task-row nums">
            {new Date(a.occurred_at).toLocaleString('de-DE')} · {a.action} · {a.entity_type} {a.entity_id.slice(0, 8)}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Mount both in `PilotApp.tsx`:

```tsx
{route.view === 'archive' && <Archive api={deps.api} signature={signature} />}
{route.view === 'admin' && <AdminPanel api={deps.api} signature={signature} />}
```

- [ ] **Step 4: Verify GREEN** — `npm test` → PASS. `npm run typecheck` → clean. Manual sweep at 390×844 across board → editor → inbox → archive → admin: no horizontal scroll, all targets ≥ 44px.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(pilot): archive with metrics export and admin panel"`

---

### Task 26: E2E — pilot flows, privacy egress, accessibility

**Files:**
- Create: `playwright.pilot.config.ts`, `e2e/pilot/flows.spec.ts`, `e2e/pilot/privacy.spec.ts`, `e2e/pilot/a11y.spec.ts`

Precondition: local stack running (`npm run db:start`, `npm run db:reset`) and `.env.local` pointing at it (`VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_ANON_KEY=<local anon key from supabase status>` — well-known local dev key, still kept out of git by the `.env*` ignore rule).

- [ ] **Step 1: Write `playwright.pilot.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/pilot',
  webServer: {
    command: 'npm run build:pilot && npm run preview:pilot',
    url: 'http://localhost:4174/pilot.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4174' },
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
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
})
```

- [ ] **Step 2: Write `e2e/pilot/flows.spec.ts`** (the spec's success criterion: find → create → publish → acknowledge with two signatures, plus carry-over):

```ts
import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
}

async function actAs(page: Page, shortCode: string) {
  const bar = page.locator('.signature-bar')
  if (await bar.getByRole('button', { name: 'Wechseln' }).isVisible()) {
    await bar.getByRole('button', { name: 'Wechseln' }).click()
  }
  await page.getByRole('button', { name: new RegExp(`^${shortCode} ·`) }).click()
}

test('publish → acknowledge → carry-over with two signatures', async ({ page }) => {
  await signIn(page)
  await actAs(page, 'AB')

  // create a draft for today's Früh and capture a task
  await page.locator('.shift-col', { hasText: 'Früh' }).getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Wasserkocher defekt, Technik informiert')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Wasserkocher defekt, Technik informiert')).toBeVisible()

  // publish
  await page.getByRole('button', { name: 'Übergabe veröffentlichen' }).click()
  await expect(page.getByText(/Veröffentlicht/)).toBeVisible()

  // switch signature and acknowledge from the target shift's inbox
  await actAs(page, 'LK')
  await page.getByRole('link', { name: 'Eingang' }).click()
  // inbox shows the current Berlin shift; navigate via board link if the published
  // handover targets a different shift than "now" — the board is deterministic:
  await page.getByRole('link', { name: 'Übergaben' }).click()
  await page.getByRole('link', { name: /→ Spät/ }).click()
  await expect(page.getByText('Übergabe · Veröffentlicht')).toBeVisible()
})

test('contact data in task text is blocked with the guest-case hint', async ({ page }) => {
  await signIn(page)
  await actAs(page, 'AB')
  await page.locator('.shift-col', { hasText: 'Spät' }).getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Rückruf +49 171 2345678')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')).toBeVisible()
})
```

- [ ] **Step 3: Write `e2e/pilot/privacy.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test('network egress is limited to the app origin and the configured Supabase origin', async ({ page, baseURL }) => {
  const allowed = new Set([
    new URL(baseURL!).origin,
    new URL(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321').origin,
  ])
  const offending: string[] = []
  page.on('request', (req) => {
    const origin = new URL(req.url()).origin
    if (!allowed.has(origin)) offending.push(req.url())
  })
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
  expect(offending).toEqual([])
})

test('pilot page is noindex and carries the Supabase-scoped CSP', async ({ page }) => {
  await page.goto('/pilot.html')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("default-src 'self'")
  expect(csp).not.toContain('%SUPABASE_ORIGIN%') // placeholder must be substituted at build
})

test('guest contact values never render without the audited reveal action', async ({ page }) => {
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('button', { name: /^AB ·/ }).click()
  await page.locator('.shift-col', { hasText: 'Nacht' }).getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByRole('button', { name: 'Gastbezug (optional)' }).click()
  await page.getByLabel('Zweck (erforderlich)').selectOption('callback')
  await page.getByLabel('Gastname').fill('Testgast Synthetisch')
  await page.getByLabel('Kontaktart').selectOption('phone')
  await page.getByLabel('Kontakt').fill('+49 000 111')
  await page.getByRole('button', { name: 'Gastfall speichern' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Rückruf erledigen — Details im Gastfall')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('••• 11')).toBeVisible()
  await expect(page.getByText('+49 000 111')).not.toBeVisible()
  await page.getByRole('button', { name: 'Kontakt anzeigen (wird protokolliert)' }).click()
  await expect(page.getByText('+49 000 111')).toBeVisible()
})
```

- [ ] **Step 4: Write `e2e/pilot/a11y.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations).toEqual([])
}

test('sign-in, board, and inbox have zero axe violations', async ({ page }) => {
  await page.goto('/pilot.html')
  await expectNoViolations(page)
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
  await expectNoViolations(page)
  await page.getByRole('link', { name: 'Eingang' }).click()
  await expectNoViolations(page)
})
```

- [ ] **Step 5: Verify** — `npm run db:reset && npm run test:e2e:pilot` → green on both projects. Then the V1 guarantee: `npm run test:e2e` (demo suite, including its zero-cross-origin privacy test) still green.
- [ ] **Step 6: Commit** — `git add playwright.pilot.config.ts e2e/pilot && git commit -m "test(pilot): e2e flows, egress allowlist, masking, axe accessibility"`

---

### Task 27: Security regression — secrets, bundle isolation, dependency audit

**Files:**
- Create: `scripts/check-pilot-security.mjs`
- Modify: `package.json` (script)

- [ ] **Step 1: Write `scripts/check-pilot-security.mjs`**

```js
// Security regression gate. Fails loudly; run after `npm run build && npm run build:pilot`.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? filesUnder(p) : [p]
  })
}
function scan(dir, patterns) {
  for (const file of filesUnder(dir)) {
    const content = readFileSync(file, 'latin1')
    for (const [label, re] of patterns) {
      if (re.test(content)) failures.push(`${label} in ${file}`)
    }
  }
}

// 1. No server-side secrets in EITHER bundle.
const secretPatterns = [
  ['service_role reference', /service_role/],
  ['supabase secret key', /sb_secret_/],
  ['postgres connection string', /postgres(ql)?:\/\/[^ '"]+:[^ '"]+@/],
]
scan('dist', secretPatterns)
scan('dist-pilot', secretPatterns)

// 2. The DEMO bundle must not know Supabase exists (no URL, no key, no client lib).
scan('dist', [
  ['supabase reference in demo bundle', /supabase/i],
  ['anon key (JWT) in demo bundle', /eyJhbGciOi/],
])

// 3. No env files tracked by git.
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
for (const f of tracked) {
  if (/^\.env(\..+)?$/.test(f) && f !== '.env.example') failures.push(`env file tracked: ${f}`)
}

// 4. Dependency audit (high+ fails the gate).
try {
  execSync('npm audit --audit-level=high', { stdio: 'pipe' })
} catch {
  failures.push('npm audit found high/critical advisories')
}

if (failures.length > 0) {
  console.error('SECURITY CHECK FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('security checks passed')
```

- [ ] **Step 2: Add script** — `package.json`: `"check:security": "node scripts/check-pilot-security.mjs"`.
- [ ] **Step 3: Verify RED-by-design** — temporarily append `console.log('service_role')` to a file in `dist-pilot/assets/`, run `npm run check:security` → exits 1 naming the file. Remove the tampering (`npm run build:pilot` rebuilds clean), rerun → `security checks passed`.
- [ ] **Step 4: Verify full** — `npm run build && npm run build:pilot && npm run check:security` → passes; confirms the demo bundle is Supabase-free.
- [ ] **Step 5: Commit** — `git add scripts/check-pilot-security.mjs package.json && git commit -m "chore(pilot): security regression gate for secrets and bundle isolation"`

---

### Task 28: CI, deploy artifact, runbook, restore drill

**Files:**
- Create: `.github/workflows/pilot-ci.yml`, `.github/workflows/pilot-build.yml`, `docs/pilot/runbook.md`, `docs/pilot/restore-drill.md`

`pages.yml` stays byte-identical — verify with `git diff --stat main -- .github/workflows/pages.yml` → empty.

- [ ] **Step 1: Write `.github/workflows/pilot-ci.yml`** (runs the whole pilot test pyramid against a throwaway local stack; no cloud credentials):

```yaml
name: pilot-ci
on:
  pull_request:
    paths:
      - 'src/pilot/**'
      - 'supabase/**'
      - 'e2e/pilot/**'
      - 'pilot.html'
      - 'vite.pilot.config.ts'
      - 'playwright.pilot.config.ts'
      - 'scripts/check-pilot-security.mjs'
      - '.github/workflows/pilot-ci.yml'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - name: Start local Supabase and apply migrations
        run: supabase start && supabase db reset
      - name: Export local keys and write pilot env
        run: |
          eval "$(supabase status -o env | sed 's/^/export /')"
          echo "ANON_KEY=$ANON_KEY" >> "$GITHUB_ENV"
          echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY" >> "$GITHUB_ENV"
          echo "API_URL=$API_URL" >> "$GITHUB_ENV"
          printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$API_URL" "$ANON_KEY" > .env.local
      - run: npm run typecheck
      - run: npm test
      - run: npm run test:db
      - run: npx playwright install chromium
      - run: npm run test:e2e:pilot
        env: { VITE_SUPABASE_URL: '${{ env.API_URL }}' }
      - name: Demo isolation + security gate
        run: npm run build && npm run build:pilot && npm run check:security
```

- [ ] **Step 2: Write `.github/workflows/pilot-build.yml`** (manual, produces a deployable artifact; hosting stays an operator action, so no hosting credentials enter CI):

```yaml
name: pilot-build
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck && npm test
      - name: Build pilot bundle against the production project
        run: |
          printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' \
            "${{ secrets.PILOT_SUPABASE_URL }}" "${{ secrets.PILOT_SUPABASE_ANON_KEY }}" > .env.local
          npm run build:pilot
      - run: npm run build && npm run check:security
      - uses: actions/upload-artifact@v4
        with:
          name: lobby-ledger-pilot
          path: dist-pilot/
          retention-days: 7
```

Repository secrets to create manually (Settings → Secrets → Actions): `PILOT_SUPABASE_URL`, `PILOT_SUPABASE_ANON_KEY`. Values from P0.4; the anon key is the publishable client key — stored as a secret anyway to keep it out of logs.

- [ ] **Step 3: Write `docs/pilot/runbook.md`**

```markdown
# Pilot runbook

## Deploy
1. Actions → pilot-build → Run workflow. Download the `lobby-ledger-pilot` artifact.
2. Upload the contents of `dist-pilot/` to the pilot host chosen by the hotel:
   HTTPS mandatory, EU hosting, not publicly linked/indexed (page is `noindex`;
   additionally configure `X-Robots-Tag: noindex` on the host if supported).
   Serve `pilot.html` as the entry (rename to `index.html` on the host or configure it).
3. Open the URL on a device, sign in with the shared account, run one full
   publish → acknowledge round with two Kürzeln before announcing.
4. Record host, region, date, and uploader in `provisioning.md`.

## Database migrations against the hosted project
Operator-only, from a trusted machine: `supabase link --project-ref <ref>` then
`supabase db push` (prompts for the database password from the password manager).
Never run with real guest data present without a fresh backup (see restore drill).

## Devices & shared account
- Shared credentials live in the password manager and the front-desk device only.
- Sign out (admin panel → Wechseln + browser sign-out) before a device leaves the desk.
- The signature bar identity is per-device; verify the Kürzel before publishing.
- Accepted pilot risk: the shared login cannot cryptographically prove which staff
  member acted — signatures are operational attribution, reviewed with the hotel.

## Retention monitoring (weekly)
Admin panel → Verwaltung → Löschläufe. Green: last run successful, 0 overdue.
On failure: note the error, check Supabase Dashboard → Database → cron job logs,
re-run manually via SQL editor `select public.run_guest_case_retention();`,
and record the incident in provisioning.md.

## Manual guest-data deletion
Admin panel → "Gastdaten sofort löschen" with the case id (visible in the editor URL
of the linked task / audit list). Two-step confirm; the deletion is audited.

## Off-boarding / end of pilot
1. Export non-PII metrics (Archiv → Pilot-Kennzahlen kopieren).
2. `select public.run_guest_case_retention();` then verify zero undeleted cases.
3. Pause/delete the Supabase project per the hotel's decision; record the date.
```

- [ ] **Step 4: Write `docs/pilot/restore-drill.md`**

```markdown
# Backup/restore drill (synthetic data only — run BEFORE real guest data)

1. Local rehearsal: `npm run db:start && npm run db:reset`, then
   `supabase db dump --local -f drill-dump.sql` and restore into a scratch db;
   run `npm run test:db` against the restored stack. Delete `drill-dump.sql` after.
2. Hosted rehearsal: seed the hosted project with synthetic rows (SQL editor,
   copy the statements from `supabase/seed.sql`, adjust ids), then use
   Dashboard → Database → Backups → Restore to a new project. Verify:
   - handovers/tasks/signatures row counts match,
   - `select * from cron.job` still lists guest-case-retention,
   - a publish → acknowledge round works against the restored project.
3. Delete the restored scratch project and the synthetic rows.
4. Log the drill (date, duration, who, outcome) below. Restore access is limited
   to the pilot administrator's Supabase account.

| Date | Who | Outcome | Notes |
|---|---|---|---|
```

- [ ] **Step 5: Verify** — `act`-style local YAML lint not required; validate by pushing the branch later (execution phase) or `npx yaml-lint` equivalent (`node -e "require('js-yaml')"` is not a dep — visual review + PR CI run is the check here). `npm test && npm run typecheck` untouched and green. Confirm `git status` shows no change to `.github/workflows/pages.yml`.
- [ ] **Step 6: Commit** — `git add .github/workflows/pilot-ci.yml .github/workflows/pilot-build.yml docs/pilot && git commit -m "ci(pilot): pilot CI with local stack, manual build artifact, ops runbook"`

---

### Task 29: Pilot gates — manual go-live checklist

**Files:**
- Create: `docs/pilot/pilot-gates.md`

- [ ] **Step 1: Write `docs/pilot/pilot-gates.md`**

```markdown
# Pilot go-live gates

No real guest data enters the system before every box is checked and dated.
This document supports data minimisation; it does not itself certify legal
compliance (spec §6) — the hotel owns the legal/privacy review.

## Technical gates
- [ ] All migrations applied to the hosted EU project; region recorded in provisioning.md
- [ ] `pilot-ci` green on the release commit (unit, db/RLS, e2e, security gate)
- [ ] Backup/restore drill completed with synthetic data (restore-drill.md log entry)
- [ ] Retention cron verified on the hosted project (`select * from cron.job`)
- [ ] Manual admin deletion tested once with a synthetic case (audited)
- [ ] TLS-only access to the pilot host confirmed; page is noindex
- [ ] Demo Pages site verified unchanged and offline-only (existing e2e suite green)

## Organisational gates (hotel)
- [ ] Pilot approved by hotel management; controller/processor responsibilities set
- [ ] 30-day post-completion retention confirmed (or adjusted + re-recorded in CLAUDE.md and migration)
- [ ] Access matrix approved: who may use the shared account, who holds the admin Kürzel
- [ ] "Include operational guest context" export/reveal usage approved
- [ ] Internal legal/privacy review completed
- [ ] Two-person handover test across at least two devices completed and logged

| Gate | Date | Signed |
|---|---|---|
```

- [ ] **Step 2: Verify** — docs only; `npm test && npm run typecheck` green.
- [ ] **Step 3: Commit** — `git add docs/pilot/pilot-gates.md && git commit -m "docs(pilot): go-live gates checklist"`

---

## Files changed by this planning session

Exactly one file was created; nothing else was touched (no source, dependencies, workflows, credentials, remotes, or pushes):

- `docs/plans/2026-07-10-team-handover-pilot-v2.md` (this plan — new)

Everything else in this document describes **future** changes that happen only when the plan is executed, task by task, on a branch, after approval.

## Plan review checklist (for Abel before execution)

- [ ] **Provider & region**: Supabase `eu-central-1` acceptable? (§2 Decisions; P0.1)
- [ ] **Service-date convention**: Nacht belongs to its start date; 00:00–05:59 Berlin = previous day's Nacht (§2, Task 8). This defines board grouping and tuple uniqueness.
- [ ] **One handover per tuple, forever** (full UNIQUE, not "one active") — corrections via amendments (Task 4). OK, or should acknowledged tuples be re-openable?
- [ ] **Departments hardcoded to `front-office` as the source/target default** in ShiftBoard (Task 21) — cross-department drafts are created by changing the tuple in a follow-up UI control; acceptable for pilot?
- [ ] **Empty publish allowed** ("nichts zu übergeben" is information) — §4 lifecycle rules.
- [ ] **Admin gating is signature-based** — a shared-login user typing the admin Kürzel id could call admin RPCs; accepted pilot risk, documented in runbook (§2 Decisions, Task 28).
- [ ] **Retention arming rule**: 30 days after the *last* open task referencing the case completes; carry-over clears the timer (Tasks 13, 15).
- [ ] **Phone/email tripwire regex** (Task 9 + DB CHECK in Task 4): 9+-digit runs blocked — internal long references would be false-positives; confirm none exist at the desk.
- [ ] **Deploy = CI artifact + operator upload** (no hosting credentials in repo); pilot host choice stays with the hotel (Task 28).
- [ ] **V1 demo isolation** is enforced three ways: separate build input, e2e egress test, `check:security` grep of `dist/` (Tasks 2, 26, 27).
- [ ] **Masking format**: names → initials (`A. S.`), phone → last 2 digits, email → first char (Tasks 5, 11). Enough for the desk to recognise the case?
- [ ] Self-review done: spec §§1–12 each map to tasks (traceability: §4 workflow → T12–13, §5 model → T3–6, §6 privacy/retention → T5, T14–15, T17, §8 surfaces → T20–25, §9 errors → T18–19 + UI hints, §10 tests → T7, T16–17, T26–27, §11 slices → phases 1–5, §12 criteria → T26 flows + T25 metrics); no TBDs; types/names consistent across tasks (`PilotApi`, `SignatureRow`, `HandoverRow`, SQLSTATE map).
