-- M9: WhatsApp bot and SMS fallback. The server (service role) writes messages, sessions,
-- incidents and bot-logged expenses; the office reads its org's rows.

alter table public.wa_messages enable row level security;
alter table public.bot_sessions enable row level security;
alter table public.incidents enable row level security;
alter table public.expenses enable row level security;
revoke all on public.wa_messages, public.bot_sessions, public.incidents, public.expenses from anon;
revoke all on public.bot_sessions from authenticated;
revoke insert, update, delete on public.wa_messages from authenticated;

create policy wa_messages_select on public.wa_messages for select to authenticated
  using (org_id is not null and public.has_role(org_id, '{owner,manager}'));

create policy incidents_select on public.incidents for select to authenticated using (public.has_role(org_id));
create policy incidents_insert on public.incidents for insert to authenticated
  with check (public.has_role(org_id) and reported_by = (select auth.uid()));
create policy incidents_update on public.incidents for update to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
revoke delete on public.incidents from authenticated;

create policy expenses_select on public.expenses for select to authenticated using (public.has_role(org_id, '{owner,manager}'));
create policy expenses_write on public.expenses for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));

create trigger incidents_audit after insert or update on public.incidents
  for each row execute function private.write_audit('incident');
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.write_audit('expense');

-- Short forms captains use in SMS (TRIP 4 CMS IKD 18 27000).
update public.jetties set aliases = array_append(aliases, 'IKD') where name = 'Ikorodu' and not ('IKD' = any (aliases));
update public.jetties set aliases = array_append(aliases, 'FAL') where name = 'Falomo' and not ('FAL' = any (aliases));
