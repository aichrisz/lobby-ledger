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

-- Same intended access model as 0001: writes arrive only through SECURITY DEFINER
-- functions (Task 6), so client roles get SELECT at most. Restating this explicitly
-- overrides the local stack's permissive default ACLs (incl. TRUNCATE, which RLS
-- does not filter): authenticated = SELECT only (row-filtered), anon = nothing.
revoke all on handovers, handover_amendments, handover_tasks from authenticated, anon;
grant select on handovers, handover_amendments, handover_tasks to authenticated;
