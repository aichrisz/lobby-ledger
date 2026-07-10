# Lobby Ledger V2 — Team Handover Pilot Design

**Status:** Approved concept awaiting Abel’s review of this written specification  
**Date:** 2026-07-10  
**Supersedes:** The local-only MVP constraints where they conflict with this pilot design.

## 1. Goal

Turn Lobby Ledger into a real shared handover system for one hotel pilot. Staff can move across dates and shifts, create a handover for a specific receiving department/shift, publish it, and have the receiving shift acknowledge it.

The pilot uses one shared login account. Auth is shared only; operational attribution is not: each handover, task, publication, acknowledgement, and meaningful edit records a staff-provided **Kürzel** and display name.

## 2. Pilot boundary

### In scope

- One organization: one hotel pilot.
- One shared email/password account for testing, usable from multiple devices.
- Staff signature entered/selected when creating or acting on a handover: `shortCode` plus `displayName`.
- Date navigation in `Europe/Berlin`: prior days, today, future planned shifts, and calendar selection.
- Shifts: Früh, Spät, Nacht; departments: Front Office, Housekeeping, Restaurant.
- Handover lifecycle: draft → published → acknowledged.
- Handover targeting: outgoing shift/department and receiving shift/department.
- Task assignment, carry-over, completion, archive/search.
- Optional structured guest case: room reference, guest name, contact value/type, and a required operational purpose.
- Thirty-day retention after a guest-related task is completed; secure deletion job.
- Audit log for operational actions without replicating guest contact values.
- EU-region database/auth hosting, TLS, backup/restore verification, and server-side authorization.

### Explicitly deferred

- Individual staff credentials and SSO.
- Multi-hotel tenancy and cross-property views.
- PMS integration, email/SMS/WhatsApp sending, automated notifications.
- Attachments, payment data, ID/passport data, or special-category personal data.
- AI summarisation.
- Guest-facing access.

## 3. User roles

| Role | Pilot behaviour |
|---|---|
| Shared pilot session | Authenticates into the single hotel workspace only. It cannot access another organization. |
| Staff signature | A non-authenticated operational identity: `AB · Abel`, `LK · Lucas`, etc. Required for create/edit/publish/acknowledge. |
| Pilot administrator | A configured signature allowed to manage signatures, view audit records, manually delete a guest case, and review retention failures. |
| Receiving staff | Opens a published handover and acknowledges responsibility using their own signature. |

The shared login is a temporary pilot compromise. A future individual-account migration must map existing signature history without rewriting authorship.

## 4. Core workflow

```text
Sign in with shared pilot account
→ choose service date and Früh / Spät / Nacht
→ choose outgoing department and receiving shift/department
→ select or create own Kürzel + display name
→ create/edit handover draft
→ add tasks; optionally link a purpose-gated guest case
→ publish handover
→ receiving staff opens their shift board
→ acknowledge using their Kürzel + display name
→ complete tasks or carry them into the next handover
→ archive/search prior handovers
```

### Handover rules

1. A handover has one `serviceDate`, source shift, source department, target shift, and target department.
2. There is exactly one active handover per organization/date/source/target tuple. Multiple staff may contribute tasks to that shared draft; each contribution keeps its own author signature.
3. Published handovers are immutable in their core recipient fields. Corrections create a versioned amendment with author signature and reason.
4. An acknowledgement records the receiving staff signature and timestamp; it does not erase or transfer authorship.
5. Open tasks can be carried over deliberately. The UI shows their origin date/shift and the carry-over chain.

## 5. Data model

```text
organizations
  id, name, timezone ('Europe/Berlin'), created_at

staff_signatures
  id, organization_id, short_code, display_name, active, created_at
  unique (organization_id, short_code)

handovers
  id, organization_id, service_date, source_shift, source_department,
  target_shift, target_department, status,
  author_signature_id, published_by_signature_id?, published_at?,
  acknowledged_by_signature_id?, acknowledged_at?, created_at, updated_at
  unique active handover boundary for organization/date/source/target

handover_tasks
  id, organization_id, handover_id, text, room_reference?, department,
  priority, status, created_by_signature_id, completed_by_signature_id?,
  completed_at?, carry_over_from_task_id?, guest_case_id?, created_at, updated_at

guest_cases
  id, organization_id, room_reference?, guest_name?, contact_type?,
  contact_value?, purpose, expires_at, deleted_at?, created_at, updated_at

audit_events
  id, organization_id, actor_signature_id?, entity_type, entity_id,
  action, occurred_at, metadata_json
```

### Personal-data limits

- Guest details are optional and purpose-gated; a task must work without them.
- `purpose` is required before a name or contact value can be stored: `callback`, `arrival`, `complaint_follow_up`, `service_recovery`, or `other` with a concise operational reason.
- Do not put names or phone/email values in free-text task text.
- `audit_events` store entity/action metadata, never guest names, contact values, or free-text task snapshots.
- Task exports/print hide contact values by default. An explicit, role-controlled “include operational guest context” action is required where the hotel has approved it.

## 6. Privacy, access, and retention

