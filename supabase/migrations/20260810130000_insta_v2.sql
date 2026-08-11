-- Insta v2: GUESTS can like too (an aggregate counter anyone may nudge — no account
-- needed), signed-in players can COMMENT, and posts can be VIDEOS (TikTok-style), not
-- just photos. Apply with: npm run db:push

-- A running like count on each post so guests (who have no auth.uid()) can like as
-- well; and a media type so a post is either a photo or a video.
alter table public.insta_posts add column if not exists likes int not null default 0;
alter table public.insta_posts add column if not exists media_type text not null default 'image';

-- Anyone (guest or signed in) may nudge a post's like count up or down by one.
create or replace function public.insta_bump_like(post_id uuid, delta int)
returns void language sql security definer set search_path = public as $$
  update public.insta_posts
     set likes = greatest(0, likes + (case when delta >= 0 then 1 else -1 end))
   where id = post_id;
$$;
grant execute on function public.insta_bump_like(uuid, int) to anon, authenticated;

-- Comments — signed-in players write them; everyone (incl. guests) can read.
create table if not exists public.insta_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.insta_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_character text not null default 'cottontail',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists insta_comments_post_idx on public.insta_comments (post_id, created_at);
alter table public.insta_comments enable row level security;
drop policy if exists "insta comments read all" on public.insta_comments;
create policy "insta comments read all" on public.insta_comments for select to anon, authenticated using (true);
drop policy if exists "insta comments insert own" on public.insta_comments;
create policy "insta comments insert own" on public.insta_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "insta comments delete own" on public.insta_comments;
create policy "insta comments delete own" on public.insta_comments for delete to authenticated using (author_id = auth.uid());

-- Rebuild the feed with the aggregate like count, a comment count, and the media type.
drop function if exists public.insta_feed(boolean, int);
create function public.insta_feed(only_following boolean default false, limit_n int default 60)
returns table (
  id uuid, author_id uuid, author_name text, author_character text,
  image_path text, media_type text, caption text, created_at timestamptz,
  like_count int, comment_count bigint, liked_by_me boolean, followed_by_me boolean, is_mine boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.author_id, p.author_name, p.author_character, p.image_path, p.media_type, p.caption, p.created_at,
    p.likes as like_count,
    (select count(*) from insta_comments c where c.post_id = p.id) as comment_count,
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

-- Allow video uploads (TikTok-style) alongside photos, and a bigger size cap (50MB).
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
  where id = 'insta-media';
