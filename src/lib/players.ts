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

/** What a username has to look like, matching the sign-up form. */
export const USERNAME_RULE = /^[A-Za-z0-9_]{3,24}$/;

/**
 * True when nobody else is using this username, false when it is taken, and
 * null when we could not check — the database's unique index is the real
 * guard, so a failed check just means "let the save decide".
 */
export async function isUsernameFree(name: string) {
  const { data, error } = await supabase.rpc('username_available', { name });
  if (error) return null;
  return data as boolean;
}

/** Renames you everywhere: the profile other players search, and your login. */
export async function changeUsername(userId: string, name: string) {
  const clean = name.trim();
  const { error } = await supabase.from('player_profiles')
    .update({ display_name: clean }).eq('user_id', userId);
  if (error) throw error;
  // The header greeting reads the auth copy, so it has to move too.
  const { error: authError } = await supabase.auth.updateUser({ data: { display_name: clean } });
  if (authError) throw authError;
}

/** Postgres unique-violation: somebody already has that username. */
export const isTakenError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

export interface AccountState {
  onboarded: boolean; display_name: string; birthday: string | null; selected_character: string;
}

/**
 * Whether this player has finished the setup screen.
 *
 * Returns null when we cannot tell (offline, or the tables are not up yet) —
 * the caller must let them play rather than trap them on a setup form.
 */
export async function loadAccountState(userId: string) {
  const { data, error } = await supabase.from('player_profiles')
    .select('onboarded, display_name, birthday, selected_character')
    .eq('user_id', userId).maybeSingle();
  if (error) return null;
  return data as AccountState | null;
}

export interface SetupFields {
  username: string; birthday: string; character: string;
}

/** Saves the setup screen and marks the account finished, so others can find them. */
export async function finishAccountSetup(userId: string, fields: SetupFields) {
  const { error } = await supabase.from('player_profiles').update({
    display_name: fields.username.trim(),
    birthday: fields.birthday || null,
    selected_character: fields.character,
    onboarded: true,
  }).eq('user_id', userId);
  if (error) throw error;
  const { error: authError } = await supabase.auth.updateUser({ data: { display_name: fields.username.trim() } });
  if (authError) throw authError;
}

/**
 * Sets a password for THIS GAME on an account that signed in with Google.
 * It is never the player's Google password — Google's own screen handles that
 * and we never see it.
 */
export async function setGamePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
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
