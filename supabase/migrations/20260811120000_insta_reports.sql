-- Reporting a post on Insta. A report ONLY counts when the person actually writes
-- what happened — an empty reason (e.g. an accidental tap) is NOT a report and is
-- never saved. Anyone (guests included) may report. Apply with: npm run db:push

create table if not exists public.insta_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.insta_posts(id) on delete cascade,
  reporter_id uuid,                 -- null for a guest reporter
  reason text not null,             -- always non-empty (the RPC enforces it)
  created_at timestamptz not null default now()
);
create index if not exists insta_reports_post_idx on public.insta_reports (post_id, created_at);

-- Reports are private (only an admin reads them via the dashboard / service role):
-- enable RLS with NO policies, so no client can read or write them directly. The
-- security-definer RPC below is the only way in.
alter table public.insta_reports enable row level security;

-- Report a post with a written reason. Returns TRUE if it was recorded, FALSE when
-- nothing was written (so an accidental click without a reason never becomes a report).
create or replace function public.insta_report(post_id uuid, reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r text := coalesce(btrim(reason), '');
begin
  if length(r) = 0 then
    return false;                   -- no reason written => not a report
  end if;
  insert into public.insta_reports (post_id, reporter_id, reason)
    values (post_id, auth.uid(), left(r, 500));
  return true;
end; $$;
grant execute on function public.insta_report(uuid, text) to anon, authenticated;
