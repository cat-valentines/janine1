import { HIDE_DISTANCE, LASER_ON, LASER_PERIOD, LASER_WARN } from './constants';
import type { Laser, Position, Wall } from './types';

export type LaserPhase = 'off' | 'warning' | 'firing';

/**
 * Where a laser is in its cycle right now.
 *
 * Each floor gets its own offset, so climbing into a firing floor is a real
 * risk rather than every floor blinking in time with every other.
 */
export function laserPhase(laser: Laser, time: number): LaserPhase {
  const at = (time + laser.phase) % LASER_PERIOD;
  const warnAt = LASER_PERIOD - LASER_ON - LASER_WARN;
  if (at < warnAt) return 'off';
  if (at < warnAt + LASER_WARN) return 'warning';
  return 'firing';
}

/** Seconds until this laser next fires — the countdown a player is racing. */
export function secondsUntilFiring(laser: Laser, time: number) {
  const at = (time + laser.phase) % LASER_PERIOD;
  const fireAt = LASER_PERIOD - LASER_ON;
  return at < fireAt ? fireAt - at : LASER_PERIOD - at + fireAt;
}

/** True when a brick wall on this floor is close enough to hide behind. */
export function isHidden(player: Position, walls: Wall[]) {
  return walls.some((wall) => wall.floor === player.floor && Math.abs(wall.x - player.x) <= HIDE_DISTANCE);
}

/** True when a firing laser has the player out in the open. */
export function laserCatches(player: Position, lasers: Laser[], walls: Wall[], time: number) {
  const here = lasers.find((laser) => laser.floor === player.floor);
  if (!here) return false;
  if (laserPhase(here, time) !== 'firing') return false;
  return !isHidden(player, walls);
}
