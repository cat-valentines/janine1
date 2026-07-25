// Song Studio — an original music generator built on the Web Audio API.
//
// Nothing is sampled: every drum, bass note, chord and melody is synthesised from
// oscillators and noise, arranged from a genre's chord progression and drum
// pattern using a seeded RNG. So a song is 100% the maker's own creation — safe
// to post anywhere — and always rebuilds identically from its little "spec".

export type Genre = 'pop' | 'hiphop' | 'lofi' | 'edm' | 'rock' | 'chill' | 'cinematic' | 'chip';
export type Mood = 'happy' | 'chill' | 'sad' | 'hype' | 'dreamy' | 'epic';
export type Instrument = 'auto' | 'guitar' | 'eguitar' | 'piano' | 'strings' | 'bells' | 'synth' | 'electro' | 'flute' | 'musicbox' | 'steeldrum' | 'marimba' | 'organ' | 'brass' | 'choir';

export interface SongSpec { genre: Genre; mood: Mood; tempo: number; seed: number; bars: number; instrument?: Instrument }

export const GENRES: { id: Genre; name: string; icon: string; tempo: number }[] = [
  { id: 'pop', name: 'Pop', icon: '🎤', tempo: 112 },
  { id: 'hiphop', name: 'Hip-Hop', icon: '🎧', tempo: 88 },
  { id: 'lofi', name: 'Lo-Fi', icon: '🌧️', tempo: 78 },
  { id: 'edm', name: 'EDM', icon: '🔊', tempo: 126 },
  { id: 'rock', name: 'Rock', icon: '🎸', tempo: 120 },
  { id: 'chill', name: 'Chill', icon: '🌊', tempo: 92 },
  { id: 'cinematic', name: 'Cinematic', icon: '🎬', tempo: 76 },
  { id: 'chip', name: '8-Bit', icon: '👾', tempo: 132 },
];
export const MOODS: { id: Mood; name: string; icon: string }[] = [
  { id: 'happy', name: 'Happy', icon: '😄' },
  { id: 'chill', name: 'Chill', icon: '😌' },
  { id: 'sad', name: 'Sad', icon: '🥲' },
  { id: 'hype', name: 'Hype', icon: '🔥' },
  { id: 'dreamy', name: 'Dreamy', icon: '✨' },
  { id: 'epic', name: 'Epic', icon: '🏔️' },
];
// The instrument that plays the chords + melody (drums & bass stay as the rhythm).
export const INSTRUMENTS: { id: Instrument; name: string; icon: string }[] = [
  { id: 'auto', name: 'Auto', icon: '🎚️' },
  { id: 'guitar', name: 'Guitar', icon: '🎸' },
  { id: 'eguitar', name: 'E. Guitar', icon: '⚡' },
  { id: 'piano', name: 'Piano', icon: '🎹' },
  { id: 'electro', name: 'Electro', icon: '🔊' },
  { id: 'strings', name: 'Strings', icon: '🎻' },
  { id: 'brass', name: 'Brass', icon: '🎺' },
  { id: 'steeldrum', name: 'Steel Drum', icon: '🥁' },
  { id: 'marimba', name: 'Marimba', icon: '🪵' },
  { id: 'organ', name: 'Organ', icon: '🪗' },
  { id: 'bells', name: 'Bells', icon: '🔔' },
  { id: 'synth', name: 'Synth', icon: '🎛️' },
  { id: 'choir', name: 'Choir', icon: '🎤' },
  { id: 'flute', name: 'Flute', icon: '🪈' },
  { id: 'musicbox', name: 'Music Box', icon: '🎶' },
];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pent: [0, 3, 5, 7, 10],
};

