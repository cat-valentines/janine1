/**
 * The underwater world: a coral-reef MAZE.
 *
 * A recursive-backtracker carves swimmable corridors through solid coral, then
 * we punch a few open "clearings" (for the start and the key-holes) and mark
 * some dead-end pockets as caves — the risky little tunnels the player is warned
 * about. Everything the engine draws (coins, keys, key-holes, caves, predators)
 * is placed on this grid so the fish and the hunters share one map.
 */

export interface Cell { col: number; row: number }

export type FishId = 'clown' | 'tang';

export interface FishKind {
  id: FishId;
  name: string;
  emoji: string;
  blurb: string;
  body: string;   // main body colour
  belly: string;  // lighter underside
  stripe: string; // the markings
  fin: string;    // tail + fins
}

/** The two fish you can be — a clownfish and a blue tang, Nemo-and-Dory style. */
export const fishKinds: FishKind[] = [
  { id: 'clown', name: 'Coral the Clownfish', emoji: '🐠', blurb: 'Small, brave and quick. Darts into tight gaps to escape.', body: '#ff8a2b', belly: '#ffd9b0', stripe: '#ffffff', fin: '#ef7318' },
  { id: 'tang', name: 'Sky the Blue Tang', emoji: '🐟', blurb: 'A bright blue reef-swimmer with a sunny yellow tail.', body: '#2f7bef', belly: '#8fc0ff', stripe: '#0f1836', fin: '#ffd23f' },
];

export const fishById = (id: FishId) => fishKinds.find((fish) => fish.id === id) ?? fishKinds[0];

// ---- world dimensions --------------------------------------------------------

export const MAZE = 11;                 // logical cells per side
export const COLS = MAZE * 2 + 1;       // 23 — fine grid (walls between cells)
export const ROWS = MAZE * 2 + 1;       // 23
export const CELL = 4;                  // world units per grid square

export const KEYS_TO_WIN = 10;
export const KEYHOLES = 5;
export const COIN_COUNT = 28;
export const START_LIVES = 3;

/** Grid square → world centre (x, z). The reef is centred on the origin. */
export function worldOf(col: number, row: number) {
  return { x: (col - COLS / 2 + 0.5) * CELL, z: (row - ROWS / 2 + 0.5) * CELL };
}
export const colOf = (x: number) => Math.floor(x / CELL + COLS / 2);
export const rowOf = (z: number) => Math.floor(z / CELL + ROWS / 2);

export interface Reef {
  grid: string[][];        // '#' coral, '.' water
  caves: Set<string>;      // "col,row" of cave pockets (dim, risky)
  start: Cell;
  keyholes: Cell[];        // 5 shell locks
  keys: Cell[];            // 10 keys to find
  coins: Cell[];           // coins to collect
}

const keyOf = (c: Cell) => `${c.col},${c.row}`;
const dist = (a: Cell, b: Cell) => Math.hypot(a.col - b.col, a.row - b.row);

