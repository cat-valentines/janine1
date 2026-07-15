import type { Cat, Ladder } from './types';

/** The full width of a floor. Cats walk all of it, wall to wall. */
const WALK_FROM = 8;
const WALK_TO = 92;

/**
 * Cats never stop and never turn early: each one walks the whole floor and only
 * turns round when it reaches an end.
 */
export function updateCats(cats: Cat[], deltaSeconds: number): Cat[] {
  return cats.map((cat) => {
    const direction = cat.direction === 'right' ? 1 : -1;
    const nextX = cat.x + direction * cat.speed * deltaSeconds;
    if (nextX <= WALK_FROM) return { ...cat, x: WALK_FROM, direction: 'right' };
    if (nextX >= WALK_TO) return { ...cat, x: WALK_TO, direction: 'left' };
    return { ...cat, x: nextX };
  });
}

export function updateLadders(ladders: Ladder[], deltaSeconds: number): Ladder[] {
  return ladders.map((ladder) => {
    if (ladder.speed === 0) return ladder;
    const direction = ladder.direction === 'right' ? 1 : -1;
    const nextX = ladder.x + direction * ladder.speed * deltaSeconds;
    if (nextX <= 12) return { ...ladder, x: 12, direction: 'right' };
    if (nextX >= 88) return { ...ladder, x: 88, direction: 'left' };
    return { ...ladder, x: nextX };
  });
}
