/**
 * Sing Star — a pitch-matching singing trainer.
 *
 * A melody plays as a "sample", then you sing it back into the mic and we score
 * how close your pitch and timing are. Everything here is ORIGINAL — original
 * tunes in different pop styles, no copyrighted songs or lyrics — so it's safe
 * to share, and it genuinely trains your ear and singing voice.
 */
import { midiToFreq } from './pitch';

export interface SongNote { midi: number; beats: number }
export interface Sing {
  id: string;
  title: string;
  style: string;   // the pop vibe it's in the spirit of
  emoji: string;
  tempo: number;   // beats per minute
  notes: SongNote[];
}

/**
 * Comfortable, singable original melodies (mostly C4–C5). Each phrase ends on a
 * LONG held note so the game can train breath control — holding your voice
 * steady on one pitch, the way a great singer sustains a note.
 */
export const SINGS: Sing[] = [
  {
    id: 'sunbeam', title: 'Sunbeam', style: 'Bright dance-pop', emoji: '🌞', tempo: 108,
    notes: [
      { midi: 60, beats: 1 }, { midi: 64, beats: 1 }, { midi: 67, beats: 1 }, { midi: 64, beats: 1 },
      { midi: 65, beats: 1 }, { midi: 62, beats: 1 }, { midi: 60, beats: 3 },
      { midi: 67, beats: 1 }, { midi: 65, beats: 1 }, { midi: 64, beats: 2 }, { midi: 62, beats: 1 }, { midi: 60, beats: 4 },
    ],
  },
  {
    id: 'moonlight', title: 'Moonlight', style: 'Dreamy slow ballad', emoji: '🌙', tempo: 74,
    notes: [
      { midi: 57, beats: 1 }, { midi: 60, beats: 1 }, { midi: 64, beats: 3 }, { midi: 62, beats: 1 }, { midi: 60, beats: 1 },
      { midi: 59, beats: 1 }, { midi: 57, beats: 3 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 1 }, { midi: 60, beats: 2 }, { midi: 59, beats: 1 }, { midi: 57, beats: 4 },
    ],
  },
  {
    id: 'sugar', title: 'Sugar Rush', style: 'Bubbly bubblegum-pop', emoji: '🍭', tempo: 122,
    notes: [
      { midi: 67, beats: 0.5 }, { midi: 69, beats: 0.5 }, { midi: 71, beats: 1 }, { midi: 69, beats: 0.5 }, { midi: 67, beats: 0.5 },
      { midi: 62, beats: 1 }, { midi: 67, beats: 3 },
      { midi: 71, beats: 0.5 }, { midi: 72, beats: 0.5 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 }, { midi: 67, beats: 4 },
    ],
  },
  {
    id: 'brave', title: 'Brave', style: 'Big power anthem', emoji: '🔥', tempo: 92,
    notes: [
      { midi: 62, beats: 1 }, { midi: 66, beats: 1 }, { midi: 69, beats: 3 }, { midi: 67, beats: 1 }, { midi: 66, beats: 1 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 3 },
      { midi: 69, beats: 1 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 }, { midi: 66, beats: 1 }, { midi: 62, beats: 4 },
    ],
  },
  {
    id: 'whisper', title: 'Whisper', style: 'Soft breathy indie-pop', emoji: '🤍', tempo: 84,
    notes: [
      { midi: 64, beats: 1 }, { midi: 67, beats: 1 }, { midi: 66, beats: 1 }, { midi: 64, beats: 1 }, { midi: 62, beats: 3 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 1 }, { midi: 59, beats: 3 },
      { midi: 62, beats: 1 }, { midi: 64, beats: 1 }, { midi: 62, beats: 4 },
    ],
  },
  {
    id: 'firefly', title: 'Firefly', style: 'Sweet mid-tempo pop', emoji: '✨', tempo: 96,
    notes: [
      { midi: 65, beats: 1 }, { midi: 67, beats: 1 }, { midi: 69, beats: 1 }, { midi: 72, beats: 3 }, { midi: 69, beats: 1 },
      { midi: 67, beats: 1 }, { midi: 65, beats: 3 },
      { midi: 69, beats: 1 }, { midi: 67, beats: 1 }, { midi: 65, beats: 1 }, { midi: 64, beats: 1 }, { midi: 65, beats: 4 },
    ],
  },
];

export interface TimedNote { midi: number; start: number; dur: number }

