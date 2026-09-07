import { HONOURS, MEDALS, honoursFor, latestHonours, placeIn, podiumLine, seasonKeyOf, seasonOf, seasonYearOf } from '../../src/lib/honours';
import { loadRewards } from '../../src/lib/rewards';
import { congratulations, deliverHonours, settleHonours } from '../../src/lib/honourDelivery';

// Rewards live in localStorage, so give the checks one.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
};
const wipe = () => store.clear();

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

const august = HONOURS.find((h) => h.key === '2026-8')!;

// ---- the recorded result ---------------------------------------------------
check('August 2026 is on the roll of honour', !!august, true);
check('the podium is Chonchon16, jimmy, cat', august.podium, ['Chonchon16', 'jimmy', 'cat']);
check('August closed a season', august.endsSeason, true);
check('  ...and that season is summer 2026', seasonKeyOf(august), 'summer-2026');
check('  ...so the cup is the Summer Champion Cup', seasonOf(august).name, 'Summer');
check('  ...of the year 2026', seasonYearOf(august), 2026);
check('places are read in podium order', [placeIn(august, 'chonchon16'), placeIn(august, 'jimmy'), placeIn(august, 'cat')], [1, 2, 3]);
check('somebody else is not on the podium', placeIn(august, 'someone-else'), null);
check('a name matches whatever the capitals', placeIn(august, 'chonchon16'), 1);
check('  ...and with stray spaces', placeIn(august, '  jimmy '), 2);
check('the podium line names all three', podiumLine(august), '🥇 Chonchon16 · 🥈 jimmy · 🥉 cat');
check('the latest month is August 2026', latestHonours()?.key, '2026-8');

// ---- the winner really gets the goods --------------------------------------
wipe();
check('chonchon16 is handed one month', deliverHonours('chonchon16'), 1);
let state = loadRewards();
check('  ...and gets a Summer Champion Cup', state.cups.map((c) => c.name), ['Summer Champion Cup']);
check('  ...and the August 1st place medal', [state.medals[0]?.label, state.medals[0]?.place], ['August 2026', 1]);
check('  ...and a champion\'s Streak Holder', state.uses.streakHolder > 0, true);
check('  ...and is told about it', state.notices.some((n) => n.text.includes('Congratulations') && n.text.includes('Summer Champion Cup')), true);
check('  ...and it is in the history', state.history.length >= 2, true);

// Running again must not hand out a second cup.
check('a second delivery gives nothing more', deliverHonours('chonchon16'), 0);
state = loadRewards();
check('  ...still exactly one cup', state.cups.length, 1);
check('  ...still exactly one medal', state.medals.length, 1);

// ---- second and third place -------------------------------------------------
wipe();
deliverHonours('jimmy');
state = loadRewards();
check('jimmy gets the same Summer cup', state.cups.map((c) => c.name), ['Summer Champion Cup']);
check('  ...with the 2nd place medal', state.medals[0]?.place, 2);

wipe();
deliverHonours('cat');
state = loadRewards();
check('cat gets the same Summer cup', state.cups.map((c) => c.name), ['Summer Champion Cup']);
check('  ...with the 3rd place medal', state.medals[0]?.place, 3);

// ---- everybody else ---------------------------------------------------------
wipe();
check('a player not on the podium wins nothing', deliverHonours('someone-else'), 0);
state = loadRewards();
check('  ...no cup', state.cups.length, 0);
check('  ...and no medal', state.medals.length, 0);

// ...but they are still told who won.
const { told } = settleHonours('someone-else');
check('everybody is told who the champions were', told, HONOURS.length);
state = loadRewards();
const announcement = state.notices.find((n) => n.text.includes('champions'))!;
check('the announcement names all three', ['chonchon16', 'jimmy', 'cat'].every((who) => announcement.text.toLowerCase().includes(who)), true);
check('  ...and congratulates them', announcement.text.includes('Congratulations'), true);
check('telling them twice does not repeat it', settleHonours('someone-else').told, 0);

// A champion's own notice is about them, not a bulletin about other people.
wipe();
settleHonours('chonchon16');
state = loadRewards();
check("a champion's notice is personal", state.notices.some((n) => n.text.includes('You finished 1st')), true);
check('  ...and names their Insta prize', state.notices.some((n) => n.text.includes('Insta profile')), true);

// ---- the wording ------------------------------------------------------------
check('a winner is congratulated by name', congratulations(august, 'jimmy').startsWith('🎉 Congratulations!'), true);
check('everyone else gets the bulletin', congratulations(august, 'nobody').startsWith('🏆 August 2026 champions'), true);
check('a guest with no name still gets it', congratulations(august, '').toLowerCase().includes('chonchon16'), true);

// ---- the roll of honour holds together --------------------------------------
check('every recorded month has three on the podium', HONOURS.every((h) => h.podium.length === 3), true);
check('no month is recorded twice', new Set(HONOURS.map((h) => h.key)).size, HONOURS.length);
check('no name appears twice on one podium', HONOURS.every((h) => new Set(h.podium.map((p) => p.toLowerCase())).size === 3), true);
check('every place has a medal picture', [1, 2, 3].every((p) => MEDALS[p as 1 | 2 | 3].art.endsWith('.png')), true);
check('honoursFor finds the month for a winner', honoursFor('cat').map((e) => e.result.key), ['2026-8']);
check('honoursFor finds nothing for a stranger', honoursFor('stranger').length, 0);
check('a blank name finds nothing', honoursFor('   ').length, 0);

process.exit(bad ? 1 : 0);
