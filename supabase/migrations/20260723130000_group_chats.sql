-- Group chats: text + photo/video with several friends at once.
-- Media reuses the private `friend-media` bucket at  groups/<groupId>/<sender>/<id>.<ext>
-- and is readable only by members of that group.

create table public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index chat_group_members_user_idx on public.chat_group_members(user_id);
create index chat_group_messages_group_idx on public.chat_group_messages(group_id, created_at);

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

-- Membership test (security definer: avoids recursive RLS on the members table).
create function public.is_chat_group_member(gid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from chat_group_members m where m.group_id = gid and m.user_id = auth.uid())
  $$;

-- Groups: readable by the owner or any member; you can create groups you own.
create policy "groups read own or member" on public.chat_groups for select
  using (owner_id = auth.uid() or public.is_chat_group_member(id));
create policy "groups create own" on public.chat_groups for insert with check (owner_id = auth.uid());
create policy "groups owner delete" on public.chat_groups for delete using (owner_id = auth.uid());

-- Members: readable by members; the owner adds people (must be their friends — enforced
-- in the app), and anyone can add/remove themselves.
create policy "members read" on public.chat_group_members for select
  using (public.is_chat_group_member(group_id) or exists (select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "members add" on public.chat_group_members for insert with check (
  user_id = auth.uid()
  or exists (select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid())
);
create policy "members remove" on public.chat_group_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid())
);

-- Messages: members read; members send as themselves.
create policy "group msgs read" on public.chat_group_messages for select using (public.is_chat_group_member(group_id));
create policy "group msgs send" on public.chat_group_messages for insert
  with check (sender_id = auth.uid() and public.is_chat_group_member(group_id));

-- Storage: a group's media (path  groups/<gid>/<sender>/...) is readable by members and
-- uploadable by a member into their own subfolder. Parsing is done safely so a malformed
-- or non-group path just returns false instead of erroring.
create function public.storage_group_member(objname text) returns boolean
  language plpgsql stable security definer set search_path = public as $$
  declare parts text[]; gid uuid;
  begin
    parts := storage.foldername(objname);
    if parts[1] is distinct from 'groups' then return false; end if;
    begin gid := parts[2]::uuid; exception when others then return false; end;
    return exists (select 1 from chat_group_members m where m.group_id = gid and m.user_id = auth.uid());
  end $$;

create policy "group media read members" on storage.objects for select to authenticated
  using (bucket_id = 'friend-media' and public.storage_group_member(name));
create policy "group media upload member" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'friend-media'
    and public.storage_group_member(name)
    and (storage.foldername(name))[3] = auth.uid()::text
  );