interface GenreCfg {
  scale: keyof typeof SCALES; root: number;                 // root midi note
  progs: number[][];                                         // chord-root progressions (pick one per song)
  kick: number[]; snare: number[]; hat: number[]; hatOpen?: number[];
  bassWave: OscillatorType; leadWave: OscillatorType; padWave: OscillatorType;
  bassEvery: number;                                         // bass note every N sixteenths
  leadDensity: number;                                       // 0..1 chance of a lead note per step
  swing: number; lowpass?: number; padGain: number; leadGain: number;
  reverb: number; clap?: boolean;                            // 0..1 reverb send; clap layered on the snare
}
const cfgFor = (g: Genre): GenreCfg => {
  switch (g) {
    case 'pop': return { scale: 'major', root: 48, progs: [[0, 4, 5, 3], [0, 3, 4, 5], [5, 3, 0, 4]], kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'triangle', leadWave: 'square', padWave: 'sawtooth', bassEvery: 4, leadDensity: 0.5, swing: 0, padGain: 0.12, leadGain: 0.16, reverb: 0.2, clap: true };
    case 'hiphop': return { scale: 'minor', root: 45, progs: [[0, 3, 5, 4], [0, 5, 3, 4], [0, 0, 3, 5]], kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'sine', leadWave: 'square', padWave: 'sawtooth', bassEvery: 8, leadDensity: 0.4, swing: 0.18, padGain: 0.1, leadGain: 0.14, reverb: 0.16 };
    case 'lofi': return { scale: 'dorian', root: 45, progs: [[0, 3, 4, 3], [0, 4, 3, 5], [5, 3, 0, 4]], kick: [0, 10], snare: [4, 12], hat: [2, 6, 10, 14], bassWave: 'sine', leadWave: 'triangle', padWave: 'sawtooth', bassEvery: 8, leadDensity: 0.34, swing: 0.24, lowpass: 2200, padGain: 0.14, leadGain: 0.12, reverb: 0.28 };
    case 'edm': return { scale: 'minor', root: 45, progs: [[0, 5, 3, 4], [0, 3, 4, 5], [5, 4, 3, 0]], kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatOpen: [2, 6, 10, 14], bassWave: 'sawtooth', leadWave: 'sawtooth', padWave: 'sawtooth', bassEvery: 2, leadDensity: 0.55, swing: 0, padGain: 0.1, leadGain: 0.18, reverb: 0.2, clap: true };
    case 'rock': return { scale: 'major', root: 45, progs: [[0, 4, 5, 4], [0, 5, 3, 4], [0, 3, 4, 4]], kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'sawtooth', leadWave: 'sawtooth', padWave: 'square', bassEvery: 4, leadDensity: 0.5, swing: 0, padGain: 0.1, leadGain: 0.17, reverb: 0.14 };
    case 'chill': return { scale: 'major', root: 48, progs: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 5]], kick: [0, 8], snare: [8], hat: [4, 12], bassWave: 'sine', leadWave: 'triangle', padWave: 'sawtooth', bassEvery: 8, leadDensity: 0.32, swing: 0.1, padGain: 0.15, leadGain: 0.12, reverb: 0.3 };
    case 'cinematic': return { scale: 'minor', root: 43, progs: [[0, 5, 3, 6], [0, 6, 3, 5], [0, 3, 5, 6]], kick: [0], snare: [], hat: [], bassWave: 'sine', leadWave: 'triangle', padWave: 'sawtooth', bassEvery: 16, leadDensity: 0.28, swing: 0, padGain: 0.2, leadGain: 0.13, reverb: 0.4 };
    case 'chip': return { scale: 'major', root: 52, progs: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 5]], kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], bassWave: 'square', leadWave: 'square', padWave: 'square', bassEvery: 2, leadDensity: 0.6, swing: 0, padGain: 0.08, leadGain: 0.16, reverb: 0.12 };
  }
};

const moodShift = (m: Mood): { octave: number; density: number; brightness: number } => {
  switch (m) {
    case 'happy': return { octave: 1, density: 1.1, brightness: 1.15 };
    case 'chill': return { octave: 0, density: 0.8, brightness: 0.9 };
    case 'sad': return { octave: 0, density: 0.7, brightness: 0.75 };
    case 'hype': return { octave: 1, density: 1.3, brightness: 1.2 };
    case 'dreamy': return { octave: 1, density: 0.85, brightness: 1.0 };
    case 'epic': return { octave: 0, density: 1.15, brightness: 1.1 };
  }
};

