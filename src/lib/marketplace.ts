import { supabase } from './supabase';

export type CollectibleType = 'carrot' | 'fish' | 'bone';

export interface MarketListing {
  id: string; seller_name: string; collectible_type: CollectibleType;
  quantity: number; price: number; created_at: string;
}

export async function loadMarketListings() {
  const { data, error } = await supabase.from('marketplace_listings')
    .select('id,seller_name,collectible_type,quantity,price,created_at')
    .eq('status', 'active').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as MarketListing[];
}

export async function createMarketListing(userId: string, type: CollectibleType) {
  const { error } = await supabase.from('marketplace_listings').insert({
    seller_id: userId, seller_name: 'Island Player', collectible_type: type, quantity: 5, price: 10,
  });
  if (error) throw error;
}
