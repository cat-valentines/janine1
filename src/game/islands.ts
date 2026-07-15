export type BiomeId = 'mosslight' | 'moonberry' | 'willowwish' | 'honeyfern' | 'cloudcap' | 'starling';

export interface Island {
  id: number;
  name: string;
  icon: string;
  biome: BiomeId;
  questsNeeded: number;
  membersOnly: boolean;
  /** Where the island sits on the ocean, in % of the map canvas. */
  x: number;
  y: number;
  /** Sprite width in % of the map canvas, so islands are not all identical. */
  size: number;
}

export const biomeAssets: Record<BiomeId, string> = {
  mosslight: '/assets/island-mosslight.png',
  moonberry: '/assets/island-moonberry.png',
  willowwish: '/assets/island-willowwish.png',
  honeyfern: '/assets/island-honeyfern.png',
  cloudcap: '/assets/island-cloudcap.png',
  starling: '/assets/island-starling.png',
};

/** height / width of each trimmed sprite — used to keep islands inside the ocean. */
export const biomeAspects: Record<BiomeId, number> = {
  mosslight: 0.785, moonberry: 0.868, willowwish: 1.056,
  honeyfern: 0.720, cloudcap: 0.877, starling: 0.725,
};

/** The .ocean-map box is 16/15, so 1% of width is this much of the height. */
export const MAP_RATIO = 16 / 15;

const families: Array<{ biome: BiomeId; name: string; icon: string }> = [
  { biome: 'mosslight', name: 'Mosslight', icon: '🌿' },
  { biome: 'moonberry', name: 'Moonberry', icon: '🫐' },
  { biome: 'willowwish', name: 'Willowwish', icon: '🌳' },
  { biome: 'honeyfern', name: 'Honeyfern', icon: '🍯' },
  { biome: 'cloudcap', name: 'Cloudcap', icon: '☁️' },
  { biome: 'starling', name: 'Starling', icon: '✨' },
];

const COLUMNS = 6;

/** Stable pseudo-random in -1..1 so islands scatter the same way on every load. */
function wobble(seed: number) {
  return (Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

export const islands: Island[] = Array.from({ length: 30 }, (_, index) => {
  const family = families[index % families.length];
  const row = Math.floor(index / COLUMNS);
  // Snake left-to-right, then right-to-left, so the trail reads as one voyage.
  const straight = index % COLUMNS;
  const column = row % 2 === 0 ? straight : COLUMNS - 1 - straight;
  // Spacing and jitter are kept tight enough that x + size and y + height both
  // stay under 100 for the widest sprite, so no island clips the ocean edge.
  return {
    id: index + 1,
    name: `${family.name} ${row + 1}`,
    icon: family.icon,
    biome: family.biome,
    // 10 quests on an island unlocks the next one.
    questsNeeded: index * 10,
    membersOnly: [10, 20, 30].includes(index + 1),
    x: 5 + column * 14.8 + wobble(index + 1) * 2.5,
    y: 4 + row * 18.4 + wobble(index + 7) * 2.5,
    size: 11 + Math.abs(wobble(index + 3)) * 3,
  };
});

/** Middle of an island sprite, in map %, for drawing the sailing route. */
export function islandCentre(item: Island) {
  return { cx: item.x + item.size / 2, cy: item.y + (item.size * MAP_RATIO * biomeAspects[item.biome]) / 2 };
}

export interface IslandGame { id: string; name: string; icon: string; blurb: string; prize: number }

/**
 * Games unlocked per island — the further you sail, the more there is to play.
 * Keyed by island id; islands with no entry just have the tower climb.
 */
const medicine: IslandGame = { id: 'medicine', name: 'Medicine Mission', icon: '🌿', blurb: 'Be the medicine cat. Find herbs, save lives.', prize: 60 };
const runner: IslandGame = { id: 'runner', name: 'Runner Up', icon: '🏃', blurb: 'Slide and jump the obstacle course. Grab coins.', prize: 0 };

const truck: IslandGame = { id: 'drive', name: 'Truck Trouble', icon: '🚚', blurb: 'Drive the obstacle course without flipping.', prize: 0 };

export const islandGames: Record<number, IslandGame[]> = {
  1: [medicine, runner],
  2: [medicine, runner],
  // Islands 10, 20 and 30 are members-only, so these are the Royal games.
  10: [medicine, runner, truck],
  20: [medicine, runner, truck],
  30: [medicine, runner, truck],
};

export const gamesForIsland = (id: number) => islandGames[id] ?? [];
