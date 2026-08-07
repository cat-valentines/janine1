import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** One player's live position, shouted over the wire many times a second. */
export interface LivePlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
  level: number;
  /** Depth, for games where players move up and down too (the Underwater Maze). */
  y?: number;
}

/** A house handed to a guest you've welcomed in: everything to render your build. */
export interface HouseGift {
  name: string;
  world: string;
  furniture: unknown;
  season: string | null;
  seed: number;
  houseName: string;
}

export interface LiveGame {
  /** Shout my current position to everyone else in the game. */
  send: (state: Omit<LivePlayer, 'id'>) => void;
  /** Bonk another player with your sword — tells just them, with where you hit from. */
  hit: (targetId: string, name: string, at: { x: number; z: number }) => void;
  /** Host-only: broadcast the shared enemies (e.g. the housekeepers) so everyone sees the same ones. */
  sendKeepers: (data: unknown) => void;
  /** Knock on a player's door to ask to come into their house. */
  knock: (targetId: string, fromName: string) => void;
  /** Welcome a guest in: hand them your house so they can walk around your build. */
  welcome: (guestId: string, house: HouseGift) => void;
  /** Turn a guest away politely. */
  turnAway: (guestId: string, fromName: string) => void;
  /** Leave: tell others I'm gone and close the channel. */
  leave: () => void;
}

/** Drop a player we have not heard from in this long (tab closed, signal lost). */
const STALE_MS = 4000;

/**
 * Live multiplayer positions over Supabase Realtime "broadcast" — no database
 * rows, just a fast message bus. Every player sends their position several
 * times a second; `onPeers` fires with the fresh list of *other* players
 * whenever it changes. Because the house layout is identical for everyone, a
 * position from one player lands in the exact same room for everyone else — so
 * what you see really is where they are, not a bot pretending.
 */
export function joinLiveGame(
  game: string,
  selfId: string,
  onPeers: (peers: LivePlayer[]) => void,
  onHit?: (fromId: string, fromName: string, at: { x: number; z: number }) => void,
  onKeepers?: (data: unknown) => void,
  onKnock?: (fromId: string, fromName: string) => void,
  onWelcome?: (fromName: string, house: HouseGift) => void,
  onTurnAway?: (fromName: string) => void,
): LiveGame {
  const channel: RealtimeChannel = supabase.channel(`live-${game}`, {
    config: { broadcast: { self: false } },
  });
  const peers = new Map<string, { player: LivePlayer; at: number }>();
  const emit = () => onPeers([...peers.values()].map((entry) => entry.player));

  channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
    const player = payload as LivePlayer;
    if (!player?.id || player.id === selfId) return;
    peers.set(player.id, { player, at: Date.now() });
    emit();
  });
  channel.on('broadcast', { event: 'bye' }, ({ payload }) => {
    const id = (payload as { id?: string })?.id;
    if (id && peers.delete(id)) emit();
  });
  channel.on('broadcast', { event: 'hit' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; target?: string; x?: number; z?: number };
    if (p?.target === selfId && p.from && onHit) onHit(p.from, p.name ?? 'someone', { x: p.x ?? 0, z: p.z ?? 0 });
  });
  channel.on('broadcast', { event: 'keepers' }, ({ payload }) => {
    const p = payload as { from?: string; data?: unknown };
    if (p?.from !== selfId && onKeepers) onKeepers(p.data);
  });
  channel.on('broadcast', { event: 'knock' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; target?: string };
    if (p?.target === selfId && p.from && onKnock) onKnock(p.from, p.name ?? 'someone');
  });
  channel.on('broadcast', { event: 'welcome' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; target?: string; house?: HouseGift };
    if (p?.target === selfId && p.house && onWelcome) onWelcome(p.name ?? 'a friend', p.house);
  });
  channel.on('broadcast', { event: 'turnaway' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; target?: string };
    if (p?.target === selfId && onTurnAway) onTurnAway(p.name ?? 'a friend');
  });
  channel.subscribe();

  // Sweep out anyone who went quiet, so leaving clears them within a moment.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    peers.forEach((entry, id) => { if (entry.at < cutoff) { peers.delete(id); changed = true; } });
    if (changed) emit();
  }, 1000);

  return {
    send: (state) => {
      channel.send({ type: 'broadcast', event: 'pos', payload: { ...state, id: selfId } });
    },
    hit: (targetId, name, at) => {
      channel.send({ type: 'broadcast', event: 'hit', payload: { from: selfId, name, target: targetId, x: at.x, z: at.z } });
    },
    sendKeepers: (data) => {
      channel.send({ type: 'broadcast', event: 'keepers', payload: { from: selfId, data } });
    },
    knock: (targetId, fromName) => {
      channel.send({ type: 'broadcast', event: 'knock', payload: { from: selfId, name: fromName, target: targetId } });
    },
    welcome: (guestId, house) => {
      channel.send({ type: 'broadcast', event: 'welcome', payload: { from: selfId, name: house.name, target: guestId, house } });
    },
    turnAway: (guestId, fromName) => {
      channel.send({ type: 'broadcast', event: 'turnaway', payload: { from: selfId, name: fromName, target: guestId } });
    },
    leave: () => {
      clearInterval(sweep);
      channel.send({ type: 'broadcast', event: 'bye', payload: { id: selfId } });
      supabase.removeChannel(channel);
    },
  };
}
