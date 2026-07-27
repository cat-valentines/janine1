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

export interface WorldTheme {
  /** Sky gradient, top → bottom. */
  skyTop: string; skyBottom: string;
  fog: string; ambient: string; sun: string;
  ground: string; groundDark: string;
  trunk: string; foliage1: string; foliage2: string;
  rock: string; water: string; waterFoam: string;
  glow: string;               // stars, sparkles, magical light
  caveWall: string; caveGlow: string;
  night: boolean;             // dim the sun for twilight biomes
  trinket: string;            // the themed ground collectible emoji
  trinketName: string;
  sparkle: string;            // drifting-particle emoji flavour
  flavour: string;            // one-line description shown on the start card
}

/** A magical-forest palette for each of the six island families. */
export const THEME_BY_BIOME: Record<BiomeId, WorldTheme> = {
  mosslight: {
    skyTop: '#6fc9ff', skyBottom: '#d8f6e6', fog: '#c6efe0', ambient: '#a7dcc6', sun: '#fff3c4',
    ground: '#6fbf6a', groundDark: '#4f9e57', trunk: '#7b5330', foliage1: '#4fae57', foliage2: '#83d36a',
    rock: '#8a9a86', water: '#4fc6d6', waterFoam: '#eafcff', glow: '#ffe45e',
    caveWall: '#2b3b46', caveGlow: '#6ff0d0', night: false,
    trinket: '🍄', trinketName: 'glow-mushroom', sparkle: '🌿', flavour: 'A bright mossy wood full of glow-mushrooms.',
  },
  moonberry: {
    skyTop: '#2a2350', skyBottom: '#6b4a8f', fog: '#4a3a6e', ambient: '#7a6aac', sun: '#ffd0f0',
    ground: '#3f4f7a', groundDark: '#2f3d63', trunk: '#4a3560', foliage1: '#7a4fae', foliage2: '#a86fd0',
    rock: '#55607f', water: '#6f7fe0', waterFoam: '#d8e0ff', glow: '#ff8fe0',
    caveWall: '#241a3b', caveGlow: '#b06ff0', night: true,
    trinket: '🫐', trinketName: 'moonberry', sparkle: '✨', flavour: 'A twilight grove glowing with ripe moonberries.',
  },
  willowwish: {
    skyTop: '#bfe0ff', skyBottom: '#eef3e8', fog: '#e0e8dd', ambient: '#cfd8c4', sun: '#fff6d8',
    ground: '#86b978', groundDark: '#6a9c62', trunk: '#8a6b4a', foliage1: '#8fc27a', foliage2: '#c6dca0',
    rock: '#9aa495', water: '#7fd0c0', waterFoam: '#eafff8', glow: '#dff08f',
    caveWall: '#38403a', caveGlow: '#9ff0c0', night: false,
    trinket: '🌸', trinketName: 'wish-petal', sparkle: '🍃', flavour: 'A misty willow grove where wishes drift on the breeze.',
  },
  honeyfern: {
    skyTop: '#ffd98f', skyBottom: '#fff2d0', fog: '#ffe6b8', ambient: '#ffd9a0', sun: '#fff0c0',
    ground: '#c7ab55', groundDark: '#a88a3d', trunk: '#8a5a30', foliage1: '#b7a84f', foliage2: '#e0cf6a',
    rock: '#b8a06a', water: '#f0b84f', waterFoam: '#fff0c0', glow: '#ffe45e',
    caveWall: '#4a3a20', caveGlow: '#ffcf6f', night: false,
    trinket: '🍯', trinketName: 'honey-drop', sparkle: '🐝', flavour: 'A warm honey meadow humming with golden light.',
  },
  cloudcap: {
    skyTop: '#9fd0ff', skyBottom: '#eaf6ff', fog: '#dbeeff', ambient: '#cfe4ff', sun: '#ffffff',
    ground: '#bfe0e6', groundDark: '#9fc6d0', trunk: '#8a8f9a', foliage1: '#a0d8e0', foliage2: '#d6f2f8',
    rock: '#b0bcc8', water: '#8fd6ff', waterFoam: '#ffffff', glow: '#eaffff',
    caveWall: '#3a4650', caveGlow: '#bff0ff', night: false,
    trinket: '☁️', trinketName: 'cloud-puff', sparkle: '❄️', flavour: 'Pale sky highlands floating above the clouds.',
  },
  starling: {
    skyTop: '#14183a', skyBottom: '#3a2f6e', fog: '#2a2a55', ambient: '#6a6aa0', sun: '#fff0b0',
    ground: '#2f3560', groundDark: '#232a4d', trunk: '#3a3550', foliage1: '#4a5aa0', foliage2: '#6f8fd0',
    rock: '#46506e', water: '#5f7fe0', waterFoam: '#dfe8ff', glow: '#ffe45e',
    caveWall: '#1a1a38', caveGlow: '#8fd0ff', night: true,
    trinket: '✨', trinketName: 'stardust', sparkle: '⭐', flavour: 'A cosmic glade under a sky full of falling stars.',
  },
};

/** How many star-points each pickup is worth (loose stars are the bread & butter). */
export const STAR_VALUE = 25;      // each ⭐ floating in the world
export const TRINKET_VALUE = 40;   // each themed ground collectible
export const GEM_VALUE = 60;       // each crystal deep in the cave

export type QuestMetric = 'stars' | 'trinkets' | 'gems' | 'cave' | 'waterfall' | 'players';

export interface QuestDef {
  id: string;
  icon: string;
  label: string;
  goal: number;
  reward: number;    // bonus star-points when finished
  metric: QuestMetric;
}

/**
 * Themed quests per island. Same shape everywhere, but the wording and the
 * collectible change with the biome so each island reads differently.
 */
export function questsForBiome(biome: BiomeId): QuestDef[] {
  const t = THEME_BY_BIOME[biome];
  return [
    { id: 'stars', icon: '⭐', label: 'Collect 20 sky-stars', goal: 20, reward: 300, metric: 'stars' },
    { id: 'trinkets', icon: t.trinket, label: `Gather 10 ${t.trinketName}s`, goal: 10, reward: 250, metric: 'trinkets' },
    { id: 'cave', icon: '🕳️', label: 'Discover the crystal cave', goal: 1, reward: 250, metric: 'cave' },
    { id: 'gems', icon: '💎', label: 'Mine 8 cave crystals', goal: 8, reward: 400, metric: 'gems' },
    { id: 'waterfall', icon: '💧', label: 'Find the magical waterfall', goal: 1, reward: 200, metric: 'waterfall' },
    { id: 'players', icon: '👋', label: 'Meet a live explorer', goal: 1, reward: 150, metric: 'players' },
  ];
}
