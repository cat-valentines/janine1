import type { Cat, Ladder } from './types';

export function updateCats(cats: Cat[], deltaSeconds: number): Cat[] {
  return cats.map((cat) => {
    const direction = cat.direction === 'right' ? 1 : -1;
    const nextX = cat.x + direction * cat.speed * deltaSeconds;
    if (nextX <= 8) return { ...cat, x: 8, direction: 'right' };
    if (nextX >= 92) return { ...cat, x: 92, direction: 'left' };
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
