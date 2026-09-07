/**
 * The roll of honour — who finished on the leaderboard podium, month by month.
 *
 * Every month the top three players win a medal for that month, and finishing a
 * whole season in the top three wins that season's Champion Cup. Once a month is
 * over its result never changes, so the results are recorded here as history.
 *
 * Rewards themselves live on each player's own device (like coins and streaks),
 * so this list is how a result reaches them: when a champion opens the app, the
 * app finds their name here and hands them the medal and the cup they earned.
 * Everybody else sees the same list as the honours board, and gets the
 * congratulations notice — so the whole island hears who won.
 */
import { seasonForMonth, type SeasonInfo } from './rewards';

export interface MedalInfo { place: 1 | 2 | 3; name: string; icon: string; art: string }

export const MEDALS: Record<1 | 2 | 3, MedalInfo> = {
  1: { place: 1, name: '1st Place', icon: '🥇', art: '/assets/pixel-summer-medal-1.png' },
  2: { place: 2, name: '2nd Place', icon: '🥈', art: '/assets/pixel-summer-medal-2.png' },
  3: { place: 3, name: '3rd Place', icon: '🥉', art: '/assets/pixel-summer-medal-3.png' },
};

export interface MonthResult {
  /** "2026-8" — the year and the *human* month number, so August is 8. */
  key: string;
  label: string;
  year: number;
  /** 1–12. */
  month: number;
  /** The podium, in order: first, second, third. Display names as on the board. */
  podium: string[];
  /** True when that month also ended a season, so the podium won the cup too. */
  endsSeason: boolean;
}

/**
 * Recorded results. Add a month here when it finishes and its podium is settled.
 * August 2026 closed the summer, so its three champions took the Summer
 * Champion Cup as well as their monthly medals.
 */
export const HONOURS: MonthResult[] = [
  // Names are spelled as they appear on the leaderboard, so the board reads
  // right; matching a player to them is case-insensitive anyway.
  { key: '2026-8', label: 'August 2026', year: 2026, month: 8, podium: ['Chonchon16', 'jimmy', 'cat'], endsSeason: true },
];

/** The season a recorded month belongs to (its month number is 1-based here). */
export const seasonOf = (result: MonthResult): SeasonInfo => seasonForMonth(result.month - 1);

/**
 * Winter runs December → February, so January and February belong to the winter
 * that began the previous December. Without this a winter champion could be
 * handed two cups for one season.
 */
export function seasonYearOf(result: MonthResult): number {
  const season = seasonOf(result);
  return season.key === 'winter' && result.month <= 2 ? result.year - 1 : result.year;
}

export const seasonKeyOf = (result: MonthResult) => `${seasonOf(result).key}-${seasonYearOf(result)}`;

/** Names are compared loosely, so "ChonChon16" still finds "chonchon16". */
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Which place a player took that month, or null if they weren't on the podium. */
export function placeIn(result: MonthResult, name: string): 1 | 2 | 3 | null {
  const index = result.podium.findIndex((who) => same(who, name));
  return index < 0 ? null : ((index + 1) as 1 | 2 | 3);
}

/** Every recorded month a player finished on the podium, newest first. */
export function honoursFor(name: string): Array<{ result: MonthResult; place: 1 | 2 | 3 }> {
  if (!name.trim()) return [];
  return HONOURS
    .map((result) => ({ result, place: placeIn(result, name) }))
    .filter((entry): entry is { result: MonthResult; place: 1 | 2 | 3 } => entry.place !== null)
    .sort((a, b) => (a.result.key < b.result.key ? 1 : -1));
}

/** The most recently recorded month, for the announcement and the Insta prize. */
export const latestHonours = (): MonthResult | null =>
  [...HONOURS].sort((a, b) => (a.key < b.key ? 1 : -1))[0] ?? null;

/** The line the whole island sees: "🥇 chonchon16 · 🥈 jimmy · 🥉 cat". */
export const podiumLine = (result: MonthResult) =>
  result.podium.map((who, i) => `${MEDALS[(i + 1) as 1 | 2 | 3].icon} ${who}`).join(' · ');

/**
 * The Insta prize each place wins at the end of a month. Every medallist gets
 * something to show off on their profile.
 */
export const INSTA_PRIZES: Record<1 | 2 | 3, string> = {
  1: '👑 Champion frame on your Insta profile for the whole next month',
  2: '✨ Silver sparkle frame on your Insta profile',
  3: '🌿 Bronze leaf frame on your Insta profile',
};
