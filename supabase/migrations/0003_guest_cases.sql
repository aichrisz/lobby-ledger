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
-- Local DB tests use the service role only to arrange and inspect synthetic fixtures.
grant select, update on guest_cases to service_role;

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
