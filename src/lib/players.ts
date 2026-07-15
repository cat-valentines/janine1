import { supabase } from './supabase';

export interface FoundPlayer {
  id: string; name: string; character_id: string; level: number;
}

export interface FriendRow extends FoundPlayer {
  status: 'pending' | 'accepted';
  /** True when they asked to be your friend, rather than you asking them. */
  incoming: boolean;
}

export interface PrivateProfile {
  display_name: string; real_name: string; birthday: string; country: string;
}

/** Public fields only — real names and birthdays never leave their owner's account. */
export async function searchPlayers(query: string) {
  const { data, error } = await supabase.rpc('search_players', { query });
  if (error) throw error;
  return (data ?? []) as FoundPlayer[];
}

export async function loadMyFriends() {
  const { data, error } = await supabase.rpc('my_friends');
  if (error) throw error;
  return (data ?? []) as FriendRow[];
}

export async function addFriend(requesterId: string, friendId: string) {
  const { error } = await supabase.from('friend_connections')
    .insert({ requester_id: requesterId, friend_id: friendId });
  if (error && error.code !== '23505') throw error;
}

export async function acceptFriend(myId: string, requesterId: string) {
  const { error } = await supabase.from('friend_connections')
    .update({ status: 'accepted' }).eq('requester_id', requesterId).eq('friend_id', myId);
  if (error) throw error;
}

export async function removeFriend(myId: string, otherId: string) {
  const { error } = await supabase.from('friend_connections').delete()
    .or(`and(requester_id.eq.${myId},friend_id.eq.${otherId}),and(requester_id.eq.${otherId},friend_id.eq.${myId})`);
  if (error) throw error;
}

export interface MyStats {
  display_name: string; total_score: number; current_level: number; current_island: number;
}

/** Your own score/level, so the explorer card shows real numbers. */
export async function loadMyStats(userId: string) {
  const { data, error } = await supabase.from('player_profiles')
    .select('display_name, total_score, current_level, current_island').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as MyStats | null;
}

export async function loadPrivateProfile(userId: string) {
  const { data, error } = await supabase.from('player_profiles')
    .select('display_name, real_name, birthday, country').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as PrivateProfile | null;
}

export async function savePrivateProfile(userId: string, fields: Partial<PrivateProfile>) {
  const { error } = await supabase.from('player_profiles').update({
    real_name: fields.real_name?.trim() || null,
    birthday: fields.birthday || null,
    country: fields.country?.trim() || null,
  }).eq('user_id', userId);
  if (error) throw error;
}
