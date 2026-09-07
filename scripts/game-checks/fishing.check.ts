import {
  BOAT_SPEED, FISHING_BOTS, FISH_KINDS, HOLD_SIZE, ROUND_SECONDS, SEA_H, SHORE_Y,
  atShore, boatSpeed, depthAt, fishById, fishForDepth, holdValue, payout, reelHit, reelWindow,
  rollFish, sailSeconds, shouldSailHome, standings, type Rarity,
} from '../../src/game/fishing';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

// ---- the sea makes sense --------------------------------------------------
check('the shore is at the bottom of the sea', SHORE_Y < SEA_H && SHORE_Y > SEA_H * 0.8, true);
check('depth is 0 at the shore', depthAt(SHORE_Y), 0);
check('depth is 1 at the very top', depthAt(0), 1);
check('the shore counts as the shore', [atShore(SHORE_Y), atShore(SHORE_Y - 1)], [true, false]);

// Rarer fish are worth more AND live further out — the whole risk/reward idea.
const order: Rarity[] = ['common', 'good', 'rare', 'legendary'];
const worst = (r: Rarity) => Math.min(...FISH_KINDS.filter((f) => f.rarity === r).map((f) => f.price));
const best = (r: Rarity) => Math.max(...FISH_KINDS.filter((f) => f.rarity === r).map((f) => f.price));
let pricesRise = true, depthsRise = true;
for (let i = 1; i < order.length; i += 1) {
  if (worst(order[i]) <= best(order[i - 1])) pricesRise = false;
  const deepest = Math.min(...FISH_KINDS.filter((f) => f.rarity === order[i]).map((f) => f.minDepth));
  const shallowest = Math.max(...FISH_KINDS.filter((f) => f.rarity === order[i - 1]).map((f) => f.minDepth));
  if (deepest < shallowest) depthsRise = false;
}
check('rarer fish always pay more', pricesRise, true);
check('rarer fish always live further out', depthsRise, true);
check('rarer fish are harder to reel', FISH_KINDS.every((f) =>
  order.indexOf(f.rarity) === 0 || f.difficulty > Math.min(...FISH_KINDS.filter((o) => order.indexOf(o.rarity) < order.indexOf(f.rarity)).map((o) => o.difficulty))), true);

// There is always something to catch, wherever you are.
check('shallow water still has fish', fishForDepth(0).length > 0, true);
check('deep water has the most choice', fishForDepth(1).length, FISH_KINDS.length);
check('the deepest fish are only in the deep', fishForDepth(0).some((f) => f.rarity === 'legendary'), false);

// ---- the reel bar is always winnable --------------------------------------
const windows = FISH_KINDS.map((k) => reelWindow(k));
check('every fish has a green band you can hit', windows.every((w) => w >= 0.12 && w <= 0.5), true);
check('a kraken is harder than a sardine', reelWindow(fishById('kraken')!) < reelWindow(fishById('sardine')!), true);
check('a press in the band lands the fish', reelHit(0.5, 0.4, 0.2), true);
check('a press before the band misses', reelHit(0.39, 0.4, 0.2), false);
check('a press after the band misses', reelHit(0.61, 0.4, 0.2), false);
check('the band edges count as a hit', [reelHit(0.4, 0.4, 0.2), reelHit(0.6, 0.4, 0.2)], [true, true]);

// ---- the hold --------------------------------------------------------------
check('an empty hold is worth nothing', holdValue([]), 0);
check('a hold adds its fish up', holdValue(['sardine', 'shark']), 3 + 45);
check('an unknown fish is worth nothing', holdValue(['boot']), 0);

// ---- when to sail home -----------------------------------------------------
check('an empty boat never runs home', shouldSailHome([], 100, 5), false);
check('a full hold always runs home', shouldSailHome(new Array(HOLD_SIZE).fill('sardine'), 100, 999), true);
const farOut = 40;
check('with plenty of time it keeps fishing', shouldSailHome(['shark'], farOut, ROUND_SECONDS), false);
check('with only the sail time left it runs', shouldSailHome(['shark'], farOut, sailSeconds(farOut) + 1), true);
check('sailing home from the shore is instant', sailSeconds(SHORE_Y), 0);
check('an empty boat sails at full speed', boatSpeed(0), BOAT_SPEED);

