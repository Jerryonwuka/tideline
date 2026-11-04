-- M1b: reference data (currencies, locales, countries, payment routes), the global baseline and
-- Nigeria compliance rule sets, org defaults from country, RLS, and the compliance functions.
-- Nigeria (NG) is seeded with its rule set as DRAFT: an admin publishes it after legal review.
-- ZZ "Testland" is a disabled, test-only country used to catch hard-coded Nigerian values.

-- ---------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------
insert into public.currencies (code, minor_unit_digits, symbol, enabled) values
  ('NGN', 2, '₦', true),
  ('USD', 2, '$', true);

insert into public.locales (code, name, enabled) values
  ('en', 'English', true),
  ('en-NG', 'English (Nigeria)', true),
  ('fr', 'Français', false),
  ('pt-BR', 'Português (Brasil)', false);

insert into public.countries
  (code, name, default_currency, default_locale, default_time_zone, phone_prefix, date_order, enabled, data_region, launch_status)
values
  ('NG', 'Nigeria', 'NGN', 'en-NG', 'Africa/Lagos', '+234', 'DMY', true, 'af', 'pilot'),
  ('ZZ', 'Testland (test only)', 'USD', 'fr', 'America/Chicago', '+999', 'MDY', false, 'us', 'planned');

insert into public.payment_provider_routes (country_code, currency, purpose, provider, priority)
select 'NG', 'NGN', p.purpose, r.provider, r.priority
from unnest(enum_range(null::public.payment_purpose)) as p(purpose)
cross join (values ('paystack'::public.payment_provider, 1), ('flutterwave'::public.payment_provider, 2)) as r(provider, priority);

-- ---------------------------------------------------------------------------------------------
-- Rule sets
-- ---------------------------------------------------------------------------------------------
create unique index rule_sets_country_version_key
  on public.compliance_rule_sets (coalesce(country_code, '**'), version);
create unique index rule_sets_one_published_key
  on public.compliance_rule_sets (coalesce(country_code, '**')) where status = 'published';

do $$
declare
  v_global uuid;
  v_ng uuid;
  v_nimasa uuid;
  v_laswa uuid;
begin
  -- Global baseline: document types every market recognises, and the one requirement that applies
  -- everywhere (insurance). Published so it is in force from day one.
  insert into public.compliance_rule_sets (country_code, name, version, status, published_at, legal_review_note)
  values (null, 'Global baseline', 1, 'published', now(), 'Baseline types only; no jurisdiction-specific rules.')
  returning id into v_global;

  insert into public.document_types (code, rule_set_id, name_key, applies_to, issuer_name, default_validity_months) values
    ('class_certificate', null, 'documentTypes.class_certificate', 'vessel', null, 60),
    ('insurance', null, 'documentTypes.insurance', 'vessel', null, 12),
    ('load_line', null, 'documentTypes.load_line', 'vessel', null, 60),
    ('radio_licence', null, 'documentTypes.radio_licence', 'vessel', null, 12),
    ('stcw', null, 'documentTypes.stcw', 'crew', null, 60),
    ('medical', null, 'documentTypes.medical', 'crew', null, 24),
    ('id_document', null, 'documentTypes.id_document', 'crew', null, null),
    ('other', null, 'documentTypes.other', 'org', null, null);

  insert into public.document_requirements (rule_set_id, document_type_code, applies_to, mandatory)
  values (v_global, 'insurance', 'vessel', true);

  -- Nigeria v1 (DRAFT). Rule wording and safety values are placeholders until reviewed with a
  -- Nigerian maritime lawyer and LASWA guidance (BUILD_SPEC appendix items 2 and 1).
  insert into public.compliance_rule_sets (country_code, name, version, status, legal_review_note)
  values ('NG', 'Nigeria', 1, 'draft', 'Pending legal review: Cabotage rule wording, LASWA safety values.')
  returning id into v_ng;

  insert into public.regulators (rule_set_id, name, short_name, scope)
  values (v_ng, 'Nigerian Maritime Administration and Safety Agency', 'NIMASA', 'national')
  returning id into v_nimasa;
  insert into public.regulators (rule_set_id, name, short_name, scope)
  values (v_ng, 'Lagos State Waterways Authority', 'LASWA', 'state')
  returning id into v_laswa;

  insert into public.document_types (code, rule_set_id, name_key, applies_to, issuer_name, default_validity_months) values
    ('vessel_registration', v_ng, 'documentTypes.vessel_registration', 'vessel', 'NIMASA', null),
    ('laswa_licence', v_ng, 'documentTypes.laswa_licence', 'vessel', 'LASWA', 12),
    ('nimasa_certificate', v_ng, 'documentTypes.nimasa_certificate', 'vessel', 'NIMASA', 12),
    ('cabotage_registration', v_ng, 'documentTypes.cabotage_registration', 'vessel', 'NIMASA', 12),
    ('safety_equipment', v_ng, 'documentTypes.safety_equipment', 'vessel', null, 12),
    ('crew_competency', v_ng, 'documentTypes.crew_competency', 'crew', 'NIMASA', 60);

  insert into public.document_requirements (rule_set_id, document_type_code, applies_to, modes, mandatory, regulator_id) values
    (v_ng, 'vessel_registration', 'vessel', '{}', true, v_nimasa),
    (v_ng, 'safety_equipment', 'vessel', '{}', true, null),
    (v_ng, 'laswa_licence', 'vessel', '{ferry}', true, v_laswa),
    (v_ng, 'nimasa_certificate', 'vessel', '{charter}', true, v_nimasa),
    (v_ng, 'cabotage_registration', 'vessel', '{charter}', true, v_nimasa),
    (v_ng, 'crew_competency', 'crew', '{}', true, v_nimasa),
    (v_ng, 'stcw', 'crew', '{charter}', true, v_nimasa);

  insert into public.charter_eligibility_rules (rule_set_id, code, description_key, "check", severity)
  values (v_ng, 'cabotage_check', 'compliance.eligibility.cabotage',
          '{"requires_documents": ["cabotage_registration"]}'::jsonb, 'warn');

  -- Conservative placeholders, not official limits (§10.3).
  insert into public.safety_rule_defaults (rule_set_id, max_wind_kmh, max_gust_kmh, max_wave_m, night_block, permitted_start, permitted_end)
  values (v_ng, 30, 40, 1.0, true, '06:30', '18:30');

  insert into public.tax_rules (rule_set_id, code, rate_bps, applies_to, label_key)
  values (v_ng, 'vat', 750, 'invoice', 'tax.vat');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Orgs take their defaults from their country
