-- The leaderboard ranks by player_profiles.total_score, but nothing ever wrote
-- that column: it sat at its default of 0 for every player forever, so the
-- board could only ever be empty. This is how a score actually gets recorded.
--
-- Keeps your best run rather than the last one, so a bad game never knocks you
-- down the board. Runs as security definer purely so the greatest() comparison
-- happens in one statement instead of a read-then-write race.

create function public.record_score(new_score integer, new_level integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update player_profiles
  set total_score = greatest(total_score, greatest(coalesce(new_score, 0), 0)),
      -- current_level is checked to be between 1 and 30.
      current_level = least(30, greatest(current_level, greatest(coalesce(new_level, 1), 1)))
  where user_id = auth.uid();
end; $$;

revoke execute on function public.record_score(integer, integer) from anon, public;
grant execute on function public.record_score(integer, integer) to authenticated;
