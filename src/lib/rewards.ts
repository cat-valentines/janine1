/**
 * Rewards & prizes.
 *
 * Players win prizes by finishing the season at the top of the leaderboard,
 * and everyone gets a welcome kit to start. Prizes come in two shapes:
 *  - Trophies (seasonal cups) — kept forever, shown off in the profile.
 *  - Consumables (streak-holder, hint potion, bubble potion, weapon) — each has
 *    a limited number of uses; used up, they retire into your reward history.
 *
 * Everything lives on-device (like coins and stars) so it works signed-out too.
 * A queue of "notices" feeds the notification bell whenever a prize lands.
 */
import { storage } from './storage';

export type ConsumableKind = 'streakHolder' | 'hint' | 'bubble' | 'weapon';

export interface ConsumableInfo { kind: ConsumableKind; icon: string; name: string; desc: string; usesPerGrant: number }

export const CONSUMABLES: Record<ConsumableKind, ConsumableInfo> = {
  streakHolder: { kind: 'streakHolder', icon: '🧊', name: 'Streak Holder', desc: 'Holds your streak for up to 2 days if you forget to play. Activate it, then it saves you automatically.', usesPerGrant: 5 },
  hint: { kind: 'hint', icon: '🔮', name: 'Magic Hint Potion', desc: 'On a quest, points you straight to the nearest star. Activate it when you are stuck.', usesPerGrant: 5 },
  bubble: { kind: 'bubble', icon: '🫧', name: 'Bubble Potion', desc: 'A protective bubble for 20 seconds — pop it on when you need to battle other players on a quest.', usesPerGrant: 5 },
  weapon: { kind: 'weapon', icon: '⚔️', name: 'Star Sword', desc: 'Arm yourself on a quest — a glowing blade that helps you fight and move faster for 20 seconds.', usesPerGrant: 5 },
};

/** Seasonal cups — the trophy you win for topping the leaderboard that season. */
export interface SeasonInfo { key: 'spring' | 'summer' | 'autumn' | 'winter'; name: string; cup: string; vines: string }
export const SEASONS: Record<SeasonInfo['key'], SeasonInfo> = {
  spring: { key: 'spring', name: 'Spring', cup: '🏆', vines: '🌱🌷🌿' },
  summer: { key: 'summer', name: 'Summer', cup: '🏆', vines: '🌻🌸🍃' },
  autumn: { key: 'autumn', name: 'Autumn', cup: '🏆', vines: '🍁🍂🌾' },
  winter: { key: 'winter', name: 'Winter', cup: '🏆', vines: '❄️🎄⛄' },
};

/** Which season a month falls in (northern-hemisphere seasons). */
export function seasonForMonth(month: number): SeasonInfo {
  if (month >= 2 && month <= 4) return SEASONS.spring;
  if (month >= 5 && month <= 7) return SEASONS.summer;
  if (month >= 8 && month <= 10) return SEASONS.autumn;
  return SEASONS.winter;
}

export interface Cup { id: string; season: SeasonInfo['key']; name: string; cup: string; vines: string; wonAt: string }
export interface HistoryItem { id: string; icon: string; text: string; at: string }
export interface RewardNotice { id: string; icon: string; text: string; at: string }

export interface RewardsState {
  cups: Cup[];
  uses: Record<ConsumableKind, number>;
  /** Armed streak-holder — set while it is watching your streak. */
  streakHolderArmed: boolean;
  history: HistoryItem[];
  earnedSeasons: string[];   // e.g. "summer-2026", so a cup is won once per season
  welcomed: boolean;
  notices: RewardNotice[];   // unread prize notices for the bell
  totalWon: number;
}

