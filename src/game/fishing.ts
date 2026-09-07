/**
 * Fishing Frenzy — the numbers and the rules, kept apart from the drawing.
 *
 * The whole game is one tug-of-war: the good fish live far out in the deep
 * water, but nothing you catch is worth a single coin until you have sailed it
 * all the way back to the shore and sold it. Stay out too long and the horn goes
 * with your hold still full, and you get nothing for any of it.
 *
 * Everything here is pure, so the bots and the tests can reason about the same
 * rules the player is playing by.
 */

export type Rarity = 'common' | 'good' | 'rare' | 'legendary';

export interface FishKind {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  /** Coins it sells for at the shore. */
  price: number;
  /** How far out it lives, 0 = at the shore, 1 = the far deep. */
  minDepth: number;
  /** 0–1. Rarer fish keep you waiting longer and give you less time to strike. */
  difficulty: number;
  /** How fast it swims about the sea. */
  speed: number;
}

export const FISH_KINDS: FishKind[] = [
  { id: 'sardine', name: 'Sardine', emoji: '🐟', rarity: 'common', price: 3, minDepth: 0, difficulty: 0.15, speed: 22 },
  { id: 'mackerel', name: 'Mackerel', emoji: '🐠', rarity: 'common', price: 5, minDepth: 0.05, difficulty: 0.2, speed: 26 },
  { id: 'crab', name: 'Crab', emoji: '🦀', rarity: 'common', price: 6, minDepth: 0, difficulty: 0.2, speed: 12 },
  { id: 'squid', name: 'Squid', emoji: '🦑', rarity: 'good', price: 12, minDepth: 0.3, difficulty: 0.34, speed: 30 },
  { id: 'puffer', name: 'Pufferfish', emoji: '🐡', rarity: 'good', price: 15, minDepth: 0.35, difficulty: 0.38, speed: 20 },
  { id: 'lobster', name: 'Lobster', emoji: '🦞', rarity: 'good', price: 18, minDepth: 0.4, difficulty: 0.4, speed: 14 },
  { id: 'turtle', name: 'Sea Turtle', emoji: '🐢', rarity: 'rare', price: 28, minDepth: 0.55, difficulty: 0.5, speed: 18 },
  { id: 'dolphin', name: 'Dolphin', emoji: '🐬', rarity: 'rare', price: 34, minDepth: 0.6, difficulty: 0.55, speed: 42 },
  { id: 'shark', name: 'Shark', emoji: '🦈', rarity: 'rare', price: 45, minDepth: 0.7, difficulty: 0.62, speed: 38 },
  { id: 'whale', name: 'Whale', emoji: '🐳', rarity: 'legendary', price: 80, minDepth: 0.85, difficulty: 0.72, speed: 16 },
  { id: 'kraken', name: 'Kraken', emoji: '🐙', rarity: 'legendary', price: 120, minDepth: 0.9, difficulty: 0.8, speed: 24 },
];

export const fishById = (id: string) => FISH_KINDS.find((f) => f.id === id);

export const RARITY_COLOUR: Record<Rarity, string> = {
  common: '#7ea8c4', good: '#5fa85f', rare: '#b06ad0', legendary: '#e0a13a',
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common', good: 'Good', rare: 'Rare', legendary: 'Legendary',
};

// ---- the sea --------------------------------------------------------------

/**
 * The sea, in metres. It runs from the shore (z = 0) out to the deep (z = SEA_D),
 * and SEA_W wide. The shore is where you sell; the far end is where the good
 * fish are.
 */
export const SEA_W = 150;
export const SEA_D = 150;
/** Closer to shore than this and you are at the dock, where the fish are sold. */
export const SHORE_Z = 12;
export const BOAT_SPEED = 15;
/** How fast the boat turns, in radians a second. */
export const TURN_SPEED = 2.1;
/** How many fish fit in the hold before you have to go and sell. */
export const HOLD_SIZE = 8;
/** How long a round lasts, in seconds. */
export const ROUND_SECONDS = 150;
/** How close a fish has to be for your line to tempt it. */
export const CAST_RANGE = 6.5;
/** How long a cast waits with nothing biting before you may as well reel in. */
export const CAST_PATIENCE = 7;

/** How deep the water is out there: 0 at the shore, 1 at the far end. */
export function depthAt(z: number): number {
  return Math.max(0, Math.min(1, (z - SHORE_Z) / (SEA_D - SHORE_Z)));
}

/** True when the boat is close enough to the dock to sell its catch. */
export const atShore = (z: number) => z <= SHORE_Z;

/** What a hold of fish is worth if you get it home. */
export function holdValue(hold: string[]): number {
  return hold.reduce((total, id) => total + (fishById(id)?.price ?? 0), 0);
}

/**
 * How long a fish takes to find your line, in seconds. A sardine is on it almost
 * at once; a kraken makes you wait. A little randomness stops it being a
 * metronome, so you have to actually watch the float.
 */
export function biteDelay(kind: FishKind, random = Math.random): number {
  const base = 0.7 + kind.difficulty * 2.6;
  return base + random() * 1.1;
}

