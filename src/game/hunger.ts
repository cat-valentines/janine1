export interface Weapon {
  id: string; name: string; icon: string; blurb: string;
  damage: number; reach: number; cooldown: number; colour: string;
}

/** Starting weapons offered on the first screen. */
export const weapons: Weapon[] = [
  { id: 'sword', name: 'Sword', icon: '🗡️', blurb: 'Quick swings, good all-rounder.', damage: 2, reach: 2.8, cooldown: 380, colour: '#cdd2da' },
  { id: 'axe', name: 'Battle Axe', icon: '🪓', blurb: 'Slow but hits very hard.', damage: 4, reach: 2.4, cooldown: 700, colour: '#9b7047' },
  { id: 'bow', name: 'Bow', icon: '🏹', blurb: 'Hit monsters from far away.', damage: 2, reach: 11, cooldown: 620, colour: '#b08752' },
  { id: 'spear', name: 'Spear', icon: '🔱', blurb: 'Long reach, keeps you safe.', damage: 3, reach: 4.2, cooldown: 520, colour: '#b6bcc4' },
];

export const magicWand: Weapon = {
  id: 'wand', name: 'Magic Wand', icon: '🪄', blurb: 'Sparkling magic from far away.',
  damage: 5, reach: 9, cooldown: 460, colour: '#c79bf0',
};

export const weaponById = (id: string) => id === 'wand' ? magicWand : weapons.find((w) => w.id === id);

export type PickupKind = 'heart' | 'weapon' | 'wand' | 'water' | 'tent' | 'blanket' | 'apple' | 'berry';

export interface PickupType { kind: PickupKind; name: string; icon: string; blurb: string }

export const pickupTypes: Record<PickupKind, PickupType> = {
  heart: { kind: 'heart', name: 'Extra Heart', icon: '❤️', blurb: 'One more heart!' },
  weapon: { kind: 'weapon', name: 'Better Weapon', icon: '⚔️', blurb: 'A stronger weapon!' },
  wand: { kind: 'wand', name: 'Magic Wand', icon: '🪄', blurb: 'Magic from far away!' },
  water: { kind: 'water', name: 'Water Bottle', icon: '💧', blurb: 'Water for your backpack.' },
  tent: { kind: 'tent', name: 'Tent', icon: '⛺', blurb: 'A tent for the night.' },
  blanket: { kind: 'blanket', name: 'Blanket', icon: '🧣', blurb: 'A warm blanket.' },
  apple: { kind: 'apple', name: 'Apple', icon: '🍎', blurb: 'A juicy apple — heals a heart!' },
  berry: { kind: 'berry', name: 'Berries', icon: '🫐', blurb: 'Sweet berries — heals a heart!' },
};

/** The three survival items the backpack is looking for. */
export const survivalKit: PickupKind[] = ['water', 'tent', 'blanket'];

export interface MobType {
  id: string; name: string; icon: string;
  hp: number; speed: number; damage: number;
  aggro: number; reach: number; cooldown: number;
  body: string; head: string; height: number;
}

export const mobTypes: Record<string, MobType> = {
  spider: { id: 'spider', name: 'Spider', icon: '🕷️', hp: 2, speed: 3.4, damage: 1, aggro: 16, reach: 1.5, cooldown: 1100, body: '#2f2438', head: '#4a3a58', height: 0.7 },
  zombie: { id: 'zombie', name: 'Zombie', icon: '🧟', hp: 4, speed: 1.7, damage: 1, aggro: 20, reach: 1.6, cooldown: 1400, body: '#4f7a46', head: '#6f9a63', height: 1.8 },
  rival: { id: 'rival', name: 'Player', icon: '🧍', hp: 5, speed: 2.6, damage: 1, aggro: 13, reach: 1.8, cooldown: 1200, body: '#8d5a8f', head: '#f2d0b4', height: 1.8 },
};

export type PowerId = 'fly' | 'teleport' | 'invisible';

export interface Power { id: PowerId; name: string; icon: string; key: string; blurb: string; cost: string }

/** Three magic powers, always available — magic is what limits them. */
export const powers: Power[] = [
  { id: 'fly', name: 'Flying', icon: '🕊️', key: '1', blurb: 'Rise up over the treetops and fly across the forest.', cost: 'uses magic while you fly' },
  { id: 'teleport', name: 'Teleport', icon: '✨', key: '2', blurb: 'Blink forwards in a flash, straight past trouble.', cost: '25 magic' },
  { id: 'invisible', name: 'Invisible', icon: '👻', key: '3', blurb: 'Vanish — nobody can hunt what they cannot see.', cost: '35 magic' },
];

/** Magic refills on its own, so a power is never gone for good. */
export const MAX_MAGIC = 100;
export const MAGIC_REGEN = 4;      // per second, while not spending
export const FLY_DRAIN = 7;        // per second, while flying
export const FLY_MIN = 10;         // magic needed to take off
export const FLY_HEIGHT = 9;       // blocks above the ground you hover
export const FLY_SPEED = 9;
export const TELEPORT_COST = 25;
export const TELEPORT_DIST = 8;
export const TELEPORT_COOLDOWN = 1.2;
export const INVISIBLE_COST = 35;
export const INVISIBLE_SECONDS = 8;

export const MAX_HEARTS = 6;
export const START_HEARTS = 3;
export const RIVAL_COUNT = 5;
export const WIN_PRIZE = 50;
/** Seconds of daylight, then the same again of night. */
export const DAY_SECONDS = 55;

export interface DayChallenge { title: string; blurb: string; spawn: string; count: number }

/** Every night brings a named challenge, so each day feels different. */
export const dayChallenges: DayChallenge[] = [
  { title: 'Spider Night', blurb: 'Spiders are crawling out of the trees!', spawn: 'spider', count: 5 },
  { title: 'Zombie Attack', blurb: 'A horde of zombies is coming for you!', spawn: 'zombie', count: 5 },
  { title: 'Hunting Party', blurb: 'The other players are hunting tonight.', spawn: 'rival', count: 2 },
  { title: 'Swarm Night', blurb: 'Spiders AND zombies. Stay near your tent!', spawn: 'spider', count: 7 },
];

export const challengeForDay = (day: number) => dayChallenges[(day - 1) % dayChallenges.length];
