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
  parrot: {
    name: 'The Rainforest', icon: '🦜',
    skyTop: '#7bcbd0', skyLow: '#d7f0d5', ground: '#4e9850', groundDark: '#347039', groundLine: '#28582f',
    obstacle: '#8b673b', obstacleDark: '#604629', decor: ['🦜', '🌺', '🌴'], far: '#75b86f',
  },
  mila: {
    name: 'The Strawberry Farm', icon: '🍓', skyTop: '#acdff1', skyLow: '#f8e5df', ground: '#74a952', groundDark: '#507b39', groundLine: '#3d602c',
    obstacle: '#a56d43', obstacleDark: '#73482d', decor: ['🍓', '🌼', '🐄'], far: '#a9cf8b',
  },
  gabby: {
    name: 'The Savanna', icon: '🦒', skyTop: '#f0c778', skyLow: '#f8e8bd', ground: '#b28d45', groundDark: '#81652f', groundLine: '#654d24',
    obstacle: '#8d673c', obstacleDark: '#614528', decor: ['🌳', '🦒', '🌾'], far: '#d0b368',
  },
  amsaal: {
    name: 'The Sunny Farm', icon: '🐥', skyTop: '#a9ddf0', skyLow: '#fff0bd', ground: '#93b650', groundDark: '#69863a', groundLine: '#51692c',
    obstacle: '#b48147', obstacleDark: '#805a31', decor: ['🐥', '🌻', '🌾'], far: '#c5d786',
  },
  misha: {
    name: 'The Strawberry Garden', icon: '🍓', skyTop: '#f3bfd6', skyLow: '#fff0e8', ground: '#82ad63', groundDark: '#5c8046', groundLine: '#466437',
    obstacle: '#b9786f', obstacleDark: '#825049', decor: ['🍓', '🌸', '🐄'], far: '#b9d394',
  },
  joy: {
    name: 'The Red Bamboo Woods', icon: '🍁', skyTop: '#b9d8d2', skyLow: '#f1e8ce', ground: '#6f934f', groundDark: '#4e6d38', groundLine: '#3c552c',
    obstacle: '#8d5b3c', obstacleDark: '#633e2a', decor: ['🍁', '🎋', '🌲'], far: '#95b577',
  },
  melly: {
    name: 'The Icy Shore', icon: '🧊', skyTop: '#b9dff0', skyLow: '#edf7fb', ground: '#d9edf4', groundDark: '#a9ccd9', groundLine: '#7fa9ba',
    obstacle: '#92c4d8', obstacleDark: '#6295aa', decor: ['🧊', '❄️', '🐟'], far: '#c7e3ec',
  },
  martin: {
    name: 'The Autumn Hedge', icon: '🍂', skyTop: '#d5c89f', skyLow: '#f4e7c8', ground: '#8d934b', groundDark: '#656b35', groundLine: '#4d5228',
    obstacle: '#9b6841', obstacleDark: '#6e482e', decor: ['🍂', '🍄', '🌰'], far: '#b3ad6e',
  },
  hazel: {
    name: 'The Orange Grove', icon: '🍊', skyTop: '#acdceb', skyLow: '#f6e5c8', ground: '#79a958', groundDark: '#567c3e', groundLine: '#416130',
    obstacle: '#9c6b3e', obstacleDark: '#6e492a', decor: ['🍊', '🌿', '🌼'], far: '#a6c680',
  },
  bubbles: {
    name: 'The Crystal Lagoon', icon: '🫧', skyTop: '#8bd5df', skyLow: '#d8f2ee', ground: '#7dbbaf', groundDark: '#57897f', groundLine: '#416b63',
    obstacle: '#7aa6b0', obstacleDark: '#52737b', decor: ['🫧', '🪸', '🌸'], far: '#9fd5ca',
  },
  rocky: {
    name: 'The Moonlit Woods', icon: '🌙', skyTop: '#889ab5', skyLow: '#d6d7d0', ground: '#667955', groundDark: '#48573c', groundLine: '#37442e',
    obstacle: '#766653', obstacleDark: '#514638', decor: ['🌙', '🌲', '🍇'], far: '#849776',
  },
  ellie: {
    name: 'The Lavender Plains', icon: '💜', skyTop: '#c4bce3', skyLow: '#eee5f1', ground: '#8ea967', groundDark: '#657b49', groundLine: '#4d6038',
    obstacle: '#917a73', obstacleDark: '#65534e', decor: ['💜', '🌸', '🌿'], far: '#b3c58d',
  },
  pip: {
    name: 'The Mountain Meadow', icon: '🐐', skyTop: '#aed9ea', skyLow: '#eef0d6', ground: '#7ea35b', groundDark: '#597641', groundLine: '#445c32',
    obstacle: '#8f7352', obstacleDark: '#634f38', decor: ['🌼', '⛰️', '🌿'], far: '#a9c487',
  },
  clover: {
    name: 'The Lucky Pond', icon: '🍀', skyTop: '#a9dcd5', skyLow: '#e4f1d4', ground: '#6fa05c', groundDark: '#4e7542', groundLine: '#3b5a32',
    obstacle: '#78906b', obstacleDark: '#52644a', decor: ['🍀', '🪷', '🐸'], far: '#92bb80',
  },
  maple: {
    name: 'The Acorn Forest', icon: '🌰', skyTop: '#d4b77f', skyLow: '#f0dfbd', ground: '#8e914b', groundDark: '#656936', groundLine: '#4d5229',
    obstacle: '#95623d', obstacleDark: '#68432a', decor: ['🌰', '🍁', '🌳'], far: '#b1a76c',
  },
  lulu: {
    name: 'The Peachy Hills', icon: '🦙', skyTop: '#efc3b2', skyLow: '#f8e8d7', ground: '#92aa67', groundDark: '#687b49', groundLine: '#506039',
    obstacle: '#a17a60', obstacleDark: '#705342', decor: ['🌸', '🦙', '🌿'], far: '#bec58c',
  },
  finn: {
    name: 'The Desert Bloom', icon: '🏜️', skyTop: '#e9c58a', skyLow: '#f8e7c1', ground: '#c69a58', groundDark: '#916f3f', groundLine: '#705631',
    obstacle: '#a87343', obstacleDark: '#754e2d', decor: ['🌵', '🌸', '☀️'], far: '#d2b477',
  },
  daisy: {
    name: 'The Royal Duck Pond', icon: '🌼', skyTop: '#a9dced', skyLow: '#f5edc8', ground: '#7da65a', groundDark: '#597740', groundLine: '#445c31',
    obstacle: '#9e8052', obstacleDark: '#705938', decor: ['🌼', '🪷', '🐥'], far: '#aec783',
  },
  hattie: {
    name: 'The Hippo Lagoon', icon: '🦛', skyTop: '#a8ddec', skyLow: '#e4f0dc', ground: '#71945e', groundDark: '#506d43', groundLine: '#3c5533',
    obstacle: '#8b7765', obstacleDark: '#625245', decor: ['🪷', '🌿', '💧'], far: '#91b884',
  },
  kiki: {
    name: 'The Lemur Jungle', icon: '🌴', skyTop: '#9bd9d0', skyLow: '#e8efd0', ground: '#638c50', groundDark: '#46663a', groundLine: '#354f2d',
    obstacle: '#856044', obstacleDark: '#5d4230', decor: ['🌴', '🥭', '🌺'], far: '#86ad70',
  },
  pango: {
    name: 'The Moonlit Burrow', icon: '🌙', skyTop: '#9ba7c7', skyLow: '#e4d8ce', ground: '#897151', groundDark: '#624f39', groundLine: '#4c3d2d',
    obstacle: '#786150', obstacleDark: '#534236', decor: ['🌙', '🪨', '🌾'], far: '#aa916e',
  },
  honey: {
    name: 'The Honey Garden', icon: '🐝', skyTop: '#b8dded', skyLow: '#fff0bd', ground: '#7da252', groundDark: '#58753a', groundLine: '#445a2d',
    obstacle: '#bd8d45', obstacleDark: '#87632f', decor: ['🌻', '🍯', '🌼'], far: '#afca7d',
  },
  roo: {
    name: 'The Outback', icon: '🦘', skyTop: '#e5b77f', skyLow: '#f4dfbd', ground: '#ad7949', groundDark: '#7d5634', groundLine: '#614229',
    obstacle: '#8d6245', obstacleDark: '#62432f', decor: ['🌾', '🪨', '☀️'], far: '#c49a69',
  },
  snowy: {
    name: 'The Snowy Peaks', icon: '🏔️', skyTop: '#aecfe4', skyLow: '#edf5f7', ground: '#dceaf0', groundDark: '#aec6d1', groundLine: '#829eab',
    obstacle: '#9db9c8', obstacleDark: '#6d8998', decor: ['❄️', '🏔️', '🧊'], far: '#c8dce5',
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
