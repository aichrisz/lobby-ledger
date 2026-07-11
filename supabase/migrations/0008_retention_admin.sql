-- 0008_retention_admin: scheduled deletion, health surface, audit listing, metrics.

-- Deletes (masks) expired guest cases. Records every run — success or failure —
-- in retention_runs so failure is never silent (spec §9).
create function run_guest_case_retention() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id, organization_id from guest_cases
     where expires_at <= now() and deleted_at is null
     for update skip locked
  loop
    update guest_cases
       set guest_name = null, contact_type = null, contact_value = null,
           deleted_at = now(), updated_at = now()
     where id = r.id;
    perform write_audit(r.organization_id, null, 'guest_case', r.id, 'guest_case.expired', '{}');
    n := n + 1;
  end loop;
  insert into retention_runs (cases_deleted, ok) values (n, true);
  return n;
exception when others then
  -- the failed sweep rolled back to the block start; record the failure itself
  insert into retention_runs (cases_deleted, ok, error) values (0, false, sqlerrm);
  return 0;
end $$;
revoke all on function run_guest_case_retention() from public, authenticated, anon;
-- cron (as postgres) and operator/service tooling may run it; the client role may not
grant execute on function run_guest_case_retention() to service_role;

-- Daily at 02:15 UTC (03:15/04:15 Berlin — inside Nacht, before Früh).
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('guest-case-retention');
exception when others then null; -- not scheduled yet
end $$;
select cron.schedule('guest-case-retention', '15 2 * * *',
                     $$select public.run_guest_case_retention()$$);

-- Admin: audit inspection (no PII exists in audit rows by construction).
create function list_audit_events(
  p_signature_id uuid, p_limit integer default 100, p_before timestamptz default null
) returns setof audit_events
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  return query
    select * from audit_events
     where organization_id = sig.organization_id
       and (p_before is null or occurred_at < p_before)
     order by occurred_at desc
     limit least(greatest(p_limit, 1), 500);
end $$;
grant execute on function list_audit_events(uuid, integer, timestamptz) to authenticated;
revoke all on function list_audit_events(uuid, integer, timestamptz) from public, anon;

-- Admin: last retention run + count of pending expired cases.
create function retention_health(p_signature_id uuid)
returns table (last_ran_at timestamptz, last_ok boolean, last_error text, overdue_cases bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  return query
    select rr.ran_at, rr.ok, rr.error,
           (select count(*) from guest_cases
             where expires_at <= now() and deleted_at is null)
      from retention_runs rr order by rr.ran_at desc limit 1;
end $$;
grant execute on function retention_health(uuid) to authenticated;
revoke all on function retention_health(uuid) from public, anon;

create function admin_deactivate_signature(p_signature_id uuid, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  update staff_signatures set active = false
   where id = p_target_id and organization_id = sig.organization_id and active;
  if not found then raise exception 'signature not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'signature', p_target_id, 'signature.deactivated', '{}');
end $$;
grant execute on function admin_deactivate_signature(uuid, uuid) to authenticated;
revoke all on function admin_deactivate_signature(uuid, uuid) from public, anon;

-- Non-PII pilot summary (spec §8 pilot export): counts only.
create function pilot_metrics(p_signature_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  result jsonb;
begin
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'handovers', count(*),
    'published', count(*) filter (where h.status in ('published', 'acknowledged')),
    'acknowledged', count(*) filter (where h.status = 'acknowledged'),
    'tasks', coalesce(sum(tc.total), 0),
    'carried_over', coalesce(sum(tc.carried), 0),
    'template_usage', coalesce(
      (select jsonb_object_agg(template, uses) from (
        select ht.template, count(*) as uses from handover_tasks ht
         join handovers h2 on h2.id = ht.handover_id
        where ht.organization_id = sig.organization_id
          and h2.service_date between p_from and p_to and ht.template is not null
        group by ht.template) tu), '{}'::jsonb))
  into result
  from handovers h
  left join lateral (
    select count(*) as total,
           count(*) filter (where ht.carry_over_from_task_id is not null) as carried
      from handover_tasks ht where ht.handover_id = h.id
  ) tc on true
  where h.organization_id = sig.organization_id
    and h.service_date between p_from and p_to;
  return result;
end $$;
grant execute on function pilot_metrics(uuid, date, date) to authenticated;
revoke all on function pilot_metrics(uuid, date, date) from public, anon;
