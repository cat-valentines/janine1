import { rand, valueNoise } from './terrain';

/**
 * A wide, open forest valley. It used to be a small square ringed by vertical
 * cliffs (very "boxed in"); now the land rolls up into hills that fade away into
 * the fog, so it feels like open country you could wander forever. You still
 * can't leave the valley, but you can't see the edge either.
 */
export const ARENA = 72;
export const ARENA_TOP = 22;
export const WALL = 3;

export interface ForestBlock { x: number; y: number; z: number; colour: string }

const palette = {
  grass: '#4f8b3b', grassDeep: '#3d6d2d', dirt: '#7a5a3c', dirtDeep: '#654a30',
  stone: '#7f7d84', stoneDeep: '#5f5d64', water: '#3f7fae', sand: '#ddc98f',
  trunk: '#5f4026', leaves: '#2f6b28', leavesAlt: '#3f8a32', cliff: '#6a6350',
};

const inArena = (x: number, z: number) => x >= 0 && z >= 0 && x < ARENA && z < ARENA;

/** Solid blocks in this column. The rim rolls up into hills that vanish in fog. */
export function forestHeight(x: number, z: number, seed: number) {
  if (!inArena(x, z)) {
    // beyond the valley: tall rolling hills, deep in the fog — the world goes on
    return Math.round(9 + valueNoise(x / 22, z / 22, seed + 7) * 12);
  }
  const edge = Math.min(x, z, ARENA - 1 - x, ARENA - 1 - z);
  const rolling = valueNoise(x / 22, z / 22, seed) * 9 + valueNoise(x / 7, z / 7, seed + 3) * 3.2;
  let h = Math.max(0, Math.round(2 + rolling * 0.7));
  if (edge < WALL + 5) {                       // gentle rise into the surrounding hills, no vertical wall
    const rise = WALL + 5 - edge;
    h += Math.round(rise * rise * 0.22);
  }
  return h;
}

export const isForestSolid = (x: number, y: number, z: number, seed: number) => y >= 0 && y < forestHeight(x, z, seed);

/** Can the player dig this block? (Not the boundary hills, and it must be solid.) */
export function forestDiggable(x: number, y: number, z: number, seed: number) {
  if (!inArena(x, z)) return false;
  const edge = Math.min(x, z, ARENA - 1 - x, ARENA - 1 - z);
  if (edge < WALL + 1) return false;           // keep the far hills solid so nobody tunnels out
  return y >= 0 && y < forestHeight(x, z, seed);
}

export const SPAWNS = 6;

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
  if (edge < WALL + 1) return 0;
  if (forestHeight(x, z, seed) < 2) return 0;
  if (nearSpawn(x, z, seed)) return 0;
  return rand(x * 2.7, z * 2.7, seed + 21) > 0.87 ? 4 + Math.floor(rand(x, z, seed + 9) * 3) : 0;
}

/** Only surface blocks and cliff faces — a solid volume would be ~100k cubes. */
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
      const rim = edge < WALL;
      const beach = !rim && lowest === 0 && height <= 2;
      blocks.push({ x, y: top, z, colour: rim ? palette.cliff : beach ? palette.sand : height >= 8 ? palette.stone : palette.grass });
      // a couple of blocks below the surface too, so a shallow dig has walls
      for (let y = top - 1; y >= Math.max(0, Math.min(lowest - 1, top - 3)); y -= 1) {
        blocks.push({ x, y, z, colour: rim ? palette.cliff : y === top - 1 ? palette.grassDeep : palette.dirt });
      }

      // scattered outdoor props: rocks and little bushes
      if (!rim && height >= 2 && !nearSpawn(x, z, seed) && !treeAt(x, z, seed)) {
        const p = rand(x * 3.1, z * 3.1, seed + 50);
        if (p > 0.982) {
          blocks.push({ x, y: top + 1, z, colour: palette.stone });
          if (rand(x, z, seed + 51) > 0.5) blocks.push({ x, y: top + 2, z, colour: palette.stoneDeep });
        } else if (p > 0.958) {
          blocks.push({ x, y: top + 1, z, colour: palette.leavesAlt });
        }
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
  const radius = ARENA * 0.28;
  const centre = ARENA / 2;
  return { x: centre + Math.cos(angle) * radius, z: centre + Math.sin(angle) * radius };
}

/** Spread spawn points around a ring, so nobody starts on top of anyone. */
export function spawnRing(index: number, _count: number, seed: number) {
  const spot = spawnPoint(index, seed);
  return { x: spot.x, z: spot.z, y: forestGround(spot.x, spot.z, seed) };
}
