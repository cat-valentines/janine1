-- The leaderboard only ever grew from Tower Royal's best run: record_score kept
-- the single best score, and no other game touched total_score at all. So a
-- player could grind Pi, Housekeeper, Slip & Grip, etc. for hours and never move
-- up the board.
--
-- add_score makes the board CUMULATIVE: every game adds the points it awards, so
-- the leaderboard reflects everything you play. Points are clamped >= 0, and an
-- optional level keeps the "Level" column moving up (never down).

create or replace function public.add_score(points integer, level integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update player_profiles
  set total_score = total_score + greatest(0, coalesce(points, 0)),
      current_level = case
        when level is null then current_level
        else least(30, greatest(current_level, greatest(1, level)))
      end
  where user_id = auth.uid();
end; $$;

revoke execute on function public.add_score(integer, integer) from anon, public;
grant execute on function public.add_score(integer, integer) to authenticated;
