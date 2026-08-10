import type { Animal, Plot } from '../game/building';
import type { Furniture } from '../game/voxel';
import type { Season } from '../game/terrain';
import type { CharacterId, SettingId } from '../game/types';
import { storage } from './storage';

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
  /** Daily streak, kept here for guests and as a fallback when offline. */
  streak: number;
  daysPlayed: number;
  lastPlayed: string;
  /** How the house was obtained, so the page knows what to show. */
  houseSource: '' | 'built' | 'bought';
  houseName: string;
  garden: Array<Plot | null>;
  animals: Animal[];
  /** Apples foraged and stored in your house, to eat later. */
  applePantry: number;
  /** Jewels mined from the caves, kept in your box until you sell them. */
  jewels: number;
  /** Wood chopped from trees, spent building wooden blocks. */
  wood: number;
  /** Bought a ladder, so you can reach the apples up in the trees. */
  hasLadder: boolean;
  /** Meat taken from your farm animals, to cook in the kitchen. */
  meat: number;
}

const fallback: LocalProfile = { character: 'cottontail', setting: 'haunted', foodBalance: 24, shopCoins: 24, ownedItems: [], equippedItem: '', ownsHouse: false, placedFurniture: [], accessory: '', completedQuests: 0, isMember: false, realName: '', birthday: '', country: '', houseWorld: '', houseFurniture: [], houseSeason: '', houseSeed: 0, characterChosen: false, supplies: {}, riddleLevel: 1, streak: 0, daysPlayed: 0, lastPlayed: '', houseSource: '', houseName: '', garden: [], animals: [], applePantry: 0, jewels: 0, wood: 0, hasLadder: false, meat: 0 };

export function loadLocalProfile(): LocalProfile {
  try {
    const saved = JSON.parse(storage.get('house-quest-profile') ?? '') as Partial<LocalProfile>;
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
  storage.set('house-quest-profile', JSON.stringify(profile));
}
