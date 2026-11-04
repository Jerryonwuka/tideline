-- M16: §12 data protection and hardening.

-- ---------------------------------------------------------------------------------------------
-- 1. TRUNCATE bypasses row-level security. Supabase's default grants gave it to anon and
--    authenticated on every public table; no app role needs it.
-- ---------------------------------------------------------------------------------------------
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Redaction: retention and erasure may change otherwise locked or append-only rows (manifests
--    of departed trips, audit snapshots, consents). Only these definer functions know the key, so
--    nobody can switch the bypass on from a session.
-- ---------------------------------------------------------------------------------------------
create table private.redaction_key (key text not null);
insert into private.redaction_key values (encode(extensions.gen_random_bytes(24), 'hex'));
revoke all on private.redaction_key from public, anon, authenticated;

create or replace function private.redacting() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(current_setting('tideline.redact', true), '') = (select key from private.redaction_key limit 1)
$$;

create or replace function private.begin_redaction() returns void
language sql security definer set search_path = '' as $$
  select set_config('tideline.redact', (select key from private.redaction_key limit 1), true);
$$;
create or replace function private.end_redaction() returns void
language sql security definer set search_path = '' as $$
  select set_config('tideline.redact', '', true);
$$;
revoke execute on function private.begin_redaction(), private.end_redaction() from public, anon, authenticated;

-- Append-only tables: audit snapshots may be redacted (UPDATE) and consents erased (DELETE).
create or replace function private.reject_mutation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.redacting() and (
       (tg_table_name = 'audit_logs' and tg_op = 'UPDATE')
    or (tg_table_name = 'consents' and tg_op = 'DELETE')) then
    return coalesce(new, old);
  end if;
  raise exception 'append_only' using errcode = '42501', detail = tg_table_name || ' rows cannot be changed or removed';
end $$;

create or replace function private.guard_manifest() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip public.trips%rowtype;
  v_capacity int;
  v_seats int;
begin
  -- Retention and erasure only blank personal fields.
  if tg_op = 'UPDATE' and private.redacting() then
    return new;
  end if;
  select * into v_trip from public.trips where id = coalesce(new.trip_id, old.trip_id) for update;
  if v_trip.status = 'cancelled' then raise exception 'trip_closed'; end if;

  if v_trip.status in ('departed', 'arrived') then
    -- Locked: nothing is changed or removed; late additions are kept as amendments.
    if tg_op <> 'INSERT' then
      if tg_op = 'UPDATE' and new.boarded_at is distinct from old.boarded_at
         and (to_jsonb(new) - 'boarded_at') = (to_jsonb(old) - 'boarded_at') then
        return new; -- marking someone boarded is still allowed
      end if;
      raise exception 'manifest_locked';
    end if;
    new.is_amendment := true;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select passenger_capacity into v_capacity from public.vessels where id = v_trip.vessel_id;
    select coalesce(sum(seats), 0) into v_seats from public.manifest_entries
     where trip_id = new.trip_id and id <> new.id;
    if v_capacity is not null and v_seats + new.seats > v_capacity then
      raise exception 'capacity_exceeded' using detail = format('%s of %s seats taken', v_seats, v_capacity);
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Personal keys removed from audit snapshots when the rows themselves are anonymised.
create or replace function private.redact_audit(p_entity text, p_ids uuid[], p_keys text[]) returns void
language sql security definer set search_path = '' as $$
  update public.audit_logs
     set before = case when before is null then null else before - p_keys end,
         after = case when after is null then null else after - p_keys end
   where entity = p_entity and entity_id = any (p_ids);
