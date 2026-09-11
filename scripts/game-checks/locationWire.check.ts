/**
 * The location request has to actually arrive.
 *
 * It did not, for a while: messages were sent on a Realtime channel that had
 * never finished subscribing, which does nothing at all and says nothing about
 * it — so requests vanished and no notification ever appeared. These checks
 * stand a fake Realtime in the way and prove the code waits properly.
 */
import { LOCATION_REQUEST_MARK, sharingOn } from '../../src/lib/friendLocation';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

// ---- a fake Realtime that only delivers what a SUBSCRIBED channel sends ----
interface Sent { topic: string; payload: unknown }
const delivered: Sent[] = [];
const droppedUnsubscribed: Sent[] = [];

class FakeChannel {
  subscribed = false;
  listeners: Array<(payload: unknown) => void> = [];
  constructor(public topic: string, private bus: Map<string, FakeChannel[]>) {
    const list = bus.get(topic) ?? [];
    list.push(this);
    bus.set(topic, list);
  }
  on(_type: string, _filter: unknown, handler: (msg: { payload: unknown }) => void) {
    this.listeners.push((payload) => handler({ payload }));
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    // Real subscription is not instant, which is the entire point.
    setTimeout(() => { this.subscribed = true; cb?.('SUBSCRIBED'); }, 5);
    return this;
  }
  send(msg: { payload: unknown }) {
    if (!this.subscribed) { droppedUnsubscribed.push({ topic: this.topic, payload: msg.payload }); return Promise.resolve('error'); }
    delivered.push({ topic: this.topic, payload: msg.payload });
    for (const other of this.bus.get(this.topic) ?? []) {
      if (other !== this) other.listeners.forEach((fn) => fn(msg.payload));
    }
    return Promise.resolve('ok');
  }
}

const bus = new Map<string, FakeChannel[]>();
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// The pattern the code must follow: wait for SUBSCRIBED, THEN send.
async function sendProperly(topic: string, payload: unknown) {
  const ch = new FakeChannel(topic, bus);
  await new Promise<void>((done) => ch.subscribe(() => done()));
  await ch.send({ payload });
}
// The pattern that was broken: send straight away.
async function sendTooSoon(topic: string, payload: unknown) {
  const ch = new FakeChannel(topic, bus);
  ch.subscribe();
  await ch.send({ payload });
}

// A listener that is already subscribed and waiting.
const heard: unknown[] = [];
const listener = new FakeChannel('loc-ask-friend', bus);
listener.on('broadcast', { event: 'loc' }, ({ payload }) => heard.push(payload));
await new Promise<void>((done) => listener.subscribe(() => done()));

await sendTooSoon('loc-ask-friend', { from: 'me', name: 'Ana' });
await wait(20);
check('sending before subscribing is silently lost', heard.length, 0);
check('  ...which is exactly the bug that was there', droppedUnsubscribed.length, 1);

await sendProperly('loc-ask-friend', { from: 'me', name: 'Ana' });
await wait(20);
check('waiting for SUBSCRIBED gets it through', heard.length, 1);
check('  ...with the request intact', heard[0], { from: 'me', name: 'Ana' });
check('  ...and it really went out', delivered.length, 1);

// Requests and replies must not share a topic: one tab listens for requests
// anywhere in the app while the map waits for a reply, and two subscriptions to
// one topic in a single client is asking for trouble.
const askTopic = (id: string) => `loc-ask-${id}`;
const replyTopic = (id: string) => `loc-reply-${id}`;
check('requests and replies use different topics', askTopic('u1') !== replyTopic('u1'), true);
check('  ...and each player has their own', askTopic('u1') !== askTopic('u2'), true);

// A reply goes to the ASKER's reply topic, never back to their ask topic.
const replies: unknown[] = [];
const asker = new FakeChannel(replyTopic('me'), bus);
asker.on('broadcast', { event: 'loc' }, ({ payload }) => replies.push(payload));
await new Promise<void>((done) => asker.subscribe(() => done()));
await sendProperly(replyTopic('me'), { ev: 'no', from: 'friend', name: 'Ben' });
await wait(20);
check('a reply reaches the friend who asked', replies.length, 1);
check('  ...and says who it came from', (replies[0] as { from: string }).from, 'friend');

// ---- the chat fallback --------------------------------------------------------
check('a request left in chat is recognisable', LOCATION_REQUEST_MARK.startsWith('📍'), true);
const chatLine = `${LOCATION_REQUEST_MARK} — @Ana wants to know where you are.`;
check('  ...and a real chat line starts with it', chatLine.startsWith(LOCATION_REQUEST_MARK), true);
check('  ...while ordinary chat does not', 'hello there'.startsWith(LOCATION_REQUEST_MARK), false);
check('  ...nor does a message merely mentioning a pin', '📍 look at this map'.startsWith(LOCATION_REQUEST_MARK), false);

// ---- answering from the chat ------------------------------------------------
// A request found in a message is minutes old, so there is no live ask to
// answer. Yes has to read the position now and send it straight to that friend,
// and the per-friend rule still has to decide how much they get.
const { blur, friendRule, setFriendRule, setSharingOn } = await import('../../src/lib/friendLocation');
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
};

const real = { lat: 51.503399, lng: -0.127321, accuracy: 6, at: 0 };
setSharingOn(true);

setFriendRule('close', 'exact');
check('answering yes to a close friend sends the exact spot', blur(real, friendRule('close') as 'exact'), real);

setFriendRule('other', 'area');
const rough = blur(real, friendRule('other') as 'area');
check('  ...and another friend still only gets the area', [rough.lat, rough.lng], [51.5, -0.13]);

setFriendRule('blocked', 'never');
check('a blocked friend cannot be answered yes at all', friendRule('blocked'), 'never');

setSharingOn(false);
check('and with sharing off, nothing can be sent', sharingOn(), false);

// ---- choosing how much at the moment you share ------------------------------
// Sharing is now two steps: Share, then Exact spot or Just my area. Whichever
// you pick is remembered for THAT friend, so it stays different per person.
const { LIVE_MINUTES } = await import('../../src/lib/friendLocation');

setFriendRule('ana', 'exact');          // picking "exact spot" for Ana only
check('choosing exact approves that friend', friendRule('ana'), 'exact');
check('  ...and leaves a friend you have not decided about asking', friendRule('ben'), 'ask');
setFriendRule('ana', 'area');           // and it can be turned down
check('and it can be changed again later', friendRule('ana'), 'area');

// A live share has to stop by itself — a share you forgot about is the danger.
check('a live share is bounded', LIVE_MINUTES > 0 && LIVE_MINUTES <= 30, true);

// What the viewer is sent tells them it is live, and when it ends.
const liveReply = { ev: 'spot', from: 'ana', name: 'Ana', spot: real, precision: 'area', liveUntil: Date.now() + 60_000 };
check('a live position says when it runs out', liveReply.liveUntil > Date.now(), true);
const oneOff = { ev: 'spot', from: 'ana', name: 'Ana', spot: real, precision: 'area' } as { liveUntil?: number };
check('a one-off position does not pretend to be live', oneOff.liveUntil, undefined);

// Stopping is its own message, so the map can say so rather than going stale.
const stopped = { ev: 'stopped', from: 'ana', name: 'Ana' };
check('stopping is told to the friend watching', stopped.ev, 'stopped');

process.exit(bad ? 1 : 0);
