/**
 * "What are they playing?" has to be answered by the friend's own app, live.
 *
 * It was broken two ways at once: the Friends panel joined the presence channel
 * a SECOND time in the same browser (the second subscription quietly receives
 * nothing), and the one that did receive the list threw it away. These checks
 * cover the shared list that replaced all that.
 */
import { clearOnline, presenceReady, publishOnline, watchOnline, whereIsFriend, type OnlinePlayer } from '../../src/lib/islandPresence';
import { placeAtPath } from '../../src/game/gameRoutes';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

const player = (id: string, name: string, place = '', icon = ''): OnlinePlayer =>
  ({ id, name, character: '', place, icon, at: Date.now() });

// ---- nothing is claimed before the app has actually heard back -------------
clearOnline();
check('nothing is known before the island answers', presenceReady(), false);

// A reader gets the list it missed, rather than waiting for the next change.
let seen: OnlinePlayer[] = [];
const stop = watchOnline((list) => { seen = list; });
check('a new reader starts with an empty list', seen, []);

publishOnline([player('ana', 'Ana', 'Chess', '♟️')]);
check('the list reaches the reader', seen.map((p) => p.name), ['Ana']);
check('  ...and the app now counts as ready', presenceReady(), true);

// An EMPTY answer still counts as an answer: an island with nobody else on it
// must say "not online", never sit on "Looking…" for ever.
publishOnline([]);
check('an empty island is still an answer', presenceReady(), true);
check('  ...and the reader is told it is empty', seen, []);

// A reader that joins late is handed what is already known.
publishOnline([player('ben', 'Ben', 'the Market', '🏪')]);
let late: OnlinePlayer[] = [];
const stopLate = watchOnline((list) => { late = list; });
check('a late reader gets the current list at once', late.map((p) => p.name), ['Ben']);

// Stopping really stops.
stopLate();
publishOnline([player('cal', 'Cal')]);
check('a stopped reader hears no more', late.map((p) => p.name), ['Ben']);
check('  ...while a live one keeps up', seen.map((p) => p.name), ['Cal']);
stop();

// Signing out must not leave a stale list behind.
clearOnline();
check('signing out forgets everyone', presenceReady(), false);

// ---- what it says about a friend -------------------------------------------
const online = [player('ana', 'Ana', 'Chess', '♟️'), player('ben', 'Ben')];
check('a friend in a game is named', whereIsFriend(online, 'ana').text, 'Playing Chess');
check('  ...with the game’s own icon', whereIsFriend(online, 'ana').icon, '♟️');
check('a friend just on the island', whereIsFriend(online, 'ben').text, 'On the island, not in a game');
check('a friend who is not there', whereIsFriend(online, 'nobody').online, false);

// The place names come from the same table the menu navigates by.
check('a game address becomes its name', placeAtPath('/play/fishing')?.name, 'Fishing Frenzy');
check('  ...and the house', placeAtPath('/house')?.name, 'their House');

process.exit(bad ? 1 : 0);