/**
 * How long you have to strike once it bites. This is the whole skill of the
 * game: everybody can catch a sardine, but a kraken gives you barely half a
 * second, so the deep water is a real test of nerve.
 */
export function catchWindow(kind: FishKind): number {
  return Math.max(0.45, 1.5 - kind.difficulty * 1.2);
}

/** Did you strike in time? `since` is seconds since the fish bit. */
export function struckInTime(kind: FishKind, since: number): boolean {
  return since >= 0 && since <= catchWindow(kind);
}

/**
 * Which fish can live at this depth. Deeper water keeps the little ones around
 * too, so there is always something to catch — it just stops being worth the
 * trip once you are far out.
 */
export function fishForDepth(depth: number): FishKind[] {
  return FISH_KINDS.filter((kind) => depth >= kind.minDepth);
}

/**
 * Pick a fish to put in the sea at that depth, weighted so the rare ones stay
 * rare even where they live.
 */
export function rollFish(depth: number, random = Math.random): FishKind {
  const pool = fishForDepth(depth);
  const weightOf = (kind: FishKind) => ({ common: 100, good: 42, rare: 15, legendary: 4 })[kind.rarity];
  const total = pool.reduce((sum, kind) => sum + weightOf(kind), 0);
  let roll = random() * total;
  for (const kind of pool) {
    roll -= weightOf(kind);
    if (roll <= 0) return kind;
  }
  return pool[0] ?? FISH_KINDS[0];
}

// ---- deciding when to sail home ------------------------------------------

/**
 * A loaded boat is a slow boat. Every fish in the hold costs you a little
 * speed, so the greedier you get the longer the run home takes — which is the
 * whole decision the game is built on: one more fish, or get this lot sold?
 */
export function boatSpeed(holdCount: number): number {
  return BOAT_SPEED * Math.max(0.55, 1 - holdCount * 0.055);
}

/** Seconds to sail home from that far out, carrying that much. */
export const sailSeconds = (z: number, holdCount = 0) =>
  Math.max(0, (z - SHORE_Z) / boatSpeed(holdCount));

/**
 * Should a boat stop fishing and run for the shore? Yes when the hold is full,
 * and yes when there is only just enough time left to get home — losing a full
 * hold to the horn is the worst thing that can happen to you.
 */
export function shouldSailHome(hold: string[], z: number, secondsLeft: number): boolean {
  if (!hold.length) return false;
  if (hold.length >= HOLD_SIZE) return true;
  // Judged with the hold you are actually carrying, because that is what slows
  // you down — a heavy boat has to set off for home sooner.
  return secondsLeft <= sailSeconds(z, hold.length) + 2.5;
}

// ---- the animal skippers you race ----------------------------------------

export interface FishingBot {
  id: string;
  name: string;
  asset: string;
  emoji: string;
  difficulty: number;
  level: string;
  blurb: string;
  /** Chance of landing a fish on the reel bar. */
  skill: number;
  /** How fast their boat is, against yours. */
  speed: number;
  /** How far out they are brave enough to go, 0–1. */
  daring: number;
}

export const FISHING_BOTS: FishingBot[] = [
  {
    id: 'pip', name: 'Pip the Chick', asset: '/assets/pixel-pip.png', emoji: '🐣',
    difficulty: 1, level: 'Just learning', skill: 0.45, speed: 0.78, daring: 0.35,
    blurb: 'Pip paddles about near the shore and mostly catches sardines.',
  },
  {
    id: 'otter', name: 'Ollie the Otter', asset: '/assets/pixel-otter.png', emoji: '🦦',
    difficulty: 2, level: 'Easy', skill: 0.6, speed: 0.9, daring: 0.55,
    blurb: 'Ollie is a natural in the water but forgets to sail home in time.',
  },
  {
    id: 'penguin', name: 'Momo the Penguin', asset: '/assets/pixel-penguin.png', emoji: '🐧',
    difficulty: 3, level: 'Tricky', skill: 0.74, speed: 1, daring: 0.75,
    blurb: 'Momo fishes deep, fills the hold and heads straight back to sell.',
  },
  {
    id: 'seal', name: 'Melly the Seal', asset: '/assets/pixel-melly.png', emoji: '🦭',
    difficulty: 4, level: 'Champion', skill: 0.88, speed: 1.08, daring: 0.95,
    blurb: 'Melly goes for krakens and almost always lands them. Good luck.',
  },
];

export const fishingBotById = (id: string) => FISHING_BOTS.find((b) => b.id === id);

// ---- scoring --------------------------------------------------------------

export interface Standing { id: string; name: string; emoji: string; banked: number; hold: number; you: boolean }

/** The scoreboard: most money banked first, and ties broken by who is carrying less. */
export function standings(all: Standing[]): Standing[] {
  return [...all].sort((a, b) => b.banked - a.banked || a.hold - b.hold || a.name.localeCompare(b.name));
}

/** Coins the player actually keeps — what they banked, plus a winner's bonus. */
export function payout(banked: number, place: number, players: number): number {
  const bonus = players > 1 && place === 1 ? 25 : 0;
  return Math.round(banked / 4) + bonus;
}
