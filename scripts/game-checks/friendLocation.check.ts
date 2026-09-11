import {
  blur, distanceWords, friendApproved, friendRule, friendRules, kmBetween, mapEmbedUrl, mapLinkUrl,
  setFriendRule, setSharingOn, sharingOn, unapproveFriend, type Spot,
} from '../../src/lib/friendLocation';
import { placeAtPath } from '../../src/game/gameRoutes';
import { whereIsFriend, type OnlinePlayer } from '../../src/lib/islandPresence';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
};

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

const spot = (lat: number, lng: number, accuracy = 8): Spot => ({ lat, lng, accuracy, at: 0 });

// ---- sharing is OFF until you say otherwise --------------------------------
// The most important line here. A child who never touches these settings must
// never be shareable, whatever anybody asks.
check('sharing starts switched off', sharingOn(), false);

// Share and Stop sharing are the whole of it — the one lasting setting, and it
// can always be taken straight back.
setSharingOn(true);
check('Share switches it on', sharingOn(), true);
setSharingOn(false);
check('Stop sharing switches it straight back off', sharingOn(), false);
setSharingOn(true);
setSharingOn(true);
check('pressing Share twice changes nothing', sharingOn(), true);
setSharingOn(false);
check('and off stays off', sharingOn(), false);

// ---- what each friend may see, one friend at a time -------------------------
// The default matters most: a friend you have never thought about must get the
// cautious answer, never your doorstep.
// Nobody is approved until you approve them — this is the one that matters.
check('a friend you have not decided about must ask', friendRule('best-friend'), 'ask');
check('  ...and is definitely not approved', friendApproved('best-friend'), false);
check('nobody has a rule to begin with', friendRules(), {});

setFriendRule('best-friend', 'exact');
check('approving a close friend for the exact spot', friendRule('best-friend'), 'exact');
check('  ...means they can look whenever they like', friendApproved('best-friend'), true);
check('  ...and changes nobody else', [friendRule('someone-else'), friendApproved('someone-else')], ['ask', false]);

setFriendRule('someone-else', 'never');
check('another can be shown nothing at all', friendRule('someone-else'), 'never');
check('  ...which is not approval either', friendApproved('someone-else'), false);
check('  ...and the close friend is untouched', friendRule('best-friend'), 'exact');

setFriendRule('best-friend', 'area');
check('approval can be turned down to the area', friendRule('best-friend'), 'area');
check('  ...and they can still look', friendApproved('best-friend'), true);

// Taking it back puts them all the way back to asking — no half-state.
unapproveFriend('best-friend');
check('stopping sharing makes them ask again', friendRule('best-friend'), 'ask');
check('  ...and they can no longer just look', friendApproved('best-friend'), false);
check('  ...leaving no clutter behind', Object.keys(friendRules()), ['someone-else']);

// Anything unexpected in storage is never read as approval.
setFriendRule('odd', 'nonsense' as 'exact');
check('a nonsense rule falls back to asking', friendRule('odd'), 'ask');
check('  ...and is not approval', friendApproved('odd'), false);

// Four friends, four different answers — the whole point.
setFriendRule('a', 'exact'); setFriendRule('b', 'area'); setFriendRule('c', 'never'); unapproveFriend('d');
check('every friend can be told something different',
  [friendRule('a'), friendRule('b'), friendRule('c'), friendRule('d')], ['exact', 'area', 'never', 'ask']);

// Rounding must genuinely lose the detail, not just look like it.
const home = spot(51.503399, -0.127321, 6);
const rough = blur(home, 'area');
check('a rough spot is really rounded', [rough.lat, rough.lng], [51.5, -0.13]);
check('  ...and stops pretending to be accurate', rough.accuracy >= 1000, true);
const movedInStreet = blur(spot(51.503812, -0.127901), 'area');
check('two doors down rounds to the same place', [movedInStreet.lat, movedInStreet.lng], [rough.lat, rough.lng]);
check('the rounding really moves the pin', kmBetween(home, rough) > 0.1, true);
check('  ...but only by about a kilometre', kmBetween(home, rough) < 1.5, true);
check('exact is left completely alone', blur(home, 'exact'), home);

// Rounding must work either side of zero, or a whole hemisphere drifts.
check('it rounds negative latitudes properly', blur(spot(-33.8688, 151.2093), 'area').lat, -33.87);
check('  ...and negative longitudes', blur(spot(-33.8688, -70.6693), 'area').lng, -70.67);
check('  ...and right on the equator', blur(spot(0.004, 0.004), 'area'), { lat: 0, lng: 0, accuracy: 1000, at: 0 });

// ---- how far away ------------------------------------------------------------
const london = spot(51.5074, -0.1278);
const paris = spot(48.8566, 2.3522);
const sydney = spot(-33.8688, 151.2093);
check('London to Paris is about 344 km', Math.round(kmBetween(london, paris)), 344);
// Halfway round the world: the exact figure shifts a little with the earth
// radius used, so check it is right to within a few kilometres.
check('London to Sydney is about 17000 km', Math.abs(kmBetween(london, sydney) - 16995) < 20, true);
check('a place is nowhere from itself', kmBetween(london, london), 0);
check('and distance reads the same both ways', kmBetween(london, paris), kmBetween(paris, london));

check('very close is said in words', distanceWords(0.01), 'right next to you');
check('close is said in metres', distanceWords(0.34), '340 m away');
check('nearby is said to one decimal', distanceWords(4.27), '4.3 km away');
check('far is said in whole kilometres', distanceWords(343.6), '344 km away');

// ---- the map links ------------------------------------------------------------
const url = mapEmbedUrl(london, 'exact');
check('the map is a real OpenStreetMap one', url.startsWith('https://www.openstreetmap.org/export/embed.html'), true);
check('  ...with the pin on the spot', url.includes(`marker=${london.lat},${london.lng}`), true);
check('a rough spot gets a wider map', mapEmbedUrl(london, 'area') !== url, true);
check('the "open in maps" link points there too', mapLinkUrl(london).includes(`mlat=${london.lat}`), true);

// ---- what are they playing ----------------------------------------------------
check('a game address is named', placeAtPath('/play/chess')?.name, 'Chess');
check('  ...and so is Fishing Frenzy', placeAtPath('/play/fishing')?.name, 'Fishing Frenzy');
check('  ...and the market', placeAtPath('/market')?.name, 'the Market');
check('  ...and a deeper page inside it', placeAtPath('/market/sell')?.name, 'the Market');
check('  ...and a game that takes an island name', placeAtPath('/play/medicine/Mosslight 1')?.name, 'Medicine Mission');
check('a trailing slash does not confuse it', placeAtPath('/play/chess/')?.name, 'Chess');
check('the front page is not a place', placeAtPath('/'), null);

const online: OnlinePlayer[] = [
  { id: 'a', name: 'Ana', character: '', place: 'Chess', icon: '♟️', at: Date.now() },
  { id: 'b', name: 'Ben', character: '', place: '', icon: '', at: Date.now() },
];
check('a friend in a game is reported', whereIsFriend(online, 'a').text, 'Playing Chess');
check('a friend just wandering about is too', whereIsFriend(online, 'b').text, 'On the island, not in a game');
check('a friend who is not there is honest', whereIsFriend(online, 'c'), { online: false, text: 'Not on Magical Islands right now', icon: '💤' });

process.exit(bad ? 1 : 0);
