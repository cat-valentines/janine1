import { CAT_HIT_DISTANCE, ITEM_DISTANCE } from './constants';
import type { Position } from './types';

export function isNear(first: Position, second: Position, distance = ITEM_DISTANCE) {
  return first.floor === second.floor && Math.abs(first.x - second.x) <= distance;
}

export function touchesEnemy(player: Position, enemies: Position[]) {
  return enemies.some((enemy) => isNear(player, enemy, CAT_HIT_DISTANCE));
}

export function crossesEnemy(start: Position, end: Position, enemies: Position[]) {
  if (start.floor !== end.floor || start.x === end.x) return false;
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  return enemies.some((enemy) => enemy.floor === start.floor && enemy.x >= left && enemy.x <= right);
}
