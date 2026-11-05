-- M13: escrow, commission and payouts (§11). Platform-held funds move only through functions
-- that lock the hold: fund_escrow (on a confirmed payment, once per payment), release_escrow (once
-- per hold and tranche; commission = charter commission minus the in-app discount), refund_escrow,
-- dispute_escrow (freezes releases; only admin tranches pass) and confirm_hire (two-sided on/off
-- hire). Every step writes ledger_entries (append-only) and audit_logs. Fund movements are called
-- by the server (service role) after it has checked who is asking.

create trigger escrow_holds_touch before update on public.escrow_holds for each row execute function private.touch_updated_at();
create trigger payouts_touch before update on public.payouts for each row execute function private.touch_updated_at();
create trigger bank_accounts_touch before update on public.bank_accounts for each row execute function private.touch_updated_at();
create trigger escrow_holds_audit after insert or update on public.escrow_holds for each row execute function private.write_audit('escrow_hold');
create trigger escrow_releases_audit after insert on public.escrow_releases for each row execute function private.write_audit('escrow_release');
create trigger payouts_audit after insert or update on public.payouts for each row execute function private.write_audit('payout');
create trigger bank_accounts_audit after insert or update or delete on public.bank_accounts for each row execute function private.write_audit('bank_account');

/** amount × bps / 10000, rounded half to even (same rule as the app's percentBps). */
create or replace function private.bps_half_even(p_amount bigint, p_bps int) returns bigint
language plpgsql immutable set search_path = '' as $$
declare
  n numeric := p_amount::numeric * p_bps;
  q numeric := floor(n / 10000);
  r numeric := n - q * 10000;
begin
  if r > 5000 or (r = 5000 and mod(q, 2) = 1) then q := q + 1; end if;
  return q::bigint;
end $$;

