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
