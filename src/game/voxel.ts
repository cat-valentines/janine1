import { EMPTY, blockById } from './building';

/** The house plot: 16x16 of ground, 10 blocks of headroom. */
export const SX = 16;
export const SY = 10;
export const SZ = 16;
export const VOXELS = SX * SY * SZ;

export const voxelIndex = (x: number, y: number, z: number) => y * SX * SZ + z * SX + x;

export const inside = (x: number, y: number, z: number) =>
  x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;

export function voxelAt(world: string, x: number, y: number, z: number) {
  if (!inside(x, y, z)) return EMPTY;
  return world[voxelIndex(x, y, z)] ?? EMPTY;
}

export function withVoxel(world: string, x: number, y: number, z: number, id: string) {
  if (!inside(x, y, z)) return world;
  const at = voxelIndex(x, y, z);
  return world.slice(0, at) + id + world.slice(at + 1);
}

/** A bare plot: one layer of grass, open sky above. */
export function emptyWorld() {
  const cells = new Array<string>(VOXELS).fill(EMPTY);
  for (let z = 0; z < SZ; z += 1) {
    for (let x = 0; x < SX; x += 1) cells[voxelIndex(x, 0, z)] = '#';
  }
  return cells.join('');
}

export const isSolid = (id: string) => id !== EMPTY && !!blockById(id);

/** Blocks you can walk through, so a door or lamp never traps the player. */
const passable = new Set(['D', 'A', 'L']);
export const blocksMovement = (id: string) => isSolid(id) && !passable.has(id);

export function validWorld(world: string) {
  return typeof world === 'string' && world.length === VOXELS;
}

/** Fixes up anything saved by an older/mismatched version rather than crashing. */
export function normaliseWorld(world: string | undefined) {
  if (!world || !validWorld(world)) return emptyWorld();
  return world;
}

export interface Furniture { id: string; item: string; x: number; y: number; z: number; rot: number }

/** Highest solid block at this column, so dropped furniture lands on the floor. */
export function groundHeight(world: string, x: number, z: number) {
  for (let y = SY - 1; y >= 0; y -= 1) {
    if (isSolid(voxelAt(world, x, y, z))) return y + 1;
  }
  return 0;
}

/**
 * Lowest spot the player actually fits, searching upward.
 *
 * Deliberately not groundHeight: that returns the highest solid block, which
 * for a finished house is the roof — so the player would spawn on top of their
 * house instead of standing inside it.
 */
export function spawnHeight(world: string, x: number, z: number) {
  for (let y = 0; y < SY - 1; y += 1) {
    const feetFree = !blocksMovement(voxelAt(world, x, y, z));
    const headFree = !blocksMovement(voxelAt(world, x, y + 1, z));
    const floorBelow = y === 0 || blocksMovement(voxelAt(world, x, y - 1, z));
    if (feetFree && headFree && floorBelow) return y;
  }
  return groundHeight(world, x, z);
}
