/**
 * Island World — the explorable 3-D island behind the old Escape Room.
 *
 * Every island wears its biome as a whole magical forest: Mosslight is a bright
 * mossy wood, Moonberry a twilight berry grove, and so on. You roam the island
 * collecting stars, doing themed quests, ducking into a crystal cave and finding
 * a waterfall — all toward the 5,000-star gate that opens the next island.
 */
import type { BiomeId } from './islands';

/** Stars needed on an island before the next one opens. */
export const STARS_PER_ISLAND = 5000;

/** Which island (1-based) you are exploring, from your running star total. */
export const islandFromStars = (total: number) => Math.min(30, Math.floor(Math.max(0, total) / STARS_PER_ISLAND) + 1);

/** Stars still to go before the next island opens. */
export const starsToNextIsland = (total: number) => STARS_PER_ISLAND - (Math.max(0, total) % STARS_PER_ISLAND);

export type TreeStyle = 'round' | 'pine' | 'willow' | 'mushroom' | 'crystal' | 'palm';

export interface WorldTheme {
  /** Sky gradient, top → bottom. */
  skyTop: string; skyBottom: string;
  fog: string; ambient: string; sun: string;
  ground: string; groundDark: string;
  dirt: string;               // under the grass — what a dug hole shows
  trunk: string; foliage1: string; foliage2: string;
  rock: string; water: string; waterFoam: string;
  glow: string;               // stars, sparkles, magical light
  caveWall: string; caveGlow: string;
  night: boolean;             // dim the sun for twilight biomes
  trinket: string;            // the themed ground collectible emoji
  trinketName: string;
  sparkle: string;            // drifting-particle emoji flavour
  treeStyle: TreeStyle;       // this biome's signature tree shape
  flower: string;             // little ground plants scattered around
  flavour: string;            // one-line description shown on the start card
}

/** A magical-forest palette for each of the six island families. */
export const THEME_BY_BIOME: Record<BiomeId, WorldTheme> = {
  mosslight: {
    skyTop: '#6fc9ff', skyBottom: '#d8f6e6', fog: '#c6efe0', ambient: '#a7dcc6', sun: '#fff3c4',
    ground: '#6fbf6a', groundDark: '#4f9e57', dirt: '#7a5636', trunk: '#7b5330', foliage1: '#4fae57', foliage2: '#83d36a',
    rock: '#8a9a86', water: '#4fc6d6', waterFoam: '#eafcff', glow: '#ffe45e',
    caveWall: '#2b3b46', caveGlow: '#6ff0d0', night: false,
    trinket: '🍄', trinketName: 'glow-mushroom', sparkle: '🌿', treeStyle: 'round', flower: '🌼', flavour: 'A bright mossy wood full of glow-mushrooms.',
  },
  moonberry: {
    skyTop: '#2a2350', skyBottom: '#6b4a8f', fog: '#4a3a6e', ambient: '#7a6aac', sun: '#ffd0f0',
    ground: '#3f4f7a', groundDark: '#2f3d63', dirt: '#2a2140', trunk: '#4a3560', foliage1: '#7a4fae', foliage2: '#a86fd0',
    rock: '#55607f', water: '#6f7fe0', waterFoam: '#d8e0ff', glow: '#ff8fe0',
    caveWall: '#241a3b', caveGlow: '#b06ff0', night: true,
    trinket: '🫐', trinketName: 'moonberry', sparkle: '✨', treeStyle: 'mushroom', flower: '🍄', flavour: 'A twilight grove glowing with ripe moonberries.',
  },
  willowwish: {
    skyTop: '#bfe0ff', skyBottom: '#eef3e8', fog: '#e0e8dd', ambient: '#cfd8c4', sun: '#fff6d8',
    ground: '#86b978', groundDark: '#6a9c62', dirt: '#6b5a3e', trunk: '#8a6b4a', foliage1: '#8fc27a', foliage2: '#c6dca0',
    rock: '#9aa495', water: '#7fd0c0', waterFoam: '#eafff8', glow: '#dff08f',
    caveWall: '#38403a', caveGlow: '#9ff0c0', night: false,
    trinket: '🌸', trinketName: 'wish-petal', sparkle: '🍃', treeStyle: 'willow', flower: '🌷', flavour: 'A misty willow grove where wishes drift on the breeze.',
  },
  honeyfern: {
    skyTop: '#ffd98f', skyBottom: '#fff2d0', fog: '#ffe6b8', ambient: '#ffd9a0', sun: '#fff0c0',
    ground: '#c7ab55', groundDark: '#a88a3d', dirt: '#7a5a2a', trunk: '#8a5a30', foliage1: '#b7a84f', foliage2: '#e0cf6a',
    rock: '#b8a06a', water: '#f0b84f', waterFoam: '#fff0c0', glow: '#ffe45e',
    caveWall: '#4a3a20', caveGlow: '#ffcf6f', night: false,
    trinket: '🍯', trinketName: 'honey-drop', sparkle: '🐝', treeStyle: 'palm', flower: '🌻', flavour: 'A warm honey meadow humming with golden light.',
  },
  cloudcap: {
    skyTop: '#9fd0ff', skyBottom: '#eaf6ff', fog: '#dbeeff', ambient: '#cfe4ff', sun: '#ffffff',
    ground: '#bfe0e6', groundDark: '#9fc6d0', dirt: '#8a9aa4', trunk: '#8a8f9a', foliage1: '#a0d8e0', foliage2: '#d6f2f8',
    rock: '#b0bcc8', water: '#8fd6ff', waterFoam: '#ffffff', glow: '#eaffff',
    caveWall: '#3a4650', caveGlow: '#bff0ff', night: false,
    trinket: '☁️', trinketName: 'cloud-puff', sparkle: '❄️', treeStyle: 'pine', flower: '💠', flavour: 'Pale sky highlands floating above the clouds.',
  },
  starling: {
    skyTop: '#14183a', skyBottom: '#3a2f6e', fog: '#2a2a55', ambient: '#6a6aa0', sun: '#fff0b0',
    ground: '#2f3560', groundDark: '#232a4d', dirt: '#1c2140', trunk: '#3a3550', foliage1: '#4a5aa0', foliage2: '#6f8fd0',
    rock: '#46506e', water: '#5f7fe0', waterFoam: '#dfe8ff', glow: '#ffe45e',
    caveWall: '#1a1a38', caveGlow: '#8fd0ff', night: true,
    trinket: '✨', trinketName: 'stardust', sparkle: '⭐', treeStyle: 'crystal', flower: '🌟', flavour: 'A cosmic glade under a sky full of falling stars.',
  },
};

