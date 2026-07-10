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
