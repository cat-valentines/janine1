import type { CharacterId, SettingId } from '../game/types';

export interface LocalProfile {
  character: CharacterId; setting: SettingId; foodBalance: number;
  shopCoins: number; ownedItems: string[];
  equippedItem: string;
  ownsHouse: boolean; placedFurniture: string[];
}

const fallback: LocalProfile = { character: 'cottontail', setting: 'haunted', foodBalance: 24, shopCoins: 24, ownedItems: [], equippedItem: '', ownsHouse: false, placedFurniture: [] };

export function loadLocalProfile(): LocalProfile {
  try {
    const saved = JSON.parse(localStorage.getItem('house-quest-profile') ?? '') as Partial<LocalProfile>;
    return { ...fallback, ...saved, ownedItems: Array.isArray(saved.ownedItems) ? saved.ownedItems : [], placedFurniture: Array.isArray(saved.placedFurniture) ? saved.placedFurniture : [] };
  } catch { return fallback; }
}

export function saveLocalProfile(profile: LocalProfile) {
  localStorage.setItem('house-quest-profile', JSON.stringify(profile));
}
