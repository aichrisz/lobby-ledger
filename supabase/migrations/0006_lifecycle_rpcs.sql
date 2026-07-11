-- 0006_lifecycle_rpcs: state transitions. Audit write shares the transaction —
-- if audit fails, the mutation fails (spec §9).

create function publish_handover(
  p_handover_id uuid, p_signature_id uuid, p_expected_version integer
) returns handovers
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
  open_count integer;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status <> 'draft' then
    raise exception 'only drafts can be published' using errcode = 'P0422';
  end if;
  if h.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'P0409';
  end if;
  select count(*) into open_count from handover_tasks
   where handover_id = h.id and status = 'open';
  update handovers
     set status = 'published', published_by_signature_id = sig.id, published_at = now(),
         version = version + 1, updated_at = now()
   where id = h.id returning * into h;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.published',
                      jsonb_build_object('open_tasks', open_count));
  return h;
end $$;
grant execute on function publish_handover(uuid, uuid, integer) to authenticated;
revoke all on function publish_handover(uuid, uuid, integer) from public, anon;

create function acknowledge_handover(p_handover_id uuid, p_signature_id uuid)
returns handovers
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status <> 'published' then
    raise exception 'only published handovers can be acknowledged' using errcode = 'P0422';
  end if;
  update handovers
     set status = 'acknowledged', acknowledged_by_signature_id = sig.id,
         acknowledged_at = now(), version = version + 1, updated_at = now()
   where id = h.id returning * into h;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.acknowledged', '{}');
  return h;
end $$;
grant execute on function acknowledge_handover(uuid, uuid) to authenticated;
revoke all on function acknowledge_handover(uuid, uuid) from public, anon;

create function amend_handover(
  p_handover_id uuid, p_signature_id uuid, p_reason text, p_body text
) returns handover_amendments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  h handovers;
  a handover_amendments;
begin
  select * into h from handovers
   where id = p_handover_id and organization_id = sig.organization_id;
  if not found then raise exception 'handover not found' using errcode = 'P0404'; end if;
  if h.status = 'draft' then
    raise exception 'drafts are edited directly, not amended' using errcode = 'P0422';
  end if;
  insert into handover_amendments (organization_id, handover_id, author_signature_id, reason, body)
  values (sig.organization_id, h.id, sig.id, trim(p_reason), trim(p_body))
  returning * into a;
  perform write_audit(sig.organization_id, sig.id, 'handover', h.id, 'handover.amended',
                      jsonb_build_object('amendment_id', a.id));
  return a;
end $$;
grant execute on function amend_handover(uuid, uuid, text, text) to authenticated;
revoke all on function amend_handover(uuid, uuid, text, text) from public, anon;

create function complete_task(
  p_task_id uuid, p_signature_id uuid, p_expected_version integer
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  t handover_tasks;
  retention_armed boolean := false;
begin
  select * into t from handover_tasks
   where id = p_task_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0404'; end if;
  if t.status <> 'open' then
    raise exception 'only open tasks can be completed' using errcode = 'P0422';
  end if;
  if t.version <> p_expected_version then
    raise exception 'version conflict' using errcode = 'P0409';
  end if;
  update handover_tasks
     set status = 'done', completed_by_signature_id = sig.id, completed_at = now(),
         version = version + 1, updated_at = now()
   where id = t.id returning * into t;
  -- Arm 30-day retention when the LAST open task for the case completes (spec §6).
  if t.guest_case_id is not null and not exists (
       select 1 from handover_tasks
        where guest_case_id = t.guest_case_id and status = 'open'
     ) then
    update guest_cases
       set expires_at = t.completed_at + interval '30 days', updated_at = now()
     where id = t.guest_case_id and deleted_at is null;
    retention_armed := true;
  end if;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.completed',
                      jsonb_build_object('guest_case_retention_armed', retention_armed));
  return t;
end $$;
grant execute on function complete_task(uuid, uuid, integer) to authenticated;
revoke all on function complete_task(uuid, uuid, integer) from public, anon;

-- Deliberate carry-over: copies the task into a target DRAFT, keeps provenance,
-- marks the source as 'carried'. A linked guest case travels with it.
create function carry_over_task(
  p_task_id uuid, p_signature_id uuid, p_target_handover_id uuid
) returns handover_tasks
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  src handover_tasks;
  src_status handover_status;
  tgt handovers;
  t handover_tasks;
begin
  select * into src from handover_tasks
   where id = p_task_id and organization_id = sig.organization_id
   for update;
  if not found then raise exception 'task not found' using errcode = 'P0404'; end if;
  select status into src_status from handovers where id = src.handover_id;
  if src.status <> 'open' then
    raise exception 'only open tasks can be carried over' using errcode = 'P0422';
  end if;
  if src_status = 'draft' then
    raise exception 'carry-over starts from a published handover' using errcode = 'P0422';
  end if;
  select * into tgt from handovers
   where id = p_target_handover_id and organization_id = sig.organization_id for update;
  if not found then raise exception 'target handover not found' using errcode = 'P0404'; end if;
  if tgt.status <> 'draft' then
    raise exception 'carry-over target must be a draft' using errcode = 'P0422';
  end if;
  insert into handover_tasks (organization_id, handover_id, text, room_reference, department,
                              priority, created_by_signature_id, carry_over_from_task_id,
                              guest_case_id, template)
  values (sig.organization_id, tgt.id, src.text, src.room_reference, src.department,
          src.priority, sig.id, src.id, src.guest_case_id, src.template)
  returning * into t;
  update handover_tasks
     set status = 'carried', version = version + 1, updated_at = now()
   where id = src.id;
  if src.guest_case_id is not null then
    -- the case is live again until the carried task completes
    update guest_cases set expires_at = null, updated_at = now()
     where id = src.guest_case_id and deleted_at is null;
  end if;
  perform write_audit(sig.organization_id, sig.id, 'task', t.id, 'task.carried_over',
                      jsonb_build_object('from_task_id', src.id, 'to_handover_id', tgt.id));
  return t;
end $$;
grant execute on function carry_over_task(uuid, uuid, uuid) to authenticated;
revoke all on function carry_over_task(uuid, uuid, uuid) from public, anon;