-- ---------------------------------------------------------------------------------------------
update public.orgs o
   set currency = c.default_currency,
       time_zone = c.default_time_zone,
       default_locale = c.default_locale,
       data_region = c.data_region
  from public.countries c
 where c.code = o.country_code and o.currency is null;

alter table public.orgs
  alter column currency set not null,
  alter column time_zone set not null,
  alter column default_locale set not null,
  alter column data_region set not null,
  add constraint orgs_country_code_countries_code_fk foreign key (country_code) references public.countries (code),
  add constraint orgs_currency_currencies_code_fk foreign key (currency) references public.currencies (code),
  add constraint orgs_default_locale_locales_code_fk foreign key (default_locale) references public.locales (code);

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
  v_country public.countries%rowtype;
  v_org uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'invalid_name'; end if;
  select * into v_country from public.countries where code = p_country_code and enabled;
  if not found then raise exception 'invalid_country'; end if;
  if p_modes is null or cardinality(p_modes) = 0 or not (p_modes <@ array['ferry', 'charter', 'barge']) then
    raise exception 'invalid_modes';
  end if;

  insert into public.orgs (name, type, country_code, currency, time_zone, default_locale, data_region,
                           modes, registration_number, region, address)
  values (trim(p_name), p_type, v_country.code, v_country.default_currency, v_country.default_time_zone,
          v_country.default_locale, v_country.data_region, p_modes,
          nullif(trim(p_registration_number), ''), nullif(trim(p_region), ''), nullif(trim(p_address), ''))
  returning id into v_org;

  insert into public.memberships (user_id, org_id, role) values (v_uid, v_org, 'owner');
  return v_org;
end $$;

-- Owners may change currency, locale and time zone; country and data region are admin-only.
create or replace function private.guard_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_platform_admin() and (
       new.verification_status is distinct from old.verification_status
       or new.country_code is distinct from old.country_code
       or new.data_region is distinct from old.data_region) then
    raise exception 'admin_only_field';
  end if;
  if new.time_zone is distinct from old.time_zone
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  return new;
end $$;

-- A country can only be switched on once its rules, currency, locale and payment route exist (§15).
create or replace function private.guard_country() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.enabled and not old.enabled then
    if not exists (select 1 from public.compliance_rule_sets r where r.country_code = new.code and r.status = 'published')
       or not exists (select 1 from public.currencies c where c.code = new.default_currency and c.enabled)
       or not exists (select 1 from public.locales l where l.code = new.default_locale and l.enabled)
       or not exists (select 1 from public.payment_provider_routes p where p.country_code = new.code and p.enabled) then
      raise exception 'country_not_ready';
    end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.default_time_zone) then
    raise exception 'invalid_time_zone';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger countries_guard before update on public.countries
  for each row execute function private.guard_country();

create trigger compliance_rule_sets_audit after insert or update or delete on public.compliance_rule_sets
  for each row execute function private.write_audit('rule_set');
