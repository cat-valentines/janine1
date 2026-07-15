import { rand, valueNoise } from './terrain';

/** The arena is a square of forest ringed by cliffs, so nobody wanders off. */
export const ARENA = 56;
export const ARENA_TOP = 14;
export const WALL = 3;

export interface ForestBlock { x: number; y: number; z: number; colour: string }

const palette = {
  grass: '#4f8b3b', grassDeep: '#3d6d2d', dirt: '#7a5a3c',
  stone: '#7f7d84', water: '#3f7fae', sand: '#ddc98f',
  trunk: '#5f4026', leaves: '#2f6b28', leavesAlt: '#3f8a32',
  cliff: '#655f66',
};

const inArena = (x: number, z: number) => x >= 0 && z >= 0 && x < ARENA && z < ARENA;

/** Solid blocks in this column. The rim rises into an unclimbable wall. */
export function forestHeight(x: number, z: number, seed: number) {
  if (!inArena(x, z)) return ARENA_TOP;
  const edge = Math.min(x, z, ARENA - 1 - x, ARENA - 1 - z);
  if (edge < WALL) return ARENA_TOP - edge * 2;
  const rolling = valueNoise(x / 17, z / 17, seed) * 6 + valueNoise(x / 6, z / 6, seed + 3) * 2;
  return Math.max(0, Math.round(1 + rolling * 0.8));
}

export const isForestSolid = (x: number, y: number, z: number, seed: number) => y >= 0 && y < forestHeight(x, z, seed);

/** How many drop points the ring holds: the player plus every rival. */
export const SPAWNS = 6;

/** Keeps a clearing around each drop point so nobody starts inside a tree. */
function nearSpawn(x: number, z: number, seed: number) {
  for (let i = 0; i < SPAWNS; i += 1) {
    const spot = spawnPoint(i, seed);
    if (Math.hypot(x - spot.x, z - spot.z) < 4) return true;
  }
  return false;
}

/** A tree here, or 0. Deterministic so the forest never shifts. */
function treeAt(x: number, z: number, seed: number) {
  const edge = Math.min(x, z, ARENA - 1 - x, ARENA - 1 - z);
  if (edge < WALL + 2) return 0;
  if (forestHeight(x, z, seed) < 2) return 0;
  if (nearSpawn(x, z, seed)) return 0;
  return rand(x * 2.7, z * 2.7, seed + 21) > 0.9 ? 4 + Math.floor(rand(x, z, seed + 9) * 3) : 0;
}

/** Only surface blocks and cliff faces — a solid volume would be ~40k cubes. */
export function buildForest(seed: number): ForestBlock[] {
  const blocks: ForestBlock[] = [];
  for (let z = 0; z < ARENA; z += 1) {
    for (let x = 0; x < ARENA; x += 1) {
      const height = forestHeight(x, z, seed);
      const edge = Math.min(x, z, ARENA - 1 - x, ARENA - 1 - z);
      if (height === 0) { blocks.push({ x, y: 0, z, colour: palette.water }); continue; }
      const top = height - 1;
      const neighbours = [forestHeight(x + 1, z, seed), forestHeight(x - 1, z, seed), forestHeight(x, z + 1, seed), forestHeight(x, z - 1, seed)];
      const lowest = Math.min(...neighbours);
      const cliff = edge < WALL;
      const beach = !cliff && lowest === 0 && height <= 2;
      blocks.push({ x, y: top, z, colour: cliff ? palette.cliff : beach ? palette.sand : height >= 7 ? palette.stone : palette.grass });
      for (let y = top - 1; y >= Math.max(0, lowest - 1); y -= 1) {
        blocks.push({ x, y, z, colour: cliff ? palette.cliff : y === top - 1 ? palette.grassDeep : palette.dirt });
      }
      const trunk = treeAt(x, z, seed);
      if (!trunk) continue;
      for (let y = 1; y <= trunk; y += 1) blocks.push({ x, y: top + y, z, colour: palette.trunk });
      const crown = top + trunk;
      for (let ly = 0; ly <= 2; ly += 1) {
        const reach = ly === 2 ? 1 : 2;
        for (let lz = -reach; lz <= reach; lz += 1) {
          for (let lx = -reach; lx <= reach; lx += 1) {
            if (Math.abs(lx) === reach && Math.abs(lz) === reach) continue;
            if (lx === 0 && lz === 0 && ly < 2) continue;
            const mix = rand(x + lx * 5, z + lz * 5, seed + ly) > 0.75;
            blocks.push({ x: x + lx, y: crown + ly, z: z + lz, colour: mix ? palette.leavesAlt : palette.leaves });
          }
        }
      }
    }
  }
  return blocks;
}

/** Standing height for a column: the first gap a body fits in. */
export function forestGround(x: number, z: number, seed: number) {
  return forestHeight(Math.floor(x), Math.floor(z), seed);
}

/** Where a drop point sits, without touching the heightmap. */
export function spawnPoint(index: number, seed: number) {
  const angle = (index / SPAWNS) * Math.PI * 2 + rand(index, 1, seed) * 0.4;
  const radius = ARENA * 0.3;
  const centre = ARENA / 2;
  return { x: centre + Math.cos(angle) * radius, z: centre + Math.sin(angle) * radius };
}

/** Spread spawn points around a ring, so nobody starts on top of anyone. */
export function spawnRing(index: number, _count: number, seed: number) {
  const spot = spawnPoint(index, seed);
  return { x: spot.x, z: spot.z, y: forestGround(spot.x, spot.z, seed) };
}
