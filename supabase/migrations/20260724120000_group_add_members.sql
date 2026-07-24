-- Let any member of a group add players to it (not only the owner), so the "+"
-- in the group chat works for everyone in the group. You can still always add
-- yourself, and the owner can add anyone.
drop policy if exists "members add" on public.chat_group_members;
create policy "members add" on public.chat_group_members for insert with check (
  user_id = auth.uid()
  or public.is_chat_group_member(group_id)
  or exists (select 1 from public.chat_groups g where g.id = group_id and g.owner_id = auth.uid())
);
