-- Tighten the report check: a reason that is ALL whitespace (spaces, tabs, newlines)
-- counts as empty too — still not a report. Apply with: npm run db:push

create or replace function public.insta_report(post_id uuid, reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r text := btrim(coalesce(reason, ''), E' \t\n\r\f\v');
begin
  if r = '' then
    return false;                   -- nothing meaningful written => not a report
  end if;
  insert into public.insta_reports (post_id, reporter_id, reason)
    values (post_id, auth.uid(), left(r, 500));
  return true;
end; $$;
grant execute on function public.insta_report(uuid, text) to anon, authenticated;