function scaleNote(cfg: GenreCfg, degree: number, octave: number) {
  const sc = SCALES[cfg.scale];
  const n = ((degree % sc.length) + sc.length) % sc.length;
  const oct = octave + Math.floor(degree / sc.length);
  return cfg.root + sc[n] + oct * 12;
}
function triad(cfg: GenreCfg, degree: number, octave: number) {
  return [scaleNote(cfg, degree, octave), scaleNote(cfg, degree + 2, octave), scaleNote(cfg, degree + 4, octave)];
}

// ---- one-shot synth voices ------------------------------------------------
function env(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, a: number, d: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(dest);
  return g;
}
function noise(ctx: BaseAudioContext, dur: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; return src;
}
function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, vel = 1) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
  const g = env(ctx, dest, t, 0.95 * vel, 0.004, 0.2); o.connect(g); o.start(t); o.stop(t + 0.24);
  // click transient for punch
  const c = noise(ctx, 0.02); const cg = env(ctx, dest, t, 0.25 * vel, 0.001, 0.02); c.connect(cg); c.start(t); c.stop(t + 0.03);
}
function snare(ctx: BaseAudioContext, dest: AudioNode, t: number, vel = 1) {
  const n = noise(ctx, 0.2); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const g = env(ctx, dest, t, 0.5 * vel, 0.002, 0.15); n.connect(hp); hp.connect(g); n.start(t); n.stop(t + 0.2);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  const og = env(ctx, dest, t, 0.28 * vel, 0.002, 0.09); o.connect(og); o.start(t); o.stop(t + 0.12);   // tonal body
}
function clap(ctx: BaseAudioContext, dest: AudioNode, t: number, vel = 1) {
  for (const d of [0, 0.012, 0.024]) { const n = noise(ctx, 0.09); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 1.2; const g = env(ctx, dest, t + d, 0.32 * vel, 0.001, 0.07); n.connect(bp); bp.connect(g); n.start(t + d); n.stop(t + d + 0.1); }
}
function hat(ctx: BaseAudioContext, dest: AudioNode, t: number, open: boolean) {
  const n = noise(ctx, open ? 0.18 : 0.05); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = env(ctx, dest, t, 0.28, 0.001, open ? 0.16 : 0.04); n.connect(hp); hp.connect(g); n.start(t); n.stop(t + 0.2);
}
function tone(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, dur: number, wave: OscillatorType, peak: number) {
  const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq;
  const g = env(ctx, dest, t, peak, 0.01, dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05);
}
function pad(ctx: BaseAudioContext, dest: AudioNode, t: number, freqs: number[], dur: number, wave: OscillatorType, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25);
  g.gain.setValueAtTime(peak, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  for (const f of freqs) { const o = ctx.createOscillator(); o.type = wave; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
}

// ---- instrument voices (a single note in the chosen timbre) ----------------
function partials(ctx: BaseAudioContext, g: GainNode, t: number, freq: number, dur: number, wave: OscillatorType, parts: [number, number][]) {
  for (const [mult, amp] of parts) { const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq * mult; const gg = ctx.createGain(); gg.gain.value = amp; o.connect(gg); gg.connect(g); o.start(t); o.stop(t + dur + 0.05); }
}
function pluckEnv(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, dur: number) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g;
}
function sustainEnv(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, dur: number, atk: number) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * atk); g.gain.setValueAtTime(peak, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g;
}
function vibrato(ctx: BaseAudioContext, t: number, dur: number, rate: number, depth: number, ...targets: AudioParam[]) {
  const lfo = ctx.createOscillator(); lfo.frequency.value = rate; const lg = ctx.createGain(); lg.gain.value = depth; lfo.connect(lg); for (const p of targets) lg.connect(p); lfo.start(t); lfo.stop(t + dur + 0.05);
}
let distCurveCache: Float32Array<ArrayBuffer> | null = null;
function distCurve(): Float32Array<ArrayBuffer> {
  if (distCurveCache) return distCurveCache;
  const n = 512, c = new Float32Array(new ArrayBuffer(n * 4)), k = 26;
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x)); }
  return (distCurveCache = c);
}
/** Play one note with the given instrument's sound. */
function instNote(inst: Instrument, ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, dur: number, peak: number) {
  if (inst === 'guitar') {
    const g = pluckEnv(ctx, dest, t, peak, dur);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(6000, freq * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2), t + dur * 0.6);
    o.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.05); return;
  }
  if (inst === 'piano') { const g = pluckEnv(ctx, dest, t, peak, dur * 0.95); partials(ctx, g, t, freq, dur, 'triangle', [[1, 1], [2, 0.4], [3, 0.14]]); return; }
  if (inst === 'bells') { const g = pluckEnv(ctx, dest, t, peak, dur); partials(ctx, g, t, freq, dur, 'sine', [[1, 1], [2.76, 0.4], [5.4, 0.15]]); return; }
  if (inst === 'musicbox') { const g = pluckEnv(ctx, dest, t, peak, Math.min(dur, 0.7)); partials(ctx, g, t, freq, Math.min(dur, 0.7), 'sine', [[1, 1], [3, 0.3], [6, 0.1]]); return; }
  if (inst === 'steeldrum') { const d = Math.min(dur, 0.9); const g = pluckEnv(ctx, dest, t, peak, d); partials(ctx, g, t, freq, d, 'sine', [[1, 1], [2, 0.5], [3.9, 0.28], [5.4, 0.12]]); return; }
  if (inst === 'marimba') { const d = Math.min(dur, 0.42); const g = pluckEnv(ctx, dest, t, peak, d); partials(ctx, g, t, freq, d, 'sine', [[1, 1], [4, 0.3], [9.2, 0.08]]); return; }
  if (inst === 'eguitar') {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * 1.2, t + 0.01); g.gain.setValueAtTime(peak * 1.2, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const sh = ctx.createWaveShaper(); sh.curve = distCurve(); sh.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(3600, freq * 6);
    o.connect(sh); sh.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.05); return;
  }
  if (inst === 'electro') {
    const g = pluckEnv(ctx, dest, t, peak, dur * 0.9);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 8; lp.frequency.setValueAtTime(Math.min(9000, freq * 8), t); lp.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 1.5), t + dur * 0.5);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freq / 2; const sg = ctx.createGain(); sg.gain.value = 0.35;
    o.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g); o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05); return;
  }
  if (inst === 'organ') { const g = sustainEnv(ctx, dest, t, peak, dur, 0.05); partials(ctx, g, t, freq, dur, 'sine', [[1, 1], [2, 0.6], [3, 0.4], [4, 0.28]]); return; }
  if (inst === 'brass') {
    const g = sustainEnv(ctx, dest, t, peak, dur, 0.12);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(freq * 1.4, t); lp.frequency.exponentialRampToValueAtTime(freq * 4, t + dur * 0.2); lp.frequency.setValueAtTime(freq * 4, t + dur * 0.7); lp.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur);
    vibrato(ctx, t, dur, 5.5, 4, o.detune); o.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.05); return;
  }
  if (inst === 'choir') {
    const g = sustainEnv(ctx, dest, t, peak, dur, 0.2);
    for (const det of [-7, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2.2; bp.Q.value = 3; vibrato(ctx, t, dur, 5, 5, o.detune); o.connect(bp); bp.connect(g); o.start(t); o.stop(t + dur + 0.05); }
    return;
  }
  if (inst === 'strings') {
    const g = sustainEnv(ctx, dest, t, peak, dur, 0.25);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq; o2.detune.value = 8;
    vibrato(ctx, t, dur, 5, 4, o.detune, o2.detune); o.connect(g); o2.connect(g); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); return;
  }
  if (inst === 'flute') {
    const g = sustainEnv(ctx, dest, t, peak, dur, 0.15);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq; vibrato(ctx, t, dur, 5.5, 3, o.detune);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq; const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
    o.connect(g); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); return;
  }
  // synth
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(freq * 2, t); lp.frequency.exponentialRampToValueAtTime(freq * 6, t + dur * 0.3); lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
  const g = env(ctx, dest, t, peak, 0.01, dur); o.connect(lp); lp.connect(g); o.start(t); o.stop(t + dur + 0.05);
}

