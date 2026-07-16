import { supabase } from './supabase';
import type { GameSelection } from '../game/types';

export interface PlayerProfile {
  user_id: string; display_name: string; selected_character: string; selected_house: string;
  current_level: number; current_island: number; coins: number; total_score: number;
}

export interface LeaderboardRow {
  display_name: string; score: number; level: number; rank: number;
}

export async function saveProfile(userId: string, name: string, selection: GameSelection) {
  const { error } = await supabase.from('player_profiles').upsert({
    user_id: userId, display_name: name, selected_character: selection.character,
    selected_house: selection.setting,
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function updateProfileSelection(userId: string, selection: GameSelection) {
  const { error } = await supabase.from('player_profiles').update({
    selected_character: selection.character, selected_house: selection.setting,
  }).eq('user_id', userId);
  if (error) throw error;
}

export async function loadLeaderboard() {
  const { data, error } = await supabase.from('safe_leaderboard').select('*').order('rank').order('score', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

/**
 * Records a finished run against the account, which is what puts a player on
 * the leaderboard. Keeps your best score, not your latest.
 */
export async function recordScore(score: number, level: number) {
  const { error } = await supabase.rpc('record_score', { new_score: score, new_level: level });
  if (error) throw error;
}

export interface PlayDay { streak: number; longest_streak: number; days_played: number; last_played: string | null }

/** Counts today as a day played, on the server's clock. Returns the new streak. */
export async function recordPlayDay() {
  const { data, error } = await supabase.rpc('record_play_day');
  if (error) throw error;
  const rows = (data ?? []) as PlayDay[];
  return rows[0] ?? null;
}

/**
 * Real signed-up players, newest scores first, for the rivals you face in the
 * forest. Readable signed out too — safe_leaderboard is a public view of
 * finished accounts, and never exposes anything private.
 */
export async function loadRivalNames(count: number) {
  const { data, error } = await supabase.from('safe_leaderboard')
    .select('display_name').order('rank').limit(count);
  if (error) return [];
  return (data ?? []).map((row) => (row as { display_name: string }).display_name);
}

export async function saveLevelProgress(userId: string, score: number, coins: number) {
  const { error } = await supabase.from('game_progress').upsert({
    user_id: userId, island: 1, level: 1, highest_floor: 10,
    coins_collected: coins, score, completed: true,
  }, { onConflict: 'user_id,island,level' });
  if (error) throw error;
}
