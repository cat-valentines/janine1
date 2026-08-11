// Little Instagram/TikTok-style sound effects, synthesised with the Web Audio API
// (no asset files). Sounds only play on a user action, so autoplay rules are happy.
import { storage } from './storage';

type Sfx = 'like' | 'unlike' | 'post' | 'comment' | 'follow' | 'tap';

const MUTE_KEY = 'insta-muted';
let ctx: AudioContext | null = null;

export function sfxMuted(): boolean { return storage.get(MUTE_KEY) === '1'; }
export function setSfxMuted(muted: boolean) { storage.set(MUTE_KEY, muted ? '1' : '0'); }

function ac(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch { return null; }
}

/** A short shaped tone. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.14) {
  const c = ctx; if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

// --- Call ringing: a repeating two-tone ring (rings regardless of the sfx mute,
//     because a call should always ring, like a phone). ---
let ringTimer: number | null = null;
export function startRing() {
  stopRing();
  if (!ac()) return;
  const play = () => { tone(880, 0, 0.28, 'sine', 0.12); tone(660, 0.32, 0.3, 'sine', 0.12); };
  play();
  ringTimer = window.setInterval(play, 1600);
}
export function stopRing() {
  if (ringTimer !== null) { clearInterval(ringTimer); ringTimer = null; }
}
/** A short tune when a call connects or ends. */
export function callTone(kind: 'connect' | 'end') {
  if (!ac()) return;
  if (kind === 'connect') { tone(523, 0, 0.12, 'sine', 0.14); tone(784, 0.1, 0.2, 'sine', 0.14); }
  else { tone(660, 0, 0.12, 'sine', 0.12); tone(440, 0.11, 0.22, 'sine', 0.12); }
}

/** Play a named effect (a no-op if muted or Web Audio is unavailable). */
export function sfx(kind: Sfx) {
  if (sfxMuted()) return;
  if (!ac()) return;
  switch (kind) {
    case 'like':    tone(660, 0, 0.12, 'triangle', 0.16); tone(990, 0.06, 0.14, 'triangle', 0.16); break;   // a happy pop
    case 'unlike':  tone(420, 0, 0.12, 'sine', 0.1); break;
    case 'post':    tone(523, 0, 0.12, 'sine', 0.15); tone(659, 0.09, 0.12, 'sine', 0.15); tone(784, 0.18, 0.2, 'sine', 0.16); break;   // success chime
    case 'comment': tone(700, 0, 0.08, 'sine', 0.12); break;   // soft tick
    case 'follow':  tone(587, 0, 0.1, 'triangle', 0.14); tone(880, 0.08, 0.16, 'triangle', 0.14); break;
    case 'tap':     tone(520, 0, 0.06, 'sine', 0.08); break;
  }
}
