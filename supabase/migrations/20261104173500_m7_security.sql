-- M7: tickets, payments and billing (BUILD_SPEC §11).
-- * Only the server writes payments, tickets, subscriptions, the ledger and webhook events; people
--   read their org's rows.
-- * Seats are reserved under a row lock on the trip, counting the manifest plus unexpired
--   reservations, so online sales can never oversell.
-- * An org whose subscription is read_only or cancelled can't change its fleet, crew, routes or
--   invitations; trips, manifests, safety checks and alerts keep working.

alter table public.manifest_entries
  add constraint manifest_entries_ticket_id_tickets_id_fk foreign key (ticket_id) references public.tickets(id) on delete set null;
create unique index manifest_ticket_key on public.manifest_entries (ticket_id) where ticket_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Seeds: fees and plans. Business assumptions, admin-editable; not final prices.
-- ---------------------------------------------------------------------------------------------
insert into public.fee_config (key, country_code, value, effective_from) values
  ('ticket_fee_bps', null, 250, '2026-01-01'),
  ('ticket_fee_bps', 'NG', 250, '2026-01-01'),
  ('charter_commission_bps', null, 500, '2026-01-01'),
  ('charter_inapp_discount_bps', null, 100, '2026-01-01');

insert into public.plans (code, name_key, unit, mode, limits) values
  ('ferry_basic', 'plans.ferry_basic', 'per_org', 'ferry', '{"boats": 5}'),
  ('ferry_fleet', 'plans.ferry_fleet', 'per_org', 'ferry', '{"boats": 50}'),
  ('charter_standard', 'plans.charter_standard', 'per_vessel', 'charter', '{}'),
  ('charter_fleet', 'plans.charter_fleet', 'per_vessel', 'charter', '{}');

insert into public.plan_prices (plan_code, currency, price_minor, country_code, active_from) values
  ('ferry_basic', 'NGN', 3000000, null, '2026-01-01'),
  ('ferry_fleet', 'NGN', 7500000, null, '2026-01-01'),
  ('charter_standard', 'NGN', 15000000, null, '2026-01-01'),
  ('charter_fleet', 'NGN', 12000000, null, '2026-01-01'),
  ('ferry_basic', 'USD', 2000, null, '2026-01-01'),
  ('ferry_fleet', 'USD', 5000, null, '2026-01-01'),
  ('charter_standard', 'USD', 10000, null, '2026-01-01'),
  ('charter_fleet', 'USD', 8000, null, '2026-01-01');

-- The fee in force for a key and country (country value first, then the default).
create or replace function public.fee_bps(p_key text, p_country text, p_on date default current_date) returns integer
language sql stable security definer set search_path = '' as $$
  select value from public.fee_config
  where key = p_key and (country_code = p_country or country_code is null) and effective_from <= p_on
  order by country_code nulls last, effective_from desc
  limit 1;
$$;
grant execute on function public.fee_bps(text, text, date) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Seats and reservations
-- ---------------------------------------------------------------------------------------------
create or replace function private.seats_taken(p_trip uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(seats) from public.manifest_entries where trip_id = p_trip), 0)::int
       + coalesce((select sum(qty) from public.tickets
                   where trip_id = p_trip and status = 'reserved' and reserved_until > now()), 0)::int;
$$;

/**
 * Holds seats for a ticket while the buyer pays (server only). Amounts are computed by the app's
 * fee maths and passed in; this only locks the trip, checks it's open and has room, and inserts.
 */
create or replace function public.reserve_ticket(
  p_trip uuid, p_qty int, p_buyer_name text, p_buyer_phone text, p_code text,
  p_channel public.ticket_channel, p_unit_price_minor bigint, p_platform_fee_minor bigint,
  p_total_minor bigint, p_currency text, p_fee_bearer public.fee_bearer, p_hold_minutes int,
  p_passenger_user uuid default null
) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips%rowtype;
  v_capacity int;
  v_ticket public.tickets;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'not_found'; end if;
  if t.status not in ('scheduled', 'boarding') then raise exception 'trip_closed'; end if;
  if p_qty < 1 or p_qty > 20 then raise exception 'validation'; end if;
  if p_currency <> t.currency then raise exception 'currency_mismatch'; end if;
  select passenger_capacity into v_capacity from public.vessels where id = t.vessel_id;
  if v_capacity is not null and private.seats_taken(p_trip) + p_qty > v_capacity then
    raise exception 'capacity_exceeded';
  end if;
  insert into public.tickets (org_id, trip_id, route_id, passenger_user_id, buyer_name, buyer_phone, qty,
                              unit_price_minor, platform_fee_minor, total_minor, currency, fee_bearer,
                              channel, code, status, reserved_until)
  values (t.org_id, t.id, t.route_id, p_passenger_user, p_buyer_name, nullif(p_buyer_phone, ''), p_qty,
          p_unit_price_minor, p_platform_fee_minor, p_total_minor, p_currency, p_fee_bearer,
          p_channel, p_code, 'reserved', now() + make_interval(mins => p_hold_minutes))
  returning * into v_ticket;
  return v_ticket;
