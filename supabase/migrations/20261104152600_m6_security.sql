-- M6: safety lock (BUILD_SPEC §4.2, §10.3).
-- * Org thresholds may only be stricter than the country defaults (published rule set, else the
--   global baseline).
-- * Checks are computed and stored by the server (users can't insert them); acknowledgements,
--   override requests and decisions are inserted by people under RLS. All four are append-only.
-- * Departure needs a check stored in the last hour that passed, was acknowledged (warn) or was
--   overridden (block). Capacity and life-jacket blocks can never be overridden.

-- ---------------------------------------------------------------------------------------------
-- Defaults: the global baseline (conservative placeholders, not official limits; §10.3).
-- ---------------------------------------------------------------------------------------------
insert into public.safety_rule_defaults (rule_set_id, max_wind_kmh, max_gust_kmh, max_wave_m, max_precip_mm_h, night_block)
select id, 30, 40, 1.0, 10, true from public.compliance_rule_sets
where country_code is null and status = 'published'
on conflict (rule_set_id) do nothing;

create or replace function public.safety_defaults_for(p_country text)
returns table (max_wind_kmh numeric, max_gust_kmh numeric, max_wave_m numeric, max_precip_mm_h numeric,
               night_block boolean, permitted_start time, permitted_end time)
language sql stable security definer set search_path = '' as $$
  select d.max_wind_kmh, d.max_gust_kmh, d.max_wave_m, d.max_precip_mm_h, d.night_block, d.permitted_start, d.permitted_end
  from public.safety_rule_defaults d
  join public.compliance_rule_sets s on s.id = d.rule_set_id
  where s.status = 'published' and (s.country_code = p_country or s.country_code is null)
  order by s.country_code nulls last, s.version desc
  limit 1;
$$;
grant execute on function public.safety_defaults_for(text) to authenticated;

create or replace function private.guard_thresholds() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d record;
begin
  select * into d from public.safety_defaults_for((select country_code from public.orgs where id = new.org_id));
  if found and (
       new.max_wind_kmh > d.max_wind_kmh or new.max_gust_kmh > d.max_gust_kmh
    or new.max_wave_m > d.max_wave_m or new.max_precip_mm_h > d.max_precip_mm_h
    or (d.night_block and not new.night_block)
    or (d.permitted_start is not null and (new.permitted_start is null or new.permitted_start < d.permitted_start))
    or (d.permitted_end is not null and (new.permitted_end is null or new.permitted_end > d.permitted_end))
  ) then
    raise exception 'thresholds_too_loose';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
create trigger safety_thresholds_guard before insert or update on public.safety_thresholds
  for each row execute function private.guard_thresholds();
create trigger safety_thresholds_audit after insert or update or delete on public.safety_thresholds
  for each row execute function private.write_audit('safety_thresholds');

-- ---------------------------------------------------------------------------------------------
-- Who can see / work a trip by id (mirrors trips RLS).
-- ---------------------------------------------------------------------------------------------
create or replace function private.can_see_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trips t where t.id = p_trip
      and (public.has_role(t.org_id, '{owner,manager}') or private.can_work_trip(t.org_id, t.vessel_id, t.captain_crew_id)));
$$;
create or replace function private.can_run_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trips t where t.id = p_trip
      and (public.has_role(t.org_id, '{owner,manager}')
           or (public.has_role(t.org_id, '{captain}') and private.can_work_trip(t.org_id, t.vessel_id, t.captain_crew_id))));
$$;
grant execute on function private.can_see_trip(uuid) to authenticated;
grant execute on function private.can_run_trip(uuid) to authenticated;

/** Owners decide overrides; managers too when the org allows it (settings.manager_can_override). */
create or replace function private.can_decide_override(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, '{owner}')
    or (public.has_role(p_org, '{manager}')
        and coalesce((select (settings ->> 'manager_can_override')::boolean from public.orgs where id = p_org), false));
