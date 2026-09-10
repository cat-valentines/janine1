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
import type { LocationReply } from './friendLocation';

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
