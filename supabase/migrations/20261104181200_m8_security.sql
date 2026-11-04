-- M8: trip tracking. Positions come from the phone of someone who runs the trip, only while it is
-- departed (a short grace after arrival lets queued offline points land). Append-only.

create or replace function private.guard_position() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips%rowtype;
begin
  select * into t from public.trips where id = new.trip_id;
  if not found or t.org_id <> new.org_id then raise exception 'invalid_subject'; end if;
  if new.lat not between -90 and 90 or new.lng not between -180 and 180 then raise exception 'validation'; end if;
  -- Points belong to the voyage: from departure until arrival (offline points sync later).
  if t.actual_departure is null or new.recorded_at < t.actual_departure - interval '5 minutes'
     or (t.actual_arrival is not null and new.recorded_at > t.actual_arrival + interval '5 minutes') then
    raise exception 'invalid_transition';
  end if;
  return new;
end $$;
create trigger trip_positions_guard before insert on public.trip_positions
  for each row execute function private.guard_position();

alter table public.trip_positions enable row level security;
revoke all on public.trip_positions from anon;
revoke update, delete on public.trip_positions from authenticated;

create policy positions_select on public.trip_positions for select to authenticated
  using (private.can_see_trip(trip_id));
create policy positions_insert on public.trip_positions for insert to authenticated
  with check (private.can_run_trip(trip_id));

-- Correction to the M7 seed: the spec's default ticket fee is 100 bps (1%).
update public.fee_config set value = 100 where key = 'ticket_fee_bps' and effective_from = '2026-01-01';
