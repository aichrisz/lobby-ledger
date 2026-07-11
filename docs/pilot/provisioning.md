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

Secrets live in the operator password manager and Vercel's server environment only.
The service-role key is used exclusively by the serverless API and is never included
in browser code.

# Simple PIN pilot environment

The Vercel project needs these server-only environment variable names:

- `PILOT_PIN`
- `PILOT_SESSION_SECRET` (at least 32 random bytes)
- `PILOT_ORGANIZATION_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not prefix any of them with `VITE_`. They belong only in Vercel's server environment and must not be exposed to the browser build.
