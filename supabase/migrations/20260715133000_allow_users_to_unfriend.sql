-- Let either person remove a friendship or cancel a pending request.
-- RLS limits deletion to connections that include the signed-in user.
create policy "friends delete own connections"
on public.friend_connections
for delete
using (auth.uid() in (requester_id, friend_id));
