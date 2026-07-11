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
