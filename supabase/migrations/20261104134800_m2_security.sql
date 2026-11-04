-- M2 security: vessels, crew, assignments, documents and the private "documents" storage bucket.
-- Owners and managers manage everything; captains and crew can read the documents of vessels they
-- are assigned to and their own certificates (BUILD_SPEC §3).

create trigger vessels_touch before update on public.vessels for each row execute function private.touch_updated_at();
create trigger crew_members_touch before update on public.crew_members for each row execute function private.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function private.touch_updated_at();

create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function private.write_audit('document');
create trigger vessels_audit after insert or update or delete on public.vessels
  for each row execute function private.write_audit('vessel');
create trigger crew_members_audit after insert or update or delete on public.crew_members
  for each row execute function private.write_audit('crew_member');

-- ---------------------------------------------------------------------------------------------
-- Integrity: everything a row points at must belong to the same org.
-- ---------------------------------------------------------------------------------------------
create or replace function private.check_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if tg_table_name = 'vessel_crew' then
    v_ok := exists (select 1 from public.vessels where id = new.vessel_id and org_id = new.org_id)
        and exists (select 1 from public.crew_members where id = new.crew_member_id and org_id = new.org_id);
  elsif tg_table_name = 'documents' then
    v_ok := case new.subject_type
      when 'vessel' then exists (select 1 from public.vessels where id = new.subject_id and org_id = new.org_id)
      when 'crew' then exists (select 1 from public.crew_members where id = new.subject_id and org_id = new.org_id)
      else new.subject_id = new.org_id
    end;
    -- Files live under {org}/{subject_type}/{subject_id}/ in the bucket.
    if v_ok and new.file_path is not null then
      v_ok := new.file_path like new.org_id::text || '/' || new.subject_type::text || '/' || new.subject_id::text || '/%';
    end if;
  else
    v_ok := true;
  end if;
  if not v_ok then raise exception 'invalid_subject'; end if;
  return new;
end $$;

create trigger vessel_crew_same_org before insert or update on public.vessel_crew
  for each row execute function private.check_same_org();
create trigger documents_same_org before insert or update on public.documents
  for each row execute function private.check_same_org();

-- ---------------------------------------------------------------------------------------------
-- Who can see a document: owners/managers; captains/crew assigned to the vessel; the crew member
-- the certificate belongs to.
-- ---------------------------------------------------------------------------------------------
create or replace function private.can_view_document(p_org uuid, p_subject_type text, p_subject_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, '{owner,manager}')
    or public.is_platform_admin()
    or (p_subject_type = 'vessel' and exists (
          select 1 from public.vessel_crew vc
          join public.crew_members cm on cm.id = vc.crew_member_id
          where vc.vessel_id = p_subject_id and vc.org_id = p_org
            and cm.user_id = (select auth.uid()) and cm.status = 'active'
            and (vc.to_date is null or vc.to_date >= current_date)
            and public.has_role(p_org)))
    or (p_subject_type = 'crew' and exists (
          select 1 from public.crew_members cm
          where cm.id = p_subject_id and cm.org_id = p_org and cm.user_id = (select auth.uid())
            and public.has_role(p_org)));
$$;
grant execute on function private.can_view_document(uuid, text, uuid) to authenticated;

-- Storage paths: {org}/{subject_type}/{subject_id}/{file}. Invalid paths resolve to null (no access).
create or replace function private.path_part_uuid(p_name text, p_index int)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(p_name))[p_index]::uuid;
exception when others then
  return null;
