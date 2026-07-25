-- Song Studio: original songs players make (a genre/mood/seed "recipe" that
-- rebuilds the instrumental, plus optional lyrics and a rendered audio file).

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  genre text not null,
  mood text not null,
  tempo integer not null check (tempo between 40 and 220),
  seed bigint not null,
  bars integer not null default 8 check (bars between 1 and 64),
  lyrics text not null default '' check (char_length(lyrics) <= 6000),
  audio_path text,                       -- rendered mix in the song-audio bucket, if any
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index songs_owner_idx on public.songs(owner_id, created_at desc);
create index songs_public_idx on public.songs(is_public, created_at desc);

alter table public.songs enable row level security;
create policy "songs read own or public" on public.songs for select using (owner_id = auth.uid() or is_public);
create policy "songs insert own" on public.songs for insert with check (owner_id = auth.uid());
create policy "songs update own" on public.songs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "songs delete own" on public.songs for delete using (owner_id = auth.uid());

-- Public bucket so a shared song has a stable URL to stream in-app. Files live at
-- <owner>/<id>.wav and you can only upload into your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('song-audio', 'song-audio', true, 26214400, array['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/mp4'])
on conflict (id) do nothing;

create policy "song audio upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'song-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "song audio update own" on storage.objects for update to authenticated
  using (bucket_id = 'song-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "song audio delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'song-audio' and (storage.foldername(name))[1] = auth.uid()::text);
