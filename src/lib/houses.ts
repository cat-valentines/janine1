import { supabase } from './supabase';

import type { Furniture } from '../game/voxel';
import type { Season } from '../game/terrain';

export interface SavedHouse {
  house_world: string | null;
  house_furniture: Furniture[];
  house_name: string | null;
  house_season: Season | null;
  house_seed: number;
}

/** The player's own house, kept on their account so it survives logging out. */
export async function loadMyHouse(userId: string) {
  const { data, error } = await supabase.from('player_profiles')
    .select('house_world, house_furniture, house_name, house_season, house_seed')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as SavedHouse | null;
}

export async function saveMyHouse(userId: string, house: Partial<SavedHouse>) {
  const { error } = await supabase.from('player_profiles').update(house).eq('user_id', userId);
  if (error) throw error;
}

export interface MarketHouse {
  id: string; seller_id: string; seller_name: string;
  name: string; blurb: string; grid: string; price: number;
}

/** Houses real players put up for sale. Never includes your own listings. */
export async function loadHouseMarket() {
  const { data, error } = await supabase.rpc('house_market');
  if (error) throw error;
  return (data ?? []) as MarketHouse[];
}

export async function listMyHouse(sellerId: string, house: { name: string; blurb: string; grid: string; price: number }) {
  const { error } = await supabase.from('house_listings').insert({ seller_id: sellerId, ...house });
  if (error) throw error;
}

/** Claims the listing and returns its blocks. Throws if someone else got it first. */
export async function buyHouse(listingId: string) {
  const { data, error } = await supabase.rpc('buy_house', { listing: listingId });
  if (error) throw error;
  return data as string;
}
