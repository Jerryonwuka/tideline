-- M14: from the app, a pack's reviewer and "Submit anyway" are always the signed-in user, stamped
-- with the database clock, and only the server's export marks a pack exported.
create or replace function private.tender_pack_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status = 'exported' and old.status is distinct from 'exported' then
    raise exception 'tender packs are exported by the server' using errcode = '42501';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by then
    if new.reviewed_by is not null and new.reviewed_by <> auth.uid() then
      raise exception 'reviewer must be the signed-in user' using errcode = '42501';
    end if;
    new.reviewed_at := case when new.reviewed_by is null then null else now() end;
  end if;
  if new.submit_anyway_by is distinct from old.submit_anyway_by or new.submit_anyway is distinct from old.submit_anyway then
    if new.submit_anyway and new.submit_anyway_by is distinct from auth.uid() then
      raise exception 'submit anyway must be recorded for the signed-in user' using errcode = '42501';
    end if;
    new.submit_anyway_at := case when new.submit_anyway then now() else null end;
    if not new.submit_anyway then
      new.submit_anyway_by := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tender_packs_guard before update on public.tender_packs
  for each row execute function private.tender_pack_guard();
