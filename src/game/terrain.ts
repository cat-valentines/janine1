import { SX, SZ } from './voxel';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonStyle {
  name: string; icon: string;
  sky: string; fog: string;
  grass: string; grassDeep: string; dirt: string;
  leaves: string; leavesAlt: string; trunk: string;
  sand: string; stone: string; water: string;
}

export const seasonStyles: Record<Season, SeasonStyle> = {
  spring: {
    name: 'Spring', icon: '🌸', sky: '#a6dcf2', fog: '#c6e8f7',
    grass: '#7cb342', grassDeep: '#5f9236', dirt: '#8a6642',
    leaves: '#8bc34a', leavesAlt: '#f4b6d2', trunk: '#7a5230',
    sand: '#e6d6a8', stone: '#8d8d95', water: '#4a90c2',
  },
  summer: {
    name: 'Summer', icon: '☀️', sky: '#8fd0ee', fog: '#b5e2f5',
    grass: '#5b9e33', grassDeep: '#417526', dirt: '#8a6642',
    leaves: '#3f7d24', leavesAlt: '#57a02f', trunk: '#6f4a2b',
    sand: '#efe0ad', stone: '#8d8d95', water: '#3f88bd',
  },
  autumn: {
    name: 'Autumn', icon: '🍂', sky: '#f0c98a', fog: '#f3d7a6',
    grass: '#8d9440', grassDeep: '#6f7433', dirt: '#7d5a38',
    leaves: '#e07a2f', leavesAlt: '#c0442b', trunk: '#5f4026',
    sand: '#e3cf9c', stone: '#87858b', water: '#4380ab',
  },
  winter: {
    name: 'Winter', icon: '❄️', sky: '#cfe3ee', fog: '#e6f1f7',
    grass: '#eef4f7', grassDeep: '#d3e2ea', dirt: '#7b6a5c',
    leaves: '#dfeaf0', leavesAlt: '#bcd3e0', trunk: '#5a4632',
    sand: '#e8eaec', stone: '#9aa0a6', water: '#b7d8e8',
  },
};

export const seasonOrder: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Season from the real calendar, so the world matches the time of year. */
export function currentSeason(date = new Date()): Season {
  const month = date.getMonth();
  if (month <= 1 || month === 11) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

/**
 * How far the generated land reaches past the build plot, in blocks.
 * Kept modest on purpose: this is a kids' game that has to stay smooth on
 * school laptops and tablets, and every extra ring is ~3 cubes per column.
 */
export const TERRAIN_REACH = 24;
export const TERRAIN_MIN = -TERRAIN_REACH;
export const TERRAIN_MAX_X = SX + TERRAIN_REACH;
export const TERRAIN_MAX_Z = SZ + TERRAIN_REACH;

export const fade = (t: number) => t * t * (3 - 2 * t);

export function rand(x: number, z: number, seed: number) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const a = rand(xi, zi, seed);
  const b = rand(xi + 1, zi, seed);
  const c = rand(xi, zi + 1, seed);
  const d = rand(xi + 1, zi + 1, seed);
  const u = fade(xf);
  const v = fade(zf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Distance outside the build plot; 0 while inside it. */
function plotDistance(x: number, z: number) {
  const dx = Math.max(-x, 0, x - (SX - 1));
  const dz = Math.max(-z, 0, z - (SZ - 1));
  return Math.max(dx, dz);
}

/**
 * Number of solid blocks in this column. 1 means a single block at y=0, which
 * is the plot's own level — the land flattens to that near the plot so the
 * house always sits on level ground.
 */
export function terrainHeight(x: number, z: number, seed: number) {
  const distance = plotDistance(x, z);
  if (distance === 0) return 1;
  const rolling = valueNoise(x / 19, z / 19, seed) * 7 + valueNoise(x / 6.5, z / 6.5, seed + 3) * 1.8;
  const blend = fade(Math.min(1, distance / 11));
  return Math.max(0, Math.round(1 + (rolling - 1.2) * blend));
}

export const isTerrainSolid = (x: number, y: number, z: number, seed: number) => y >= 0 && y < terrainHeight(x, z, seed);

export interface TerrainBlock { x: number; y: number; z: number; colour: string }

/** A tree, if this column should have one. Deterministic, so it never moves. */
function treeAt(x: number, z: number, seed: number) {
  if (plotDistance(x, z) < 4) return 0;
  const height = terrainHeight(x, z, seed);
  if (height < 2) return 0;
  return rand(x * 3.3, z * 3.3, seed + 11) > 0.972 ? 3 + Math.floor(rand(x, z, seed + 5) * 2) : 0;
}

/**
 * Builds the visible land around the plot.
 *
 * Only surface blocks and cliff faces are emitted — a full solid volume would
 * be ~200k cubes, nearly all of them buried and invisible.
 */
export function buildTerrain(season: Season, seed: number) {
  const style = seasonStyles[season];
  const blocks: TerrainBlock[] = [];

  for (let z = TERRAIN_MIN; z < TERRAIN_MAX_Z; z += 1) {
    for (let x = TERRAIN_MIN; x < TERRAIN_MAX_X; x += 1) {
      if (plotDistance(x, z) === 0) continue; // the plot draws itself
      const height = terrainHeight(x, z, seed);
      if (height === 0) {
        blocks.push({ x, y: 0, z, colour: style.water });
        continue;
      }
      const top = height - 1;
      const neighbours = [terrainHeight(x + 1, z, seed), terrainHeight(x - 1, z, seed), terrainHeight(x, z + 1, seed), terrainHeight(x, z - 1, seed)];
      const lowest = Math.min(...neighbours);
      const beach = lowest === 0 && height <= 2;
      blocks.push({ x, y: top, z, colour: beach ? style.sand : height >= 6 ? style.stone : style.grass });
      // Fill only as far down as a neighbouring column exposes.
      for (let y = top - 1; y >= Math.max(0, lowest - 1); y -= 1) {
        blocks.push({ x, y, z, colour: y === top - 1 ? style.grassDeep : style.dirt });
      }

      const trunk = treeAt(x, z, seed);
      if (!trunk) continue;
      for (let y = 1; y <= trunk; y += 1) blocks.push({ x, y: top + y, z, colour: style.trunk });
      const crown = top + trunk;
      for (let ly = 0; ly <= 2; ly += 1) {
        const reach = ly === 2 ? 1 : 2;
        for (let lz = -reach; lz <= reach; lz += 1) {
          for (let lx = -reach; lx <= reach; lx += 1) {
            if (Math.abs(lx) === reach && Math.abs(lz) === reach) continue;
            if (lx === 0 && lz === 0 && ly < 2) continue;
            const mix = rand(x + lx * 7, z + lz * 7, seed + ly) > 0.78;
            blocks.push({ x: x + lx, y: crown + ly, z: z + lz, colour: mix ? style.leavesAlt : style.leaves });
          }
        }
      }
    }
  }
  return blocks;
}
