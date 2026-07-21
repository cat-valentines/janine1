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

/** Every signed-up player, most recently active first, for the browse list. */
export async function loadAllPlayers() {
  const { data, error } = await supabase.rpc('all_players');
  if (error) throw error;
  return (data ?? []) as FoundPlayer[];
}

export async function loadMyFriends() {
  const { data, error } = await supabase.rpc('my_friends');
  if (error) throw error;
  return (data ?? []) as FriendRow[];
}

/**
 * Friends someone straight away — no "request pending" step. Kids just want to
 * add each other and play, so the connection goes in already accepted.
 */
export async function addFriend(requesterId: string, friendId: string) {
  const { error } = await supabase.from('friend_connections')
    .insert({ requester_id: requesterId, friend_id: friendId, status: 'accepted' });
  if (error && error.code !== '23505') throw error;
  // If a row already existed as pending (from before), make it accepted too.
  if (error?.code === '23505') {
    await supabase.from('friend_connections').update({ status: 'accepted' })
      .or(`and(requester_id.eq.${requesterId},friend_id.eq.${friendId}),and(requester_id.eq.${friendId},friend_id.eq.${requesterId})`);
  }
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
 * Makes sure the player has at least a lightweight anonymous account, so a
 * guest can appear on the leaderboard and in friend search like everyone else.
 *
 * Returns 'ready' if they now have an account, 'guest' if anonymous sign-in is
 * turned off (they stay a device-only guest and the game still plays), and
 * 'signed-in' if they already had a real account. Never throws — a guest must
 * always be able to play.
 */
export async function ensureGuestAccount(): Promise<'signed-in' | 'ready' | 'guest'> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) return 'signed-in';
    const { error } = await supabase.auth.signInAnonymously();
    // A disabled toggle, offline, etc. — fall back to a local-only guest.
    return error ? 'guest' : 'ready';
  } catch {
    return 'guest';
  }
}

/** True for an email-less anonymous account (a guest who became real). */
export const isAnonymous = (user: { app_metadata?: { provider?: string }; is_anonymous?: boolean } | null | undefined) =>
  !!user && (user.is_anonymous === true || user.app_metadata?.provider === 'anonymous');

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
  // Upsert, not update: some accounts never got a profile row (the signup
  // trigger can miss, e.g. older or OAuth accounts). A plain update on a
  // missing row changes nothing and reports success, so the player thinks
  // they have a username but stays invisible. Upsert creates it if needed.
  const { error } = await supabase.from('player_profiles')
    .upsert({ user_id: userId, display_name: clean }, { onConflict: 'user_id' });
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
  // Upsert so an account that never got a profile row still gets one here.
  const { error } = await supabase.from('player_profiles').upsert({
    user_id: userId,
    display_name: fields.username.trim(),
    birthday: fields.birthday || null,
    selected_character: fields.character,
    onboarded: true,
  }, { onConflict: 'user_id' });
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
