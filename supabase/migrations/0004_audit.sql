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