$$;
grant execute on function private.can_decide_override(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Integrity of acknowledgements, requests and decisions.
-- ---------------------------------------------------------------------------------------------
create or replace function private.guard_safety_followup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.safety_checks%rowtype;
  r public.safety_override_requests%rowtype;
begin
  select * into c from public.safety_checks where id = new.safety_check_id;
  if not found or c.org_id <> new.org_id then raise exception 'invalid_subject'; end if;

  if tg_table_name = 'safety_acknowledgements' then
    if c.result <> 'warn' then raise exception 'invalid_transition'; end if;
  elsif tg_table_name = 'safety_override_requests' then
    if c.result <> 'block' or c.trip_id <> new.trip_id then raise exception 'invalid_transition'; end if;
    if exists (select 1 from jsonb_array_elements(c.reasons) x where not coalesce((x ->> 'overridable')::boolean, false)
               and x ->> 'severity' = 'block') then
      raise exception 'not_overridable';
    end if;
  else -- safety_overrides
    select * into r from public.safety_override_requests where id = new.request_id;
    if not found or r.safety_check_id <> new.safety_check_id or r.trip_id <> new.trip_id then
      raise exception 'invalid_subject';
    end if;
    if new.decision = 'approved' and exists (
         select 1 from jsonb_array_elements(c.reasons) x
         where x ->> 'severity' = 'block' and not coalesce((x ->> 'overridable')::boolean, false)) then
      raise exception 'not_overridable';
    end if;
    if length(trim(coalesce(new.reason, ''))) < 3 then raise exception 'validation'; end if;
    new.requested_by := r.requested_by;
    new.requested_at := r.requested_at;
    new.decided_at := now();
  end if;
  return new;
end $$;

create trigger safety_ack_guard before insert on public.safety_acknowledgements
  for each row execute function private.guard_safety_followup();
create trigger safety_request_guard before insert on public.safety_override_requests
  for each row execute function private.guard_safety_followup();
create trigger safety_override_guard before insert on public.safety_overrides
  for each row execute function private.guard_safety_followup();

-- ---------------------------------------------------------------------------------------------
-- Departure gate (replaces the M4 guard, same rules plus the safety lock).
-- ---------------------------------------------------------------------------------------------
create or replace function private.safety_clearance(p_trip uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.safety_checks%rowtype;
begin
  select * into c from public.safety_checks
   where trip_id = p_trip and created_at >= now() - interval '60 minutes'
   order by created_at desc, checked_at desc limit 1;
  if not found then return 'safety_check_required'; end if;
  if c.result = 'pass' then return null; end if;
  if c.result = 'warn' then
    return case when exists (select 1 from public.safety_acknowledgements where safety_check_id = c.id)
                then null else 'safety_unacknowledged' end;
  end if;
  return case when exists (select 1 from public.safety_overrides where safety_check_id = c.id and decision = 'approved')
              then null else 'safety_blocked' end;
end $$;
grant execute on function private.safety_clearance(uuid) to authenticated;

create or replace function private.guard_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[];
  v_safety text;
begin
  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'scheduled' then array['boarding', 'departed', 'cancelled']
      when 'boarding' then array['departed', 'cancelled']
      when 'departed' then array['arrived']
      else array[]::text[]
    end;
    if not (new.status::text = any (v_allowed)) then raise exception 'invalid_transition'; end if;
    if new.status = 'departed' then
      if not new.lifejackets_confirmed then raise exception 'lifejackets_unconfirmed'; end if;
      v_safety := private.safety_clearance(new.id);
      if v_safety is not null then raise exception '%', v_safety; end if;
      new.actual_departure := coalesce(new.actual_departure, now());
      select coalesce(sum(seats), 0) into new.passenger_count from public.manifest_entries where trip_id = new.id;
    elsif new.status = 'arrived' then
      new.actual_arrival := coalesce(new.actual_arrival, now());
      select coalesce(sum(seats), 0) into new.passenger_count from public.manifest_entries where trip_id = new.id;
    end if;
  end if;
  if old.status in ('arrived', 'cancelled') and new.status = old.status
     and (to_jsonb(new) - 'updated_at' - 'notes') <> (to_jsonb(old) - 'updated_at' - 'notes') then
    raise exception 'trip_closed';
  end if;
  if new.org_id <> old.org_id or new.vessel_id <> old.vessel_id and old.status <> 'scheduled' then
    raise exception 'immutable_trip';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.weather_cache enable row level security;
alter table public.safety_thresholds enable row level security;
alter table public.safety_checks enable row level security;
alter table public.safety_acknowledgements enable row level security;
alter table public.safety_override_requests enable row level security;
alter table public.safety_overrides enable row level security;
revoke all on public.weather_cache, public.safety_thresholds, public.safety_checks, public.safety_acknowledgements,
  public.safety_override_requests, public.safety_overrides from anon;

-- Weather is public data; only the server (service role) writes it.
create policy weather_cache_read on public.weather_cache for select to authenticated using (true);
revoke insert, update, delete on public.weather_cache from authenticated;

create policy thresholds_select on public.safety_thresholds for select to authenticated using (public.has_role(org_id));
create policy thresholds_write on public.safety_thresholds for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));

-- Append-only: nobody updates or deletes (CLAUDE.md rule 7).
revoke update, delete on public.safety_checks, public.safety_acknowledgements, public.safety_override_requests,
  public.safety_overrides from authenticated;
revoke insert on public.safety_checks from authenticated;

create policy safety_checks_select on public.safety_checks for select to authenticated
  using (private.can_see_trip(trip_id));

create policy safety_acks_select on public.safety_acknowledgements for select to authenticated
  using (public.has_role(org_id));
create policy safety_acks_insert on public.safety_acknowledgements for insert to authenticated
  with check (acknowledged_by = (select auth.uid())
              and private.can_run_trip((select trip_id from public.safety_checks where id = safety_check_id)));

create policy override_requests_select on public.safety_override_requests for select to authenticated
  using (private.can_see_trip(trip_id));
create policy override_requests_insert on public.safety_override_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and private.can_run_trip(trip_id));

create policy overrides_select on public.safety_overrides for select to authenticated
  using (private.can_see_trip(trip_id));
create policy overrides_insert on public.safety_overrides for insert to authenticated
  with check (decided_by = (select auth.uid()) and private.can_decide_override(org_id));

create trigger safety_overrides_audit after insert on public.safety_overrides
  for each row execute function private.write_audit('safety_override');

-- ---------------------------------------------------------------------------------------------
-- Weather polling: every 30 minutes (UTC), through the app's job endpoint.
-- ---------------------------------------------------------------------------------------------
select cron.schedule('weather-poll', '*/30 * * * *', $$select private.run_job('weather-poll')$$);
