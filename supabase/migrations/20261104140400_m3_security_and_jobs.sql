-- M3: RLS for AI jobs and notifications, and the scheduler that runs jobs hourly.
--
-- Scheduled jobs: pg_cron fires every hour (UTC) and pg_net calls the app's protected job endpoint
-- (/api/jobs/<name>) with the CRON_SECRET. The app picks the orgs whose LOCAL time matches
-- (e.g. 07:00 for expiry alerts). Each environment sets its URL and secret in private.job_config;
-- with no config (local dev, CI) the call is skipped.

alter table public.ai_jobs enable row level security;
alter table public.notifications enable row level security;
revoke all on public.ai_jobs, public.notifications from anon;

create policy ai_jobs_select on public.ai_jobs for select to authenticated
  using (public.has_role(org_id, '{owner,manager}') or public.is_platform_admin());
revoke insert, update, delete on public.ai_jobs from authenticated;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Scheduler
-- ---------------------------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists private.job_config (
  key text primary key,
  value text not null
);
revoke all on private.job_config from public, anon, authenticated;

create or replace function private.run_job(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.job_config where key = 'app_url';
  select value into v_secret from private.job_config where key = 'cron_secret';
  if v_url is null or v_secret is null then
    return; -- not configured in this environment
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/jobs/' || p_name,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function private.run_job(text) from public, anon, authenticated;

select cron.schedule('alerts-expiry', '0 * * * *', $$select private.run_job('alerts-expiry')$$);
