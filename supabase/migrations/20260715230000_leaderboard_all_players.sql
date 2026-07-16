-- Show every signed-up player on the leaderboard, not only those who have
-- scored. New players with 0 points now appear too (tied at the bottom),
-- ordered by score. The auto-generated placeholder names stay hidden.

drop view if exists public.safe_leaderboard;
create view public.safe_leaderboard as
select display_name, total_score as score, current_level as level,
  dense_rank() over (order by total_score desc, lower(display_name)) as rank
from public.player_profiles
where display_name !~ '^player_[0-9a-f]{8}$';
grant select on public.safe_leaderboard to anon, authenticated;
