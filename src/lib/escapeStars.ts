/**
 * Your Escape Room ⭐ collection.
 *
 * Every star you find in the Escape Room is added to a running total that is
 * kept between visits (on this device). The Challenge Room shows the total as
 * progress toward the shared 5,000-star goal and its seasonal champion cup.
 */
import { storage } from './storage';

const KEY = 'escapeRoomStars';
export const STAR_GOAL = 5000;

export function getStars(): number {
  const raw = storage.get(KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Add newly-found stars to the collection and return the new total. */
export function addStars(count: number): number {
  if (count <= 0) return getStars();
  const total = getStars() + Math.round(count);
  storage.set(KEY, String(total));
  return total;
}
