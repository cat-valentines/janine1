export const GRID_W = 16;
export const GRID_H = 10;
export const EMPTY = '.';

export interface BlockType {
  id: string; name: string; icon: string; colour: string; price: number;
}

/** Palette for the from-scratch builder. `id` is the char stored in the grid. */
export const blocks: BlockType[] = [
  { id: 'W', name: 'Wood', icon: '🪵', colour: '#b07a4a', price: 0 },
  { id: 'S', name: 'Stone', icon: '🪨', colour: '#8d8d95', price: 0 },
  { id: 'B', name: 'Brick', icon: '🧱', colour: '#a8564a', price: 0 },
  { id: 'R', name: 'Roof', icon: '🔺', colour: '#96453c', price: 0 },
  { id: 'G', name: 'Glass', icon: '🪟', colour: '#a9d8e8', price: 0 },
  { id: 'D', name: 'Door', icon: '🚪', colour: '#6b4423', price: 0 },
  { id: 'L', name: 'Leaves', icon: '🌿', colour: '#5f8b4c', price: 0 },
  { id: 'F', name: 'Fence', icon: '🚧', colour: '#c9a06a', price: 0 },
  { id: 'P', name: 'Path', icon: '⬜', colour: '#d9c39a', price: 0 },
  { id: 'A', name: 'Lamp', icon: '💡', colour: '#f2c94c', price: 0 },
  { id: '~', name: 'Water', icon: '💧', colour: '#4a90c2', price: 0 },
  { id: '#', name: 'Grass', icon: '🟩', colour: '#6aa84f', price: 0 },
];

export const blockById = (id: string) => blocks.find((block) => block.id === id);

export function emptyHouse() {
  // Bare plot: sky above, one row of grass to build on.
  return rowsToGrid([...Array.from({ length: GRID_H - 1 }, () => EMPTY.repeat(GRID_W)), '#'.repeat(GRID_W)]);
}

export function rowsToGrid(rows: string[]) {
  if (rows.length !== GRID_H || rows.some((row) => row.length !== GRID_W)) {
    throw new Error(`house layout must be ${GRID_W}x${GRID_H}`);
  }
  return rows.join('');
}

export const blockAt = (grid: string, x: number, y: number) => grid[y * GRID_W + x] ?? EMPTY;

export function withBlock(grid: string, x: number, y: number, id: string) {
  const index = y * GRID_W + x;
  return grid.slice(0, index) + id + grid.slice(index + 1);
}

export interface Crop {
  id: string; name: string; icon: string; seedIcon: string;
  seconds: number; seedPrice: number; reward: number;
}

/** Short grow times on purpose — this is a kids' game, not a farming sim. */
export const crops: Crop[] = [
  { id: 'carrot', name: 'Carrot', icon: '🥕', seedIcon: '🌱', seconds: 20, seedPrice: 2, reward: 5 },
  { id: 'wheat', name: 'Wheat', icon: '🌾', seedIcon: '🌱', seconds: 35, seedPrice: 3, reward: 8 },
  { id: 'berry', name: 'Berry', icon: '🫐', seedIcon: '🌱', seconds: 50, seedPrice: 5, reward: 12 },
  { id: 'pumpkin', name: 'Pumpkin', icon: '🎃', seedIcon: '🌱', seconds: 75, seedPrice: 8, reward: 20 },
];

export const cropById = (id: string) => crops.find((crop) => crop.id === id);
export const GARDEN_PLOTS = 6;

export interface Plot { crop: string; plantedAt: number }

export function cropReady(plot: Plot, now: number) {
  const crop = cropById(plot.crop);
  return !!crop && now - plot.plantedAt >= crop.seconds * 1000;
}

export function cropProgress(plot: Plot, now: number) {
  const crop = cropById(plot.crop);
  if (!crop) return 1;
  return Math.min(1, (now - plot.plantedAt) / (crop.seconds * 1000));
}

export interface AnimalType {
  id: string; name: string; icon: string; produceIcon: string;
  price: number; seconds: number; reward: number;
}

export const animalTypes: AnimalType[] = [
  { id: 'chicken', name: 'Chicken', icon: '🐔', produceIcon: '🥚', price: 8, seconds: 25, reward: 4 },
  { id: 'sheep', name: 'Sheep', icon: '🐑', produceIcon: '🧶', price: 15, seconds: 45, reward: 9 },
  { id: 'cow', name: 'Cow', icon: '🐄', produceIcon: '🥛', price: 22, seconds: 60, reward: 14 },
  { id: 'pig', name: 'Pig', icon: '🐖', produceIcon: '🍄', price: 12, seconds: 35, reward: 7 },
];

export const animalById = (id: string) => animalTypes.find((animal) => animal.id === id);
export const ANIMAL_PEN = 6;

export interface Animal { id: string; type: string; fedAt: number }

export function produceReady(animal: Animal, now: number) {
  const type = animalById(animal.type);
  return !!type && now - animal.fedAt >= type.seconds * 1000;
}

export function produceProgress(animal: Animal, now: number) {
  const type = animalById(animal.type);
  if (!type) return 1;
  return Math.min(1, (now - animal.fedAt) / (type.seconds * 1000));
}

/** Every block char a saved house may contain — kept in step with the CHECK
 *  constraint on house_listings.grid in the house market migration. */
export const GRID_PATTERN = /^[.WSBRGDLFPA~#]{2560}$/;