/** Schedule the whole arrangement into `master` starting at `start`; returns its length in seconds. */
function arrange(spec: SongSpec, ctx: BaseAudioContext, master: AudioNode, start: number): number {
  const cfg = cfgFor(spec.genre); const mood = moodShift(spec.mood); const R = mulberry32(spec.seed >>> 0);
  const spb = 60 / spec.tempo; const step = spb / 4;      // seconds per 16th
  const bars = spec.bars;
  const inst = spec.instrument && spec.instrument !== 'auto' ? spec.instrument : null;
  const held = inst === 'strings' || inst === 'flute' || inst === 'synth' || inst === 'organ' || inst === 'brass' || inst === 'choir';   // sustained vs plucked
  // Pick one of the genre's progressions (variety between songs).
  const prog = cfg.progs[Math.floor(R() * cfg.progs.length)];
  // Build a repeating melodic MOTIF over a phrase, so the tune has structure and
  // repetition (professional-sounding) instead of a random walk.
  const phraseBars = Math.min(4, bars);
  const motif: { step: number; deg: number; len: number }[] = [];
  let mDeg = 0;
  for (let b = 0; b < phraseBars; b++) {
    for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) {
      if (R() < cfg.leadDensity * mood.density) {
        mDeg += [-2, -1, 0, 0, 1, 1, 2][Math.floor(R() * 7)];
        mDeg = Math.max(-3, Math.min(7, mDeg));
        motif.push({ step: b * 16 + s, deg: mDeg, len: 1 + Math.floor(R() * 3) });
      }
    }
  }
  const V = () => 0.82 + R() * 0.34;                          // per-hit velocity (human feel)

  for (let bar = 0; bar < bars; bar++) {
    const barStart = start + bar * 16 * step;
    const chordDeg = prog[bar % prog.length];
    const lastBar = bar === bars - 1;
    // chords for the bar — played by the chosen instrument, or the default pad
    const freqs = triad(cfg, chordDeg, mood.octave).map(midiToFreq);
    if (inst) {
      const cg = cfg.padGain * 1.5 * mood.brightness;
      if (held) { for (const f of freqs) instNote(inst, ctx, master, barStart, f, 16 * step * 0.95, cg); }
      else { for (const half of [0, 8]) freqs.forEach((f, ci) => instNote(inst, ctx, master, barStart + half * step + ci * 0.02, f, 8 * step * 0.9, cg)); }  // strum on beats 1 & 3
    } else if (cfg.padGain > 0) pad(ctx, master, barStart, freqs, 16 * step * 0.98, cfg.padWave, cfg.padGain * mood.brightness);
    for (let s = 0; s < 16; s++) {
      const swung = (s % 2 === 1) ? cfg.swing * step : 0;
      const t = barStart + s * step + swung;
      if (cfg.kick.includes(s)) kick(ctx, master, t, V());
      if (cfg.snare.includes(s)) { snare(ctx, master, t, V()); if (cfg.clap) clap(ctx, master, t, 0.75); }
      if (cfg.hat.includes(s)) hat(ctx, master, t, !!cfg.hatOpen?.includes(s));
      if (s % cfg.bassEvery === 0) tone(ctx, master, t, midiToFreq(scaleNote(cfg, chordDeg, mood.octave - 2)), cfg.bassEvery * step * 0.9, cfg.bassWave, 0.32 * V());
      if (lastBar && cfg.snare.length && s >= 12) snare(ctx, master, t, 0.45 + (s - 12) * 0.12);   // drum fill into the loop
    }
    // melody: the phrase, transposed to this bar's chord
    const phaseStart = (bar % phraseBars) * 16;
    for (const m of motif) {
      if (m.step < phaseStart || m.step >= phaseStart + 16) continue;
      const s = m.step - phaseStart;
      const t = barStart + s * step + ((s % 2 === 1) ? cfg.swing * step : 0);
      const note = midiToFreq(scaleNote(cfg, chordDeg + m.deg, mood.octave + 1));
      const g = cfg.leadGain * mood.brightness * V();
      if (inst) instNote(inst, ctx, master, t, note, m.len * step * 0.9, g);
      else tone(ctx, master, t, note, m.len * step * 0.9, cfg.leadWave, g);
    }
  }
  return bars * 16 * step;
}

