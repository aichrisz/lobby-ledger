-- 0007_guest_rpcs: purpose-gated PII entry, audited reveal, admin manual delete.

create function create_guest_case(
  p_signature_id uuid, p_purpose guest_purpose,
  p_purpose_note text default null, p_room_reference text default '',
  p_guest_name text default null, p_contact_type contact_type default null,
  p_contact_value text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  gc_id uuid;
begin
  if p_purpose = 'other' and length(trim(coalesce(p_purpose_note, ''))) = 0 then
    raise exception 'purpose "other" requires a concise operational reason' using errcode = 'P0422';
  end if;
  if p_guest_name is null and p_contact_value is null then
    raise exception 'guest case without name or contact is pointless — use a plain task'
      using errcode = 'P0422';
  end if;
  insert into guest_cases (organization_id, room_reference, guest_name, contact_type,
                           contact_value, purpose, purpose_note, created_by_signature_id)
  values (sig.organization_id, trim(coalesce(p_room_reference, '')),
          nullif(trim(coalesce(p_guest_name, '')), ''),
          p_contact_type, nullif(trim(coalesce(p_contact_value, '')), ''),
          p_purpose, nullif(trim(coalesce(p_purpose_note, '')), ''), sig.id)
  returning id into gc_id;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', gc_id, 'guest_case.created',
                      jsonb_build_object('purpose', p_purpose,
                                         'has_name', p_guest_name is not null,
                                         'has_contact', p_contact_value is not null));
  return gc_id;
end $$;
grant execute on function create_guest_case(uuid, guest_purpose, text, text, text, contact_type, text) to authenticated;
revoke all on function create_guest_case(uuid, guest_purpose, text, text, text, contact_type, text) from public, anon;

-- The only path to unmasked values. Every call is audited.
create function reveal_guest_case(p_case_id uuid, p_signature_id uuid)
returns table (guest_name text, contact_type contact_type, contact_value text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
  gc guest_cases;
begin
  select * into gc from guest_cases
   where id = p_case_id and organization_id = sig.organization_id and deleted_at is null;
  if not found then raise exception 'guest case not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', gc.id, 'guest_case.revealed', '{}');
  return query select gc.guest_name, gc.contact_type, gc.contact_value;
end $$;
grant execute on function reveal_guest_case(uuid, uuid) to authenticated;
revoke all on function reveal_guest_case(uuid, uuid) from public, anon;

-- Immediate manual deletion (pilot administrator): masks values, keeps non-PII shell.
create function admin_delete_guest_case(p_case_id uuid, p_signature_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig staff_signatures := assert_signature(p_signature_id);
begin
  if not sig.is_admin then
    raise exception 'administrator signature required' using errcode = 'P0403';
  end if;
  update guest_cases
     set guest_name = null, contact_type = null, contact_value = null,
         deleted_at = now(), expires_at = null, updated_at = now()
   where id = p_case_id and organization_id = sig.organization_id and deleted_at is null;
  if not found then raise exception 'guest case not found' using errcode = 'P0404'; end if;
  perform write_audit(sig.organization_id, sig.id, 'guest_case', p_case_id, 'guest_case.admin_deleted', '{}');
end $$;
grant execute on function admin_delete_guest_case(uuid, uuid) to authenticated;
revoke all on function admin_delete_guest_case(uuid, uuid) from public, anon;