create or replace function private.escrow_event(p_hold uuid, p_kind text, p_data jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.escrow_holds
     set events = events || jsonb_build_array(jsonb_build_object('at', now(), 'kind', p_kind) || coalesce(p_data, '{}'))
   where id = p_hold;
$$;

-- ---------------------------------------------------------------------------------------------
-- Funding: a confirmed charter_escrow payment becomes a hold (once).
-- ---------------------------------------------------------------------------------------------
create or replace function public.fund_escrow(p_payment uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments%rowtype;
  c public.charters%rowtype;
  v_hold uuid;
begin
  select * into p from public.payments where id = p_payment;
  if not found or p.status <> 'success' or p.purpose <> 'charter_escrow' or p.reference_type <> 'charter' then
    raise exception 'invalid_subject';
  end if;
  select * into c from public.charters where id = p.reference_id for update;
  if p.currency <> c.currency then raise exception 'currency_mismatch'; end if;
  insert into public.escrow_holds (payee_org_id, payer_org_id, payment_id, charter_id, currency, amount_minor)
  values (c.owner_org_id, c.charterer_org_id, p.id, c.id, p.currency, p.amount_minor)
  on conflict (payment_id) do nothing
  returning id into v_hold;
  if v_hold is null then
    select id into v_hold from public.escrow_holds where payment_id = p.id;
    return v_hold; -- already funded (repeated webhook)
  end if;
  insert into public.ledger_entries (org_id, account, payment_id, currency, credit_minor, memo)
  values (c.owner_org_id, 'escrow', p.id, p.currency, p.amount_minor, 'escrow funded for charter ' || c.id);
  update public.charters set status = 'active' where id = c.id and status in ('pending_payment', 'pending_contract');
  perform private.escrow_event(v_hold, 'funded', jsonb_build_object('amount_minor', p.amount_minor));
  return v_hold;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Release: once per (hold, tranche). Payee gets gross − commission; the platform the commission.
-- ---------------------------------------------------------------------------------------------
create or replace function public.release_escrow(p_hold uuid, p_tranche text, p_gross bigint, p_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  h public.escrow_holds%rowtype;
  c public.charters%rowtype;
  v_remaining bigint;
  v_gross bigint;
  v_bps int;
  v_commission bigint;
  v_release uuid;
  v_payout uuid;
  v_account uuid;
begin
  select * into h from public.escrow_holds where id = p_hold for update;
  if not found then raise exception 'not_found'; end if;
  if h.status = 'disputed' and p_tranche not like 'admin%' then raise exception 'escrow_disputed'; end if;
  if h.status in ('released', 'refunded') then raise exception 'invalid_transition'; end if;
  v_remaining := h.amount_minor - h.released_minor - h.refunded_minor;
  v_gross := least(p_gross, v_remaining);
  if v_gross <= 0 then raise exception 'nothing_to_release'; end if;
  select * into c from public.charters where id = h.charter_id;
  v_bps := greatest(c.commission_bps - coalesce(public.fee_bps('charter_inapp_discount_bps', c.governing_country_code), 0), 0);
  v_commission := private.bps_half_even(v_gross, v_bps);
  begin
    insert into public.escrow_releases (hold_id, tranche, gross_minor, commission_minor, payout_minor, released_by)
    values (h.id, p_tranche, v_gross, v_commission, v_gross - v_commission, p_by)
    returning id into v_release;
  exception when unique_violation then
    raise exception 'already_released';
  end;
  update public.escrow_holds
     set released_minor = released_minor + v_gross,
         status = (case when h.released_minor + v_gross + h.refunded_minor >= h.amount_minor then 'released' else 'partially_released' end)::public.escrow_status
   where id = h.id;
  insert into public.ledger_entries (org_id, account, payment_id, currency, debit_minor, credit_minor, memo) values
    (h.payee_org_id, 'escrow', h.payment_id, h.currency, v_gross, 0, 'escrow release ' || p_tranche),
    (null, 'platform_revenue', h.payment_id, h.currency, 0, v_commission, 'charter commission ' || p_tranche),
    (h.payee_org_id, 'payee_payable', h.payment_id, h.currency, 0, v_gross - v_commission, 'owed to owner ' || p_tranche);
  select id into v_account from public.bank_accounts
   where org_id = h.payee_org_id and currency = h.currency and verified order by created_at desc limit 1;
  insert into public.payouts (org_id, bank_account_id, escrow_hold_id, release_id, currency, amount_minor, commission_minor,
                              provider_transfer_ref, status, initiated_by)
  values (h.payee_org_id, v_account, h.id, v_release, h.currency, v_gross - v_commission, v_commission,
          'PO-' || replace(v_release::text, '-', ''), 'pending', p_by)
  returning id into v_payout;
  perform private.escrow_event(h.id, 'released', jsonb_build_object('tranche', p_tranche, 'gross_minor', v_gross, 'commission_minor', v_commission));
  if (select status from public.escrow_holds where id = h.id) = 'released' then
    update public.charters set status = 'completed' where id = h.charter_id and status in ('active', 'disputed');
  end if;
  return v_payout;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Refund (admin resolution): money back to the charterer; the provider refund is made by the server.
-- ---------------------------------------------------------------------------------------------
create or replace function public.refund_escrow(p_hold uuid, p_tranche text, p_amount bigint, p_by uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  h public.escrow_holds%rowtype;
  v_amount bigint;
begin
  select * into h from public.escrow_holds where id = p_hold for update;
  if not found then raise exception 'not_found'; end if;
  if h.status in ('released', 'refunded') then raise exception 'invalid_transition'; end if;
  v_amount := least(p_amount, h.amount_minor - h.released_minor - h.refunded_minor);
  if v_amount <= 0 then raise exception 'nothing_to_release'; end if;
  begin
    insert into public.escrow_releases (hold_id, tranche, gross_minor, commission_minor, payout_minor, refund_minor, released_by)
    values (h.id, p_tranche, 0, 0, 0, v_amount, p_by);
  exception when unique_violation then
    raise exception 'already_released';
  end;
  update public.escrow_holds
     set refunded_minor = refunded_minor + v_amount,
         status = case when h.released_minor + h.refunded_minor + v_amount >= h.amount_minor
                       then (case when h.released_minor = 0 then 'refunded' else 'released' end)::public.escrow_status
                       else status end
   where id = h.id;
  insert into public.ledger_entries (org_id, account, payment_id, currency, debit_minor, memo)
  values (h.payee_org_id, 'escrow', h.payment_id, h.currency, v_amount, 'escrow refund to charterer ' || p_tranche);
  perform private.escrow_event(h.id, 'refunded', jsonb_build_object('tranche', p_tranche, 'amount_minor', v_amount));
  return v_amount;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Dispute (either side) and two-sided hire confirmations.
-- ---------------------------------------------------------------------------------------------
create or replace function public.dispute_escrow(p_hold uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.escrow_holds%rowtype;
begin
  select * into h from public.escrow_holds where id = p_hold for update;
  if not found then raise exception 'not_found'; end if;
  if not (public.has_role(h.payee_org_id, '{owner,manager}') or public.has_role(h.payer_org_id, '{owner,manager,charterer}')) then
    raise exception 'forbidden';
  end if;
  if h.status not in ('held', 'partially_released') then raise exception 'invalid_transition'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'validation'; end if;
  update public.escrow_holds set status = 'disputed', dispute_reason = trim(p_reason), disputed_by = (select auth.uid()) where id = h.id;
  update public.charters set status = 'disputed' where id = h.charter_id;
  perform private.escrow_event(h.id, 'disputed', jsonb_build_object('by', (select auth.uid())));
end $$;

/** One side confirms on-hire or off-hire; returns 'both' once the other side has too. */
create or replace function public.confirm_hire(p_charter uuid, p_stage text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.charters%rowtype;
  v_side text;
begin
  select * into c from public.charters where id = p_charter for update;
  if not found then raise exception 'not_found'; end if;
  if public.has_role(c.owner_org_id, '{owner,manager}') then v_side := 'owner';
  elsif c.charterer_org_id is not null and public.has_role(c.charterer_org_id, '{owner,manager,charterer}') then v_side := 'charterer';
  else raise exception 'forbidden';
  end if;
  if c.status <> 'active' then raise exception 'invalid_transition'; end if;
  if p_stage = 'on' then
    if v_side = 'owner' then update public.charters set on_hire_owner_at = coalesce(on_hire_owner_at, now()) where id = c.id;
    else update public.charters set on_hire_charterer_at = coalesce(on_hire_charterer_at, now()) where id = c.id; end if;
    update public.charters set on_hire_at = coalesce(on_hire_at, now())
     where id = c.id and on_hire_owner_at is not null and on_hire_charterer_at is not null;
    return case when (select on_hire_at from public.charters where id = c.id) is not null then 'both' else 'waiting' end;
  elsif p_stage = 'off' then
    if (select on_hire_at from public.charters where id = c.id) is null then raise exception 'invalid_transition'; end if;
    if v_side = 'owner' then update public.charters set off_hire_owner_at = coalesce(off_hire_owner_at, now()) where id = c.id;
    else update public.charters set off_hire_charterer_at = coalesce(off_hire_charterer_at, now()) where id = c.id; end if;
    update public.charters set off_hire_at = coalesce(off_hire_at, now())
     where id = c.id and off_hire_owner_at is not null and off_hire_charterer_at is not null;
    return case when (select off_hire_at from public.charters where id = c.id) is not null then 'both' else 'waiting' end;
  end if;
  raise exception 'validation';
end $$;

revoke execute on function public.fund_escrow(uuid), public.release_escrow(uuid, text, bigint, uuid),
  public.refund_escrow(uuid, text, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.dispute_escrow(uuid, text), public.confirm_hire(uuid, text) from public, anon;
grant execute on function public.dispute_escrow(uuid, text), public.confirm_hire(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS: both sides read; nobody writes directly (the server and the functions above do).
-- ---------------------------------------------------------------------------------------------
alter table public.bank_accounts enable row level security;
alter table public.escrow_holds enable row level security;
alter table public.escrow_releases enable row level security;
alter table public.payouts enable row level security;
revoke all on public.bank_accounts, public.escrow_holds, public.escrow_releases, public.payouts from anon;
revoke insert, update, delete on public.bank_accounts, public.escrow_holds, public.escrow_releases, public.payouts from authenticated;

create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using (public.has_role(org_id, '{owner,manager}'));
create policy escrow_select on public.escrow_holds for select to authenticated
  using (public.has_role(payee_org_id) or public.has_role(payer_org_id) or public.is_platform_admin());
create policy releases_select on public.escrow_releases for select to authenticated
  using (exists (select 1 from public.escrow_holds h where h.id = hold_id
                 and (public.has_role(h.payee_org_id) or public.has_role(h.payer_org_id) or public.is_platform_admin())));
create policy payouts_select on public.payouts for select to authenticated
  using (public.has_role(org_id, '{owner,manager}') or public.is_platform_admin());

-- Charter hire confirmations go through confirm_hire only.
revoke update on public.charters from authenticated;