/** A decaying-noise impulse response for the reverb. */
function reverbImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate; const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(1, len, rate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  return buf;
}
/** Master chain: compressor → optional lo-fi lowpass → dry + reverb send → out. */
function masterChain(ctx: BaseAudioContext, genre: Genre) {
  const cfg = cfgFor(genre);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const out = ctx.createGain(); out.gain.value = 0.72;   // headroom so busy genres don't clip
  let pre: AudioNode = comp;
  if (cfg.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cfg.lowpass; comp.connect(f); pre = f; }
  const dry = ctx.createGain(); dry.gain.value = 1 - cfg.reverb * 0.55; pre.connect(dry); dry.connect(out);
  const send = ctx.createGain(); send.gain.value = cfg.reverb;
  const conv = ctx.createConvolver(); conv.buffer = reverbImpulse(ctx, 1.8, 2.6);
  pre.connect(send); send.connect(conv); conv.connect(out);
  out.connect(ctx.destination);
  return comp;                                            // instruments connect here
}

export class SongEngine {
  private ctx: AudioContext | null = null;
  private stopTimer = 0;
  private onStop: (() => void) | null = null;
  playing = false;

  /** Play a song live, optionally mixing a recorded voice on top. Loops until stopped. */
  play(spec: SongSpec, voice?: AudioBuffer | null, onEnd?: () => void) {
    this.stop();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(); this.ctx = ctx; this.onStop = onEnd ?? null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);   // browsers gate audio until a gesture
    const master = masterChain(ctx, spec.genre);
    const start = ctx.currentTime + 0.08;
    const len = arrange(spec, ctx, master, start);
    if (voice) { const v = ctx.createBufferSource(); v.buffer = voice; const vg = ctx.createGain(); vg.gain.value = 1; v.connect(vg); vg.connect(ctx.destination); v.start(start); }
    this.playing = true;
    this.stopTimer = window.setTimeout(() => this.stop(), (len + 0.2) * 1000);
  }

  stop() {
    window.clearTimeout(this.stopTimer);
    if (this.ctx) { try { this.ctx.close(); } catch { /* ok */ } this.ctx = null; }
    if (this.playing) { this.playing = false; this.onStop?.(); this.onStop = null; }
  }

  /** Render the whole song (+ optional voice) offline into a WAV blob for saving/sharing. */
  static async renderWav(spec: SongSpec, voice?: AudioBuffer | null): Promise<Blob> {
    const rate = 32000;
    const spb = 60 / spec.tempo; const len = spec.bars * 16 * (spb / 4);
    const voiceLen = voice ? voice.duration : 0;
    const total = Math.max(len, voiceLen) + 0.4;
    const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const ctx = new OAC(1, Math.ceil(total * rate), rate);
    const master = masterChain(ctx, spec.genre);
    arrange(spec, ctx, master, 0.02);
    if (voice) { const v = ctx.createBufferSource(); v.buffer = voice; v.connect(ctx.destination); v.start(0.02); }
    const buf = await ctx.startRendering();
    return encodeWav(buf);
  }
}

/** 16-bit PCM WAV from a (mono) AudioBuffer. */
function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.getChannelData(0); const n = ch.length; const rate = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, ch[i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
