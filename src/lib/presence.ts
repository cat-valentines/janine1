import { supabase } from './supabase';
import type { FoundPlayer } from './players';

/** Tells the server you are in a game right now. Call it on a timer. */
export async function heartbeat(game: string) {
  try { await supabase.rpc('heartbeat', { game_id: game }); } catch { /* offline is fine */ }
}

/** Tells the server you have left, so you drop out of that game's live list. */
export async function leaveGame() {
  try { await supabase.rpc('leave_game'); } catch { /* offline is fine */ }
}

/** Real players who are actually in this game right now (fresh heartbeat). */
export async function playersInGame(game: string): Promise<FoundPlayer[]> {
  const { data, error } = await supabase.rpc('players_in_game', { game_id: game });
  if (error) return [];
  return (data ?? []) as FoundPlayer[];
}
