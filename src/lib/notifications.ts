import { supabase } from './supabase';
import { loadMyFriends } from './players';

export interface NotificationItem {
  id: string;
  kind: 'friend' | 'invite' | 'message';
  text: string;
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
    supabase.from('friend_connections').select('requester_id, created_at')
      .eq('friend_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('friend_messages').select('id, sender_id, message, created_at')
      .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30),
  ]);

  const nameOf = (id: string) => friends.find((friend) => friend.id === id)?.name ?? 'a player';
  const items: NotificationItem[] = [];

  (conns.data ?? []).forEach((row) => {
    const conn = row as { requester_id: string; created_at: string };
    items.push({ id: `friend-${conn.requester_id}`, kind: 'friend', at: conn.created_at,
      text: `🤝 @${nameOf(conn.requester_id)} added you as a friend!` });
  });

  (msgs.data ?? []).forEach((row) => {
    const msg = row as { id: string; sender_id: string; message: string; created_at: string };
    const invite = looksLikeInvite(msg.message);
    // Invites already name the sender inside the message; a plain text does not,
    // so say who it is from — "💬 @lily texted you: hi".
    items.push({ id: msg.id, kind: invite ? 'invite' : 'message', at: msg.created_at,
      text: invite ? msg.message : `💬 @${nameOf(msg.sender_id)} texted you: ${msg.message}` });
  });

  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

const SEEN_KEY = 'magic-islands-notif-seen';
export const loadSeenAt = () => localStorage.getItem(SEEN_KEY) ?? '';
export const markSeen = () => localStorage.setItem(SEEN_KEY, new Date().toISOString());
export const countUnread = (items: NotificationItem[], seenAt: string) =>
  items.filter((item) => !seenAt || item.at > seenAt).length;
