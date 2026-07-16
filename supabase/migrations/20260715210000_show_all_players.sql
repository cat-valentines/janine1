-- "Let everyone play and be seen."
--
-- Search and the leaderboard only showed accounts flagged `onboarded` (i.e.
-- that finished the setup screen). Anyone who signed up but never completed it
-- — like a player called "cat" — was invisible. This shows every account that
-- has a REAL chosen name, and only hides the auto-generated placeholder names
-- (player_ab12cd34) the signup trigger hands out before a name is picked.

-- 1. Mark every real-named account as set up, so nothing that still reads the
--    flag keeps them hidden.
update public.player_profiles
set onboarded = true
where display_name !~ '^player_[0-9a-f]{8}$';

-- 2. Search: any real-named player, not just onboarded ones.
create or replace function public.search_players(query text)
returns table (id uuid, name text, character_id text, level integer)
language plpgsql stable security definer set search_path = public as $$
declare term text;
begin
  if auth.uid() is null then raise exception 'Sign in to search for players'; end if;
  term := trim(query);
  if char_length(term) < 2 then return; end if;
  term := replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.user_id, p.display_name, p.selected_character, p.current_level
    from player_profiles p
    where p.user_id <> auth.uid()
      and p.display_name !~ '^player_[0-9a-f]{8}$'
      and p.display_name ilike '%' || term || '%' escape '\'
    order by lower(p.display_name) = lower(trim(query)) desc, p.display_name
    limit 12;
end; $$;
revoke execute on function public.search_players(text) from anon, public;
grant execute on function public.search_players(text) to authenticated;

-- 3. Leaderboard: real-named players who have scored, regardless of the flag.
drop view if exists public.safe_leaderboard;
create view public.safe_leaderboard as
select display_name, total_score as score, current_level as level,
  dense_rank() over (order by total_score desc) as rank
from public.player_profiles
where display_name !~ '^player_[0-9a-f]{8}$' and total_score > 0;
grant select on public.safe_leaderboard to anon, authenticated;
