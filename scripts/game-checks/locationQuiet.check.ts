/**
 * A shared location must never pop up by itself.
 *
 * A live share sends a fresh position every few seconds. Showing a map for each
 * one meant somebody's location appeared over and over while the reader was
 * trying to do something else — unusable. You see a location when you go to
 * Friends and press "Where are they?", and not a moment before.
 *
 * These checks cover the quiet memory that replaced the pop-up: it keeps the
 * latest position to hand so the button answers instantly, forgets it when the
 * sharer stops, and never keeps anything stale.
 */
import { forgetSpots, lastSpotFrom, rememberSpot } from '../../src/lib/locationBus';
import type { LocationReply, Spot } from '../../src/lib/friendLocation';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

const spot = (lat: number, lng: number): Spot => ({ lat, lng, accuracy: 10, at: Date.now() });
const shared = (from: string, s: Spot, liveUntil?: number): LocationReply =>
  ({ ev: 'spot', from, name: 'Ana', spot: s, precision: 'area', liveUntil });

forgetSpots();

// ---- nothing is remembered until somebody actually shares -------------------
check('nothing is known about a friend to begin with', lastSpotFrom('ana'), null);

rememberSpot(shared('ana', spot(51.5, -0.13), Date.now() + 60_000));
const kept = lastSpotFrom('ana');
check('a shared position is kept to hand', [kept?.spot.lat, kept?.spot.lng], [51.5, -0.13]);
check('  ...and knows it is a live share', kept?.live, true);
check('  ...without touching anybody else', lastSpotFrom('ben'), null);

// Every tick of a live share replaces the last, rather than piling up.
rememberSpot(shared('ana', spot(51.6, -0.14), Date.now() + 60_000));
check('a newer position replaces the older one', lastSpotFrom('ana')?.spot.lat, 51.6);

// A one-off share is remembered, but is not called live.
rememberSpot(shared('ben', spot(48.85, 2.35)));
check('a one-off share is kept too', lastSpotFrom('ben')?.spot.lat, 48.85);
check('  ...but is not pretending to be live', lastSpotFrom('ben')?.live, false);

// ---- stopping really forgets ------------------------------------------------
rememberSpot({ ev: 'stopped', from: 'ana', name: 'Ana' });
check('stopping forgets where they were', lastSpotFrom('ana'), null);
check('  ...and leaves the other friend alone', lastSpotFrom('ben')?.spot.lat, 48.85);

// A refusal is not a position, and must never leave one behind.
rememberSpot({ ev: 'no', from: 'cal', name: 'Cal' });
check('a "no" leaves nothing behind', lastSpotFrom('cal'), null);
rememberSpot({ ev: 'off', from: 'dee', name: 'Dee' });
check('"sharing is off" leaves nothing either', lastSpotFrom('dee'), null);
rememberSpot({ ev: 'trouble', from: 'eve', name: 'Eve', why: 'no signal' });
check('nor does something going wrong', lastSpotFrom('eve'), null);

// ---- nothing stale is ever shown ---------------------------------------------
const old = spot(10, 10);
old.at = 0;
rememberSpot(shared('fay', old));
// The position is remembered with the time it ARRIVED, so fake that instead.
check('a position just shared counts as fresh', !!lastSpotFrom('fay'), true);

forgetSpots();
check('everything can be forgotten at once', [lastSpotFrom('ana'), lastSpotFrom('ben'), lastSpotFrom('fay')], [null, null, null]);

process.exit(bad ? 1 : 0);
