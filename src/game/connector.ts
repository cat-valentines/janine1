export const COLS = 6;
export const ROWS = 8;
export const CELL = 60;
export const GAP = 9;
export const VIEW_W = COLS * CELL + (COLS + 1) * GAP;
export const VIEW_H = ROWS * CELL + (ROWS + 1) * GAP;

/** New blocks are always small, weighted low, so the board keeps refilling. */
const SPAWN = [2, 2, 2, 2, 4, 4, 8];
export const spawnValue = () => SPAWN[Math.floor(Math.random() * SPAWN.length)];

/** 2048-style colours. Unknown (very big) values fall back to dark. */
const palette: Record<number, [string, string]> = {
  2: ['#eee4da', '#6f6559'], 4: ['#ede0c8', '#6f6559'],
  8: ['#f2b179', '#fff8f0'], 16: ['#f59563', '#fff8f0'],
  32: ['#f67c5f', '#fff8f0'], 64: ['#f65e3b', '#fff8f0'],
  128: ['#edcf72', '#fff8f0'], 256: ['#edcc61', '#fff8f0'],
  512: ['#edc850', '#fff8f0'], 1024: ['#edc53f', '#fff8f0'],
  2048: ['#edc22e', '#fff8f0'],
};
export const colourFor = (value: number): [string, string] => palette[value] ?? ['#3c3a32', '#ffffff'];

export interface Cell { c: number; r: number }

/** Two cells touch if they are within one step in any of the eight directions. */
export const adjacent = (a: Cell, b: Cell) =>
  Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1 && !(a.c === b.c && a.r === b.r);

/**
 * Is there any valid connect left?
 *
 * The smallest move is two touching blocks that are equal, or where one is
 * exactly double the other (start on the smaller, step up to the double). When
 * no such pair exists anywhere, no chain can be made and the game is over.
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
        const n = grid[nr][nc];
        if (!n) continue;
        if (v === n || v === n * 2 || n === v * 2) return true;
      }
    }
  }
  return false;
}

export const SCORE_PER_MERGE = 1;
