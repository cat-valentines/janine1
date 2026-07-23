import { supabase } from './supabase';

export interface FriendMessage {
  id: string; sender_id: string; recipient_id: string; message: string; created_at: string;
}

export async function loadFriendMessages(friendId: string) {
  const { data, error } = await supabase.from('friend_messages').select('*')
    .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`).order('created_at').limit(50);
  if (error) throw error;
  return (data ?? []) as FriendMessage[];
}

export async function sendFriendMessage(senderId: string, recipientId: string, message: string) {
  const { error } = await supabase.from('friend_messages').insert({
    sender_id: senderId, recipient_id: recipientId, message: message.trim(),
  });
  if (error) throw error;
}

// ---- Photo / video "selfie" messages ---------------------------------------
// A media message is an ordinary text message whose body is just a short marker
// plus the private storage path, e.g.  media::photo::<sender>/<recipient>/<id>.jpg
export type MediaKind = 'photo' | 'video';
const MEDIA_PREFIX = 'media::';

export function mediaMessage(kind: MediaKind, path: string) { return `${MEDIA_PREFIX}${kind}::${path}`; }

export function parseMedia(message: string): { kind: MediaKind; path: string } | null {
  if (!message.startsWith(MEDIA_PREFIX)) return null;
  const rest = message.slice(MEDIA_PREFIX.length);
  const sep = rest.indexOf('::');
  if (sep < 0) return null;
  const kind = rest.slice(0, sep);
  const path = rest.slice(sep + 2);
  if ((kind === 'photo' || kind === 'video') && path) return { kind, path };
  return null;
}

/** Selfies you saved privately to yourself (sender === recipient === you). */
export async function loadSavedSelfies(me: string) {
  const { data, error } = await supabase.from('friend_messages').select('*')
    .eq('sender_id', me).eq('recipient_id', me).like('message', `${MEDIA_PREFIX}%`)
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as FriendMessage[];
}
