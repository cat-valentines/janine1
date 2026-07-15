import type { Island } from './islands';

/** Quests you must have finished before any new island will open. */
export const QUESTS_TO_MOVE_UP = 20;
/** Each island wants a longer streak: island 2 wants 200 days, island 3 wants 300. */
export const STREAK_PER_ISLAND = 100;

export const streakNeededFor = (islandId: number) => islandId <= 1 ? 0 : islandId * STREAK_PER_ISLAND;

export interface Progress {
  completedQuests: number;
  streak: number;
  isMember: boolean;
}

/** Today, as YYYY-MM-DD. */
export const todayKey = (now = new Date()) => now.toISOString().slice(0, 10);

/** Yesterday, as YYYY-MM-DD. */
export function yesterdayKey(now = new Date()) {
  const back = new Date(now);
  back.setUTCDate(back.getUTCDate() - 1);
  return todayKey(back);
}

export interface StreakState { lastPlayed: string; streak: number; daysPlayed: number }

/**
 * Counts today as a day played.
 *
 * Played today already? Nothing changes. Played yesterday? The streak grows.
 * Missed a day? It starts again at one. This is the on-device copy — signed-in
 * players are counted by the server, which cannot be fooled by the clock.
 */
export function countTodayAsPlayed(state: StreakState, now = new Date()): StreakState {
  const today = todayKey(now);
  if (state.lastPlayed === today) return state;
  if (state.lastPlayed === yesterdayKey(now)) {
    return { lastPlayed: today, streak: state.streak + 1, daysPlayed: state.daysPlayed + 1 };
  }
  return { lastPlayed: today, streak: 1, daysPlayed: state.daysPlayed + 1 };
}

/**
 * Why an island is still locked, or null when it is open.
 *
 * Paying skips the streak — that is the "open islands earlier" bargain — but
 * never the quests, so a Royal Member still has to actually play.
 */
export function islandLock(island: Island, progress: Progress): string | null {
  if (island.id <= 1) return null;
  if (island.membersOnly && !progress.isMember) return 'Royal Membership needed';
  if (progress.completedQuests < island.questsNeeded) {
    return `${island.questsNeeded - progress.completedQuests} more quests`;
  }
  if (!progress.isMember) {
    const needed = streakNeededFor(island.id);
    if (progress.streak < needed) return `${needed - progress.streak} more days of your streak`;
  }
  return null;
}

export const isIslandOpen = (island: Island, progress: Progress) => islandLock(island, progress) === null;

/** The next island still shut, so the streak page can show what you are working towards. */
export function nextLockedIsland(islands: Island[], progress: Progress) {
  return islands.find((island) => !isIslandOpen(island, progress)) ?? null;
}
