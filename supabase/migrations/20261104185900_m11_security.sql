-- M11: charter listings, requests and quotes. Two sides: the vessel owner's org and the
-- charterer's org. Listings are managed by their owner; the public board is served by the server
-- with an explicit column list (and only the listing's chosen public documents). Requests and
-- quotes are visible to both sides; acceptance is one transaction (accept_charter_quote).

create trigger charter_listings_touch before update on public.charter_listings for each row execute function private.touch_updated_at();
create trigger charter_requests_touch before update on public.charter_requests for each row execute function private.touch_updated_at();
create trigger charter_quotes_touch before update on public.charter_quotes for each row execute function private.touch_updated_at();
create trigger charters_touch before update on public.charters for each row execute function private.touch_updated_at();
create trigger charter_listings_audit after insert or update or delete on public.charter_listings for each row execute function private.write_audit('charter_listing');
create trigger charter_quotes_audit after insert or update on public.charter_quotes for each row execute function private.write_audit('charter_quote');
create trigger charters_audit after insert or update on public.charters for each row execute function private.write_audit('charter');

-- ---------------------------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------------------------
create or replace function private.guard_listing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vessels where id = new.vessel_id and org_id = new.org_id and charter_enabled) then
    raise exception 'invalid_subject';
  end if;
  if new.day_rate_minor <= 0 or new.min_days < 1 or (new.min_rate_minor is not null and new.min_rate_minor > new.day_rate_minor) then
    raise exception 'validation';
  end if;
  if new.available_from is not null and new.available_to is not null and new.available_to < new.available_from then
    raise exception 'validation';
  end if;
  -- Public documents must belong to this vessel (or the org) and this org.
  if exists (
    select 1 from unnest(new.public_document_ids) d(id)
    where not exists (
      select 1 from public.documents x where x.id = d.id and x.org_id = new.org_id
        and ((x.subject_type = 'vessel' and x.subject_id = new.vessel_id) or x.subject_type = 'org'))
  ) then
    raise exception 'invalid_subject';
  end if;
  return new;
end $$;
create trigger charter_listings_guard before insert or update on public.charter_listings
  for each row execute function private.guard_listing();

create or replace function private.guard_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.charter_listings%rowtype;
begin
  if new.end_date < new.start_date then raise exception 'validation'; end if;
  if new.listing_id is not null then
    select * into l from public.charter_listings where id = new.listing_id;
    if not found or l.status <> 'live' then raise exception 'not_found'; end if;
    new.owner_org_id := l.org_id;
    new.currency := coalesce(new.currency, l.currency);
  end if;
  if new.owner_org_id = new.charterer_org_id then raise exception 'validation'; end if;
  new.status := 'open';
  return new;
end $$;
create trigger charter_requests_guard before insert on public.charter_requests
  for each row execute function private.guard_request();

create or replace function private.guard_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.charter_requests%rowtype;
begin
  select * into r from public.charter_requests where id = new.request_id for update;
  if not found or r.status not in ('open', 'quoted') then raise exception 'invalid_transition'; end if;
  if r.owner_org_id is not null and r.owner_org_id <> new.owner_org_id then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.vessels where id = new.vessel_id and org_id = new.owner_org_id and charter_enabled) then
    raise exception 'invalid_subject';
  end if;
  if new.day_rate_minor <= 0 or new.mobilisation_minor < 0 or new.valid_until < current_date then raise exception 'validation'; end if;
  new.status := 'sent';
  update public.charter_requests set status = 'quoted' where id = r.id and status = 'open';
  return new;
end $$;
create trigger charter_quotes_guard before insert on public.charter_quotes
  for each row execute function private.guard_quote();

-- ---------------------------------------------------------------------------------------------
-- Accept / decline (charterer side)
-- ---------------------------------------------------------------------------------------------
create or replace function public.accept_charter_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  q public.charter_quotes%rowtype;
  r public.charter_requests%rowtype;
  v_days int;
  v_country text;
  v_charter uuid;
