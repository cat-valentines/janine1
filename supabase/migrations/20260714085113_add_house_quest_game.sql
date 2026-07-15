-- House Quest data. Apply later with: npm run db:push
create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  selected_character text not null default 'cottontail',
  selected_house text not null default 'haunted',
  current_level integer not null default 1 check (current_level between 1 and 30),
  current_island integer not null default 1 check (current_island >= 1),
  coins integer not null default 0 check (coins >= 0),
  total_score integer not null default 0 check (total_score >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index player_profiles_display_name_lower_idx on public.player_profiles (lower(display_name));

create function public.create_new_player_profile() returns trigger language plpgsql security definer
set search_path = public as $$
declare chosen_name text;
begin
  chosen_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'player_' || left(new.id::text, 8));
  insert into player_profiles (user_id, display_name) values (new.id, chosen_name);
  return new;
end; $$;
create trigger create_profile_after_signup after insert on auth.users
for each row execute function public.create_new_player_profile();

create table public.game_progress (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  level integer not null check (level between 1 and 30), island integer not null default 1,
  highest_floor integer not null default 1 check (highest_floor between 1 and 10),
  coins_collected integer not null default 0, score integer not null default 0,
  completed boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (user_id, island, level)
);

create table public.friend_challenges (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'House Quest Challenge', invite_code text not null unique default encode(gen_random_bytes(18), 'hex'),
  goal_score integer not null default 5000, shared_score integer not null default 0,
  reward_type text not null default 'bonus_coins', reward_value text not null default '5',
  status text not null default 'open' check (status in ('open','complete','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.challenge_members (
  challenge_id uuid not null references public.friend_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, score integer not null default 0,
  highest_floor integer not null default 1, reward_claimed boolean not null default false,
  joined_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table public.leaderboard_rewards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  season_key text not null, rank integer not null check (rank > 0), reward_type text not null,
  reward_value text not null, claimed boolean not null default false, claimed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, season_key, reward_type)
);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade,
  seller_name text not null check (char_length(seller_name) between 2 and 24),
  collectible_type text not null check (collectible_type in ('carrot','fish','bone')),
  quantity integer not null check (quantity between 1 and 100), price integer not null check (price > 0),
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.friend_connections (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (requester_id <> friend_id), unique (requester_id, friend_id)
);

create table public.friend_messages (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.village_homes (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete cascade,
  home_style text not null default 'country_cottage', purchased_price integer not null check (purchased_price > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.home_furniture (
  id uuid primary key default gen_random_uuid(), home_id uuid not null references public.village_homes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, item_type text not null,
  position_x integer not null default 50, position_y integer not null default 50, created_at timestamptz not null default now()
);
create table public.home_guests (
  home_id uuid not null references public.village_homes(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at timestamptz not null default now(),
  primary key (home_id, guest_id)
);

alter table public.player_profiles enable row level security;
alter table public.game_progress enable row level security;
alter table public.friend_challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.leaderboard_rewards enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.friend_connections enable row level security;
alter table public.friend_messages enable row level security;
alter table public.village_homes enable row level security;
alter table public.home_furniture enable row level security;
alter table public.home_guests enable row level security;

create policy "profiles read own" on public.player_profiles for select using (auth.uid() = user_id);
create policy "profiles insert own" on public.player_profiles for insert with check (auth.uid() = user_id);
create policy "profiles update own" on public.player_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress own access" on public.game_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.is_challenge_member(challenge uuid) returns boolean language sql stable security definer
set search_path = public as $$ select exists (select 1 from challenge_members where challenge_id = challenge and user_id = auth.uid()) $$;
create policy "challenge members read" on public.friend_challenges for select using (creator_id = auth.uid() or public.is_challenge_member(id));
create policy "challenge creators insert" on public.friend_challenges for insert with check (creator_id = auth.uid());
create policy "challenge creators update" on public.friend_challenges for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "members read room" on public.challenge_members for select using (user_id = auth.uid() or public.is_challenge_member(challenge_id));
create policy "members join self" on public.challenge_members for insert with check (user_id = auth.uid());
create policy "members update self" on public.challenge_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rewards read own" on public.leaderboard_rewards for select using (user_id = auth.uid());
create policy "rewards claim own" on public.leaderboard_rewards for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.leaderboard_rewards from anon, authenticated;
revoke update on public.leaderboard_rewards from anon, authenticated;
grant update (claimed, claimed_at) on public.leaderboard_rewards to authenticated;
create policy "market read active or own" on public.marketplace_listings for select using (status = 'active' or seller_id = auth.uid());
create policy "market list own food" on public.marketplace_listings for insert with check (seller_id = auth.uid());
create policy "market manage own listings" on public.marketplace_listings for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "friends read own connections" on public.friend_connections for select using (auth.uid() in (requester_id, friend_id));
create policy "friends request as self" on public.friend_connections for insert with check (requester_id = auth.uid());
create policy "friends manage own connections" on public.friend_connections for update using (auth.uid() in (requester_id, friend_id)) with check (auth.uid() in (requester_id, friend_id));
create policy "messages read participants" on public.friend_messages for select using (auth.uid() in (sender_id, recipient_id));
create policy "messages send as self" on public.friend_messages for insert with check (sender_id = auth.uid());
create function public.is_home_guest(home uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from home_guests where home_id = home and guest_id = auth.uid() and status = 'accepted') $$;
create function public.owns_home(home uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from village_homes where id = home and owner_id = auth.uid()) $$;
create policy "homes owner or guest read" on public.village_homes for select using (owner_id = auth.uid() or public.is_home_guest(id));
create policy "homes buy own" on public.village_homes for insert with check (owner_id = auth.uid());
create policy "homes owner update" on public.village_homes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "furniture owner or guest read" on public.home_furniture for select using (owner_id = auth.uid() or public.is_home_guest(home_id));
create policy "furniture owner manage" on public.home_furniture for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "guests see own invitations" on public.home_guests for select using (guest_id = auth.uid() or public.owns_home(home_id));
create policy "home owners invite" on public.home_guests for insert with check (public.owns_home(home_id));
create policy "guests answer invitations" on public.home_guests for update using (guest_id = auth.uid()) with check (guest_id = auth.uid());

create view public.safe_leaderboard as
select display_name, total_score as score, current_level as level,
  dense_rank() over (order by total_score desc) as rank
from public.player_profiles;
grant select on public.safe_leaderboard to anon, authenticated;

create function public.join_house_challenge(code text) returns uuid language plpgsql security definer
set search_path = public as $$
declare challenge uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join this challenge'; end if;
  select id into challenge from friend_challenges where invite_code = code and status = 'open';
  if challenge is null then raise exception 'Challenge not found'; end if;
  insert into challenge_members (challenge_id, user_id) values (challenge, auth.uid()) on conflict do nothing;
  return challenge;
end; $$;
grant execute on function public.join_house_challenge(text) to authenticated;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger touch_player_profiles before update on public.player_profiles for each row execute function public.touch_updated_at();
create trigger touch_game_progress before update on public.game_progress for each row execute function public.touch_updated_at();
create trigger touch_friend_challenges before update on public.friend_challenges for each row execute function public.touch_updated_at();
create trigger touch_challenge_members before update on public.challenge_members for each row execute function public.touch_updated_at();
create trigger touch_leaderboard_rewards before update on public.leaderboard_rewards for each row execute function public.touch_updated_at();
create trigger touch_marketplace_listings before update on public.marketplace_listings for each row execute function public.touch_updated_at();
create trigger touch_friend_connections before update on public.friend_connections for each row execute function public.touch_updated_at();
create trigger touch_village_homes before update on public.village_homes for each row execute function public.touch_updated_at();
