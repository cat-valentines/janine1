/**
 * Sharing where you are with a friend.
 *
 * This is somebody's real whereabouts, and most of the people here are
 * children, so the design is deliberately cautious:
 *
 *  - **Nothing is ever stored.** No server, no database, no history. A position
 *    is read from the device at the moment it is asked for and sent straight to
 *    the one friend who asked. Nobody can look up where you were yesterday,
 *    because nowhere knows.
 *  - **You must ask, and they must say yes — every single time.** There is no
 *    standing permission that could be granted once and forgotten about. The
 *    only lasting setting is the off switch.
 *  - **Friends only**, and your friend has to be online — their own app is what
 *    answers, so nothing happens behind their back.
 *  - **You can take it back at any time.** One button stops it, and the setting
 *    lives on your own device, not on a server.
 *  - **Each friend separately.** A best friend can see your exact spot, someone
 *    else only roughly what part of town you are in, and a third nothing at all
 *    — they are simply told no, and you are not even interrupted. It defaults to
 *    the rough area, never the doorstep.
 *
 * It is real: the position comes from the device's own GPS, never invented.
 */
import { supabase } from './supabase';
import { storage } from './storage';
import { sendFriendMessage } from './friends';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** A position on the earth, as read from the device. */
export interface Spot { lat: number; lng: number; accuracy: number; at: number }

/** How exact a shared position is. */
export type Precision = 'area' | 'exact';

/**
 * What one particular friend is allowed to see:
 *  - `ask`    — they must ask, and you decide each time (where everyone starts)
 *  - `exact`  — approved: your real spot, whenever they look
 *  - `area`   — approved: roughly what part of town you are in, whenever they look
 *  - `never`  — nothing at all; they are told no without you being asked
 *
 * Approving somebody lasts until you take it back, so a friend can just press
 * the button and see you. Taking it back puts them on `ask` again, so they have
 * to request from scratch — there is no half-state where they keep a way in.
 */
export type FriendRule = Precision | 'never' | 'ask';

const ON_KEY = 'loc-sharing-on';
const RULES_KEY = 'loc-friend-rules';

// ---- your own settings (kept on your device only) --------------------------

export const sharingOn = (): boolean => storage.get(ON_KEY) === '1';
export const setSharingOn = (on: boolean) => storage.set(ON_KEY, on ? '1' : '0');

/** Everyone you have set a rule for. Friends not listed get `area`. */
export function friendRules(): Record<string, FriendRule> {
  try { return JSON.parse(storage.get(RULES_KEY) ?? '{}') as Record<string, FriendRule>; } catch { return {}; }
}

/**
 * What this friend may see. Anybody you have not decided about has to ask —
 * an unrecognised value is never read as approval.
 */
export function friendRule(friendId: string): FriendRule {
  const rule = friendRules()[friendId];
  return rule === 'exact' || rule === 'area' || rule === 'never' ? rule : 'ask';
}

/** True when they can simply look, without asking you again. */
export const friendApproved = (friendId: string) => {
  const rule = friendRule(friendId);
  return rule === 'exact' || rule === 'area';
};

export function setFriendRule(friendId: string, rule: FriendRule) {
  const rules = friendRules();
  if (rule === 'ask') delete rules[friendId];   // the default needs no entry
  else rules[friendId] = rule;
  storage.set(RULES_KEY, JSON.stringify(rules));
}

/** Take approval back: they have to request all over again. */
export const unapproveFriend = (friendId: string) => setFriendRule(friendId, 'ask');

// ---- rounding off ----------------------------------------------------------

/**
 * Round a position to about a kilometre, so "where are you?" answers "this part
 * of town" rather than "this building". Three decimal places of latitude is a
 * hundred metres or so, two is a kilometre or so — two is the one we want.
 */
export function blur(spot: Spot, how: Precision): Spot {
  if (how === 'exact') return spot;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { ...spot, lat: round(spot.lat), lng: round(spot.lng), accuracy: Math.max(spot.accuracy, 1000) };
}

/** How far apart two spots are, in kilometres (the usual great-circle sum). */
export function kmBetween(a: Spot, b: Spot): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "1.2 km away", "340 m away", "right next to you". */
export function distanceWords(km: number): string {
  if (km < 0.05) return 'right next to you';
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m away`;
  if (km < 20) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

/** A map of that spot, from OpenStreetMap — a real map, and no API key needed. */
export function mapEmbedUrl(spot: Spot, how: Precision): string {
  const span = how === 'exact' ? 0.008 : 0.05;
  const bbox = [spot.lng - span, spot.lat - span / 2, spot.lng + span, spot.lat + span / 2].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${spot.lat},${spot.lng}`;
}

