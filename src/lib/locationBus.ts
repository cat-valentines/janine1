/**
 * Passing a location answer from the one app-wide listener to whoever is
 * waiting for it.
 *
 * There is a single subscription to your reply channel, mounted at the app root
 * — two subscriptions to the same Realtime topic in one client is the sort of
 * thing that quietly stops delivering. So the listener re-broadcasts what it
 * hears as an ordinary window event, and any open map picks it up, the same way
 * the Friends panel already starts a call.
 */
import type { LocationReply, Precision, Spot } from './friendLocation';

const EVENT = 'location-reply';

/** Pass on an answer that just came in. */
export function publishLocationReply(reply: LocationReply) {
  window.dispatchEvent(new CustomEvent<LocationReply>(EVENT, { detail: reply }));
}

/** Watch for answers. Returns a stop function. */
export function onLocationReply(handler: (reply: LocationReply) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<LocationReply>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/**
 * The last position each friend sent, kept in memory for this page only.
 *
 * A live share sends a fresh position every few seconds. Somebody who has not
 * opened a map should never be interrupted by those — but when they DO press
 * "Where are they?", it should show at once rather than making them wait for
 * the next one. So the most recent is kept here, and nowhere else: it is gone
 * the moment the page closes, and it is never written to disk.
 */
const lastSpots = new Map<string, { spot: Spot; how: Precision; at: number; live: boolean }>();

/** How long a remembered position is worth showing before it is just old. */
const FRESH_MS = 2 * 60 * 1000;

export function rememberSpot(reply: LocationReply) {
  if (reply.ev === 'spot') {
    lastSpots.set(reply.from, {
      spot: reply.spot, how: reply.precision, at: Date.now(), live: (reply.liveUntil ?? 0) > Date.now(),
    });
  } else if (reply.ev === 'stopped') {
    lastSpots.delete(reply.from);   // they stopped: nothing to show any more
  }
}

/** What that friend last sent, if it is recent enough to still mean anything. */
export function lastSpotFrom(friendId: string) {
  const found = lastSpots.get(friendId);
  if (!found || Date.now() - found.at > FRESH_MS) return null;
  return found;
}

export const forgetSpots = () => lastSpots.clear();
