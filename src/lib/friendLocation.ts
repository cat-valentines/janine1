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
 *  - **You must ask, and they must say yes.** A request goes to your friend and
 *    they choose: allow once, always allow, or no.
 *  - **Friends only**, and your friend has to be online — their own app is what
 *    answers, so nothing happens behind their back.
 *  - **You can take it back at any time.** Sharing has an off switch, and the
 *    "always allow" list can be emptied whenever you like. Both live on your own
 *    device, not on a server.
 *  - **How exact is your choice.** It defaults to roughly your neighbourhood,
 *    not your doorstep, and you can turn on the exact spot if you want to.
 *
 * It is real: the position comes from the device's own GPS, never invented.
 */
import { supabase } from './supabase';
import { storage } from './storage';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** A position on the earth, as read from the device. */
export interface Spot { lat: number; lng: number; accuracy: number; at: number }

/** How exact a shared position is. */
export type Precision = 'area' | 'exact';

const ON_KEY = 'loc-sharing-on';
const ALLOW_KEY = 'loc-allow-list';
const PRECISION_KEY = 'loc-precision';

// ---- your own settings (kept on your device only) --------------------------

export const sharingOn = (): boolean => storage.get(ON_KEY) === '1';
export const setSharingOn = (on: boolean) => storage.set(ON_KEY, on ? '1' : '0');

export function precision(): Precision {
  return storage.get(PRECISION_KEY) === 'exact' ? 'exact' : 'area';
}
export const setPrecision = (value: Precision) => storage.set(PRECISION_KEY, value);

/** Friends you have said "always allow" to. */
export function allowList(): string[] {
  try { return JSON.parse(storage.get(ALLOW_KEY) ?? '[]') as string[]; } catch { return []; }
}
export const allowsAlways = (friendId: string) => allowList().includes(friendId);
export function setAlwaysAllow(friendId: string, allow: boolean) {
  const list = allowList().filter((id) => id !== friendId);
  if (allow) list.push(friendId);
  storage.set(ALLOW_KEY, JSON.stringify(list));
}
export const clearAllowList = () => storage.set(ALLOW_KEY, '[]');

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
  | { ev: 'spot'; from: string; name: string; spot: Spot; precision: Precision }
  | { ev: 'no'; from: string; name: string }
  | { ev: 'off'; from: string; name: string }
  | { ev: 'trouble'; from: string; name: string; why: string };

export interface LocationAsk { from: string; name: string }

const channelFor = (userId: string) => `loc-${userId}`;

/**
 * Listen for friends asking where you are. Your own app answers, so nothing can
 * happen without this tab being open.
 */
export interface IncomingAsk {
  ask: LocationAsk;
  /** True when this friend is already on your always-allow list. */
  alreadyAllowed: boolean;
  /** Answer it. Nothing is sent until this is called. */
  reply: (choice: 'once' | 'always' | 'no') => void;
}

export function listenForLocationAsks(
  self: { id: string; name: string },
  onAsk: (incoming: IncomingAsk) => void,
): () => void {
  const channel: RealtimeChannel = supabase.channel(channelFor(self.id), { config: { broadcast: { self: false } } });

  const send = (to: string, payload: LocationReply) =>
    supabase.channel(channelFor(to)).send({ type: 'broadcast', event: 'reply', payload });

  channel.on('broadcast', { event: 'ask' }, ({ payload }) => {
    const ask = payload as LocationAsk;
    if (!ask?.from) return;
    const me = { from: self.id, name: self.name };
    // Sharing switched off is a flat no, without troubling the player at all.
    if (!sharingOn()) { void send(ask.from, { ev: 'off', ...me }); return; }

    // Nothing is read or sent here — the decision is handed upward, so the
    // caller can check they really are a friend first, whatever the answer.
    onAsk({
      ask,
      alreadyAllowed: allowsAlways(ask.from),
      reply: (choice) => void (async () => {
        if (choice === 'no') { await send(ask.from, { ev: 'no', ...me }); return; }
        if (choice === 'always') setAlwaysAllow(ask.from, true);
        try {
          const spot = blur(await readSpot(), precision());
          await send(ask.from, { ev: 'spot', ...me, spot, precision: precision() });
        } catch (error) {
          await send(ask.from, { ev: 'trouble', ...me, why: (error as Error).message });
        }
      })(),
    });
  });
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Ask a friend where they are, and wait for their answer. */
export function askFriendForLocation(
  self: { id: string; name: string },
  friend: { id: string; name: string },
  onReply: (reply: LocationReply) => void,
): () => void {
  const mine: RealtimeChannel = supabase.channel(channelFor(self.id), { config: { broadcast: { self: false } } });
  mine.on('broadcast', { event: 'reply' }, ({ payload }) => {
    const reply = payload as LocationReply;
    if (reply?.from === friend.id) onReply(reply);
  });
  mine.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    supabase.channel(channelFor(friend.id)).send({
      type: 'broadcast', event: 'ask', payload: { from: self.id, name: self.name } satisfies LocationAsk,
    });
  });
  return () => { supabase.removeChannel(mine); };
}