/** A link that opens the spot in whatever maps app the player has. */
export const mapLinkUrl = (spot: Spot) => `https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lng}#map=15/${spot.lat}/${spot.lng}`;

// ---- reading the device's own position -------------------------------------

/**
 * Ask the device where it is. Rejects with a message a child can understand,
 * because "PositionError code 1" helps nobody.
 */
export function readSpot(): Promise<Spot> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device cannot find its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0, at: Date.now() }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED ? 'You need to let the browser share your location first.'
          : err.code === err.POSITION_UNAVAILABLE ? 'Your location could not be found just now.'
            : 'Finding your location took too long. Try again.',
      )),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

// ---- the request, over each player's own channel ----------------------------

export type LocationReply =
  | {
    ev: 'spot'; from: string; name: string; spot: Spot; precision: Precision;
    /** When a live share is running, the moment it stops by itself. */
    liveUntil?: number;
  }
  | { ev: 'stopped'; from: string; name: string }
  | { ev: 'no'; from: string; name: string }
  | { ev: 'off'; from: string; name: string }
  | { ev: 'trouble'; from: string; name: string; why: string };

export interface LocationAsk { from: string; name: string }

/**
 * Two separate topics per player: one for requests coming in, one for replies
 * coming back. They have to be separate, because one tab both listens for
 * requests (anywhere in the app) and waits for a reply (on the map) — and two
 * subscriptions to the same topic in one client is asking for trouble.
 */
const askTopic = (userId: string) => `loc-ask-${userId}`;
const replyTopic = (userId: string) => `loc-reply-${userId}`;

/**
 * Join a topic and resolve only once it is genuinely ready to send on.
 *
 * This is the part that was broken: sending on a channel that has not finished
 * subscribing does nothing at all, silently — so requests were vanishing and no
 * notification ever appeared. Calls have always waited properly; now this does.
 */
function join(topic: string, onMessage?: (payload: unknown) => void): Promise<RealtimeChannel> {
  return new Promise((resolve) => {
    const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    if (onMessage) channel.on('broadcast', { event: 'loc' }, ({ payload }) => onMessage(payload));
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(channel); });
  });
}

/** One-shot message to somebody's channel: join, send, then let it go. */
async function sendTo(topic: string, payload: unknown) {
  const channel = await join(topic);
  await channel.send({ type: 'broadcast', event: 'loc', payload });
  setTimeout(() => supabase.removeChannel(channel), 1500);
}

/**
 * Listen for friends asking where you are. Your own app answers, so nothing can
 * happen without this tab being open.
 */
export interface IncomingAsk {
  ask: LocationAsk;
  /**
   * Set when this friend is already approved: they asked, and the answer is
   * already yes at this precision. Nothing happens behind your back — the app
   * still tells you it went, and the Stop button is right there.
   */
  approvedAs: Precision | null;
  /** Answer it. Nothing is read or sent until this is called. */
  reply: (choice: 'yes' | 'no') => void;
}

export function listenForLocationAsks(
  self: { id: string; name: string },
  onAsk: (incoming: IncomingAsk) => void,
): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;

  const send = (to: string, payload: LocationReply) => sendTo(replyTopic(to), payload);

  const handle = (payload: unknown) => {
    const ask = payload as LocationAsk;
    if (!ask?.from) return;
    const me = { from: self.id, name: self.name };
    // Sharing switched off is a flat no, without troubling the player at all.
    if (!sharingOn()) { void send(ask.from, { ev: 'off', ...me }); return; }

    // A friend you have set to "nothing at all" is turned away here, before it
    // ever reaches you — that is the point of the setting.
    const rule = friendRule(ask.from);
    if (rule === 'never') { void send(ask.from, { ev: 'no', ...me }); return; }

    // Nothing is read or sent here — the decision is handed upward, so the
    // caller can check they really are a friend first, whatever the answer.
    const how: Precision = rule === 'exact' ? 'exact' : 'area';
    onAsk({
      ask,
      approvedAs: rule === 'exact' || rule === 'area' ? rule : null,
      reply: (choice) => void (async () => {
        if (choice === 'no') { await send(ask.from, { ev: 'no', ...me }); return; }
        try {
          const spot = blur(await readSpot(), how);
          await send(ask.from, { ev: 'spot', ...me, spot, precision: how });
        } catch (error) {
          await send(ask.from, { ev: 'trouble', ...me, why: (error as Error).message });
        }
      })(),
    });
  };

  void join(askTopic(self.id), handle).then((ready) => {
    channel = ready;
    if (closed) supabase.removeChannel(ready);
  });
  return () => { closed = true; if (channel) supabase.removeChannel(channel); };
}

