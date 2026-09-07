/**
 * "Tell me when someone wants to play."
 *
 * The chess lobby is often empty — two children have to be at the board at the
 * same moment for a live game to happen. So a player can leave a bell on, and
 * the app watches the lobby for them: the instant anybody else turns up looking
 * for a game, they get told and can go and play.
 *
 * It listens on the lobby channel rather than polling the database, because the
 * many players here who play as guests never appear in the database's live list
 * at all — but they do announce themselves in the lobby.
 */
import { supabase } from './supabase';
import { storage } from './storage';
import { askToNotify, notify } from './appNotify';
import type { RealtimeChannel } from '@supabase/supabase-js';

const KEY = 'chess-alert';
/** Don't nag: at most one alert about the same player this often. */
const REPEAT_MS = 10 * 60 * 1000;

export const chessAlertOn = (): boolean => storage.get(KEY) === '1';

/**
 * Turn the bell on or off. Turning it on also asks the browser for permission to
 * show a notification, so the player can be told even when the tab is in the
 * background — if they say no, the in-app banner still works.
 */
export async function setChessAlertOn(on: boolean): Promise<void> {
  storage.set(KEY, on ? '1' : '0');
  if (on) await askToNotify();
}

/** Show a real browser notification, if the player allowed them. */
export function notifyOutsideApp(title: string, body: string) {
  notify(title, body, 'chess-live');
}

/**
 * Watch the chess lobby for anyone looking for a game. Calls `onSomeone` with
 * their name, at most once per player per ten minutes. Returns a stop function.
 */
export function watchChessLobby(selfId: string, onSomeone: (name: string) => void): () => void {
  const told = new Map<string, number>();
  const channel: RealtimeChannel = supabase.channel('chess-lobby', { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'here' }, ({ payload }) => {
    const p = payload as { id?: string; name?: string };
    if (!p?.id || p.id === selfId) return;
    const last = told.get(p.id) ?? 0;
    if (Date.now() - last < REPEAT_MS) return;
    told.set(p.id, Date.now());
    onSomeone(p.name ?? 'A player');
  });
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}
