-- M4: ferry security and rules. Capacity is a hard block (no override); the manifest locks at
-- departure and later additions are recorded as amendments; trip status only moves forward.

create trigger trips_touch before update on public.trips for each row execute function private.touch_updated_at();
create trigger trips_audit after insert or update or delete on public.trips
  for each row execute function private.write_audit('trip');
create trigger manifest_audit after insert or update or delete on public.manifest_entries
  for each row execute function private.write_audit('manifest_entry');
create trigger routes_audit after insert or update or delete on public.routes
  for each row execute function private.write_audit('route');

-- ---------------------------------------------------------------------------------------------
-- Who works a trip: the captain on it, or crew assigned to its vessel (today).
-- ---------------------------------------------------------------------------------------------
create or replace function private.my_crew_ids(p_org uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.crew_members
  where org_id = p_org and user_id = (select auth.uid()) and status = 'active';
$$;

create or replace function private.can_work_trip(p_org uuid, p_vessel uuid, p_captain uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(p_org, '{captain,crew}') and (
    p_captain in (select private.my_crew_ids(p_org))
    or exists (
      select 1 from public.vessel_crew vc
      where vc.vessel_id = p_vessel and vc.org_id = p_org
        and vc.crew_member_id in (select private.my_crew_ids(p_org))
        and (vc.to_date is null or vc.to_date >= current_date)
    )
  );
$$;
grant execute on function private.my_crew_ids(uuid) to authenticated;
grant execute on function private.can_work_trip(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------------------------
create or replace function private.check_ferry_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean := true;
begin
  if tg_table_name = 'routes' then
    v_ok := new.origin_jetty_id <> new.destination_jetty_id;
  elsif tg_table_name = 'schedules' then
    v_ok := exists (select 1 from public.routes where id = new.route_id and org_id = new.org_id)
        and exists (select 1 from public.vessels where id = new.vessel_id and org_id = new.org_id)
        and cardinality(new.days_of_week) > 0
        and new.days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[];
  elsif tg_table_name = 'trips' then
    v_ok := exists (select 1 from public.vessels where id = new.vessel_id and org_id = new.org_id)
        and (new.route_id is null or exists (select 1 from public.routes where id = new.route_id and org_id = new.org_id))
        and (new.captain_crew_id is null or exists (select 1 from public.crew_members where id = new.captain_crew_id and org_id = new.org_id))
        and (new.route_id is not null or (new.origin_text is not null and new.destination_text is not null));
  elsif tg_table_name = 'manifest_entries' then
    v_ok := exists (select 1 from public.trips where id = new.trip_id and org_id = new.org_id) and new.seats between 1 and 50;
  end if;
  if not v_ok then raise exception 'invalid_subject'; end if;
  return new;
end $$;

create trigger routes_check before insert or update on public.routes for each row execute function private.check_ferry_same_org();
create trigger schedules_check before insert or update on public.schedules for each row execute function private.check_ferry_same_org();
create trigger trips_check before insert or update on public.trips for each row execute function private.check_ferry_same_org();
create trigger manifest_check before insert or update on public.manifest_entries for each row execute function private.check_ferry_same_org();

-- Capacity (hard block) and the lock at departure.
create or replace function private.guard_manifest() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip public.trips%rowtype;
  v_capacity int;
  v_seats int;
begin
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

create trigger manifest_guard before insert or update or delete on public.manifest_entries
  for each row execute function private.guard_manifest();

-- Trip status only moves forward; times and passenger count are recorded on the way.
create or replace function private.guard_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[];
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

create trigger trips_guard before update on public.trips for each row execute function private.guard_trip();

-- ---------------------------------------------------------------------------------------------
-- Schedules → trips for a day (idempotent; any member may trigger it).
-- ---------------------------------------------------------------------------------------------
create or replace function public.materialise_schedule_trips(p_org uuid, p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not public.has_role(p_org) then raise exception 'forbidden'; end if;
  with slots as (
    select s.id as schedule_id, s.route_id, s.vessel_id, r.currency,
           ((p_date + s.departure_time) at time zone j.time_zone) as departs,
           (select vc.crew_member_id from public.vessel_crew vc
              join public.crew_members cm on cm.id = vc.crew_member_id
             where vc.vessel_id = s.vessel_id and vc.to_date is null and cm.crew_role = 'captain' and cm.status = 'active'
             order by vc.from_date limit 1) as captain
    from public.schedules s
    join public.routes r on r.id = s.route_id and r.active
    join public.jetties j on j.id = r.origin_jetty_id
    where s.org_id = p_org and s.active
      and extract(dow from p_date)::smallint = any (s.days_of_week)
  ), ins as (
    insert into public.trips (org_id, vessel_id, route_id, schedule_id, scheduled_departure, currency, captain_crew_id)
    select p_org, vessel_id, route_id, schedule_id, departs, currency, captain from slots
    on conflict (schedule_id, scheduled_departure) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;
revoke execute on function public.materialise_schedule_trips(uuid, date) from public, anon;
grant execute on function public.materialise_schedule_trips(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.jetties enable row level security;
alter table public.routes enable row level security;
alter table public.schedules enable row level security;
alter table public.trips enable row level security;
alter table public.manifest_entries enable row level security;
revoke all on public.routes, public.schedules, public.trips, public.manifest_entries from anon;
revoke insert, update, delete on public.jetties from anon;

-- Jetties: active ones are public reference data; proposals are visible to the proposer and admins.
create policy jetties_read_anon on public.jetties for select to anon using (status = 'active');
create policy jetties_read on public.jetties for select to authenticated
  using (status = 'active' or public.is_platform_admin()
         or (proposed_by_org_id is not null and public.has_role(proposed_by_org_id)) or proposed_by_org_id is null);
create policy jetties_propose on public.jetties for insert to authenticated
  with check (status = 'proposed' and proposed_by_org_id is not null and public.has_role(proposed_by_org_id, '{owner,manager}'));
create policy jetties_admin on public.jetties for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy routes_select on public.routes for select to authenticated using (public.has_role(org_id));
create policy routes_write on public.routes for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
create policy schedules_select on public.schedules for select to authenticated using (public.has_role(org_id));
create policy schedules_write on public.schedules for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));

-- Trips carry takings: owners/managers see all; captains and crew only the trips they work.
create policy trips_select on public.trips for select to authenticated
  using (public.has_role(org_id, '{owner,manager}') or private.can_work_trip(org_id, vessel_id, captain_crew_id));
create policy trips_insert on public.trips for insert to authenticated
  with check (
    public.has_role(org_id, '{owner,manager}')
    or (public.has_role(org_id, '{captain}') and captain_crew_id in (select private.my_crew_ids(org_id))
        and private.can_work_trip(org_id, vessel_id, null))
  );
-- Crew sell and board; only captains (and the office) open and close trips (§3).
create policy trips_update on public.trips for update to authenticated
  using (public.has_role(org_id, '{owner,manager}')
         or (public.has_role(org_id, '{captain}') and private.can_work_trip(org_id, vessel_id, captain_crew_id)))
  with check (public.has_role(org_id, '{owner,manager}')
         or (public.has_role(org_id, '{captain}') and private.can_work_trip(org_id, vessel_id, captain_crew_id)));
create policy trips_delete on public.trips for delete to authenticated
  using (public.has_role(org_id, '{owner}') and status = 'scheduled');

create or replace function private.can_work_trip_id(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip
      and (public.has_role(t.org_id, '{owner,manager}') or private.can_work_trip(t.org_id, t.vessel_id, t.captain_crew_id))
  );
$$;
grant execute on function private.can_work_trip_id(uuid) to authenticated;

create policy manifest_select on public.manifest_entries for select to authenticated using (private.can_work_trip_id(trip_id));
create policy manifest_insert on public.manifest_entries for insert to authenticated with check (private.can_work_trip_id(trip_id));
create policy manifest_update on public.manifest_entries for update to authenticated
  using (private.can_work_trip_id(trip_id)) with check (private.can_work_trip_id(trip_id));
create policy manifest_delete on public.manifest_entries for delete to authenticated using (private.can_work_trip_id(trip_id));

-- ---------------------------------------------------------------------------------------------
-- Sample Lagos jetties: PROPOSED until an admin checks names and coordinates.
-- ---------------------------------------------------------------------------------------------
insert into public.jetties (country_code, time_zone, name, aliases, admin_area, lat, lng, status) values
  ('NG', 'Africa/Lagos', 'CMS Marina', '{CMS,Marina}', 'Lagos', 6.4500, 3.3920, 'proposed'),
  ('NG', 'Africa/Lagos', 'Ikorodu', '{Ikorodu Terminal}', 'Lagos', 6.6190, 3.5050, 'proposed'),
  ('NG', 'Africa/Lagos', 'Falomo', '{Ikoyi}', 'Lagos', 6.4480, 3.4290, 'proposed'),
  ('NG', 'Africa/Lagos', 'Badore', '{Ajah}', 'Lagos', 6.5130, 3.6000, 'proposed'),
  ('NG', 'Africa/Lagos', 'Mile 2', '{Mile2}', 'Lagos', 6.4630, 3.3150, 'proposed'),
  ('NG', 'Africa/Lagos', 'Five Cowries', '{Five Cowrie Creek}', 'Lagos', 6.4420, 3.4220, 'proposed');
