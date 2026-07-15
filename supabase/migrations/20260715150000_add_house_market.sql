-- Player-to-player house resale, so every seller is a real signed-up player.
-- Apply with: npm run db:push

create table public.house_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  blurb text not null default '' check (char_length(blurb) <= 80),
  -- 16x10x16 voxel house, one char per block, matching src/game/voxel.ts
  grid text not null check (grid ~ '^[.WSBRGDLFPA~#]{2560}$'),
  price integer not null check (price between 1 and 999),
  status text not null default 'active' check (status in ('active', 'sold')),
  buyer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.house_listings enable row level security;

create policy "houses read active or mine" on public.house_listings for select
  using (status = 'active' or seller_id = auth.uid() or buyer_id = auth.uid());
create policy "houses list own" on public.house_listings for insert with check (seller_id = auth.uid());
create policy "houses manage own" on public.house_listings for update
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create trigger touch_house_listings before update on public.house_listings
  for each row execute function public.touch_updated_at();

-- Seller usernames live in player_profiles, which is read-own, so this runs as
-- definer. It returns the display name only — never email, real name or birthday.
create function public.house_market()
returns table (id uuid, seller_id uuid, seller_name text, name text, blurb text, grid text, price integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to see houses for sale'; end if;
  return query
    select l.id, l.seller_id, p.display_name, l.name, l.blurb, l.grid, l.price
    from house_listings l
    join player_profiles p on p.user_id = l.seller_id
    where l.status = 'active' and l.seller_id <> auth.uid()
    order by l.created_at desc
    limit 40;
end; $$;
revoke execute on function public.house_market() from anon, public;
grant execute on function public.house_market() to authenticated;

-- Claiming a listing has to be atomic, or two buyers could take the same house.
create function public.buy_house(listing uuid)
returns text language plpgsql security definer set search_path = public as $$
declare bought house_listings;
begin
  if auth.uid() is null then raise exception 'Sign in to buy a house'; end if;
  update house_listings set status = 'sold', buyer_id = auth.uid()
    where id = listing and status = 'active' and seller_id <> auth.uid()
    returning * into bought;
  if not found then raise exception 'That house is no longer for sale'; end if;
  return bought.grid;
end; $$;
revoke execute on function public.buy_house(uuid) from anon, public;
grant execute on function public.buy_house(uuid) to authenticated;
