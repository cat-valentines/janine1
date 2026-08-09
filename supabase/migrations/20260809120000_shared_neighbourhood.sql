-- The public shared neighbourhood: let every player SEE each other's built
-- houses on the land (entering still needs an invite), and allow the taller
-- houses the 3-D world now supports. Apply with: npm run db:push

-- 1) Houses grew taller (16 x 40 x 16 = 10240 voxels, was 10 high = 2560), so the
--    fixed-length check would now reject every save. Allow any valid length.
alter table public.player_profiles
  drop constraint if exists player_profiles_house_world_check;
alter table public.player_profiles
  add constraint player_profiles_house_world_check
  check (house_world is null or house_world ~ '^[.WSBRGDLFPA~#]+$');

-- 2) A read-only list of OTHER players' built houses, so the neighbourhood is
--    visible even when nobody else is online right now. Public house fields only
--    (never private data). Security-definer so it can read past row-level rules,
--    the same pattern as all_players(). Works for guests too (anon).
create or replace function public.neighbour_houses()
returns table (user_id uuid, house_world text, house_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select p.user_id, p.house_world, p.house_name
    from player_profiles p
    where p.house_world is not null
      and (auth.uid() is null or p.user_id <> auth.uid())
    order by p.updated_at desc nulls last
    limit 40;
end; $$;

grant execute on function public.neighbour_houses() to anon, authenticated;
