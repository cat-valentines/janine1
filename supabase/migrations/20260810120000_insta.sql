-- "Insta" — a simple Instagram-style public photo feed for players. You have an
-- account (your existing username + character), post a photo with a caption to the
-- PUBLIC feed, follow other players, and like posts. Apply with: npm run db:push
--
-- Guests work too: they get an anonymous auth user (see ensureGuestAccount), so
-- every action is keyed to auth.uid(), and reads are public (anon + authenticated).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Posts: a photo (stored in the public insta-media bucket) + a caption. Author
-- name + character are denormalised so the feed needs no joins. Anyone may read;
-- you may only create/delete your OWN posts.
-- ---------------------------------------------------------------------------
create table if not exists public.insta_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_character text not null default 'cottontail',
  image_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists insta_posts_created_idx on public.insta_posts (created_at desc);
create index if not exists insta_posts_author_idx on public.insta_posts (author_id);
alter table public.insta_posts enable row level security;
drop policy if exists "insta posts read all" on public.insta_posts;
create policy "insta posts read all" on public.insta_posts for select to anon, authenticated using (true);
drop policy if exists "insta posts insert own" on public.insta_posts;
create policy "insta posts insert own" on public.insta_posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "insta posts delete own" on public.insta_posts;
create policy "insta posts delete own" on public.insta_posts for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Follows: who follows whom. You manage only your own follows.
-- ---------------------------------------------------------------------------
create table if not exists public.insta_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
alter table public.insta_follows enable row level security;
drop policy if exists "insta follows read all" on public.insta_follows;
create policy "insta follows read all" on public.insta_follows for select to anon, authenticated using (true);
drop policy if exists "insta follows insert own" on public.insta_follows;
create policy "insta follows insert own" on public.insta_follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "insta follows delete own" on public.insta_follows;
create policy "insta follows delete own" on public.insta_follows for delete to authenticated using (follower_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Likes: one per person per post.
-- ---------------------------------------------------------------------------
create table if not exists public.insta_likes (
  post_id uuid not null references public.insta_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.insta_likes enable row level security;
drop policy if exists "insta likes read all" on public.insta_likes;
create policy "insta likes read all" on public.insta_likes for select to anon, authenticated using (true);
drop policy if exists "insta likes insert own" on public.insta_likes;
create policy "insta likes insert own" on public.insta_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "insta likes delete own" on public.insta_likes;
create policy "insta likes delete own" on public.insta_likes for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The feed: newest posts (optionally only people you follow), each with its like
-- count, whether YOU liked it, whether you follow the author, and if it's yours.
-- Security-definer so it can read past row rules, same pattern as all_players().
-- ---------------------------------------------------------------------------
create or replace function public.insta_feed(only_following boolean default false, limit_n int default 60)
returns table (
  id uuid, author_id uuid, author_name text, author_character text,
  image_path text, caption text, created_at timestamptz,
  like_count bigint, liked_by_me boolean, followed_by_me boolean, is_mine boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.author_id, p.author_name, p.author_character, p.image_path, p.caption, p.created_at,
    (select count(*) from insta_likes l where l.post_id = p.id) as like_count,
    exists(select 1 from insta_likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
    exists(select 1 from insta_follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id) as followed_by_me,
    (p.author_id = auth.uid()) as is_mine
  from insta_posts p
  where (not only_following)
     or p.author_id in (select followee_id from insta_follows where follower_id = auth.uid())
  order by p.created_at desc
  limit greatest(1, least(limit_n, 120));
$$;
grant execute on function public.insta_feed(boolean, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The photos themselves live in a PUBLIC bucket (a public feed needs public
-- images). You may upload/delete only inside your own <userId>/ folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('insta-media', 'insta-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "insta media read all" on storage.objects;
create policy "insta media read all" on storage.objects for select to anon, authenticated
  using (bucket_id = 'insta-media');
drop policy if exists "insta media insert own" on storage.objects;
create policy "insta media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'insta-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "insta media delete own" on storage.objects;
create policy "insta media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'insta-media' and (storage.foldername(name))[1] = auth.uid()::text);
