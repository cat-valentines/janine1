import type { Animal, Plot } from '../game/building';
import type { Furniture } from '../game/voxel';
import type { Season } from '../game/terrain';
import type { CharacterId, SettingId } from '../game/types';

export interface LocalProfile {
  character: CharacterId; setting: SettingId; foodBalance: number;
  shopCoins: number; ownedItems: string[];
  equippedItem: string;
  ownsHouse: boolean; placedFurniture: string[];
  accessory: string; completedQuests: number; isMember: boolean;
  /** Private details. Stay on this device unless the player is signed in. */
  realName: string; birthday: string; country: string;
  /** The 3D house: SX*SY*SZ chars, one per voxel. '' until they start. */
  houseWorld: string;
  /** Furniture placed inside the 3D house. */
  houseFurniture: Furniture[];
  /** Chosen season; '' means follow the real calendar. */
  houseSeason: Season | '';
  /** Fixed per player so their landscape regenerates identically forever. */
  houseSeed: number;
  /** False until a first-time player picks a character in their profile. */
  characterChosen: boolean;
  /** Everything foraged in the forest, saved the moment it is picked up. */
  supplies: Record<string, number>;
  /** Highest riddle level reached, so you carry on where you left off. */
  riddleLevel: number;
  /** How the house was obtained, so the page knows what to show. */
  houseSource: '' | 'built' | 'bought';
  houseName: string;
  garden: Array<Plot | null>;
  animals: Animal[];
}

const fallback: LocalProfile = { character: 'cottontail', setting: 'haunted', foodBalance: 24, shopCoins: 24, ownedItems: [], equippedItem: '', ownsHouse: false, placedFurniture: [], accessory: '', completedQuests: 0, isMember: false, realName: '', birthday: '', country: '', houseWorld: '', houseFurniture: [], houseSeason: '', houseSeed: 0, characterChosen: false, supplies: {}, riddleLevel: 1, houseSource: '', houseName: '', garden: [], animals: [] };

export function loadLocalProfile(): LocalProfile {
  try {
    const saved = JSON.parse(localStorage.getItem('house-quest-profile') ?? '') as Partial<LocalProfile>;
    return {
      ...fallback, ...saved,
      ownedItems: Array.isArray(saved.ownedItems) ? saved.ownedItems : [],
      placedFurniture: Array.isArray(saved.placedFurniture) ? saved.placedFurniture : [],
      garden: Array.isArray(saved.garden) ? saved.garden : [],
      animals: Array.isArray(saved.animals) ? saved.animals : [],
      houseFurniture: Array.isArray(saved.houseFurniture) ? saved.houseFurniture : [],
      supplies: (saved.supplies && typeof saved.supplies === 'object') ? saved.supplies : {},
      // A seed of 0 means "never generated" — mint one and keep it forever.
      houseSeed: saved.houseSeed || Math.floor(Math.random() * 100000) + 1,
    };
  } catch { return { ...fallback, houseSeed: Math.floor(Math.random() * 100000) + 1 }; }
}

export function saveLocalProfile(profile: LocalProfile) {
  localStorage.setItem('house-quest-profile', JSON.stringify(profile));
}
