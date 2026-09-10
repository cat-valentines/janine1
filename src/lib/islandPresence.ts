/**
 * Who is on the island right now, and what are they doing.
 *
 * Every open app quietly says "I'm here, I'm in the Market" on one shared
 * channel a few times a minute; everyone else keeps the list. So "what is my
 * friend playing?" is answered by the friend's own app, live, and if they are
 * not there at all then they are simply not online — which is the honest answer
 * rather than a stale row in a table saying they were here an hour ago.
 *
 * Nothing is stored anywhere. Close the tab and you are gone from the list
 * within a few seconds.
 */
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface OnlinePlayer {
  id: string;
  name: string;
  character: string;
  /** Where they are, already turned into words: "Chess", "the Market". */
  place: string;
  icon: string;
  at: number;
}

/** Someone we haven't heard from in this long has closed the tab. */
const STALE_MS = 11000;
const SHOUT_MS = 4000;

export interface PresenceHandle {
  /** Say where you are now — call it when the player moves to another page. */
  update: (place: string, icon: string) => void;
  leave: () => void;
}

/**
 * Join the island's presence channel. `onPlayers` fires with everyone else who
 * is online whenever the list changes.
 */
export function joinIslandPresence(
  self: { id: string; name: string; character: string },
  onPlayers: (players: OnlinePlayer[]) => void,
): PresenceHandle {
  const channel: RealtimeChannel = supabase.channel('island-presence', { config: { broadcast: { self: false } } });
  const players = new Map<string, OnlinePlayer>();
  let settle: ReturnType<typeof setTimeout> | null = null;
  const emit = () => onPlayers([...players.values()].sort((a, b) => a.name.localeCompare(b.name)));
  let place = '';
  let icon = '';

  const shout = () => channel.send({
    type: 'broadcast', event: 'here',
    payload: { id: self.id, name: self.name, character: self.character, place, icon, at: Date.now() },
  });

  channel.on('broadcast', { event: 'here' }, ({ payload }) => {
    const p = payload as OnlinePlayer;
    if (!p?.id || p.id === self.id) return;
    players.set(p.id, { ...p, at: Date.now() });
    emit();
  });
  // A newly-opened app asks, and everybody answers at once — so you do not have
  // to wait several seconds to find out who is around.
  channel.on('broadcast', { event: 'who' }, ({ payload }) => {
    if ((payload as { id?: string })?.id !== self.id) shout();
  });
  channel.on('broadcast', { event: 'gone' }, ({ payload }) => {
    const id = (payload as { id?: string })?.id;
    if (id && players.delete(id)) emit();
  });
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    channel.send({ type: 'broadcast', event: 'who', payload: { id: self.id } });
    shout();
    // Report the list once the "who is there?" answers have had time to come
    // back — even if it turns out to be empty. Without this, an island with
    // nobody else on it never reports at all, and the panel would sit on
    // "Looking…" for ever instead of honestly saying they are not online.
    settle = setTimeout(emit, 1200);
  });

  const shouting = setInterval(shout, SHOUT_MS);
  const sweep = setInterval(() => {
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    players.forEach((p, id) => { if (p.at < cutoff) { players.delete(id); changed = true; } });
    if (changed) emit();
  }, 3000);

  return {
    update: (nextPlace, nextIcon) => {
      if (nextPlace === place && nextIcon === icon) return;
      place = nextPlace;
      icon = nextIcon;
      shout();
    },
    leave: () => {
      clearInterval(shouting);
      clearInterval(sweep);
      if (settle) clearTimeout(settle);
      channel.send({ type: 'broadcast', event: 'gone', payload: { id: self.id } });
      supabase.removeChannel(channel);
    },
  };
}

// ---- one join for the whole app --------------------------------------------

/**
 * The live list, kept in one place.
 *
 * Exactly one part of the app joins the presence channel (PresenceCenter, at the
 * root) and everything else reads the list from here. Two subscriptions to one
 * Realtime topic in a single client is a fault this app has hit twice already:
 * the second one quietly receives nothing.
 *
 * A new reader is handed the current list straight away, so opening the Friends
 * panel does not have to wait several seconds to find out who is around.
 */
let latest: OnlinePlayer[] = [];
let joined = false;
const readers = new Set<(players: OnlinePlayer[]) => void>();

/** Called by the one joiner whenever the list changes. */
export function publishOnline(players: OnlinePlayer[]) {
  latest = players;
  joined = true;
  readers.forEach((read) => read(players));
}

/** True once the app has actually joined and heard back at least once. */
export const presenceReady = () => joined;

/** Read the live list. Returns a stop function. */
export function watchOnline(read: (players: OnlinePlayer[]) => void): () => void {
  readers.add(read);
  read(latest);
  return () => { readers.delete(read); };
}

/** Forget everything — used when signing out, so a stale list cannot linger. */
export function clearOnline() {
  latest = [];
  joined = false;
  readers.forEach((read) => read([]));
}

/** What to say about a friend, given the live list. Never guesses. */
export function whereIsFriend(players: OnlinePlayer[], friendId: string): { online: boolean; text: string; icon: string } {
  const found = players.find((p) => p.id === friendId);
  if (!found) return { online: false, text: 'Not on Magical Islands right now', icon: '💤' };
  if (!found.place) return { online: true, text: 'On the island, not in a game', icon: '🏝️' };
  return { online: true, text: `Playing ${found.place}`, icon: found.icon || '🎮' };
}
