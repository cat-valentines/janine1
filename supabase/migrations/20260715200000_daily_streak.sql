-- Playing every day builds a streak, and a streak is what opens new islands.

alter table public.player_profiles
  add column streak integer not null default 0 check (streak >= 0),
  add column longest_streak integer not null default 0 check (longest_streak >= 0),
  add column days_played integer not null default 0 check (days_played >= 0),
  add column last_played date;

/*
 * Counts today as a day played, and returns the streak afterwards.
 *
 * Deliberately uses the server's current_date rather than a date sent from the
 * device: otherwise a player could wind their clock forward and unlock every
 * island in an afternoon. Playing twice in one day counts once.
 */
create function public.record_play_day()
returns table (streak integer, longest_streak integer, days_played integer, last_played date)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prev date;
begin
  if me is null then return; end if;
  select p.last_played into prev from player_profiles p where p.user_id = me;

  if prev is distinct from current_date then
    if prev = current_date - 1 then
      -- Played yesterday too: the streak carries on.
      update player_profiles p set
        streak = p.streak + 1,
        longest_streak = greatest(p.longest_streak, p.streak + 1),
        days_played = p.days_played + 1,
        last_played = current_date
      where p.user_id = me;
    else
      -- First day, or a day was missed: back to one.
      update player_profiles p set
        streak = 1,
        longest_streak = greatest(p.longest_streak, 1),
        days_played = p.days_played + 1,
        last_played = current_date
      where p.user_id = me;
    end if;
  end if;

  return query
    select p.streak, p.longest_streak, p.days_played, p.last_played
    from player_profiles p where p.user_id = me;
end; $$;

revoke execute on function public.record_play_day() from anon, public;
grant execute on function public.record_play_day() to authenticated;