end $$;
revoke execute on function public.reserve_ticket(uuid, int, text, text, text, public.ticket_channel, bigint, bigint, bigint, text, public.fee_bearer, int, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Billing gate: read-only mode never blocks trips, manifests, safety or alerts (§11).
-- ---------------------------------------------------------------------------------------------
create or replace function private.billing_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.subscriptions where org_id = p_org and status in ('read_only', 'cancelled'));
$$;
grant execute on function private.billing_writable(uuid) to authenticated;

alter policy vessels_insert on public.vessels
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy vessels_update on public.vessels
  using (public.has_role(org_id, '{owner,manager}'))
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy crew_insert on public.crew_members
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy crew_update on public.crew_members
  using (public.has_role(org_id, '{owner,manager}'))
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy routes_write on public.routes
  using (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id))
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy schedules_write on public.schedules
  using (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id))
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));
alter policy invitations_insert on public.invitations
  with check (
    invited_by = (select auth.uid())
    and (public.has_role(org_id, '{owner}') or (public.has_role(org_id, '{manager}') and role in ('captain', 'crew')))
    and private.billing_writable(org_id)
  );

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.webhook_events enable row level security;
alter table public.fee_config enable row level security;
alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.org_settlement_accounts enable row level security;
alter table public.reconciliation_issues enable row level security;

revoke all on public.payments, public.tickets, public.webhook_events, public.subscriptions, public.ledger_entries,
  public.org_settlement_accounts, public.reconciliation_issues from anon;
-- The server (service role) writes all of these.
revoke insert, update, delete on public.payments, public.tickets, public.webhook_events, public.subscriptions,
  public.ledger_entries, public.org_settlement_accounts, public.reconciliation_issues from authenticated;
revoke all on public.webhook_events from authenticated;

create policy payments_select on public.payments for select to authenticated
  using (public.has_role(org_id, '{owner,manager}') or payer_user_id = (select auth.uid()));
create policy tickets_select on public.tickets for select to authenticated
  using (private.can_see_trip(trip_id) or passenger_user_id = (select auth.uid()));
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.has_role(org_id));
create policy ledger_select on public.ledger_entries for select to authenticated
  using (public.has_role(org_id, '{owner}') or public.is_platform_admin());
create policy settlement_select on public.org_settlement_accounts for select to authenticated
  using (public.has_role(org_id, '{owner}'));
create policy reconciliation_select on public.reconciliation_issues for select to authenticated
  using (public.is_platform_admin());

-- Reference data: readable by everyone; admins edit.
create policy fee_config_read on public.fee_config for select to anon, authenticated using (true);
create policy plans_read on public.plans for select to anon, authenticated using (true);
create policy plan_prices_read on public.plan_prices for select to anon, authenticated using (true);
create policy fee_config_admin on public.fee_config for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy plan_prices_admin on public.plan_prices for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke insert, update, delete on public.fee_config, public.plans, public.plan_prices from anon;

-- Ledger is append-only, even for the server role's callers through the API.
revoke update, delete on public.ledger_entries from authenticated, service_role;

create trigger tickets_audit after insert or update on public.tickets
  for each row execute function private.write_audit('ticket');
create trigger payments_audit after insert or update on public.payments
  for each row execute function private.write_audit('payment');
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Daily reconciliation (03:15 UTC) through the app's job endpoint.
-- ---------------------------------------------------------------------------------------------
select cron.schedule('reconcile-payments', '15 3 * * *', $$select private.run_job('reconcile-payments')$$);
