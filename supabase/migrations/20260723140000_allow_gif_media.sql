-- Allow animated GIFs (made from a quick video) in the friend-media bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm', 'video/mp4']
where id = 'friend-media';