create trigger countries_audit after update on public.countries
  for each row execute function private.write_audit('country');

-- ---------------------------------------------------------------------------------------------
-- Compliance functions
-- ---------------------------------------------------------------------------------------------

-- Mandatory and optional documents for a vessel (or crew/org) in a country, from the PUBLISHED
-- global baseline plus the PUBLISHED country rule set. Drafts and retired versions never count.
create or replace function public.compliance_requirements(
  p_country text,
  p_vessel_type text default null,
  p_modes text[] default '{}',
  p_applies_to public.applies_to default 'vessel'
) returns table (
  document_type_code text,
  name_key text,
  applies_to public.applies_to,
  mandatory boolean,
  regulator text,
  alert_offsets integer[],
  rule_set_id uuid,
  rule_set_country text,
  rule_set_version integer
)
language sql stable security definer set search_path = '' as $$
  select r.document_type_code, t.name_key, r.applies_to, r.mandatory, g.short_name, r.alert_offsets,
         s.id, s.country_code, s.version
  from public.document_requirements r
  join public.compliance_rule_sets s on s.id = r.rule_set_id and s.status = 'published'
  join public.document_types t on t.code = r.document_type_code
  left join public.regulators g on g.id = r.regulator_id
  where (s.country_code is null or s.country_code = p_country)
    and r.applies_to = p_applies_to
    and (cardinality(r.vessel_types) = 0 or p_vessel_type = any (r.vessel_types))
    and (cardinality(r.modes) = 0 or r.modes && coalesce(p_modes, '{}'))
  order by s.country_code nulls first, r.mandatory desc, r.document_type_code;
$$;