$$;
revoke execute on function private.redact_audit(text, uuid[], text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Retention (§12): manifests and tickets of trips before the cutoff are anonymised and their
--    GPS positions deleted. Called by the retention job per org (cutoff from org settings).
-- ---------------------------------------------------------------------------------------------
create or replace function public.anonymise_trips_before(p_org uuid, p_before timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_manifest uuid[];
  v_tickets uuid[];
  v_positions int;
begin
  perform private.begin_redaction();
  with old_trips as (
    select id from public.trips where org_id = p_org and coalesce(actual_departure, scheduled_departure, created_at) < p_before
  ), m as (
    update public.manifest_entries e
       set full_name = '[anonymised]', phone_e164 = null, next_of_kin_phone = null, sex = null
     where e.trip_id in (select id from old_trips)
       and (e.full_name is distinct from '[anonymised]' or e.phone_e164 is not null or e.next_of_kin_phone is not null)
    returning e.id
  ) select coalesce(array_agg(id), '{}') into v_manifest from m;
  with old_trips as (
    select id from public.trips where org_id = p_org and coalesce(actual_departure, scheduled_departure, created_at) < p_before
  ), t as (
    update public.tickets k set buyer_name = '[anonymised]', buyer_phone = null
     where k.trip_id in (select id from old_trips) and (k.buyer_phone is not null or k.buyer_name <> '[anonymised]')
    returning k.id
  ) select coalesce(array_agg(id), '{}') into v_tickets from t;
  delete from public.trip_positions where org_id = p_org and recorded_at < p_before;
  get diagnostics v_positions = row_count;
  perform private.redact_audit('manifest_entry', v_manifest, array['full_name', 'phone_e164', 'next_of_kin_phone', 'sex']);
  perform private.redact_audit('ticket', v_tickets, array['buyer_name', 'buyer_phone']);
  perform private.end_redaction();
  return jsonb_build_object('manifest_entries', cardinality(v_manifest), 'tickets', cardinality(v_tickets), 'positions', v_positions);
end $$;
revoke execute on function public.anonymise_trips_before(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.anonymise_trips_before(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Erasure (delete requests): personal fields about the person are blanked wherever they
--    appear as a passenger or buyer, references to their profile are cleared, and their consents
--    removed. The server then deletes the auth user (cascading profile, memberships, notifications).
--    Money and safety records stay (legal basis) without the person's details.
-- ---------------------------------------------------------------------------------------------
create or replace function public.erase_person(p_user uuid, p_phone text, p_phone_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_manifest uuid[];
  v_tickets uuid[];
begin
  perform private.begin_redaction();
  with m as (
    update public.manifest_entries set full_name = '[erased]', phone_e164 = null, next_of_kin_phone = null, sex = null
     where p_phone is not null and phone_e164 = p_phone
    returning id
  ) select coalesce(array_agg(id), '{}') into v_manifest from m;
  with t as (
    update public.tickets set buyer_name = '[erased]', buyer_phone = null, passenger_user_id = null
     where passenger_user_id = p_user or (p_phone is not null and buyer_phone = p_phone)
    returning id
  ) select coalesce(array_agg(id), '{}') into v_tickets from t;
  perform private.redact_audit('manifest_entry', v_manifest, array['full_name', 'phone_e164', 'next_of_kin_phone', 'sex']);
  perform private.redact_audit('ticket', v_tickets, array['buyer_name', 'buyer_phone', 'passenger_user_id']);
  perform private.redact_audit('profile', array[p_user], array['full_name', 'phone_e164', 'email']);
  delete from public.consents where user_id = p_user or (p_phone_hash is not null and phone_hash = p_phone_hash);
  update public.invitations set accepted_by = null where accepted_by = p_user;
  update public.invitations set invited_by = null where invited_by = p_user;
  update public.memberships set invited_by = null where invited_by = p_user;
  update public.crew_members set user_id = null where user_id = p_user;
  update public.documents set reviewed_by = null where reviewed_by = p_user;
  update public.compliance_rule_sets set reviewed_by = null where reviewed_by = p_user;
  perform private.end_redaction();
  return jsonb_build_object('manifest_entries', cardinality(v_manifest), 'tickets', cardinality(v_tickets));
end $$;
revoke execute on function public.erase_person(uuid, text, text) from public, anon, authenticated;
grant execute on function public.erase_person(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. Consents (append-only), data requests, admin access log, feature flags, rate limits.
-- ---------------------------------------------------------------------------------------------
alter table public.consents enable row level security;
alter table public.data_requests enable row level security;
alter table public.admin_access_logs enable row level security;
alter table public.feature_flags enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.consents, public.data_requests, public.admin_access_logs, public.feature_flags, public.rate_limits
  from anon, authenticated;

create trigger consents_append_only before update or delete on public.consents
  for each row execute function private.reject_mutation();
grant select on public.consents to authenticated;
create policy consents_own on public.consents for select to authenticated using (user_id = (select auth.uid()));

create trigger data_requests_touch before update on public.data_requests for each row execute function private.touch_updated_at();
create trigger data_requests_audit after insert or update on public.data_requests for each row execute function private.write_audit('data_request');
-- One open request of each kind per person.
create unique index data_requests_one_open on public.data_requests (user_id, kind) where status = 'pending';
grant select on public.data_requests to authenticated;
grant insert (user_id, kind) on public.data_requests to authenticated;
create policy data_requests_select on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

create trigger admin_access_logs_append_only before update or delete on public.admin_access_logs
  for each row execute function private.reject_mutation();
grant select on public.admin_access_logs to authenticated;
create policy admin_access_logs_select on public.admin_access_logs for select to authenticated
  using (public.is_platform_admin());

grant select on public.feature_flags to anon, authenticated;
grant update (enabled) on public.feature_flags to authenticated;
create policy feature_flags_read on public.feature_flags for select to anon, authenticated using (true);
create policy feature_flags_admin on public.feature_flags for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create or replace function private.stamp_flag() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger feature_flags_stamp before update on public.feature_flags for each row execute function private.stamp_flag();
create trigger feature_flags_audit after update on public.feature_flags for each row execute function private.write_audit('feature_flag');
insert into public.feature_flags (key, enabled, description) values
  ('charter', true, 'Charter mode: board, listings, requests, charters, tenders, idle-vessel suggestions.'),
  ('escrow', true, 'Escrow payments for charters. In production also needs ESCROW_ENABLED=on (legal sign-off).'),
  ('phase3', false, 'Phase 3 features (none released yet).');

-- Fixed-window counter; true while under the limit. Server only (keys are hashed by the app).
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. Admin reads of passenger data need a reason, and every read is logged (§12).
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_read_manifest(p_trip uuid, p_reason text)
returns table (id uuid, full_name text, phone_e164 text, seats int, age_band text, next_of_kin_phone text, boarded_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_rows int;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select count(*) into v_rows from public.manifest_entries e where e.trip_id = p_trip;
  insert into public.admin_access_logs (admin_user_id, subject_type, subject_id, reason, rows_returned)
  values ((select auth.uid()), 'trip_manifest', p_trip, trim(p_reason), v_rows);
  return query
    select e.id, e.full_name, e.phone_e164, e.seats, e.age_band::text, e.next_of_kin_phone, e.boarded_at
      from public.manifest_entries e where e.trip_id = p_trip order by e.created_at;
end $$;
revoke execute on function public.admin_read_manifest(uuid, text) from public, anon;
grant execute on function public.admin_read_manifest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Exports live in a private bucket; downloads are short-lived signed links.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privacy', 'privacy', false, 20971520, array['application/json'])
on conflict (id) do nothing;

-- Daily 02:00 UTC: retention (anonymise old manifests, delete old positions) and overdue requests.
select cron.schedule('retention', '0 2 * * *', $$select private.run_job('retention')$$);
