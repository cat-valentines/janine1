import { useSyncExternalStore } from 'react';

/**
 * The address bar as the single source of truth for which page is showing.
 *
 * Deliberately one shared store rather than a hook with its own state: two
 * components each holding a private copy would drift apart the moment one of
 * them navigated, because pushState does not fire popstate.
 */

const clean = (path: string) => {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const listeners = new Set<() => void>();
let current = clean(window.location.pathname);

const announce = () => listeners.forEach((listener) => listener());

window.addEventListener('popstate', () => {
  // Back and forward buttons.
  current = clean(window.location.pathname);
  announce();
});

/** Go to a page, and put it in the address bar and the history. */
export function navigate(to: string) {
  const next = clean(to);
  if (next === current) return;
  window.history.pushState({}, '', next);
  current = next;
  announce();
}

/** Replace the current page without adding a history entry. */
export function replace(to: string) {
  const next = clean(to);
  window.history.replaceState({}, '', next);
  current = next;
  announce();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useRoute = () => useSyncExternalStore(subscribe, () => current);

/** The bit after a route, e.g. islandOf('/play/medicine/Mosslight 1'). */
export function paramOf(path: string, prefix: string) {
  if (!path.startsWith(`${prefix}/`)) return '';
  return decodeURIComponent(path.slice(prefix.length + 1));
}
