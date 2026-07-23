// Uploading and fetching the private photo/video "selfies" friends send each other.
// Files live in the private `friend-media` bucket at  <sender>/<recipient>/<id>.<ext>
// so only those two people can read them (see the storage RLS migration). The chat
// message only carries the short storage path; here we turn it into a signed URL.
import { supabase } from './supabase';
import { mediaMessage, sendFriendMessage, type MediaKind } from './friends';

const BUCKET = 'friend-media';
const WEEK = 60 * 60 * 24 * 7;

function newId() {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Upload a captured photo/video, then message the recipient its storage path. */
export async function sendMediaTo(me: string, recipient: string, kind: MediaKind, blob: Blob, ext: string, contentType: string) {
  const path = `${me}/${recipient}/${newId()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (up.error) throw up.error;
  await sendFriendMessage(me, recipient, mediaMessage(kind, path));
  return path;
}

/** A short-lived signed URL to actually display a private media file. */
export async function mediaSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, WEEK);
  if (error || !data) return '';
  return data.signedUrl;
}

/**
 * Forward an existing media file to another friend. Only the original SENDER can do
 * this — they own the source folder, so only they can copy it to a new recipient path.
 */
export async function resendMedia(me: string, newRecipient: string, kind: MediaKind, sourcePath: string) {
  const ext = sourcePath.split('.').pop() || 'jpg';
  const path = `${me}/${newRecipient}/${newId()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).copy(sourcePath, path);
  if (error) throw error;
  await sendFriendMessage(me, newRecipient, mediaMessage(kind, path));
  return path;
}
