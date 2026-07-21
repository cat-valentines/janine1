import type { CharacterId } from './types';

export interface RunnerTheme {
  name: string; icon: string;
  skyTop: string; skyLow: string;
  ground: string; groundDark: string; groundLine: string;
  obstacle: string; obstacleDark: string;
  decor: string[]; far: string;
}

/** Each character runs through their own home ground. */
export const runnerThemes: Record<CharacterId, RunnerTheme> = {
  momo: {
    name: 'The Arctic', icon: '🧊',
    skyTop: '#bfe6f7', skyLow: '#e8f6fd', ground: '#eaf6fb', groundDark: '#c3dfeb', groundLine: '#8fbdd1',
    obstacle: '#9fd6ee', obstacleDark: '#6aa8c6', decor: ['🧊', '❄️', '🏔️'], far: '#d7eef8',
  },
  cottontail: {
    name: 'The Meadow', icon: '🌼',
    skyTop: '#9ed7f0', skyLow: '#d9f0e2', ground: '#6fb04a', groundDark: '#4d8534', groundLine: '#3c6a28',
    obstacle: '#8a6a45', obstacleDark: '#5f4830', decor: ['🌼', '🌾', '🦋'], far: '#a8d894',
  },
  toby: {
    name: 'The Forest', icon: '🌲',
    skyTop: '#8fc8e0', skyLow: '#cfe6cf', ground: '#4f8b3b', groundDark: '#37642a', groundLine: '#2a4d20',
    obstacle: '#6b4a2b', obstacleDark: '#4a3220', decor: ['🌲', '🍄', '🌿'], far: '#7fb26a',
  },
  coral: {
    name: 'The Ocean', icon: '🐠',
    skyTop: '#2e7fb0', skyLow: '#7fc4de', ground: '#e3d7a4', groundDark: '#c2b57f', groundLine: '#9d9163',
    obstacle: '#3f9a8f', obstacleDark: '#2a6b63', decor: ['🫧', '🐚', '🪸'], far: '#59a8c9',
  },
  ollie: {
    name: 'The Wetland', icon: '🪷',
    skyTop: '#a9cfe0', skyLow: '#d5e6cf', ground: '#5f7f4a', groundDark: '#446036', groundLine: '#33492a',
    obstacle: '#6d7a4a', obstacleDark: '#4c5633', decor: ['🪷', '🌾', '🐸'], far: '#83a86c',
  },
  biscuit: {
    name: 'The Field', icon: '🌾',
    skyTop: '#a5dcef', skyLow: '#e6f2d8', ground: '#84b455', groundDark: '#5f8c3b', groundLine: '#4a6d2c',
    obstacle: '#a8763f', obstacleDark: '#77522b', decor: ['🌾', '🌻', '🐝'], far: '#b6d68f',
  },
  koala: {
    name: 'The Gum Trees', icon: '🌿',
    skyTop: '#bfe0ea', skyLow: '#e7f2e0', ground: '#7ca86a', groundDark: '#57804a', groundLine: '#436035',
    obstacle: '#8a9b6b', obstacleDark: '#5f6d47', decor: ['🌿', '🍃', '🦋'], far: '#a3c48f',
  },
  teddy: {
    name: 'The Honey Woods', icon: '🍯',
    skyTop: '#f0d8a8', skyLow: '#f7ecd2', ground: '#9c7a4a', groundDark: '#6f5533', groundLine: '#543f26',
    obstacle: '#c79a4a', obstacleDark: '#8f6d2f', decor: ['🍯', '🐝', '🌳'], far: '#c9ad78',
  },
  panda: {
    name: 'The Bamboo Grove', icon: '🎋',
    skyTop: '#cfe6d6', skyLow: '#eef6ea', ground: '#7fae5f', groundDark: '#588640', groundLine: '#43662f',
    obstacle: '#6fa04a', obstacleDark: '#4d7032', decor: ['🎋', '🐼', '🌿'], far: '#a0c986',
  },
  tiger: {
    name: 'The Jungle', icon: '🌴',
    skyTop: '#8fd0c0', skyLow: '#d6efd8', ground: '#4f8b4a', groundDark: '#376437', groundLine: '#2a4d2a',
    obstacle: '#7a5a2b', obstacleDark: '#553d1c', decor: ['🌴', '🐯', '🌺'], far: '#6faa6a',
  },
  piggy: {
    name: 'The Farm', icon: '🚜',
    skyTop: '#bfe6f2', skyLow: '#f4ecd6', ground: '#9ab04a', groundDark: '#6f8433', groundLine: '#546327',
    obstacle: '#b07a4a', obstacleDark: '#7d552f', decor: ['🌽', '🐷', '🚜'], far: '#c2c88f',
  },
};

export type ObstacleKind = 'spike' | 'block' | 'spikes3';

export interface Obstacle { kind: ObstacleKind; x: number; width: number; height: number }
export interface RunnerCoin { x: number; y: number; taken: boolean }

export const GROUND_Y = 300;
export const PLAYER_SIZE = 40;
export const START_SPEED = 300;
export const MAX_SPEED = 620;
export const GRAVITY = 2100;
export const JUMP_V = 760;
export const COIN_SIZE = 22;

function rand(n: number, seed: number) {
  const value = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * A fixed course, generated once from the seed.
 *
 * Deterministic on purpose: like Geometry Dash, the same run every time is what
 * lets a player learn the jumps instead of being killed by a fresh surprise.
 */
export function buildCourse(seed: number, length = 260) {
  const obstacles: Obstacle[] = [];
  const coins: RunnerCoin[] = [];
  let x = 900; // a calm run-up before the first obstacle
  for (let i = 0; i < length; i += 1) {
    const roll = rand(i, seed);
    // Gaps shrink slowly, so the course gets harder the further you run.
    const gap = Math.max(230, 430 - i * 1.2) + rand(i + 99, seed) * 120;
    if (roll < 0.5) {
      obstacles.push({ kind: 'spike', x, width: 34, height: 42 });
    } else if (roll < 0.78) {
      const height = 46 + Math.floor(rand(i + 7, seed) * 46);
      obstacles.push({ kind: 'block', x, width: 52, height });
      // A coin sits above a block, rewarding the jump you already have to make.
      coins.push({ x: x + 26, y: GROUND_Y - height - 46, taken: false });
    } else {
      obstacles.push({ kind: 'spikes3', x, width: 78, height: 42 });
    }
    if (rand(i + 41, seed) > 0.55) {
      coins.push({ x: x + gap / 2, y: GROUND_Y - 60 - rand(i + 13, seed) * 70, taken: false });
    }
    x += gap;
  }
  return { obstacles, coins, finish: x + 600 };
}
