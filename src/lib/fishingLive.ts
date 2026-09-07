/**
 * Live Fishing Frenzy.
 *
 * Unlike chess, this is not a duel — a fishing round is a free-for-all, so
 * everyone playing live shares one room and simply shouts where their boat is
 * and how much they have banked, several times a second. Anyone can join a
 * round already in progress; you just arrive on the water.
 *
 * "Play with everybody" uses the open room. "Play with friends" uses a private
 * room whose code you share, so a group can have the sea to themselves.
 */
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Another player's boat, as last heard. */
export interface FishingPeer {
  id: string; name: string; emoji: string;
  x: number; y: number; banked: number; hold: number;
  at: number;
}

/** Someone sitting in the lobby, not yet fishing. */
export interface FishingWaiter { id: string; name: string; emoji: string; at: number }

/** Boats we haven't heard from in this long have gone. */
const STALE_MS = 5000;
const WAIT_STALE_MS = 8000;

export const OPEN_ROOM = 'everyone';
/** A short code a friend can type in, avoiding letters that look alike. */
export function newRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

export interface FishingRoom {
  /** Shout where my boat is and what I've banked. */
  send: (state: { x: number; y: number; banked: number; hold: number }) => void;
  /** Tell the room I landed something worth shouting about. */
  brag: (text: string) => void;
  leave: () => void;
}

export interface RoomHandlers {
  onPeers: (peers: FishingPeer[]) => void;
  onBrag: (name: string, text: string) => void;
}

export function joinFishingRoom(
  room: string,
  self: { id: string; name: string; emoji: string },
  handlers: RoomHandlers,
): FishingRoom {
  const channel: RealtimeChannel = supabase.channel(`fishing-${room}`, { config: { broadcast: { self: false } } });
  const peers = new Map<string, FishingPeer>();
  const emit = () => handlers.onPeers([...peers.values()]);

  channel.on('broadcast', { event: 'boat' }, ({ payload }) => {
    const p = payload as FishingPeer;
    if (!p?.id || p.id === self.id) return;
    peers.set(p.id, { ...p, at: Date.now() });
    emit();
  });
  channel.on('broadcast', { event: 'brag' }, ({ payload }) => {
    const p = payload as { id?: string; name?: string; text?: string };
    if (!p?.id || p.id === self.id || !p.text) return;
    handlers.onBrag(p.name ?? 'Someone', p.text);
  });
  channel.on('broadcast', { event: 'gone' }, ({ payload }) => {
    const id = (payload as { id?: string })?.id;
    if (id && peers.delete(id)) emit();
  });
  channel.subscribe();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    peers.forEach((peer, id) => { if (peer.at < cutoff) { peers.delete(id); changed = true; } });
    if (changed) emit();
  }, 1500);

  return {
    send: (state) => {
      channel.send({ type: 'broadcast', event: 'boat', payload: { id: self.id, name: self.name, emoji: self.emoji, ...state } });
    },
    brag: (text) => {
      channel.send({ type: 'broadcast', event: 'brag', payload: { id: self.id, name: self.name, text } });
    },
    leave: () => {
      clearInterval(sweep);
      channel.send({ type: 'broadcast', event: 'gone', payload: { id: self.id } });
      supabase.removeChannel(channel);
    },
  };
}

// ---- the "who is around?" lobby -------------------------------------------

export interface LobbyHandlers { onWaiting: (waiting: FishingWaiter[]) => void }

/**
 * A quiet channel where players who are *about* to fish say hello, so the menu
 * can honestly say whether anyone else is out there before you sail.
 */
export function watchFishingLobby(
  self: { id: string; name: string; emoji: string } | null,
  handlers: LobbyHandlers,
): () => void {
  const channel: RealtimeChannel = supabase.channel('fishing-lobby', { config: { broadcast: { self: false } } });
  const waiting = new Map<string, FishingWaiter>();
  const emit = () => handlers.onWaiting([...waiting.values()].sort((a, b) => a.name.localeCompare(b.name)));

  channel.on('broadcast', { event: 'waiting' }, ({ payload }) => {
    const p = payload as FishingWaiter;
    if (!p?.id || p.id === self?.id) return;
    waiting.set(p.id, { ...p, at: Date.now() });
    emit();
  });
  channel.subscribe();

  // Announce yourself too, so other people's menus can see you.
  const shout = () => {
    if (!self) return;
    channel.send({ type: 'broadcast', event: 'waiting', payload: { id: self.id, name: self.name, emoji: self.emoji, at: Date.now() } });
  };
  shout();
  const shouting = setInterval(shout, 2500);
  const sweep = setInterval(() => {
    const cutoff = Date.now() - WAIT_STALE_MS;
    let changed = false;
    waiting.forEach((w, id) => { if (w.at < cutoff) { waiting.delete(id); changed = true; } });
    if (changed) emit();
  }, 2000);

  return () => {
    clearInterval(shouting);
    clearInterval(sweep);
    supabase.removeChannel(channel);
  };
}
