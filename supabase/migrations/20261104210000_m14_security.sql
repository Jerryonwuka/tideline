-- M14: tenders and tender packs. Owners and managers of the org only; every change is audited
-- (including "Submit anyway", which overrides the export block). Files live in the private
-- business bucket.

create trigger tenders_touch before update on public.tenders for each row execute function private.touch_updated_at();
create trigger tender_packs_touch before update on public.tender_packs for each row execute function private.touch_updated_at();
create trigger tenders_audit after insert or update or delete on public.tenders for each row execute function private.write_audit('tender');
create trigger tender_packs_audit after insert or update or delete on public.tender_packs for each row execute function private.write_audit('tender_pack');

alter table public.tenders enable row level security;
alter table public.tender_packs enable row level security;
revoke all on public.tenders, public.tender_packs from anon;

create policy tenders_all on public.tenders for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
create policy tender_packs_all on public.tender_packs for all to authenticated
  using (public.has_role(org_id, '{owner,manager}')) with check (public.has_role(org_id, '{owner,manager}'));
-- Export results are written by the server after its checks.
revoke update on public.tender_packs from authenticated;
grant update (vessel_ids, items, sections, status, submit_anyway, submit_anyway_by, submit_anyway_at, reviewed_by, reviewed_at, updated_at)
  on public.tender_packs to authenticated;
