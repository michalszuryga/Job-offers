-- Access rules for the web app, which talks to Supabase directly from the
-- browser with the public (publishable) key. Idempotent: safe to re-run.
--
-- The Python side (dashboard, scheduled fetch) connects as `postgres`, which
-- bypasses RLS, so none of this affects it.

-- Who may use the web app. Today that's only the owner; it's also the seed of
-- multi-user access later.
create table if not exists public.app_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;
alter table public.meta enable row level security;
alter table public.fetch_runs enable row level security;
alter table public.app_members enable row level security;

-- Security definer so policies can check membership without exposing the
-- members table itself.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_members where user_id = auth.uid())
$$;

-- Supabase grants every API role full rights on new public tables by default;
-- RLS already blocks rows, this also removes the rights themselves.
revoke all on public.jobs, public.meta, public.fetch_runs, public.app_members from anon, authenticated;
grant select on public.jobs, public.meta, public.fetch_runs to authenticated;
grant select on public.app_members to authenticated;
-- Scraped fields and scores are written only by the Python side.
grant update (application_status, applied_rate, notice_period, applied_at) on public.jobs to authenticated;

drop policy if exists members_read_jobs on public.jobs;
create policy members_read_jobs on public.jobs for select to authenticated using (public.is_member());
drop policy if exists members_update_jobs on public.jobs;
create policy members_update_jobs on public.jobs for update to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists members_read_meta on public.meta;
create policy members_read_meta on public.meta for select to authenticated using (public.is_member());
drop policy if exists members_read_runs on public.fetch_runs;
create policy members_read_runs on public.fetch_runs for select to authenticated using (public.is_member());
drop policy if exists own_membership on public.app_members;
create policy own_membership on public.app_members for select to authenticated using (user_id = auth.uid());

-- One call to save the tracking fields; stamps applied_at the first time an
-- offer becomes APPLIED, in the same text format the Python side writes.
-- Statuses must match DEFAULT_STATUSES in job_finder/storage.py.
create or replace function public.save_offer_tracking(
  p_external_id text, p_status text, p_rate text, p_notice text
) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_status not in ('TO_REVIEW', 'REVIEW', 'INTERESTED', 'CV_GENERATED', 'READY_TO_APPLY',
                      'APPLIED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN', 'DISMISSED') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.jobs
     set application_status = p_status,
         applied_rate = coalesce(p_rate, ''),
         notice_period = coalesce(p_notice, ''),
         applied_at = case when p_status = 'APPLIED'
                           then coalesce(applied_at, cast(current_timestamp as text))
                           else applied_at end
   where external_id = p_external_id;
  if not found then
    raise exception 'offer not found or not allowed';
  end if;
end
$$;

-- Functions are executable by everyone by default in Postgres/Supabase.
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
revoke execute on function public.save_offer_tracking(text, text, text, text) from public, anon;
grant execute on function public.save_offer_tracking(text, text, text, text) to authenticated;

-- Companies found by discover-ats (job_finder/discover.py). Not readable through the
-- API at all; the Monday e-mail's links decide one through this function only.
alter table public.ats_companies enable row level security;
alter table public.ats_probes enable row level security;
revoke all on public.ats_companies, public.ats_probes from anon, authenticated;

create or replace function public.decide_ats_company(p_ats text, p_slug text, p_approve boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if not public.is_member() then
    raise exception 'not allowed';
  end if;
  update public.ats_companies
     set status = case when p_approve then 'approved' else 'skipped' end,
         decided_at = cast(current_timestamp as text)
   where ats = p_ats and slug = p_slug
  returning name into v_name;
  if not found then
    raise exception 'company not found';
  end if;
  return v_name;
end
$$;

revoke execute on function public.decide_ats_company(text, text, boolean) from public, anon;
grant execute on function public.decide_ats_company(text, text, boolean) to authenticated;
