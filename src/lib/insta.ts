// "Insta" — a simple Instagram-style PUBLIC photo feed. Post a photo + caption,
// follow other players, like posts. Photos live in the public `insta-media` bucket;
// posts/follows/likes are rows guarded by RLS (see the insta migration). Guests get
// an anonymous account first, so everyone can join in.
import { supabase } from './supabase';
import { ensureGuestAccount } from './players';

const BUCKET = 'insta-media';

export interface InstaPost {
  id: string;
  author_id: string;
  author_name: string;
  author_character: string;
  image_path: string;
  caption: string;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  followed_by_me: boolean;
  is_mine: boolean;
}

function newId() {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** The public URL for a stored photo (the bucket is public, so no signing needed). */
export function photoUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Shrink a chosen photo to a friendly size (max ~1000px, JPEG) before uploading. */
export function compressImage(file: File, max = 1000, quality = 0.72): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/** Who am I (real or guest)? Ensures an account exists so posting/following works. */
async function myId(): Promise<string | null> {
  await ensureGuestAccount().catch(() => undefined);
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Post a photo + caption to the public feed. Returns the new post id. */
export async function createPost(name: string, character: string, file: File, caption: string) {
  const me = await myId();
  if (!me) throw new Error('Sign in to post.');
  const blob = await compressImage(file);
  const path = `${me}/${newId()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('insta_posts').insert({
    author_id: me,
    author_name: (name || 'explorer').slice(0, 30),
    author_character: character || 'cottontail',
    image_path: path,
    caption: caption.slice(0, 300),
  });
  if (error) throw error;
}

/** The feed: everyone's posts, or just the people you follow. */
export async function loadFeed(onlyFollowing = false): Promise<InstaPost[]> {
  const { data, error } = await supabase.rpc('insta_feed', { only_following: onlyFollowing });
  if (error) throw error;
  return (data ?? []) as InstaPost[];
}

/** Like or unlike a post. */
export async function setLike(postId: string, liked: boolean) {
  const me = await myId();
  if (!me) return;
  if (liked) await supabase.from('insta_likes').upsert({ post_id: postId, user_id: me });
  else await supabase.from('insta_likes').delete().eq('post_id', postId).eq('user_id', me);
}

/** Follow or unfollow a player. */
export async function setFollow(followeeId: string, following: boolean) {
  const me = await myId();
  if (!me || me === followeeId) return;
  if (following) await supabase.from('insta_follows').upsert({ follower_id: me, followee_id: followeeId });
  else await supabase.from('insta_follows').delete().eq('follower_id', me).eq('followee_id', followeeId);
}

/** Delete one of your own posts (and its photo). */
export async function deletePost(postId: string, imagePath: string) {
  await supabase.from('insta_posts').delete().eq('id', postId);
  await supabase.storage.from(BUCKET).remove([imagePath]).catch(() => undefined);
}
