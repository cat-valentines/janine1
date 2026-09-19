-- Book Writer: the shared bookshelf.
--
-- Drafts live on each writer's own device; this is only for books they have
-- chosen to publish. Anyone may read the shelf, but only the author may put a
-- book on it or take it off — and reactions go through a function so a reader
-- can add to the counts without being able to set them to anything they like.

create table public.story_books (
  id text primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_character text not null default 'cottontail',
  title text not null,
  cover text not null default 'forest',
  -- The pages themselves: words, scene, characters, and paths to any picture
  -- or narration in the media store.
  pages jsonb not null default '[]'::jsonb,
  co_authors text[] not null default '{}',
  co_author_names text[] not null default '{}',
  likes integer not null default 0,
  hearts integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.story_books enable row level security;

-- Anyone signed in can read the shelf. Guests write books, but reading the
-- shared shelf is an account thing, like the rest of the island's social side.
create policy "books readable" on public.story_books for select
  using (auth.role() = 'authenticated');
create policy "books written by their author" on public.story_books for insert
  with check (author_id = auth.uid());
create policy "books edited by their author" on public.story_books for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "books removed by their author" on public.story_books for delete
  using (author_id = auth.uid());

create index story_books_author on public.story_books (author_id);
create index story_books_new on public.story_books (created_at desc);

-- ---- comments --------------------------------------------------------------

create table public.story_comments (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.story_books(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_character text not null default 'cottontail',
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.story_comments enable row level security;

create policy "comments readable" on public.story_comments for select
  using (auth.role() = 'authenticated');
create policy "comments written by their author" on public.story_comments for insert
  with check (author_id = auth.uid());
-- A commenter may delete their own; a book's author may clear any on their book.
create policy "comments removed by author or book owner" on public.story_comments for delete
  using (
    author_id = auth.uid()
    or exists (select 1 from public.story_books b where b.id = book_id and b.author_id = auth.uid())
  );

create index story_comments_book on public.story_comments (book_id, created_at);

-- Keep the count on the book, so the shelf does not have to count every time.
create function public.story_comment_counted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update story_books set comment_count = comment_count + 1 where id = new.book_id;
  elsif tg_op = 'DELETE' then
    update story_books set comment_count = greatest(0, comment_count - 1) where id = old.book_id;
  end if;
  return null;
end; $$;
create trigger story_comment_count
  after insert or delete on public.story_comments
  for each row execute function public.story_comment_counted();

-- ---- reactions -------------------------------------------------------------

-- One row per reader per book per kind, so nobody can react twice and an author
-- cannot be given coins over and over by one enthusiastic friend.
create table public.story_reactions (
  book_id text not null references public.story_books(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('like', 'heart')),
  created_at timestamptz not null default now(),
  primary key (book_id, reader_id, kind)
);
alter table public.story_reactions enable row level security;
create policy "reactions readable" on public.story_reactions for select
  using (auth.role() = 'authenticated');

-- Reacting goes through this, so the counts can only ever go up by one, by a
-- real signed-in reader, once.
create function public.story_react(book_id text, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if kind not in ('like', 'heart') then return; end if;
  insert into story_reactions (book_id, reader_id, kind)
  values (book_id, auth.uid(), kind)
  on conflict do nothing;
  if not found then return; end if;   -- already reacted: change nothing
  if kind = 'like' then
    update story_books set likes = likes + 1 where id = book_id;
  else
    update story_books set hearts = hearts + 1 where id = book_id;
  end if;
end; $$;
grant execute on function public.story_react(text, text) to authenticated;