// A heavy boat is a slow boat — the decision the whole game turns on.
check('one fish already slows you a little', boatSpeed(1) < boatSpeed(0), true);
check('a full hold is much slower', boatSpeed(HOLD_SIZE) < boatSpeed(0) * 0.65, true);
check('but never so slow it is hopeless', boatSpeed(HOLD_SIZE) >= BOAT_SPEED * 0.55, true);
check('the slowdown has a floor', boatSpeed(HOLD_SIZE * 3), BOAT_SPEED * 0.55);

// The run home from the deep has to be a real slice of the round, or "race back
// to shore" means nothing. Empty it is brisk; loaded it really costs you.
const emptyRun = sailSeconds(0, 0);
const ladenRun = sailSeconds(0, HOLD_SIZE);
console.log(`      (run home from the deep: ${emptyRun.toFixed(1)}s empty, ${ladenRun.toFixed(1)}s full)`);
check('the run home from the deep is worth dreading', ladenRun > 6, true);
check('  ...and a full boat is far slower than an empty one', ladenRun > emptyRun * 1.5, true);
check('  ...but still a fraction of the round', ladenRun < ROUND_SECONDS / 8, true);

// ---- the scoreboard --------------------------------------------------------
const table = standings([
  { id: 'a', name: 'Ann', emoji: '🚤', banked: 40, hold: 2, you: false },
  { id: 'b', name: 'You', emoji: '⛵', banked: 90, hold: 0, you: true },
  { id: 'c', name: 'Cal', emoji: '🛶', banked: 40, hold: 0, you: false },
]);
check('most money banked comes first', table.map((r) => r.name), ['You', 'Cal', 'Ann']);
check('a tie is broken by who is carrying less', table[1].name, 'Cal');

// Only banked money counts — a full hold at the horn is worth nothing.
check('unsold fish earn no coins', payout(0, 1, 1), 0);
check('coins scale with what you sold', payout(120, 2, 3), 30);
check('winning a race pays a bonus', payout(120, 1, 3) - payout(120, 2, 3), 25);
check('there is no bonus on your own', payout(120, 1, 1), 30);

// ---- the animal skippers ---------------------------------------------------
check('four skippers, all different levels', FISHING_BOTS.map((b) => b.difficulty), [1, 2, 3, 4]);
check('tougher skippers reel better', FISHING_BOTS.every((b, i) => i === 0 || b.skill > FISHING_BOTS[i - 1].skill), true);
check('tougher skippers sail further out', FISHING_BOTS.every((b, i) => i === 0 || b.daring > FISHING_BOTS[i - 1].daring), true);
check('even the best is beatable on skill', FISHING_BOTS.every((b) => b.skill < 1), true);
check('every skipper has a picture', FISHING_BOTS.every((b) => b.asset.startsWith('/assets/') && b.asset.endsWith('.png')), true);

// The daring value has to actually reach fish worth catching.
for (const bot of FISHING_BOTS) {
  const canReach = fishForDepth(bot.daring);
  if (!canReach.length) { bad += 1; console.log(`FAIL  ${bot.name} dares no depth with any fish in it`); }
}
check('every skipper can reach some fish', true, true);
check('only the bravest can reach a kraken', FISHING_BOTS.filter((b) => b.daring >= fishById('kraken')!.minDepth).length, 1);

// ---- the fish that get put in the sea --------------------------------------
let shallowRoll = true;
for (let i = 0; i < 400; i += 1) {
  const kind = rollFish(0.1);
  if (kind.minDepth > 0.1) shallowRoll = false;
}
check('shallow water never spawns a deep fish', shallowRoll, true);
const deepRolls = Array.from({ length: 600 }, () => rollFish(1).rarity);
check('the deep still mostly gives common fish', deepRolls.filter((r) => r === 'common').length > deepRolls.filter((r) => r === 'legendary').length, true);
check('but legendaries do turn up out there', deepRolls.includes('legendary'), true);

process.exit(bad ? 1 : 0);