begin
  select * into q from public.charter_quotes where id = p_quote for update;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.charter_requests where id = q.request_id for update;
  if not public.has_role(r.charterer_org_id, '{owner,manager,charterer}') then raise exception 'forbidden'; end if;
  if q.status <> 'sent' or r.status not in ('open', 'quoted') then raise exception 'invalid_transition'; end if;
  if q.valid_until < current_date then
    update public.charter_quotes set status = 'expired' where id = q.id;
    raise exception 'quote_expired';
  end if;
  v_days := (r.end_date - r.start_date) + 1;
  select country_code into v_country from public.orgs where id = q.owner_org_id;
  update public.charter_quotes set status = 'accepted', decided_by = (select auth.uid()), decided_at = now() where id = q.id;
  update public.charter_quotes set status = 'declined', decided_at = now()
   where request_id = r.id and id <> q.id and status = 'sent';
  update public.charter_requests set status = 'accepted' where id = r.id;
  insert into public.charters (owner_org_id, charterer_org_id, vessel_id, quote_id, start_date, end_date, currency,
                               governing_country_code, day_rate_minor, mobilisation_minor, total_value_minor,
                               commission_bps, booked_on_platform, status)
  values (q.owner_org_id, r.charterer_org_id, q.vessel_id, q.id, r.start_date, r.end_date, q.currency,
          v_country, q.day_rate_minor, q.mobilisation_minor, q.day_rate_minor * v_days + q.mobilisation_minor,
          coalesce(public.fee_bps('charter_commission_bps', v_country), 0), true, 'pending_contract')
  returning id into v_charter;
  return v_charter;
end $$;

create or replace function public.decline_charter_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.charter_quotes%rowtype;
  r public.charter_requests%rowtype;
begin
  select * into q from public.charter_quotes where id = p_quote for update;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.charter_requests where id = q.request_id for update;
  if not public.has_role(r.charterer_org_id, '{owner,manager,charterer}') then raise exception 'forbidden'; end if;
  if q.status <> 'sent' then raise exception 'invalid_transition'; end if;
  update public.charter_quotes set status = 'declined', decided_by = (select auth.uid()), decided_at = now() where id = q.id;
  if not exists (select 1 from public.charter_quotes where request_id = r.id and status = 'sent') then
    update public.charter_requests set status = 'open' where id = r.id and status = 'quoted';
  end if;
end $$;
revoke execute on function public.accept_charter_quote(uuid), public.decline_charter_quote(uuid) from public, anon;
grant execute on function public.accept_charter_quote(uuid), public.decline_charter_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.charter_listings enable row level security;
alter table public.charter_requests enable row level security;
alter table public.charter_quotes enable row level security;
alter table public.charters enable row level security;
revoke all on public.charter_listings, public.charter_requests, public.charter_quotes, public.charters from anon;

create policy listings_select on public.charter_listings for select to authenticated using (public.has_role(org_id));
create policy listings_write on public.charter_listings for all to authenticated
  using (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id))
  with check (public.has_role(org_id, '{owner,manager}') and private.billing_writable(org_id));

-- Requests: the charterer's side, the owner they were sent to, and (open requests) charter owners.
create policy requests_select on public.charter_requests for select to authenticated
  using (
    public.has_role(charterer_org_id)
    or (owner_org_id is not null and public.has_role(owner_org_id, '{owner,manager}'))
    or (owner_org_id is null and exists (
          select 1 from public.memberships m join public.orgs o on o.id = m.org_id
          where m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'manager')
            and 'charter' = any (o.modes)))
  );
create policy requests_insert on public.charter_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and public.has_role(charterer_org_id, '{owner,manager,charterer}'));
revoke update, delete on public.charter_requests from authenticated;

create policy quotes_select on public.charter_quotes for select to authenticated
  using (
    public.has_role(owner_org_id)
    or exists (select 1 from public.charter_requests r where r.id = request_id and public.has_role(r.charterer_org_id))
  );
create policy quotes_insert on public.charter_quotes for insert to authenticated
  with check (public.has_role(owner_org_id, '{owner,manager}'));
revoke update, delete on public.charter_quotes from authenticated;

create policy charters_select on public.charters for select to authenticated
  using (public.has_role(owner_org_id) or (charterer_org_id is not null and public.has_role(charterer_org_id)));
revoke insert, update, delete on public.charters from authenticated;
