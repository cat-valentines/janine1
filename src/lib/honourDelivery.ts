/**
 * Delivering the honours.
 *
 * Two things happen when the app opens:
 *  - if the player's name is on a recorded podium, they are handed the medal
 *    (and the season's cup, if that month closed a season);
 *  - everybody, champion or not, gets the congratulations notice naming the
 *    winners, so the whole island hears about it.
 *
 * Both are idempotent — a month already delivered is skipped — so this can run
 * on every open without ever handing out a prize twice.
 */
import { HONOURS, INSTA_PRIZES, honoursFor, latestHonours, podiumLine, seasonKeyOf, seasonOf, seasonYearOf, type MonthResult } from './honours';
import { announceHonour, claimHonour } from './rewards';

/** Hand this player everything they are recorded as having won. */
export function deliverHonours(displayName: string): number {
  if (!displayName.trim()) return 0;
  let given = 0;
  for (const { result, place } of honoursFor(displayName)) {
    const { medal, cup } = claimHonour({
      monthKey: result.key,
      label: result.label,
      place,
      endsSeason: result.endsSeason,
      season: seasonOf(result),
      seasonKey: seasonKeyOf(result),
      seasonYear: seasonYearOf(result),
    });
    if (medal || cup) given += 1;
  }
  return given;
}

/** The congratulations line for a month, as everybody sees it. */
export function congratulations(result: MonthResult, forName: string): string {
  const mine = honoursFor(forName).find((entry) => entry.result.key === result.key);
  if (mine) {
    return `🎉 Congratulations! You finished ${['1st', '2nd', '3rd'][mine.place - 1]} in ${result.label}. `
      + `${podiumLine(result)} — and your Insta prize: ${INSTA_PRIZES[mine.place]}`;
  }
  return `🏆 ${result.label} champions: ${podiumLine(result)}. Congratulations to all three! `
    + 'Finish a month in the top three to win a medal of your own.';
}

/** Tell this player about any recorded month they have not been told about. */
export function announceHonours(displayName: string): number {
  let told = 0;
  // Oldest first, so a player who has been away reads them in the right order.
  for (const result of [...HONOURS].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    if (announceHonour(result.key, congratulations(result, displayName))) told += 1;
  }
  return told;
}

/** Everything at once: hand out the prizes, then tell everybody. */
export function settleHonours(displayName: string) {
  const given = deliverHonours(displayName);
  const told = announceHonours(displayName);
  return { given, told, latest: latestHonours() };
}
