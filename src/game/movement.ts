import { PLAYER_STEP, SECRET_PORTAL } from './constants';
import type { Ladder, Position } from './types';

const clamp = (value: number) => Math.max(3, Math.min(97, value));

export function moveHorizontal(position: Position, direction: -1 | 1): Position {
  return { ...position, x: clamp(position.x + direction * PLAYER_STEP) };
}

export function climb(
  position: Position,
  direction: -1 | 1,
  ladders: Ladder[],
): Position {
  const targetFloor = position.floor + direction;
  if (targetFloor < 0 || targetFloor > ladders.length) return position;
  const ladderFloor = direction > 0 ? position.floor : targetFloor;
  const ladderX = ladders[ladderFloor].x;
  if (Math.abs(position.x - ladderX) > 10) return position;
  return { floor: targetFloor, x: ladderX };
}

export function enterSecretPortal(position: Position): Position | null {
  if (position.floor !== SECRET_PORTAL.floor || Math.abs(position.x - SECRET_PORTAL.x) > 10) return null;
  return { floor: SECRET_PORTAL.destinationFloor, x: SECRET_PORTAL.x };
}
