-- Instagram-style player profiles: open a player's Insta account to see their name,
-- follower / following / post counts, and their posts — with a Follow button.
-- Apply with: npm run db:push

-- One player's Insta profile: display name + character, the three counts, whether
-- YOU already follow them, and whether it's you. Public (guests can look too).
create or replace function public.insta_profile(uid uuid)
returns table (uname text, char_id text, followers bigint, following bigint, posts bigint, followed_by_me boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select display_name from player_profiles p where p.user_id = uid),
             (select author_name from insta_posts po where po.author_id = uid order by po.created_at desc limit 1),
             'a player'),
    coalesce((select selected_character from player_profiles p where p.user_id = uid),
             (select author_character from insta_posts po where po.author_id = uid order by po.created_at desc limit 1),
             'cottontail'),
    (select count(*) from insta_follows f where f.followee_id = uid),
    (select count(*) from insta_follows f where f.follower_id = uid),
    (select count(*) from insta_posts po where po.author_id = uid),
    exists(select 1 from insta_follows f where f.follower_id = auth.uid() and f.followee_id = uid),
    (uid = auth.uid());
$$;
grant execute on function public.insta_profile(uuid) to anon, authenticated;

-- A single player's posts, newest first — same shape as the main feed.
create or replace function public.insta_user_posts(uid uuid, limit_n int default 60)
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
  where p.author_id = uid
  order by p.created_at desc
  limit greatest(1, least(limit_n, 120));
$$;
grant execute on function public.insta_user_posts(uuid, int) to anon, authenticated;