-- Admin: publish a draft. The previously published version for the same country is retired.
create or replace function public.publish_rule_set(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_set public.compliance_rule_sets%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select * into v_set from public.compliance_rule_sets where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_set.status <> 'draft' then raise exception 'not_draft'; end if;
  update public.compliance_rule_sets set status = 'retired'
   where status = 'published' and country_code is not distinct from v_set.country_code;
  update public.compliance_rule_sets
     set status = 'published', published_at = now(), reviewed_by = (select auth.uid()),
         legal_review_note = coalesce(nullif(trim(p_note), ''), legal_review_note)
   where id = p_id;
end $$;

-- Admin: start the next version as a draft copy of an existing one (regulators, requirements,
-- eligibility rules, safety defaults and tax rules are copied; document types are shared by code).
create or replace function public.new_rule_set_version(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.compliance_rule_sets%rowtype;
  v_new uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  select * into v_src from public.compliance_rule_sets where id = p_id;
  if not found then raise exception 'not_found'; end if;

  insert into public.compliance_rule_sets (country_code, name, version, status)
  select v_src.country_code, v_src.name, max(version) + 1, 'draft'
    from public.compliance_rule_sets where country_code is not distinct from v_src.country_code
  returning id into v_new;

  create temporary table regulator_map (old_id uuid, new_id uuid) on commit drop;
  with src as (
    select id, name, short_name, scope, website, gen_random_uuid() as new_id
    from public.regulators where rule_set_id = p_id
  ), ins as (
    insert into public.regulators (id, rule_set_id, name, short_name, scope, website)
    select new_id, v_new, name, short_name, scope, website from src returning id
  )
  insert into regulator_map select id, new_id from src;

  insert into public.document_requirements (rule_set_id, document_type_code, applies_to, vessel_types, modes, mandatory, regulator_id, alert_offsets)
  select v_new, r.document_type_code, r.applies_to, r.vessel_types, r.modes, r.mandatory, m.new_id, r.alert_offsets
  from public.document_requirements r left join regulator_map m on m.old_id = r.regulator_id
  where r.rule_set_id = p_id;

  insert into public.charter_eligibility_rules (rule_set_id, code, description_key, "check", severity)
  select v_new, code, description_key, "check", severity from public.charter_eligibility_rules where rule_set_id = p_id;
  insert into public.safety_rule_defaults (rule_set_id, max_wind_kmh, max_gust_kmh, max_wave_m, night_block, permitted_start, permitted_end)
  select v_new, max_wind_kmh, max_gust_kmh, max_wave_m, night_block, permitted_start, permitted_end
  from public.safety_rule_defaults where rule_set_id = p_id;
  insert into public.tax_rules (rule_set_id, code, rate_bps, applies_to, label_key)
  select v_new, code, rate_bps, applies_to, label_key from public.tax_rules where rule_set_id = p_id;

  return v_new;
end $$;

revoke execute on function public.compliance_requirements(text, text, text[], public.applies_to) from public;
revoke execute on function public.publish_rule_set(uuid, text) from public, anon;
revoke execute on function public.new_rule_set_version(uuid) from public, anon;
grant execute on function public.compliance_requirements(text, text, text[], public.applies_to) to anon, authenticated, service_role;
grant execute on function public.publish_rule_set(uuid, text) to authenticated;
grant execute on function public.new_rule_set_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS: reference data is readable; only platform admins write it.
-- ---------------------------------------------------------------------------------------------
alter table public.currencies enable row level security;
alter table public.locales enable row level security;
alter table public.countries enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.payment_provider_routes enable row level security;
alter table public.compliance_rule_sets enable row level security;
alter table public.regulators enable row level security;
alter table public.document_types enable row level security;
alter table public.document_requirements enable row level security;
alter table public.charter_eligibility_rules enable row level security;
alter table public.safety_rule_defaults enable row level security;
alter table public.tax_rules enable row level security;

create policy currencies_read on public.currencies for select to anon, authenticated using (true);
create policy locales_read on public.locales for select to anon, authenticated using (true);
-- Signed-out visitors can't run is_platform_admin(), so they get their own simpler policy.
create policy countries_read_anon on public.countries for select to anon using (enabled);
create policy countries_read on public.countries for select to authenticated
  using (enabled or public.is_platform_admin());
create policy countries_admin_update on public.countries for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy exchange_rates_read on public.exchange_rates for select to authenticated using (true);
create policy payment_routes_read on public.payment_provider_routes for select to authenticated using (true);
create policy payment_routes_admin on public.payment_provider_routes for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Published rules are public knowledge; drafts and retired versions are admin-only.
create policy rule_sets_read_anon on public.compliance_rule_sets for select to anon using (status = 'published');
create policy rule_sets_read on public.compliance_rule_sets for select to authenticated
  using (status = 'published' or public.is_platform_admin());
create policy rule_sets_admin_update on public.compliance_rule_sets for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy document_types_read on public.document_types for select to anon, authenticated using (true);

create or replace function private.rule_set_visible(p_rule_set uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compliance_rule_sets s
    where s.id = p_rule_set and (s.status = 'published' or public.is_platform_admin())
  );
$$;
grant execute on function private.rule_set_visible(uuid) to anon, authenticated;
grant usage on schema private to anon;

create policy regulators_read on public.regulators for select to anon, authenticated using (private.rule_set_visible(rule_set_id));
create policy requirements_read on public.document_requirements for select to anon, authenticated using (private.rule_set_visible(rule_set_id));
create policy eligibility_read on public.charter_eligibility_rules for select to anon, authenticated using (private.rule_set_visible(rule_set_id));
create policy safety_defaults_read on public.safety_rule_defaults for select to anon, authenticated using (private.rule_set_visible(rule_set_id));
create policy tax_rules_read on public.tax_rules for select to anon, authenticated using (private.rule_set_visible(rule_set_id));

-- Admins edit drafts only; published and retired versions are frozen.
create or replace function private.rule_set_editable(p_rule_set uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() and exists (
    select 1 from public.compliance_rule_sets s where s.id = p_rule_set and s.status = 'draft'
  );
$$;
grant execute on function private.rule_set_editable(uuid) to authenticated;

create policy regulators_edit on public.regulators for all to authenticated
  using (private.rule_set_editable(rule_set_id)) with check (private.rule_set_editable(rule_set_id));
create policy requirements_edit on public.document_requirements for all to authenticated
  using (private.rule_set_editable(rule_set_id)) with check (private.rule_set_editable(rule_set_id));
create policy eligibility_edit on public.charter_eligibility_rules for all to authenticated
  using (private.rule_set_editable(rule_set_id)) with check (private.rule_set_editable(rule_set_id));
create policy safety_defaults_edit on public.safety_rule_defaults for all to authenticated
  using (private.rule_set_editable(rule_set_id)) with check (private.rule_set_editable(rule_set_id));
create policy tax_rules_edit on public.tax_rules for all to authenticated
  using (private.rule_set_editable(rule_set_id)) with check (private.rule_set_editable(rule_set_id));

-- Table privileges: anon reads reference data only; nobody inserts countries/currencies from the app.
revoke insert, update, delete on public.currencies, public.locales, public.document_types from anon, authenticated;
revoke insert, delete on public.countries from anon, authenticated;
revoke all on public.exchange_rates, public.payment_provider_routes from anon;
revoke insert, update, delete on public.regulators, public.document_requirements, public.charter_eligibility_rules,
  public.safety_rule_defaults, public.tax_rules, public.compliance_rule_sets from anon;
revoke insert, delete on public.compliance_rule_sets from authenticated;
-- Status changes go through publish_rule_set(); admins may edit the review note directly.
revoke update on public.compliance_rule_sets from authenticated;
grant update (legal_review_note, name) on public.compliance_rule_sets to authenticated;
