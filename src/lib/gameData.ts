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
  const { data, error } = await supabase.from('safe_leaderboard').select('*').order('rank').limit(20);
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

export async function saveLevelProgress(userId: string, score: number, coins: number) {
  const { error } = await supabase.from('game_progress').upsert({
    user_id: userId, island: 1, level: 1, highest_floor: 10,
    coins_collected: coins, score, completed: true,
  }, { onConflict: 'user_id,island,level' });
  if (error) throw error;
}
