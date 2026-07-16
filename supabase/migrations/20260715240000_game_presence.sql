-- Live presence: who is actually playing a given game right now.
--
-- Each player in a match sends a heartbeat every few seconds. "Currently
-- playing" means a heartbeat within the last few seconds — so when someone
-- leaves, or switches to another game, their heartbeat goes stale and they
-- stop counting almost immediately.

create table public.game_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game text not null,
  last_seen timestamptz not null default now()
);
alter table public.game_presence enable row level security;
create policy "presence own" on public.game_presence for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Called on a timer while playing. One row per player; changing game replaces it.
create function public.heartbeat(game_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into game_presence (user_id, game, last_seen)
  values (auth.uid(), game_id, now())
  on conflict (user_id) do update set game = excluded.game, last_seen = now();
end; $$;
grant execute on function public.heartbeat(text) to authenticated;

-- Called when you leave a game, so you drop out at once rather than waiting
-- for the heartbeat to go stale.
create function public.leave_game() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from game_presence where user_id = auth.uid();
end; $$;
grant execute on function public.leave_game() to authenticated;

-- Real players in a game right now: a fresh heartbeat, someone other than you,
-- and a real chosen name.
create function public.players_in_game(game_id text)
returns table (id uuid, name text, character_id text, level integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select p.user_id, p.display_name, p.selected_character, p.current_level
    from game_presence gp
    join player_profiles p on p.user_id = gp.user_id
    where gp.game = game_id
      and gp.last_seen > now() - interval '18 seconds'
      and gp.user_id <> auth.uid()
      and p.display_name !~ '^player_[0-9a-f]{8}$'
    order by gp.last_seen desc
    limit 20;
end; $$;
grant execute on function public.players_in_game(text) to authenticated;
