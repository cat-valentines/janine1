import { countTodayAsPlayed, type StreakState } from '../game/progress';
import { loadLocalProfile, saveLocalProfile } from './localProfile';
import { recordPlayDay } from './gameData';

let markedThisVisit = false;

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
  const local = countTodayAsPlayed(before);
  if (local.lastPlayed !== before.lastPlayed) {
    saveLocalProfile({ ...profile, streak: local.streak, daysPlayed: local.daysPlayed, lastPlayed: local.lastPlayed });
  }

  try {
    const row = await recordPlayDay();   // server (authoritative); no-op / throws for guests
    if (row) {
      const server: StreakState = { lastPlayed: row.last_played ?? local.lastPlayed, streak: row.streak, daysPlayed: row.days_played };
      saveLocalProfile({ ...loadLocalProfile(), ...server });
      return server;
    }
  } catch { /* offline or guest — the device streak above already counted it */ }
  return local;
}