This design supports data minimisation; it does not itself certify legal compliance. Before real guest data is used, the hotel must approve the pilot, set controller/processor responsibilities, confirm retention, and complete its internal legal/privacy review.

Technical safeguards:

- Database/auth is provisioned in an EU region; exact region is recorded in deployment documentation.
- TLS in transit; provider-managed encryption at rest; no secrets in Git, client bundle, logs, docs, or browser storage.
- Server-side Row Level Security restricts every query/mutation to the signed-in organization.
- Sensitive guest fields are returned only to authorised pilot session paths; never embedded in public static Pages output.
- Authentication credentials are never used as author signatures.
- Guest cases linked to a completed task are queued for deletion **30 days after completion**. A scheduled job marks, deletes, and audits the deletion event.
- Manual deletion is available to the pilot administrator and removes/masks guest values immediately while retaining only non-PII audit metadata.
- Backup/restore is tested with synthetic data before pilot launch. Restore access is limited to authorised administrators.

## 7. Architecture

```text
Preact client
  ├── authenticated shared-pilot session
  ├── date/shift/team UI
  └── no direct privileged database access

Application API / server actions
  ├── validates staff signatures and handover state transitions
  ├── owns publish/acknowledge/amend operations
  ├── applies PII purpose and retention rules
  └── writes non-PII audit events

PostgreSQL in EU region
  ├── relational handover/task/guest schema
  ├── row-level organization boundaries
  └── scheduled retention workflow
```

The present static GitHub Pages site remains a public **MVP demo** only. It must not connect to the production pilot database or collect guest data. The team pilot deploys separately to an authenticated HTTPS application environment.

## 8. UX surfaces

| Surface | Key behaviour |
|---|---|
| Shift board | Calendar/date controls; each date shows Früh, Spät, Nacht and draft/published/acknowledged state. |
| Handover editor | Source/target context is always visible; author signature required before edits. |
| Rapid capture | Existing fast capture is preserved; templates for Technik, Zimmer prüfen, Rechnung/Beleg, Frühstück, Rückruf. |
| Task list | Department, target shift, ownership/carry-over origin, priority, completion. |
| Guest case drawer | Purpose selector precedes optional name/contact fields; shows expiry and masking by default. |
| Review/publish | Validates required recipient context; summary of open/important/carry-over tasks. |
| Receiving inbox | Published handovers for the chosen target date/shift/department; acknowledge action. |
| Archive | Search by date, shift, department, room reference, author signature, and status. |
| Pilot export | Non-PII pilot summary: task count, carry-overs, acknowledgement rate, and template usage. |

## 9. Error handling and state integrity

- Network unavailable: show saved draft state and explicit retry; never claim a publish/acknowledgement succeeded until server confirmation.
- Conflicting edits: optimistic version number; server returns conflict, UI shows latest state and allows comparison/reapply.
- Expired/missing staff signature: block mutating action and prompt selection/creation of an active signature.
- Attempt to enter PII without purpose: block save and explain why.
- Retention job failure: administrator-only health alert; no silent loss/no silent indefinite storage.
- Failed audit write makes the corresponding publish/acknowledge mutation fail; attribution is mandatory.

## 10. Security and test plan

### Automated tests

- Domain tests: date/shift boundaries using Berlin timezone, lifecycle transitions, carry-over rules, retention calculation, signature validation.
- Database tests: RLS isolation, access denial across organizations, schema constraints, retention deletion, audit omission of PII.
- API tests: unauthenticated rejection, invalid transition rejection, purpose-gated guest case validation, conflict handling.
- E2E: shared login, date navigation, author signature, publish/acknowledge, task carry-over, masked guest case, retention/synthetic deletion, mobile and desktop workflows.
- Security regression checks: no secret leakage, no guest PII in logs/export defaults/audit payloads, dependency audit.

### Manual pilot gates

- Synthetic-data backup and restore drill.
- Hotel-approved access matrix and retention sign-off.
- Review of Cloud hosting region and configuration without exposing credentials.
- Two-person shift handover test across at least two devices.

## 11. Delivery slices

1. **Foundation:** server project, Postgres schema/migrations, EU auth, shared-pilot session, RLS, environment boundary; no real guest data.
2. **Team handover core:** date/shift navigator, signatures, target routing, publish/acknowledge, archive.
3. **Rapid capture and workflow:** templates, task ownership, carry-over, receiving inbox, pilot metrics.
4. **Guest case privacy slice:** structured purpose-gated data, masking, 30-day deletion, audit, export rules.
5. **Hardening and pilot release:** security/e2e/restore tests, operator documentation, private pilot deployment.

## 12. Success criteria

- A staff member can find, create, publish, and acknowledge the correct handover for a date/shift/department in under two minutes.
- Every published/acknowledged event has a readable staff signature and immutable timestamp.
- Open work is not lost when the date/shift changes; carry-over provenance remains visible.
- Guest data is optional, purpose-gated, masked by default, never duplicated into audit logs, and deleted after the defined 30-day completed-task retention window.
- One hotel pilot can operate without any cross-hotel data visibility.