/** A tiny seedable RNG so a game's maze is stable while you replay it. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grow the whole reef for one game. */
export function generateReef(seed: number): Reef {
  const rng = mulberry32(seed);
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill('#'));
  const gridOf = (cx: number, cy: number): [number, number] => [cx * 2 + 1, cy * 2 + 1];

  // --- carve the maze (recursive backtracker over MAZE×MAZE logical cells) ---
  const visited = Array.from({ length: MAZE }, () => Array(MAZE).fill(false));
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0][0] = true;
  { const [gx, gy] = gridOf(0, 0); grid[gy][gx] = '.'; }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = dirs
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAZE && ny < MAZE && !visited[ny][nx]);
    if (!options.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = options[Math.floor(rng() * options.length)];
    visited[ny][nx] = true;
    const [gx, gy] = gridOf(cx, cy);
    grid[gy + dy][gx + dx] = '.';       // knock the wall between the two cells
    const [gnx, gny] = gridOf(nx, ny);
    grid[gny][gnx] = '.';
    stack.push([nx, ny]);
  }

  // --- braid: open a few extra walls so it loops, not one dead-end tree ---
  for (let i = 0; i < MAZE * 3; i += 1) {
    const cx = 1 + Math.floor(rng() * (MAZE - 2));
    const cy = 1 + Math.floor(rng() * (MAZE - 2));
    const [gx, gy] = gridOf(cx, cy);
    const side = dirs[Math.floor(rng() * 4)];
    grid[gy + side[1]][gx + side[0]] = '.';
  }

  // --- clearings: open 3×3 rooms of open water for the start and key-holes ---
  // Six of them: the middle one is the safe start, the other five hold locks.
  const mid = Math.floor(MAZE / 2);
  const clearings: Cell[] = [];
  const roomAnchors = [[mid, mid], [2, 2], [MAZE - 3, 2], [2, MAZE - 3], [MAZE - 3, MAZE - 3], [mid, 2]];
  roomAnchors.forEach(([cx, cy]) => {
    const [gx, gy] = gridOf(cx, cy);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const r = gy + dy, c = gx + dx;
        if (r > 0 && c > 0 && r < ROWS - 1 && c < COLS - 1) grid[r][c] = '.';
      }
    }
    clearings.push({ col: gx, row: gy });
  });

  // --- collect every swimmable square ---
  const floor: Cell[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (grid[row][col] === '.') floor.push({ col, row });
    }
  }
  const openNeighbours = (c: Cell) =>
    dirs.filter(([dx, dy]) => grid[c.row + dy]?.[c.col + dx] === '.').length;

  // --- caves: dead-end pockets (one way in) — dim and risky ---
  const caves = new Set<string>();
  const deadEnds = floor.filter((c) => openNeighbours(c) === 1);
  for (const c of deadEnds) { if (caves.size < 10 && rng() < 0.85) caves.add(keyOf(c)); }

  // --- start: the middle clearing (kept clear of locks and predators) ---
  const start = clearings[0];

  // --- key-holes: the other five clearings, spread around the reef ---
  const keyholes: Cell[] = clearings.slice(1, 1 + KEYHOLES);

  // --- keys: 10 spots, biased toward caves, never on the start or a key-hole ---
  const used = new Set<string>([keyOf(start), ...keyholes.map(keyOf)]);
  const keys: Cell[] = [];
  const caveCells = [...caves].map((s) => { const [col, row] = s.split(',').map(Number); return { col, row }; });
  for (const c of caveCells) {
    if (keys.length >= 6 || used.has(keyOf(c))) continue;
    keys.push(c); used.add(keyOf(c));
  }
  const shuffled = [...floor].sort(() => rng() - 0.5);
  for (const c of shuffled) {
    if (keys.length >= KEYS_TO_WIN) break;
    if (used.has(keyOf(c)) || dist(c, start) < 3) continue;
    keys.push(c); used.add(keyOf(c));
  }

  // --- coins: sprinkled through the water and caves ---
  const coins: Cell[] = [];
  for (const c of shuffled) {
    if (coins.length >= COIN_COUNT) break;
    if (used.has(keyOf(c)) || (c.col === start.col && c.row === start.row)) continue;
    coins.push(c); used.add(keyOf(c));
  }

  return { grid, caves, start, keyholes, keys, coins };
}

/**
 * True, kid-friendly coral facts, drawn from NOAA and National Geographic.
 * Sourced deliberately so the "learn something" strip stays honest.
 */
export const coralFacts: Array<{ text: string; source: string }> = [
  { text: 'Coral reefs cover less than 1% of the ocean floor, yet about 25% of all sea creatures depend on them.', source: 'NOAA' },
  { text: 'Coral is an animal! Each reef is built by thousands of tiny animals called polyps.', source: 'NOAA' },
  { text: 'Corals get their colour and much of their food from tiny algae that live inside them.', source: 'NOAA' },
  { text: 'The Great Barrier Reef is the largest reef on Earth — so big it can be seen from space.', source: 'NOAA' },
  { text: 'Clownfish live safely inside sea anemones — the stinging tentacles keep them from being eaten.', source: 'National Geographic' },
  { text: 'Reefs are natural sea walls: they soak up waves and protect coastlines from storms.', source: 'NOAA' },
  { text: 'When the water gets too warm, coral can "bleach" — it turns white and can get sick.', source: 'NOAA' },
  { text: 'Some coral colonies are hundreds, even thousands, of years old.', source: 'NOAA' },
  { text: 'Reefs are called the "rainforests of the sea" because so many kinds of life live there.', source: 'National Geographic' },
  { text: 'Parrotfish nibble on coral and turn it into soft white sand for beaches.', source: 'National Geographic' },
];
