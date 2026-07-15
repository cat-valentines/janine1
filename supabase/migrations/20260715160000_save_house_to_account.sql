-- Keep each player's 3D house on their account, so logging out (or playing on
-- another device) never loses it. Apply with: npm run db:push

alter table public.player_profiles
  -- 16x10x16 voxel house, one char per block, matching src/game/voxel.ts
  add column house_world text check (house_world is null or house_world ~ '^[.WSBRGDLFPA~#]{2560}$'),
  add column house_furniture jsonb not null default '[]'::jsonb,
  add column house_name text check (house_name is null or char_length(house_name) <= 24),
  add column house_season text check (house_season is null or house_season in ('spring', 'summer', 'autumn', 'winter')),
  -- Fixed once, so a player's landscape regenerates identically forever.
  add column house_seed integer not null default 0;

-- The existing "profiles read own"/"profiles update own" policies already scope
-- these columns to their owner, so no new policy is needed. The house is only
-- shared with other players when it is listed in house_listings.
