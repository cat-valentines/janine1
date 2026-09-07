/**
 * Getting a player's attention when they are not looking at the page.
 *
 * The app already rings for a call and lights up the 🔔 for a message, but both
 * of those only help if you happen to be looking at the tab. If you are reading
 * something else, or the app is behind another window, a call would ring into an
 * empty room and you would never know somebody wanted you.
 *
 * So there are three layers here, weakest to strongest:
 *  - the **tab title** flashes, so a background tab visibly rings in the tab bar;
 *  - a **browser notification** pops up outside the page, if allowed;
 *  - the sound keeps playing, as it always did.
 *
 * None of this can reach a tab that is properly closed — that needs a push
 * server — so the app never pretends otherwise.
 */

export const canNotify = () => typeof Notification !== 'undefined';
export const notifyAllowed = () => canNotify() && Notification.permission === 'granted';
export const notifyRefused = () => canNotify() && Notification.permission === 'denied';

/**
 * Ask for permission to show notifications. Browsers only allow the request
 * during something the player did, so call it from a click — starting a call,
 * or tapping "let me know".
 */
export async function askToNotify(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

/** True when the page is hidden or in the background — nobody is watching. */
export const pageHidden = () => typeof document !== 'undefined' && (document.hidden || !document.hasFocus());

/**
 * Pop a notification outside the page. Returns a closer, so a call that gets
 * answered can take its notification away again.
 */
export function notify(title: string, body: string, tag: string): (() => void) | null {
  if (!notifyAllowed()) return null;
  try {
    const shown = new Notification(title, { body, tag, icon: '/apple-touch-icon.png' });
    // Clicking it should bring the player back to the game.
    shown.onclick = () => { try { window.focus(); shown.close(); } catch { /* nothing to do */ } };
    return () => { try { shown.close(); } catch { /* already gone */ } };
  } catch {
    return null;   // never let a notification break anything
  }
}

// ---- the flashing tab title ------------------------------------------------

let flashTimer: number | null = null;
let realTitle = '';

/**
 * Flash a message in the tab title, alternating with the real one, so a
 * background tab is visibly asking for you.
 */
export function flashTitle(message: string) {
  if (typeof document === 'undefined') return;
  stopFlashTitle();
  realTitle = document.title;
  let on = true;
  document.title = message;
  flashTimer = window.setInterval(() => {
    on = !on;
    document.title = on ? message : realTitle;
  }, 900);
}

export function stopFlashTitle() {
  if (flashTimer === null) return;
  clearInterval(flashTimer);
  flashTimer = null;
  if (realTitle) document.title = realTitle;
}
