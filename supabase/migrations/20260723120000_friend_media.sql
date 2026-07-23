-- Photo & video "selfies" that friends send each other, kept in a PRIVATE bucket.
--
-- Files live at  <senderId>/<recipientId>/<uuid>.<ext>  so that:
--   • read access is limited to exactly those two people (the sender or the recipient),
--   • uploads are limited to your own <senderId> folder,
--   • only the sender ever holds the original, so only the sender can copy / resend it.
-- The chat message itself only stores the short storage path (well under the 500-char
-- message limit); the media is fetched with a short-lived signed URL on view.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('friend-media', 'friend-media', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
on conflict (id) do nothing;

-- You may only upload into your own user-id folder.
create policy "friend media upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'friend-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Only the sender (folder 1) or the recipient (folder 2) may read a file.
create policy "friend media read party" on storage.objects for select to authenticated
  using (
    bucket_id = 'friend-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- You may delete only files in your own folder.
create policy "friend media delete own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'friend-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