const KEY = 'magic-islands-rewards';
let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter += 1)}`;

const empty = (): RewardsState => ({
  cups: [], uses: { streakHolder: 0, hint: 0, bubble: 0, weapon: 0 },
  streakHolderArmed: false, history: [], earnedSeasons: [], welcomed: false, notices: [], totalWon: 0,
});

export function loadRewards(): RewardsState {
  const raw = storage.get(KEY);
  if (!raw) return empty();
  try { return { ...empty(), ...(JSON.parse(raw) as Partial<RewardsState>) }; } catch { return empty(); }
}

function save(state: RewardsState): RewardsState { storage.set(KEY, JSON.stringify(state)); return state; }

function logHistory(state: RewardsState, icon: string, text: string) {
  state.history.unshift({ id: uid('h'), icon, text, at: new Date().toISOString() });
  state.history = state.history.slice(0, 100);
}
function notice(state: RewardsState, icon: string, text: string) {
  state.notices.unshift({ id: uid('n'), icon, text, at: new Date().toISOString() });
  state.notices = state.notices.slice(0, 30);
}

/** Give a consumable (adds a grant's worth of uses) and record it. */
function grantConsumable(state: RewardsState, kind: ConsumableKind, silent = false) {
  const info = CONSUMABLES[kind];
  state.uses[kind] += info.usesPerGrant;
  state.totalWon += 1;
  logHistory(state, info.icon, `Won ${info.name} (${info.usesPerGrant} uses)`);
  if (!silent) notice(state, info.icon, `🎁 You won a ${info.name}! ${info.usesPerGrant} uses added.`);
}

/** First-ever visit: a friendly starter kit so the rewards shelf isn't empty. */
export function grantWelcomeKit(): RewardsState {
  const state = loadRewards();
  if (state.welcomed) return state;
  state.welcomed = true;
  grantConsumable(state, 'streakHolder', true);
  grantConsumable(state, 'hint', true);
  logHistory(state, '🎉', 'Welcome gift: a Streak Holder and Hint Potions');
  notice(state, '🎉', '🎁 Welcome gift! A Streak Holder and Magic Hint Potions are waiting in your Rewards.');
  return save(state);
}

/**
 * If you are in the top of the leaderboard this season and haven't won this
 * season's cup yet, award it — plus a bundle of consumables. Returns the cup if
 * one was granted, else null.
 */
export function awardSeasonalCupIfTop(rank: number | null, year: number, month: number): Cup | null {
  if (rank === null || rank > 3) return null;
  const season = seasonForMonth(month);
  const seasonKey = `${season.key}-${year}`;
  const state = loadRewards();
  if (state.earnedSeasons.includes(seasonKey)) return null;

  state.earnedSeasons.push(seasonKey);
  const cup: Cup = { id: uid('cup'), season: season.key, name: `${season.name} Champion Cup`, cup: season.cup, vines: season.vines, wonAt: new Date().toISOString() };
  state.cups.unshift(cup);
  state.totalWon += 1;
  logHistory(state, '🏆', `Won the ${cup.name} (leaderboard #${rank})`);
  notice(state, '🏆', `🏆 You won the ${cup.name} for finishing #${rank} on the leaderboard! Plus a bundle of potions.`);
  // A champion's bundle.
  grantConsumable(state, 'bubble', true);
  grantConsumable(state, 'weapon', true);
  grantConsumable(state, 'hint', true);
  save(state);
  return cup;
}

/** Use one charge of a consumable. Returns true if a charge was spent. */
export function useConsumable(kind: ConsumableKind): boolean {
  const state = loadRewards();
  if (state.uses[kind] <= 0) return false;
  state.uses[kind] -= 1;
  if (state.uses[kind] === 0) {
    logHistory(state, CONSUMABLES[kind].icon, `Used up all your ${CONSUMABLES[kind].name}s`);
    if (kind === 'streakHolder') state.streakHolderArmed = false;
  }
  save(state);
  return true;
}

/** Arm / disarm the streak-holder (must have a use available to arm it). */
export function setStreakHolderArmed(armed: boolean): RewardsState {
  const state = loadRewards();
  if (armed && state.uses.streakHolder <= 0) return state;
  state.streakHolderArmed = armed;
  return save(state);
}

/**
 * Called by the streak logic: you missed some days but the holder is armed, so
 * spend one charge to save the streak. Returns true if it saved you.
 */
export function spendStreakHolder(): boolean {
  const state = loadRewards();
  if (!state.streakHolderArmed || state.uses.streakHolder <= 0) return false;
  state.uses.streakHolder -= 1;
  logHistory(state, '🧊', 'Streak Holder saved your streak!');
  notice(state, '🧊', '🧊 Your Streak Holder saved your streak! Nice save.');
  if (state.uses.streakHolder === 0) { state.streakHolderArmed = false; logHistory(state, '🧊', 'Used up all your Streak Holders'); }
  save(state);
  return true;
}

/** Pull (and clear) the queued prize notices, for merging into the bell. */
export function drainRewardNotices(): RewardNotice[] {
  const state = loadRewards();
  const out = state.notices;
  if (out.length) { state.notices = []; save(state); }
  return out;
}

/** Read the notices without clearing them (for the bell to display live). */
export function peekRewardNotices(): RewardNotice[] {
  return loadRewards().notices;
}

export const totalRewardsWon = () => loadRewards().totalWon;
