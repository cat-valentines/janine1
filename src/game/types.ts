export type CharacterId = 'cottontail' | 'momo' | 'toby' | 'ollie' | 'coral' | 'biscuit' | 'koala' | 'teddy' | 'panda' | 'tiger' | 'piggy' | 'parrot' | 'mila' | 'gabby' | 'amsaal' | 'misha';
export type SettingId = 'haunted' | 'secret' | 'power';
export type Direction = 'left' | 'right';

export interface GameSelection {
  character: CharacterId;
  setting: SettingId;
  equippedItem?: string;
}

export interface Position {
  floor: number;
  x: number;
}

export interface Cat extends Position {
  /** Floors can hold several cats, so they need their own key. */
  id: string;
  direction: Direction;
  speed: number;
}

/** A brick wall. Stand behind one and the laser cannot reach you. */
export interface Wall extends Position {}

/** A hidden power, tucked somewhere in the tower for you to find. */
export type SecretKind = 'heart' | 'double' | 'invisible';
export interface Secret extends Position { id: string; kind: SecretKind }

/**
 * A sweeping laser, like the ones in Mousy: it warns, then fires across the
 * whole floor. The only safe place is tucked behind a brick wall.
 */
export interface Laser {
  floor: number;
  /** Seconds offset, so floors do not all fire at once. */
  phase: number;
}

export interface Ladder {
  floor: number;
  x: number;
  startX: number;
  direction: Direction;
  speed: number;
}

export interface LevelLayout {
  ladders: Ladder[];
  coins: Position[];
  goldCoins: Position[];
  cats: Cat[];
  walls: Wall[];
  lasers: Laser[];
  secrets: Secret[];
  powerUp: Position | null;
}

export interface GameState {
  player: Position;
  cats: Cat[];
  /** Seconds since the level started. The lasers run off this. */
  time: number;
  coins: Position[];
  goldCoins: Position[];
  powerUp: Position | null;
  /** Appears where the star was collected, and sparkles until used. */
  magicDoor: Position | null;
  score: number;
  lives: number;
  invincibleUntil: number;
  caughtUntil: number;
  /** Set when a laser is what hit you, so the tip can say so. */
  zappedUntil: number;
  secrets: Secret[];
  /** While this lasts nothing can touch you — not cats, not lasers. */
  invisibleUntil: number;
  /** Found the double-coins power: every coin from here on is worth two. */
  doubled: boolean;
  /** The extra gold the doubler has earned, on top of the coins picked up. */
  goldBonus: number;
  /** What the last secret did, for the tip line. */
  secretNote: string;
  secretUntil: number;
  status: 'playing' | 'won' | 'lost';
}
