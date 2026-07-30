import { countTodayAsPlayed, todayKey, yesterdayKey, type StreakState } from '../game/progress';
import { loadLocalProfile, saveLocalProfile } from './localProfile';
import { recordPlayDay } from './gameData';
import { spendStreakHolder } from './rewards';

let markedThisVisit = false;

/** Whole days between a YYYY-MM-DD key and today. */
function dayGap(lastPlayed: string, now = new Date()): number {
  const then = Date.parse(`${lastPlayed}T00:00:00Z`);
  const today = Date.parse(`${todayKey(now)}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(today)) return 999;
  return Math.round((today - then) / 86400000);
}

/**
 * Count today as a real play day — the ONLY way to earn a streak.
 *
 * Call this only when the player is genuinely playing a game (they scored/won,
 * or they've stayed in a game long enough to be playing it). Never call it on
 * page load: just visiting the site, or clicking into a game and leaving, must
 * not count.
 *
 * It does its real work once per visit: it bumps the on-device streak right
 * away (so guests get one too), and records the day on the server — which uses
 * the server's own clock, so winding the device date forward can't fake it.
 * Returns the new streak so the caller can refresh what's on screen, or null if
 * the day was already counted this visit.
 */
export async function markPlayedToday(): Promise<StreakState | null> {
  if (markedThisVisit) return null;
  markedThisVisit = true;

  const profile = loadLocalProfile();
  const before: StreakState = { lastPlayed: profile.lastPlayed, streak: profile.streak, daysPlayed: profile.daysPlayed };

  // Streak Holder: if you missed a day or two (a gap of 2–3 days) but the holder
  // is armed, spend a charge to bridge the gap so today continues your streak.
  const gap = before.lastPlayed ? dayGap(before.lastPlayed) : 999;
  const bridged = gap >= 2 && gap <= 3 && spendStreakHolder();
  if (bridged) before.lastPlayed = yesterdayKey();

  const local = countTodayAsPlayed(before);
  if (local.lastPlayed !== profile.lastPlayed || bridged) {
    saveLocalProfile({ ...profile, streak: local.streak, daysPlayed: local.daysPlayed, lastPlayed: local.lastPlayed });
  }

  try {
    const row = await recordPlayDay();   // server (authoritative); no-op / throws for guests
    // When the holder bridged a gap, keep the saved on-device streak — the server
    // clock can't know about the holder, so we don't let it reset us here.
    if (row && !bridged) {
      // Keep the higher streak so a holder-bridge from a PREVIOUS session (which
      // the server never learned about) isn't undone here. In the normal case
      // local and server already agree, so this is a no-op.
      const streak = Math.max(row.streak, local.streak);
      const server: StreakState = { lastPlayed: row.last_played ?? local.lastPlayed, streak, daysPlayed: row.days_played };
      saveLocalProfile({ ...loadLocalProfile(), ...server });
      return server;
    }
  } catch { /* offline or guest — the device streak above already counted it */ }
  return local;
}
