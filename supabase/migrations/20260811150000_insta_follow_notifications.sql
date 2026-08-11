-- Follow notifications: when someone you follow posts, you get a notification.
-- A trigger fans a new post out to every follower's notification list. Apply with:
-- npm run db:push

create table if not exists public.insta_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null,
  actor_name text not null,
  actor_character text not null default 'cottontail',
  post_id uuid references public.insta_posts(id) on delete cascade,
  media_type text not null default 'image',
  created_at timestamptz not null default now()
);
create index if not exists insta_notifications_recipient_idx on public.insta_notifications (recipient_id, created_at desc);

-- You can read only YOUR OWN notifications. Nobody writes them directly — only the
-- trigger below (security definer) does, so there's no insert policy on purpose.
alter table public.insta_notifications enable row level security;
drop policy if exists "insta notif read own" on public.insta_notifications;
create policy "insta notif read own" on public.insta_notifications for select to authenticated using (recipient_id = auth.uid());

-- On every new post, drop a notification into each follower's list.
create or replace function public.notify_followers_on_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.insta_notifications (recipient_id, actor_id, actor_name, actor_character, post_id, media_type)
  select f.follower_id, NEW.author_id, NEW.author_name, NEW.author_character, NEW.id, NEW.media_type
  from public.insta_follows f
  where f.followee_id = NEW.author_id;
  return NEW;
end; $$;

drop trigger if exists insta_post_notify on public.insta_posts;
create trigger insta_post_notify after insert on public.insta_posts
  for each row execute function public.notify_followers_on_post();
