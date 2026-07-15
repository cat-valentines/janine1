-- Private profile details + player search. Apply with: npm run db:push

-- Private details. The "profiles read own" policy already keeps these rows
-- readable only by their owner, so nobody else can select these columns.
alter table public.player_profiles
  add column real_name text check (real_name is null or char_length(real_name) between 1 and 60),
  add column birthday date check (birthday is null or birthday > '1900-01-01'),
  add column country text check (country is null or char_length(country) between 2 and 56);

-- Search other players by username. player_profiles is read-own only, so this
-- runs as security definer. It returns public fields ONLY: never real_name,
-- birthday, country, or anything from auth.users.
create function public.search_players(query text)
returns table (id uuid, name text, character_id text, level integer)
language plpgsql stable security definer set search_path = public as $$
declare term text;
begin
  if auth.uid() is null then raise exception 'Sign in to search for players'; end if;
  term := trim(query);
  if char_length(term) < 2 then return; end if;
  -- Escape LIKE wildcards so a search for "100%" cannot match everything.
  term := replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.user_id, p.display_name, p.selected_character, p.current_level
    from player_profiles p
    where p.user_id <> auth.uid()
      and p.display_name ilike '%' || term || '%' escape '\'
    order by lower(p.display_name) = lower(trim(query)) desc, p.display_name
    limit 12;
end; $$;
revoke execute on function public.search_players(text) from anon, public;
grant execute on function public.search_players(text) to authenticated;

-- Usernames of players you have an accepted friendship with, so the friends
-- list can show real people instead of only local demo data.
create function public.my_friends()
returns table (id uuid, name text, character_id text, level integer, status text, incoming boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to load your friends'; end if;
  return query
    select p.user_id, p.display_name, p.selected_character, p.current_level, c.status,
      c.friend_id = auth.uid()
    from friend_connections c
    join player_profiles p
      on p.user_id = case when c.requester_id = auth.uid() then c.friend_id else c.requester_id end
    where auth.uid() in (c.requester_id, c.friend_id)
      and c.status in ('pending', 'accepted')
    order by c.status, p.display_name
    limit 100;
end; $$;
revoke execute on function public.my_friends() from anon, public;
grant execute on function public.my_friends() to authenticated;
