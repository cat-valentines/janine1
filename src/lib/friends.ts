import { supabase } from './supabase';
import { storage } from './storage';

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

// ---- Unread tracking: which friends have texted you since you last looked ----
// A per-device record of when you last opened each friend's chat.
const CHAT_SEEN_KEY = 'chatSeenAt';
type SeenMap = Record<string, string>;
function readSeen(): SeenMap { try { return JSON.parse(storage.get(CHAT_SEEN_KEY) ?? '{}') as SeenMap; } catch { return {}; } }
export function chatSeenAt(friendId: string): string { return readSeen()[friendId] ?? ''; }
export function markChatSeen(friendId: string) { const all = readSeen(); all[friendId] = new Date().toISOString(); storage.set(CHAT_SEEN_KEY, JSON.stringify(all)); }

// A one-time baseline set the first time unread-tracking runs on this device.
// Without it, EVERY message you'd already read long ago would look "unread" and
// light the dot. Only messages newer than this baseline (or your last chat open)
// count as unread.
const BASELINE_KEY = 'chatUnreadBaseline';
function unreadBaseline(): string {
  let base = storage.get(BASELINE_KEY);
  if (!base) { base = new Date().toISOString(); storage.set(BASELINE_KEY, base); }
  return base;
}

/** True only when `lastAt` (a friend's newest message to you) is newer than both the
 *  baseline and the last time you opened their chat. */
export function messageUnread(lastAt: string | undefined, seenAt: string): boolean {
  if (!lastAt) return false;
  const floor = seenAt > unreadBaseline() ? seenAt : unreadBaseline();
  return lastAt > floor;
}

/** The time of the newest message each friend sent YOU — used to show unread dots. */
export async function loadIncomingLatest(me: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('friend_messages').select('sender_id, created_at')
    .eq('recipient_id', me).order('created_at', { ascending: false }).limit(200);
  if (error) return {};
  const latest: Record<string, string> = {};
  (data ?? []).forEach((row) => {
    const r = row as { sender_id: string; created_at: string };
    if (r.sender_id !== me && !latest[r.sender_id]) latest[r.sender_id] = r.created_at;
  });
  return latest;
}

/** Selfies you saved privately to yourself (sender === recipient === you). */
export async function loadSavedSelfies(me: string) {
  const { data, error } = await supabase.from('friend_messages').select('*')
    .eq('sender_id', me).eq('recipient_id', me).like('message', `${MEDIA_PREFIX}%`)
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as FriendMessage[];
}
