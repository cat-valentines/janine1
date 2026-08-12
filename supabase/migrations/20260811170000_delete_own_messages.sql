-- Let players delete their OWN chat messages "forever" — e.g. clearing photos from
-- their shared history. You can only ever delete messages you sent yourself.
-- Apply with: npm run db:push

drop policy if exists "messages delete own" on public.friend_messages;
create policy "messages delete own" on public.friend_messages
  for delete using (sender_id = auth.uid());

drop policy if exists "group msgs delete own" on public.chat_group_messages;
create policy "group msgs delete own" on public.chat_group_messages
  for delete using (sender_id = auth.uid());
