/**
 * Block Up — the block-blast rules.
 *
 * An 8×8 board. You get three block pieces at a time and drop them on the
 * grid; whenever a row or column is completely full it clears. When all three
 * pieces are used you get three more, and the game ends when not one of the
 * pieces you are holding can fit anywhere. Every shape has its own cute colour.
 */

export const BOARD = 8;

export interface Shape {
  cells: Array<[number, number]>; // [row, col] offsets, normalised to start at 0
  color: string;
}

/**
 * The bag of shapes, each a soft candy colour. Colours go by shape family so
 * the same shape always looks the same, the way Block Blast does it.
 */
export const SHAPES: Shape[] = [
  // dot
  { cells: [[0, 0]], color: '#ff8fab' },
  // dominoes
  { cells: [[0, 0], [0, 1]], color: '#4dabf7' },
  { cells: [[0, 0], [1, 0]], color: '#4dabf7' },
  // triominoes (lines)
  { cells: [[0, 0], [0, 1], [0, 2]], color: '#69db7c' },
  { cells: [[0, 0], [1, 0], [2, 0]], color: '#69db7c' },
  // 4-lines
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#ffd43b' },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#ffd43b' },
  // 5-lines
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], color: '#ffa94d' },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], color: '#ffa94d' },
  // 2×2 square
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#f783ac' },
  // 3×3 square
  { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], color: '#845ef7' },
  // little L corners (all four turns)
  { cells: [[0, 0], [1, 0], [1, 1]], color: '#4ecdc4' },
  { cells: [[0, 0], [0, 1], [1, 0]], color: '#4ecdc4' },
  { cells: [[0, 0], [0, 1], [1, 1]], color: '#4ecdc4' },
  { cells: [[0, 1], [1, 0], [1, 1]], color: '#4ecdc4' },
  // L-tetromino turns
  { cells: [[0, 0], [1, 0], [2, 0], [2, 1]], color: '#ff6b6b' },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 0]], color: '#ff6b6b' },
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#ff6b6b' },
  { cells: [[0, 2], [1, 0], [1, 1], [1, 2]], color: '#ff6b6b' },
  // J-tetromino turns
  { cells: [[0, 1], [1, 1], [2, 1], [2, 0]], color: '#5c7cfa' },
  { cells: [[0, 0], [1, 0], [1, 1], [1, 2]], color: '#5c7cfa' },
  { cells: [[0, 0], [0, 1], [1, 0], [2, 0]], color: '#5c7cfa' },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 2]], color: '#5c7cfa' },
  // T-tetromino turns
  { cells: [[0, 0], [0, 1], [0, 2], [1, 1]], color: '#e599f7' },
  { cells: [[0, 1], [1, 0], [1, 1], [2, 1]], color: '#e599f7' },
  { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: '#e599f7' },
  { cells: [[0, 0], [1, 0], [1, 1], [2, 0]], color: '#e599f7' },
  // S / Z
  { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: '#63e6be' },
  { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: '#ffa8a8' },
  // rectangles
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]], color: '#faa2c1' },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], color: '#faa2c1' },
];

/**
 * A gentle bag: small shapes appear more often than the big ones, so a run is
 * fun rather than brutal. Returns indices into SHAPES.
 */
const WEIGHTS = SHAPES.map((shape) => (shape.cells.length <= 2 ? 3 : shape.cells.length <= 3 ? 3 : shape.cells.length <= 4 ? 2 : 1));
const WEIGHT_TOTAL = WEIGHTS.reduce((sum, weight) => sum + weight, 0);

export function randomShape(): Shape {
  let roll = Math.random() * WEIGHT_TOTAL;
  for (let i = 0; i < SHAPES.length; i += 1) {
    roll -= WEIGHTS[i];
    if (roll <= 0) return SHAPES[i];
  }
  return SHAPES[0];
}

export const shapeRows = (shape: Shape) => Math.max(...shape.cells.map(([r]) => r)) + 1;
export const shapeCols = (shape: Shape) => Math.max(...shape.cells.map(([, c]) => c)) + 1;

/** Lighten a hex colour toward white — for the block's shiny top edge. */
export function lighten(hex: string, amount: number) {
  return mix(hex, 255, amount);
}
/** Darken a hex colour toward black — for the block's shaded bottom edge. */
export function darken(hex: string, amount: number) {
  return mix(hex, 0, amount);
}
function mix(hex: string, target: number, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * (1 - amount) + target * amount);
  const g = Math.round(((value >> 8) & 255) * (1 - amount) + target * amount);
  const b = Math.round((value & 255) * (1 - amount) + target * amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
