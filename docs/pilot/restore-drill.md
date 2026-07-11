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