/**
 * How many star-points each pickup is worth. Deliberately small so reaching
 * 5,000 is a real journey — you have to explore the endless island, dig, and
 * finish quests over several sessions, not clear one screen.
 */
export const STAR_VALUE = 5;       // each ⭐ floating in the world
export const TRINKET_VALUE = 8;    // each themed ground collectible
export const GEM_VALUE = 20;       // each crystal deep in the cave
export const BURIED_VALUE = 15;    // treasure you dig up out of the ground

export type QuestMetric = 'stars' | 'trinkets' | 'gems' | 'cave' | 'waterfall' | 'players' | 'dig' | 'explore';

export interface QuestDef {
  id: string;
  icon: string;
  label: string;
  goal: number;
  reward: number;    // bonus star-points when finished
  metric: QuestMetric;
}

/** A big pool of quest templates; each biome draws a different, themed slate. */
function questPool(t: WorldTheme): Record<string, QuestDef> {
  return {
    stars: { id: 'stars', icon: '⭐', label: 'Collect 40 sky-stars', goal: 40, reward: 200, metric: 'stars' },
    starsBig: { id: 'stars', icon: '⭐', label: 'Collect 60 sky-stars', goal: 60, reward: 300, metric: 'stars' },
    trinkets: { id: 'trinkets', icon: t.trinket, label: `Gather 20 ${t.trinketName}s`, goal: 20, reward: 220, metric: 'trinkets' },
    cave: { id: 'cave', icon: '🕳️', label: 'Discover the crystal cave', goal: 1, reward: 250, metric: 'cave' },
    gems: { id: 'gems', icon: '💎', label: 'Mine 12 cave crystals', goal: 12, reward: 350, metric: 'gems' },
    waterfall: { id: 'waterfall', icon: '💧', label: 'Find the hidden waterfall', goal: 1, reward: 200, metric: 'waterfall' },
    players: { id: 'players', icon: '👋', label: 'Meet a live explorer', goal: 1, reward: 200, metric: 'players' },
    dig: { id: 'dig', icon: '⛏️', label: 'Dig up 15 blocks of earth', goal: 15, reward: 250, metric: 'dig' },
    digBig: { id: 'dig', icon: '⛏️', label: 'Dig up 30 blocks of earth', goal: 30, reward: 400, metric: 'dig' },
    explore: { id: 'explore', icon: '🧭', label: 'Wander 300 steps from the shore', goal: 300, reward: 250, metric: 'explore' },
    exploreFar: { id: 'explore', icon: '🧭', label: 'Wander 500 steps into the wild', goal: 500, reward: 400, metric: 'explore' },
  };
}

/**
 * Themed quests per island. Every island draws a DIFFERENT slate from the pool
 * (and the wording follows the biome), so no two islands feel the same.
 */
export function questsForBiome(biome: BiomeId): QuestDef[] {
  const t = THEME_BY_BIOME[biome];
  const p = questPool(t);
  const slates: Record<BiomeId, QuestDef[]> = {
    mosslight: [p.stars, p.trinkets, p.dig, p.cave, p.gems, p.players],
    moonberry: [p.starsBig, p.trinkets, p.waterfall, p.explore, p.dig, p.gems],
    willowwish: [p.stars, p.trinkets, p.explore, p.waterfall, p.digBig, p.players],
    honeyfern: [p.starsBig, p.trinkets, p.dig, p.cave, p.exploreFar, p.gems],
    cloudcap: [p.stars, p.trinkets, p.explore, p.digBig, p.waterfall, p.players],
    starling: [p.starsBig, p.trinkets, p.exploreFar, p.cave, p.gems, p.dig],
  };
  return slates[biome];
}
