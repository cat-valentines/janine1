import { supabase } from './supabase';
import { loadMyFriends } from './players';
import { parseMedia } from './friends';
import { storage } from './storage';

export interface NotificationItem {
  id: string;
  kind: 'friend' | 'invite' | 'message';
  text: string;
  /** The other player (who texted / added you), so the panel can open their chat. */
  friendId: string;
  /** ISO timestamp — used to sort, and to tell what is unread. */
  at: string;
}

/** True when a message reads like a game invite or a play date. */
const looksLikeInvite = (message: string) => /invited you|play date|come play|🎮|🔦|📅/i.test(message);

/**
 * Everything worth telling the player about: who added them as a friend, and
 * any invites or messages friends sent. Newest first. Needs a signed-in user;
 * returns [] if the tables are not reachable, so the bell just stays quiet.
 */
export async function loadNotifications(userId: string): Promise<NotificationItem[]> {
  const [friends, conns, msgs] = await Promise.all([
    loadMyFriends().catch(() => []),
    supabase.from('friend_connections').select('requester_id, status, created_at')
      .eq('friend_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('friend_messages').select('id, sender_id, message, created_at')
      .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30),
  ]);

  const nameOf = (id: string) => friends.find((friend) => friend.id === id)?.name ?? 'a player';
  const items: NotificationItem[] = [];

  (conns.data ?? []).forEach((row) => {
    const conn = row as { requester_id: string; status: string; created_at: string };
    const pending = conn.status === 'pending';
    items.push({ id: `friend-${conn.requester_id}`, kind: 'friend', at: conn.created_at, friendId: conn.requester_id,
      text: pending
        ? `👋 @${nameOf(conn.requester_id)} wants to be your friend — tap to accept or decline`
        : `🤝 @${nameOf(conn.requester_id)} is now your friend!` });
  });

  (msgs.data ?? []).forEach((row) => {
    const msg = row as { id: string; sender_id: string; message: string; created_at: string };
    const media = parseMedia(msg.message);
    const invite = looksLikeInvite(msg.message);
    // Invites already name the sender inside the message; a plain text/photo does
    // not, so say who it is from — "💬 @lily texted you: hi".
    const text = media ? `📷 @${nameOf(msg.sender_id)} sent you a ${media.kind}`
      : invite ? msg.message
        : `💬 @${nameOf(msg.sender_id)} texted you: ${msg.message}`;
    items.push({ id: msg.id, kind: invite ? 'invite' : 'message', at: msg.created_at, friendId: msg.sender_id, text });
  });

  const cleared = loadClearedAt();
  return items
    .filter((item) => !cleared || item.at > cleared)   // "Clear all" hides everything up to now
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

const SEEN_KEY = 'magic-islands-notif-seen';
export const loadSeenAt = () => storage.get(SEEN_KEY) ?? '';
export const markSeen = () => storage.set(SEEN_KEY, new Date().toISOString());

// "Clear all": a per-device timestamp; notifications older than it are hidden.
// New friend adds / messages after this still come through.
const CLEARED_KEY = 'magic-islands-notif-cleared';
export const loadClearedAt = () => storage.get(CLEARED_KEY) ?? '';
export const clearNotifications = () => storage.set(CLEARED_KEY, new Date().toISOString());
export const countUnread = (items: NotificationItem[], seenAt: string) =>
  items.filter((item) => !seenAt || item.at > seenAt).length;