/** Turn a melody's beats into absolute seconds using its tempo. */
export function noteTimes(sing: Sing): TimedNote[] {
  const spb = 60 / sing.tempo;
  let t = 0;
  return sing.notes.map((n) => {
    const start = t;
    const dur = n.beats * spb;
    t += dur;
    return { midi: n.midi, start, dur };
  });
}

export const melodySeconds = (sing: Sing) => noteTimes(sing).reduce((m, n) => Math.max(m, n.start + n.dur), 0);
export const beatSeconds = (sing: Sing) => 60 / sing.tempo;

/** The pitch span of a melody, padded a little, for drawing the note lane. */
export function midiRange(sing: Sing): { lo: number; hi: number } {
  const ms = sing.notes.map((n) => n.midi);
  return { lo: Math.min(...ms) - 2, hi: Math.max(...ms) + 2 };
}

/** How on-pitch you must be to count as "holding" the note steady, in semitones. */
export const HOLD_TOLERANCE = 1.2;

/**
 * Grade one note from how much of its length you held STEADY on pitch (0–1).
 * This is the breath-control skill: it's not enough to touch the note — you
 * have to keep your voice steady on it for the whole note.
 */
export function rateHold(heldFraction: number): { label: string; points: number; klass: string } {
  if (heldFraction >= 0.8) return { label: 'Held it! 🎯', points: 100, klass: 'perfect' };
  if (heldFraction >= 0.55) return { label: 'Steady', points: 70, klass: 'great' };
  if (heldFraction >= 0.3) return { label: 'Almost — hold longer', points: 40, klass: 'close' };
  return { label: 'Hold the note', points: 0, klass: 'miss' };
}

/** Stars + a kind message from how steadily you held the notes overall. */
export function starsFor(pct: number): { stars: number; message: string } {
  if (pct >= 90) return { stars: 3, message: '🌟 Superstar breath control — you held every note rock-steady!' };
  if (pct >= 70) return { stars: 3, message: '🎉 Beautiful, steady singing — you really held those notes!' };
  if (pct >= 50) return { stars: 2, message: '👏 Nice! Take a big breath and hold each note a little longer.' };
  if (pct >= 30) return { stars: 1, message: '🙂 Good try — breathe from your tummy and keep your voice steady on the long notes.' };
  return { stars: 0, message: '🎧 Tip: on the long notes, take a deep breath and hold ONE steady pitch.' };
}

/** Play one soft tone (used only for the metronome count-in ticks). */
export function playTone(ctx: AudioContext, dest: AudioNode, midi: number, start: number, dur: number, gain = 0.22, type: OscillatorType = 'triangle') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = midiToFreq(midi);
  osc.connect(g); g.connect(dest);
  const a = 0.02, r = Math.min(0.14, dur * 0.4);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + a);
  g.gain.setValueAtTime(gain, start + Math.max(a, dur - r));
  g.gain.linearRampToValueAtTime(0, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/**
 * Sing one note as a real-sounding "aah" vowel instead of a beep. This is
 * formant synthesis: two slightly-detuned voices (a glottal buzz) shaped by
 * three bandpass "formant" filters — the acoustic fingerprint of a human vowel —
 * with vibrato. It's synthetic, but it sings "aaah", not "bee-boo".
 */
const AAH_FORMANTS: [number, number, number] = [800, 1150, 2800];
const AAH_GAINS = [1, 0.55, 0.3];
export function playVoice(ctx: AudioContext, dest: AudioNode, midi: number, start: number, dur: number, gain = 0.5) {
  const freq = midiToFreq(midi);
  const amp = ctx.createGain();
  const a = 0.06, r = Math.min(0.24, dur * 0.35);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + a);
  amp.gain.setValueAtTime(gain, start + Math.max(a, dur - r));
  amp.gain.linearRampToValueAtTime(0.0001, start + dur);
  amp.connect(dest);

  for (const detune of [-9, 9]) {
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.value = freq;
    src.detune.value = detune;
    // a gentle 5.2 Hz vibrato, like a held human note
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.value = 9;
    lfo.connect(lg); lg.connect(src.detune);
    lfo.start(start); lfo.stop(start + dur + 0.06);
    AAH_FORMANTS.forEach((ff, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 7;
      const fg = ctx.createGain(); fg.gain.value = AAH_GAINS[i];
      src.connect(bp); bp.connect(fg); fg.connect(amp);
    });
    src.start(start); src.stop(start + dur + 0.06);
  }
}
