/**
 * The housekeeper's house, drawn as a grid.
 *
 * #  wall              .  floor
 * K  a key             H  a wardrobe to hide in
 * B  a bed to hide under   C  a creaky floorboard
 * D  the front door — the way out
 * P  the bedroom you wake up in
 */
export const LAYOUT = [
  '####################',
  '#........#.........#',
  '#..H.....#....K....#',
  '#........#....C....#',
  '#....#####....#....#',
  '#..B.#........#..B.#',
  '#....#....H...#....#',
  '#....C....#####....#',
  '#####.#............#',
  '#.....#....K...#####',
  '#..K..#...C....#...#',
  '#.....#....H...#.P.#',
  '#.....##########...#',
  '#....B.............#',
  '#########D##########',
];

export const COLS = LAYOUT[0].length;
export const ROWS = LAYOUT.length;
/** How many world units one grid square is. */
export const CELL = 3.4;
export const WALL_H = 3.4;

export const cellAt = (col: number, row: number) =>
  col < 0 || row < 0 || col >= COLS || row >= ROWS ? '#' : LAYOUT[row][col];

export const isWall = (col: number, row: number) => cellAt(col, row) === '#';

/** Grid square -> world centre. */
export const worldOf = (col: number, row: number) => ({ x: (col + 0.5) * CELL, z: (row + 0.5) * CELL });
/** World point -> grid square. */
export const colOf = (x: number) => Math.floor(x / CELL);
export const rowOf = (z: number) => Math.floor(z / CELL);

export interface Spot { col: number; row: number }

function find(mark: string): Spot[] {
  const spots: Spot[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (LAYOUT[row][col] === mark) spots.push({ col, row });
    }
  }
  return spots;
}

export type HideKind = 'wardrobe' | 'bed';
export interface HideSpot extends Spot { kind: HideKind }

export const keySpots = find('K');
/** Wardrobes to climb into, and beds to slide under. */
export const hideSpots: HideSpot[] = [
  ...find('H').map((spot) => ({ ...spot, kind: 'wardrobe' as const })),
  ...find('B').map((spot) => ({ ...spot, kind: 'bed' as const })),
];
/** Floorboards that groan. Tread on one at a run and she comes looking. */
export const creakySpots = find('C');
export const doorSpot = find('D')[0];
export const startSpot = find('P')[0];

export const KEYS_TO_ESCAPE = keySpots.length;

/** Anything that is not a wall can be walked on. */
export const isFloor = (col: number, row: number) => !isWall(col, row);

export const PLAYER_RADIUS = 0.42;
export const PLAYER_EYE = 1.6;
export const PLAYER_SPEED = 4.4;
export const SNEAK_SPEED = 2.1;
export const TURN_SPEED = 2.3;

/** The housekeeper. Slower than you when you run — but she never gets tired. */
export const KEEPER_PATROL_SPEED = 2.2;
export const KEEPER_CHASE_SPEED = 4.1;
/** How far she can see, and how wide. */
export const KEEPER_SIGHT = 16;
export const KEEPER_FOV = 1.15;
/** She grabs you inside this. */
export const KEEPER_REACH = 1.25;
/** How long she keeps looking after losing you. */
export const KEEPER_SEARCH_SECONDS = 8;
/** Running is loud: she hears it from this far, even without seeing you. */
export const KEEPER_HEARING = 7;
export const HIDE_DISTANCE = 1.6;

/** Nights you get. She catches you, you wake up — until you run out. */
export const DAYS = 5;
/** How close she has to get to a hiding place she saw you use. */
export const SEARCH_HIDE_DISTANCE = 1.9;
