import { askToNotify, canNotify, flashTitle, notify, notifyAllowed, notifyRefused, pageHidden, stopFlashTitle } from '../../src/lib/appNotify';

// A pretend page to flash the title of.
const doc = { title: 'Magical Islands', hidden: false, hasFocus: () => true };
(globalThis as { document?: unknown }).document = doc;
(globalThis as { window?: unknown }).window = globalThis;

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// ---- a browser with no notifications at all --------------------------------
// Plenty of the iPads this runs on have them switched off, and an old in-app
// browser has none. Nothing here may throw, whatever is missing.
check('no Notification API is handled', canNotify(), false);
check('  ...so nothing is allowed', notifyAllowed(), false);
check('  ...and nothing is refused either', notifyRefused(), false);
check('  ...and showing one is a safe no-op', notify('Ring', 'someone is calling', 'call'), null);
await askToNotify().then((got) => check('  ...and asking politely says no', got, false));

// ---- the tab title, which works everywhere ----------------------------------
check('the title starts as itself', doc.title, 'Magical Islands');
flashTitle('📞 Ana is calling…');
check('flashing shows the message at once', doc.title, '📞 Ana is calling…');
await wait(1000);
check('  ...then swaps back to the real title', doc.title, 'Magical Islands');
await wait(950);
check('  ...and back to the message again', doc.title, '📞 Ana is calling…');
stopFlashTitle();
check('stopping puts the real title back', doc.title, 'Magical Islands');
await wait(1000);
check('  ...and it stays put', doc.title, 'Magical Islands');

// Flashing twice must not lose the real title behind the first message.
flashTitle('💬 New message');
flashTitle('📞 Ana is calling…');
stopFlashTitle();
check('a second flash does not eat the title', doc.title, 'Magical Islands');
// And stopping when nothing is flashing is harmless.
stopFlashTitle();
check('stopping twice is harmless', doc.title, 'Magical Islands');

// ---- is anybody looking? ----------------------------------------------------
check('a visible, focused page is being watched', pageHidden(), false);
doc.hidden = true;
check('a hidden page is not', pageHidden(), true);
doc.hidden = false;
doc.hasFocus = () => false;
check('nor is one behind another window', pageHidden(), true);
doc.hasFocus = () => true;
check('and looking at it again counts', pageHidden(), false);

// ---- with notifications available -------------------------------------------
let shown: Array<{ title: string; body: string; tag: string }> = [];
let closed = 0;
class FakeNotification {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
  onclick: (() => void) | null = null;
  constructor(title: string, opts: { body: string; tag: string }) {
    shown.push({ title, body: opts.body, tag: opts.tag });
  }
  close() { closed += 1; }
}
(globalThis as { Notification?: unknown }).Notification = FakeNotification;

check('notifications are available now', canNotify(), true);
check('  ...and allowed', notifyAllowed(), true);
const close = notify('📞 Ana is calling', 'Tap to answer.', 'friend-call');
check('a call notification is shown', shown[0], { title: '📞 Ana is calling', body: 'Tap to answer.', tag: 'friend-call' });
check('  ...and hands back a way to close it', typeof close, 'function');
close?.();
check('  ...which really closes it', closed, 1);

// Refused means refused: no pop-up, and no nagging the player again.
FakeNotification.permission = 'denied';
shown = [];
check('a refusal is respected', notifyRefused(), true);
check('  ...so nothing pops up', notify('Ring', 'hello', 'call'), null);
check('  ...and nothing was shown', shown.length, 0);
await askToNotify().then((got) => check('  ...and it does not ask again', got, false));

process.exit(bad ? 1 : 0);
