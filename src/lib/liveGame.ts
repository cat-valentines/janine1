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
  /** Scavenger co-op: the seed that decides where the one key is hidden. */
  seed?: number;
  /** Scavenger co-op: this player has found the key. */
  found?: boolean;
}

export interface LiveGame {
  /** Shout my current position to everyone else in the game. */
  send: (state: Omit<LivePlayer, 'id'>) => void;
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
    leave: () => {
      clearInterval(sweep);
      channel.send({ type: 'broadcast', event: 'bye', payload: { id: selfId } });
      supabase.removeChannel(channel);
    },
  };
}
