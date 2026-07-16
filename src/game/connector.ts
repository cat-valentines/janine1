export const COLS = 6;
export const ROWS = 8;
export const CELL = 60;
export const GAP = 9;
export const VIEW_W = COLS * CELL + (COLS + 1) * GAP;
export const VIEW_H = ROWS * CELL + (ROWS + 1) * GAP;

/** New blocks are always small, weighted low, so the board keeps refilling. */
const SPAWN = [2, 2, 2, 2, 4, 4, 8];
export const spawnValue = () => SPAWN[Math.floor(Math.random() * SPAWN.length)];

/**
 * A bright rainbow: every number is its own colour, so the board reads at a
 * glance. [background, text] — dark text on the pale yellows, white elsewhere.
 */
const palette: Record<number, [string, string]> = {
  2: ['#ff6b6b', '#ffffff'],   // coral
  4: ['#ff9f43', '#ffffff'],   // orange
  8: ['#feca57', '#5b4a1e'],   // yellow
  16: ['#26de81', '#ffffff'],  // green
  32: ['#00d2d3', '#ffffff'],  // cyan
  64: ['#54a0ff', '#ffffff'],  // blue
  128: ['#5f6dff', '#ffffff'], // indigo
  256: ['#a55eea', '#ffffff'], // violet
  512: ['#ff6ec7', '#ffffff'], // pink
  1024: ['#ffd32a', '#5b4a1e'],// gold
  2048: ['#ff3f34', '#ffffff'],// bright red
};
export const colourFor = (value: number): [string, string] => palette[value] ?? ['#2f3542', '#ffffff'];

/** The dark board the bright blocks sit on, and the empty-slot colour. */
export const BOARD_BG = '#241f3a';
export const SLOT_BG = '#332d52';

export interface Cell { c: number; r: number }

/** Two cells touch if they are within one step in any of the eight directions. */
export const adjacent = (a: Cell, b: Cell) =>
  Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1 && !(a.c === b.c && a.r === b.r);

/**
 * Is there any valid connect left?
 *
 * A move is two touching blocks with the same number. When no two neighbours
 * are equal anywhere on the board, no chain can be made and the game is over.
 */
export function hasMove(grid: number[][]) {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const v = grid[r][c];
      if (!v) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (grid[nr][nc] === v) return true;
      }
    }
  }
  return false;
}

export const SCORE_PER_MERGE = 1;