end $$;
grant execute on function private.path_part_uuid(text, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Document status as of today in the org's time zone (§4.1). Stored status records the human
-- decision; valid/expiring/expired follow the calendar.
-- ---------------------------------------------------------------------------------------------
create or replace function public.effective_document_status(
  p_status public.document_status,
  p_expiry date,
  p_today date,
  p_expiring_days int default 30
) returns public.document_status
language sql immutable set search_path = '' as $$
  select case
    when p_status in ('needs_review', 'rejected') then p_status
    when p_expiry is null then 'valid'::public.document_status
    when p_expiry < p_today then 'expired'::public.document_status
    when p_expiry <= p_today + p_expiring_days then 'expiring'::public.document_status
    else 'valid'::public.document_status
  end;
$$;

create view public.documents_live with (security_invoker = true) as
select d.*,
       public.effective_document_status(
         d.status, d.expiry_date, (now() at time zone o.time_zone)::date,
         coalesce((o.settings ->> 'expiring_window_days')::int, 30)) as effective_status,
       d.expiry_date - (now() at time zone o.time_zone)::date as days_to_expiry
from public.documents d
join public.orgs o on o.id = d.org_id
where d.replaced_by is null;

-- Document types that can be recorded for a subject in a country: the global catalogue plus every
-- type the country's rule sets define (drafts included: a type is a label, not a requirement).
create or replace function public.document_types_for(p_country text, p_applies_to public.applies_to)
returns table (code text, name_key text, applies_to public.applies_to, issuer_name text, default_validity_months int)
language sql stable security definer set search_path = '' as $$
  select t.code, t.name_key, t.applies_to, t.issuer_name, t.default_validity_months
  from public.document_types t
  left join public.compliance_rule_sets s on s.id = t.rule_set_id
  where t.applies_to = p_applies_to
    and (t.rule_set_id is null or (s.country_code = p_country and s.status <> 'retired'))
  order by t.rule_set_id nulls last, t.code;
$$;
revoke execute on function public.document_types_for(text, public.applies_to) from public;
grant execute on function public.document_types_for(text, public.applies_to) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Invitations now also link the matching crew record, so an invited captain sees their vessel.
-- ---------------------------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text;
  v_inv public.invitations%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_inv from public.invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.accepted_at is not null then raise exception 'invitation_used'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation_expired'; end if;

  select phone_e164 into v_phone from public.profiles where id = v_uid;
  if v_phone is distinct from v_inv.phone_e164 then raise exception 'phone_mismatch'; end if;
  if exists (select 1 from public.memberships where user_id = v_uid and org_id = v_inv.org_id) then
    raise exception 'already_member';
  end if;

  insert into public.memberships (user_id, org_id, role, invited_by)
  values (v_uid, v_inv.org_id, v_inv.role, v_inv.invited_by);
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  update public.crew_members set user_id = v_uid
   where org_id = v_inv.org_id and phone_e164 = v_inv.phone_e164 and user_id is null;
  return v_inv.org_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.vessels enable row level security;
alter table public.crew_members enable row level security;
alter table public.vessel_crew enable row level security;
alter table public.documents enable row level security;
alter table public.document_alerts enable row level security;
revoke all on public.vessels, public.crew_members, public.vessel_crew, public.documents, public.document_alerts from anon;

-- Vessels: every member sees the fleet; owners and managers change it; only owners delete.
create policy vessels_select on public.vessels for select to authenticated using (public.has_role(org_id));
create policy vessels_insert on public.vessels for insert to authenticated with check (public.has_role(org_id, '{owner,manager}'));
create policy vessels_update on public.vessels for update to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
create policy vessels_delete on public.vessels for delete to authenticated using (public.has_role(org_id, '{owner}'));

-- Crew records hold personal data: owners/managers see all, a person sees their own.
create policy crew_select on public.crew_members for select to authenticated
  using (public.has_role(org_id, '{owner,manager}') or (user_id = (select auth.uid()) and public.has_role(org_id)));
create policy crew_insert on public.crew_members for insert to authenticated with check (public.has_role(org_id, '{owner,manager}'));
create policy crew_update on public.crew_members for update to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
create policy crew_delete on public.crew_members for delete to authenticated using (public.has_role(org_id, '{owner}'));

create policy vessel_crew_select on public.vessel_crew for select to authenticated using (public.has_role(org_id));
create policy vessel_crew_write on public.vessel_crew for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));

create policy documents_select on public.documents for select to authenticated
  using (private.can_view_document(org_id, subject_type::text, subject_id));
create policy documents_insert on public.documents for insert to authenticated with check (public.has_role(org_id, '{owner,manager}'));
create policy documents_update on public.documents for update to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
create policy documents_delete on public.documents for delete to authenticated using (public.has_role(org_id, '{owner}'));

create policy document_alerts_select on public.document_alerts for select to authenticated
  using (public.has_role(org_id, '{owner,manager}'));
revoke insert, update, delete on public.document_alerts from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Private storage bucket for documents and photos (short-lived signed URLs only).
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy documents_bucket_read on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.can_view_document(
      private.path_part_uuid(name, 1), (storage.foldername(name))[2], private.path_part_uuid(name, 3))
  );
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.has_role(private.path_part_uuid(name, 1), '{owner,manager}')
    and (storage.foldername(name))[2] in ('vessel', 'crew', 'org')
  );
create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_role(private.path_part_uuid(name, 1), '{owner}'));
