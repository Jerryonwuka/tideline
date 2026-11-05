-- M5: offline sync op log. A person records and reads their own ops in orgs they belong to;
-- nobody edits or deletes them (the log is what makes replays safe).

alter table public.sync_ops enable row level security;
revoke all on public.sync_ops from anon;
revoke update, delete on public.sync_ops from authenticated;

create policy sync_ops_select on public.sync_ops for select to authenticated
  using (user_id = (select auth.uid()) and public.has_role(org_id));
create policy sync_ops_insert on public.sync_ops for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_role(org_id));
