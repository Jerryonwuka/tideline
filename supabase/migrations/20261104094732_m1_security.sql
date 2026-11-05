-- M1 security: role helpers, row-level security, audit trail and the RPCs that need to cross
-- RLS boundaries (create an org with its first owner, accept an invitation).
-- Error messages raised here are stable codes the app maps to translated text.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger orgs_touch before update on public.orgs for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships for each row execute function private.touch_updated_at();
create trigger invitations_touch before update on public.invitations for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Role helpers (BUILD_SPEC §3). SECURITY DEFINER so policies can call them without recursing
-- into the memberships policy.
-- ---------------------------------------------------------------------------------------------
create or replace function public.has_role(p_org uuid, p_roles public.membership_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

-- A profile is visible to its owner, to owners/managers of an org the person belongs to, and to admins.
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
    or public.is_platform_admin()
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs on theirs.org_id = mine.org_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and mine.role in ('owner', 'manager')
        and theirs.user_id = p_user
    );
$$;

revoke execute on function public.has_role(uuid, public.membership_role[]) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function private.can_see_profile(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.membership_role[]) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function private.can_see_profile(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Profiles follow auth.users (phone stored as E.164 with the leading +).
-- ---------------------------------------------------------------------------------------------
create or replace function private.e164(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case when p_phone is null or p_phone = '' then null else '+' || ltrim(p_phone, '+') end;
$$;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone_e164, email)
  values (new.id, private.e164(new.phone), nullif(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set phone_e164 = private.e164(new.phone), email = nullif(new.email, '')
   where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_updated after update of phone, email on auth.users
  for each row execute function private.handle_user_updated();

-- ---------------------------------------------------------------------------------------------
-- Audit trail (append-only). Written by triggers so no code path can skip it.
-- ---------------------------------------------------------------------------------------------
create or replace function private.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := tg_argv[0];
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_org uuid;
  v_headers json;
  v_ip text;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_action := 'updated';
  else
    v_before := to_jsonb(old);
    v_action := 'deleted';
  end if;

  if v_entity = 'invitation' then
    -- Never copy the token hash into the audit trail.
    v_before := v_before - 'token_hash';
    v_after := v_after - 'token_hash';
    if tg_op = 'UPDATE' and v_before ->> 'accepted_at' is null and v_after ->> 'accepted_at' is not null then
      v_action := 'accepted';
    end if;
  elsif v_entity = 'membership' and tg_op = 'UPDATE' then
    if v_before ->> 'role' is distinct from v_after ->> 'role' then
      v_action := 'role_changed';
    elsif v_before ->> 'status' is distinct from v_after ->> 'status' then
      v_action := 'status_changed';
    end if;
  end if;

  v_org := coalesce(
    v_after ->> 'org_id',
    v_before ->> 'org_id',
    case when v_entity = 'org' then coalesce(v_after ->> 'id', v_before ->> 'id') end
  )::uuid;

  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(v_headers ->> 'x-client-ip', split_part(v_headers ->> 'x-forwarded-for', ',', 1));

  insert into public.audit_logs (org_id, actor_user_id, action, entity, entity_id, before, after, ip)
  values (
    v_org,
    (select auth.uid()),
    v_entity || '.' || v_action,
    v_entity,
    coalesce(v_after ->> 'id', v_before ->> 'id')::uuid,
    v_before,
    v_after,
    nullif(trim(v_ip), '')
  );
  return coalesce(new, old);
end $$;

create trigger orgs_audit after insert or update or delete on public.orgs
  for each row execute function private.write_audit('org');
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.write_audit('membership');
create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function private.write_audit('invitation');

create or replace function private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append_only' using errcode = '42501', detail = tg_table_name || ' rows cannot be changed or removed';
end $$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.reject_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.reject_mutation();

-- ---------------------------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------------------------
create or replace function private.guard_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.org_id <> old.org_id) then
    raise exception 'immutable_membership';
  end if;
  -- Every org keeps at least one active owner (unless the org itself is being deleted).
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and exists (select 1 from public.orgs o where o.id = old.org_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.id <> old.id and m.role = 'owner' and m.status = 'active'
     ) then
    raise exception 'last_owner';
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_guard before update or delete on public.memberships
  for each row execute function private.guard_membership();

create or replace function private.guard_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Verification is set by platform admins (or server jobs running without a user).
  if new.verification_status is distinct from old.verification_status
     and (select auth.uid()) is not null and not public.is_platform_admin() then
    raise exception 'admin_only_field';
  end if;
  return new;
end $$;

create trigger orgs_guard before update on public.orgs
  for each row execute function private.guard_org();

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- Creates an org and makes the caller its owner in one transaction.
create or replace function public.create_org(
  p_name text,
  p_type public.org_type,
  p_country_code text,
  p_modes text[],
  p_registration_number text default null,
  p_region text default null,
  p_address text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'invalid_name'; end if;
  if p_country_code !~ '^[A-Z]{2}$' then raise exception 'invalid_country'; end if;
  if p_modes is null or cardinality(p_modes) = 0 or not (p_modes <@ array['ferry', 'charter', 'barge']) then
    raise exception 'invalid_modes';
  end if;

  insert into public.orgs (name, type, country_code, modes, registration_number, region, address)
  values (trim(p_name), p_type, p_country_code, p_modes, nullif(trim(p_registration_number), ''),
          nullif(trim(p_region), ''), nullif(trim(p_address), ''))
  returning id into v_org;

  insert into public.memberships (user_id, org_id, role) values (v_uid, v_org, 'owner');
  return v_org;
end $$;

-- Runs as the caller, so the invitation policies decide who may invite whom.
create or replace function public.create_invitation(
  p_org uuid,
  p_phone text,
  p_role public.membership_role,
  p_token_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'invalid_phone'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token'; end if;
  if exists (
    select 1 from public.memberships m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and p.phone_e164 = p_phone
  ) then
    raise exception 'already_member';
  end if;
  -- One open invitation per phone per org: a new invite replaces the old one.
  delete from public.invitations where org_id = p_org and phone_e164 = p_phone and accepted_at is null;
  insert into public.invitations (org_id, phone_e164, role, token_hash, expires_at, invited_by)
  values (p_org, p_phone, p_role, p_token_hash, p_expires_at, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- Accepting needs to create a membership the caller can't insert directly, so it is SECURITY DEFINER
-- and checks everything itself: token, expiry, single use and that the phone matches the invite.
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
  return v_inv.org_id;
end $$;

-- What the invite link page shows before sign-in: org name and role only.
create or replace function public.invitation_preview(p_token text)
returns table (org_name text, role public.membership_role, status text)
language sql stable security definer set search_path = '' as $$
  select o.name,
         i.role,
         case when i.accepted_at is not null then 'used'
              when i.expires_at < now() then 'expired'
              else 'valid' end
  from public.invitations i
  join public.orgs o on o.id = i.org_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke execute on function public.create_org(text, public.org_type, text, text[], text, text, text) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.membership_role, text, timestamptz) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.invitation_preview(text) from public;
grant execute on function public.create_org(text, public.org_type, text, text[], text, text, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.membership_role, text, timestamptz) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security (CLAUDE.md rule 1)
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

-- Nobody signed out reads or writes these tables.
revoke all on public.profiles, public.orgs, public.memberships, public.platform_admins,
  public.invitations, public.audit_logs from anon;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Phone and email come from auth; users may only edit these columns.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, locale, time_zone, whatsapp_opt_in) on public.profiles to authenticated;

-- orgs
create policy orgs_select on public.orgs for select to authenticated
  using (public.has_role(id) or public.is_platform_admin());
create policy orgs_update on public.orgs for update to authenticated
  using (public.has_role(id, '{owner}') or public.is_platform_admin())
  with check (public.has_role(id, '{owner}') or public.is_platform_admin());
revoke insert, delete on public.orgs from authenticated;

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role(org_id, '{owner,manager}') or public.is_platform_admin());
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(org_id, '{owner}'))
  with check (public.has_role(org_id, '{owner}'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(org_id, '{owner}') or user_id = (select auth.uid()));
revoke insert, update on public.memberships from authenticated;
grant update (role, status) on public.memberships to authenticated;

-- invitations: owners invite anyone; managers invite captains and crew.
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_role(org_id, '{owner,manager}'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and (public.has_role(org_id, '{owner}')
         or (public.has_role(org_id, '{manager}') and role in ('captain', 'crew')))
  );
create policy invitations_delete on public.invitations for delete to authenticated
  using (
    accepted_at is null
    and (public.has_role(org_id, '{owner}')
         or (public.has_role(org_id, '{manager}') and role in ('captain', 'crew')))
  );
revoke update on public.invitations from authenticated;

-- platform_admins: you can see whether you are one; admins see the list.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
revoke insert, update, delete on public.platform_admins from authenticated;

-- audit_logs: owners read their org's trail; admins read all. Rows only come from triggers.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role(org_id, '{owner}') or public.is_platform_admin());
revoke insert, update, delete, truncate on public.audit_logs from authenticated, service_role;
