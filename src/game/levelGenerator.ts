import { FLOOR_COUNT, SAFE_POSITION } from './constants';
import type { GameState, LevelLayout, SettingId } from './types';

export function generateLevel(setting: SettingId, level = 1): LevelLayout {
  const speed = Math.min(6.25 + level * 0.25, 10);
  const ladders = Array.from({ length: FLOOR_COUNT - 1 }, (_, floor) => ({
    floor, x: floor % 2 === 0 ? 82 : 18, startX: floor % 2 === 0 ? 82 : 18,
    direction: floor % 2 === 0 ? ('left' as const) : ('right' as const),
    speed: level >= 2 && floor >= Math.max(2, 7 - level) ? Math.min(4 + level, 9) : 0,
  }));
  const coins = Array.from({ length: FLOOR_COUNT }, (_, floor) => ({
    floor,
    x: floor % 2 === 0 ? 35 : 65,
  }));
  const goldCoins = Array.from({ length: FLOOR_COUNT }, (_, floor) => ({
    floor,
    x: floor % 2 === 0 ? 68 : 32,
  }));
  const catFloors = Array.from({ length: FLOOR_COUNT }, (_, floor) => floor)
    .filter((floor) => level > 1 || (floor >= 3 && floor % 2 === 1));
  const cats = catFloors.map((floor) => ({
    floor,
    x: 16 + ((floor * 19) % 68),
    direction: floor % 3 === 0 ? ('left' as const) : ('right' as const),
    speed: speed + (floor % 3) * 0.35,
  }));
  const powerUp = { floor: setting === 'haunted' ? 6 : 4, x: 50 };
  return { ladders, coins, goldCoins, cats, powerUp };
}

export function createGameState(layout: LevelLayout): GameState {
  return {
    player: { ...SAFE_POSITION },
    cats: layout.cats,
    coins: layout.coins,
    goldCoins: layout.goldCoins,
    powerUp: layout.powerUp,
    magicDoor: null,
    score: 0,
    lives: 3,
    invincibleUntil: 0,
    caughtUntil: 0,
    status: 'playing',
  };
}