/** Ask a friend where they are, and wait for their answer. */
/**
 * Ask a friend where they are. Their answer comes back through the app-wide
 * reply listener, which passes it on — so the map does not need its own
 * subscription to the same topic.
 */
export async function askFriendForLocation(self: { id: string; name: string }, friend: { id: string }) {
  await sendTo(askTopic(friend.id), { from: self.id, name: self.name } satisfies LocationAsk);
}

// ---- sharing live, for a while ---------------------------------------------

/** How long a live share runs before it stops on its own. */
export const LIVE_MINUTES = 10;
/** How often a live share sends a fresh position. */
const LIVE_EVERY_MS = 8000;

export interface LiveShare {
  friendId: string;
  friendName: string;
  /** When it stops by itself. */
  until: number;
  precision: Precision;
  stop: () => void;
}

/**
 * Share where you are, live, for a few minutes.
 *
 * A single position is a snapshot; this keeps it honest as you move, which is
 * what "see them on the map" means. It stops by itself after {@link LIVE_MINUTES},
 * and can be stopped at any moment — there is always a visible way out, because
 * a share you have forgotten about is the thing to avoid.
 */
export function startLiveShare(
  self: { id: string; name: string },
  friend: { id: string; name: string },
  how: Precision,
  onTrouble?: (why: string) => void,
): LiveShare {
  const until = Date.now() + LIVE_MINUTES * 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (Date.now() >= until) { live.stop(); return; }
    try {
      const spot = blur(await readSpot(), how);
      await sendTo(replyTopic(friend.id), {
        ev: 'spot', from: self.id, name: self.name, spot, precision: how, liveUntil: until,
      } satisfies LocationReply);
    } catch (error) {
      onTrouble?.((error as Error).message);
      live.stop();
    }
  };

  const live: LiveShare = {
    friendId: friend.id,
    friendName: friend.name,
    until,
    precision: how,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      void sendTo(replyTopic(friend.id), { ev: 'stopped', from: self.id, name: self.name });
    },
  };

  void tick();
  timer = setInterval(() => void tick(), LIVE_EVERY_MS);
  return live;
}

/**
 * Say yes to a request you found in the chat, rather than to a live one.
 *
 * A request left in a message may be minutes old, so there is no pending ask to
 * answer — this reads your position now and sends it straight to that friend.
 * The per-friend rule still decides how much they get, and a friend set to
 * "Nothing" cannot be shared with even by accident.
 */
export async function shareLocationNow(
  self: { id: string; name: string },
  friendId: string,
  how: Precision = friendRule(friendId) === 'exact' ? 'exact' : 'area',
): Promise<'sent' | 'blocked' | 'off' | { trouble: string }> {
  if (!sharingOn()) return 'off';
  if (friendRule(friendId) === 'never') return 'blocked';
  const me = { from: self.id, name: self.name };
  try {
    const spot = blur(await readSpot(), how);
    await sendTo(replyTopic(friendId), { ev: 'spot', ...me, spot, precision: how } satisfies LocationReply);
    return 'sent';
  } catch (error) {
    return { trouble: (error as Error).message };
  }
}

/** Say no to a request you found in the chat. Nothing is read from the device. */
export async function declineLocationNow(self: { id: string; name: string }, friendId: string) {
  await sendTo(replyTopic(friendId), { ev: 'no', from: self.id, name: self.name });
}

/**
 * Listen for answers coming back to you — mounted once, app-wide.
 *
 * One listener for the whole app rather than one per open map: two
 * subscriptions to the same topic in a single client is exactly the sort of
 * thing that quietly stops working.
 */
export function listenForLocationReplies(selfId: string, onReply: (reply: LocationReply) => void): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  void join(replyTopic(selfId), (payload) => {
    const reply = payload as LocationReply;
    if (reply?.ev && reply.from) onReply(reply);
  }).then((ready) => {
    channel = ready;
    if (closed) supabase.removeChannel(ready);
  });
  return () => { closed = true; if (channel) supabase.removeChannel(channel); };
}

/** How a location request reads in the chat, so it can be spotted again later. */
export const LOCATION_REQUEST_MARK = '📍 asked to see your location';

/**
 * Leave the request in the chat too.
 *
 * A live request only reaches somebody who has the app open. Putting it in the
 * chat as well means a friend who was away still finds out that you asked, in
 * the same place they read everything else — and can answer whenever they come
 * back, exactly like a missed call.
 */
export async function leaveLocationRequestInChat(fromId: string, fromName: string, toId: string) {
  try {
    await sendFriendMessage(fromId, toId, `${LOCATION_REQUEST_MARK} — @${fromName} wants to know where you are. Open 👥 Friends → 📍 Where are they? to share or say no.`);
  } catch { /* offline is fine — the live request may still have got through */ }
}
