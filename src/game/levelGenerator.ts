import { FLOOR_COUNT, SAFE_FLOORS, SAFE_POSITION } from './constants';
import type { Cat, GameState, Laser, LevelLayout, Secret, SettingId, Wall } from './types';

/**
 * How many cats prowl a floor. The higher you climb the busier it gets, so the
 * top of the tower is the frightening part.
 */
export function catsOnFloor(floor: number, level: number) {
  if (floor < SAFE_FLOORS) return 0;
  return 1 + Math.floor((floor - SAFE_FLOORS) / 3) + (level > 2 ? 1 : 0);
}

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

  // A laser floor gets exactly one brick wall — the only shelter on it. Keeping
  // it away from the ladder is what forces the hide-then-dash the game is about.
  const laserFloors = Array.from({ length: FLOOR_COUNT }, (_, floor) => floor)
    .filter((floor) => floor >= SAFE_FLOORS && floor % 2 === 1);
  const lasers: Laser[] = laserFloors.map((floor) => ({ floor, phase: (floor * 1.7) % 5.4 }));
  const walls: Wall[] = laserFloors.map((floor) => ({ floor, x: floor % 4 === 1 ? 46 : 54 }));

  const cats: Cat[] = [];
  for (let floor = 0; floor < FLOOR_COUNT; floor += 1) {
    const count = catsOnFloor(floor, level);
    for (let i = 0; i < count; i += 1) {
      // Spread them out, so several cats on a floor never start stacked up.
      const spread = count === 1 ? 50 : 16 + (i * 68) / (count - 1);
      cats.push({
        id: `cat-${floor}-${i}`,
        floor,
        x: Math.min(92, Math.max(8, spread)),
        direction: (floor + i) % 2 === 0 ? 'left' : 'right',
        speed: speed + ((floor + i) % 3) * 0.35,
      });
    }
  }

  // Hidden powers, tucked in the corners cats and coins do not sit in. They
  // shuffle by level so you cannot just memorise where they are.
  const spots: Secret[] = [
    { id: 'secret-heart', kind: 'heart', floor: 3 + (level % 3), x: 88 },
    { id: 'secret-double', kind: 'double', floor: 5 + (level % 3), x: 12 },
    { id: 'secret-invisible', kind: 'invisible', floor: 7 + (level % 3), x: 88 },
  ];
  const secrets = spots.filter((secret) => secret.floor < FLOOR_COUNT);

  const powerUp = { floor: setting === 'haunted' ? 6 : 4, x: 50 };
  return { ladders, coins, goldCoins, cats, walls, lasers, secrets, powerUp };
}

export function createGameState(layout: LevelLayout): GameState {
  return {
    player: { ...SAFE_POSITION },
    cats: layout.cats,
    secrets: layout.secrets,
    time: 0,
    coins: layout.coins,
    goldCoins: layout.goldCoins,
    powerUp: layout.powerUp,
    magicDoor: null,
    score: 0,
    lives: 3,
    invincibleUntil: 0,
    caughtUntil: 0,
    zappedUntil: 0,
    invisibleUntil: 0,
    doubled: false,
    goldBonus: 0,
    secretNote: '',
    secretUntil: 0,
    status: 'playing',
  };
}
