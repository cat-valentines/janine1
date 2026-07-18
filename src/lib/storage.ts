/**
 * Crash-proof localStorage.
 *
 * On iPads — especially inside a messaging app's in-app browser, or Safari with
 * "Block All Cookies" / strict privacy — touching localStorage can throw. A
 * throw in a component's initial state (best-score reads, "seen" flags…) takes
 * the whole React app down, and all you see is the page background. These
 * helpers swallow that, so storage being unavailable just means "no saved data"
 * instead of a blank screen.
 */
export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* private mode / blocked — fine */ }
  },
};
