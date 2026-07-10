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

-- Writes happen only through SECURITY DEFINER functions. The local stack's
-- default ACLs hand client roles extra privileges (incl. TRUNCATE, which RLS
-- does not filter) and no SELECT, so state the intended model explicitly:
-- authenticated = SELECT only (row-filtered by the policies above), anon = nothing.
revoke all on organizations, pilot_accounts, staff_signatures from authenticated, anon;
grant select on organizations, pilot_accounts, staff_signatures to authenticated;
