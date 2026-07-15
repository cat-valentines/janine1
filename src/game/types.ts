export type CharacterId = 'cottontail' | 'momo' | 'toby' | 'ollie' | 'coral' | 'biscuit';
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
  direction: Direction;
  speed: number;
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
  powerUp: Position | null;
}

export interface GameState {
  player: Position;
  cats: Cat[];
  coins: Position[];
  goldCoins: Position[];
  powerUp: Position | null;
  /** Appears where the star was collected, and sparkles until used. */
  magicDoor: Position | null;
  score: number;
  lives: number;
  invincibleUntil: number;
  caughtUntil: number;
  status: 'playing' | 'won' | 'lost';
}
