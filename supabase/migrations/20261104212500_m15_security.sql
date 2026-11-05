-- M15: idle-vessel pricing and buyer suggestions (§10.4). Suggestions are written by the server
-- (job and owner actions after their checks); owners and managers read their org's. Board
-- searches are platform-only data used for ranking, never shown raw, and kept 90 days.

create trigger vessel_suggestions_touch before update on public.vessel_suggestions for each row execute function private.touch_updated_at();
create trigger vessel_suggestions_audit after insert or update or delete on public.vessel_suggestions for each row execute function private.write_audit('vessel_suggestion');

alter table public.vessel_suggestions enable row level security;
alter table public.board_searches enable row level security;
revoke all on public.vessel_suggestions, public.board_searches from anon, authenticated;
grant select on public.vessel_suggestions to authenticated;

create policy vessel_suggestions_read on public.vessel_suggestions for select to authenticated
  using (public.has_role(org_id, '{owner,manager}'));

-- Daily 07:00 UTC (08:00 in Lagos): mark idle vessels, refresh suggestions, prune old searches.
select cron.schedule('idle-vessels', '0 7 * * *', $$select private.run_job('idle-vessels')$$);
