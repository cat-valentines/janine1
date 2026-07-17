/**
 * Scavenger — a cozy house you and your friends search together for the one key
 * that opens the locked front door. The house is drawn as a grid: a ring of
 * outer walls, interior walls that split it into nine warm little rooms, a
 * doorway between every neighbouring room, and one locked door to the outside.
 *
 * Furniture (cabinets, chests, wardrobes, beds…) stands in the corners of each
 * room. Some pieces can be searched — the key is hidden inside exactly one of
 * them. Which one is decided by a shared seed, so friends in the same match all
 * hunt the same key.
 */

export const COLS = 25;
export const ROWS = 19;

// ---- 3-D world sizing ------------------------------------------------------
export const CELL = 3.2;
export const WALL_H = 3.0;
export const PLAYER_EYE = 1.55;
export const PLAYER_RADIUS = 0.42;
export const PLAYER_SPEED = 4.6;
export const TURN_SPEED = 2.4;
/** How close (world units) you must be to a piece / the door to act. */
export const SEARCH_REACH = 2.6;

/** Grid square → world centre. */
export const worldOf = (col: number, row: number) => ({ x: (col + 0.5) * CELL, z: (row + 0.5) * CELL });
export const colOf = (x: number) => Math.floor(x / CELL);
export const rowOf = (z: number) => Math.floor(z / CELL);

/** Interior walls: these columns/rows are solid, cutting the house into rooms. */
const WALL_COLS = [8, 16];
const WALL_ROWS = [6, 12];
/** The rooms between those walls, as [start, end] inclusive cell ranges. */
const COL_BANDS: Array<[number, number]> = [[1, 7], [9, 15], [17, 23]];
const ROW_BANDS: Array<[number, number]> = [[1, 5], [7, 11], [13, 17]];

const mid = ([a, b]: [number, number]) => Math.floor((a + b) / 2);

export type FurnitureKind =
  | 'cabinet' | 'bookshelf' | 'chest' | 'wardrobe' | 'fridge' | 'bed' | 'sofa'
  | 'plant' | 'tv' | 'lamp';

interface Kind { kind: FurnitureKind; icon: string; label: string; search: boolean }

/** The cozy furniture set. `search: true` pieces can hide the key. */
export const KINDS: Kind[] = [
  { kind: 'cabinet', icon: '🗄️', label: 'cabinet', search: true },
  { kind: 'bookshelf', icon: '📚', label: 'bookshelf', search: true },
  { kind: 'chest', icon: '🧰', label: 'chest', search: true },
  { kind: 'wardrobe', icon: '🚪', label: 'wardrobe', search: true },
  { kind: 'fridge', icon: '🧊', label: 'fridge', search: true },
  { kind: 'bed', icon: '🛏️', label: 'bed', search: true },
  { kind: 'sofa', icon: '🛋️', label: 'sofa', search: true },
  { kind: 'plant', icon: '🪴', label: 'plant', search: false },
  { kind: 'tv', icon: '📺', label: 'TV', search: false },
  { kind: 'lamp', icon: '💡', label: 'lamp', search: false },
];

export interface Furniture {
  col: number;
  row: number;
  kind: FurnitureKind;
  icon: string;
  label: string;
  search: boolean;
}

export interface House {
  /** walls[row][col] — true is a solid wall. */
  walls: boolean[][];
  furniture: Furniture[];
  /** Indices into `furniture` of the pieces you can actually search. */
  searchable: number[];
  door: { col: number; row: number };
  approach: { col: number; row: number };
  spawn: { col: number; row: number };
}

/** Build the (always identical) cozy house. Only the key's hiding place varies. */
export function buildHouse(): House {
  const walls: boolean[][] = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) =>
      row === 0 || col === 0 || row === ROWS - 1 || col === COLS - 1 ||
      WALL_COLS.includes(col) || WALL_ROWS.includes(row)));

  // Punch a doorway through every interior wall so all nine rooms connect.
  WALL_COLS.forEach((wc) => ROW_BANDS.forEach((band) => { walls[mid(band)][wc] = false; }));
  WALL_ROWS.forEach((wr) => COL_BANDS.forEach((band) => { walls[wr][mid(band)] = false; }));

  // Furniture in the corners of each room — cozy, and never blocking a doorway.
  const furniture: Furniture[] = [];
  let n = 0;
  ROW_BANDS.forEach(([r0, r1]) => COL_BANDS.forEach(([c0, c1]) => {
    ([[c0, r0], [c1, r0], [c0, r1], [c1, r1]] as Array<[number, number]>).forEach(([col, row]) => {
      const k = KINDS[n % KINDS.length];
      n += 1;
      furniture.push({ col, row, kind: k.kind, icon: k.icon, label: k.label, search: k.search });
    });
  }));

  const searchable = furniture.map((f, i) => (f.search ? i : -1)).filter((i) => i >= 0);

  return {
    walls,
    furniture,
    searchable,
    door: { col: 12, row: ROWS - 1 },
    approach: { col: 12, row: ROWS - 2 },
    spawn: { col: 12, row: 9 },
  };
}

/** How many searchable pieces there are — the page needs it to place the key. */
export const SEARCHABLE_COUNT = buildHouse().searchable.length;

/** Seconds on the clock. Enough to search a cozy house, tight enough to sweat. */
export const TIME_LIMIT = 150;
