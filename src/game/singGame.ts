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

/** Comfortable, singable original melodies (mostly C4–C5), each a different vibe. */
export const SINGS: Sing[] = [
  {
    id: 'sunbeam', title: 'Sunbeam', style: 'Bright dance-pop', emoji: '🌞', tempo: 108,
    notes: [
      { midi: 60, beats: 1 }, { midi: 64, beats: 1 }, { midi: 67, beats: 1 }, { midi: 64, beats: 1 },
      { midi: 65, beats: 1 }, { midi: 62, beats: 1 }, { midi: 60, beats: 2 },
      { midi: 67, beats: 1 }, { midi: 65, beats: 1 }, { midi: 64, beats: 1 }, { midi: 62, beats: 1 }, { midi: 60, beats: 2 },
    ],
  },
  {
    id: 'moonlight', title: 'Moonlight', style: 'Dreamy slow ballad', emoji: '🌙', tempo: 74,
    notes: [
      { midi: 57, beats: 1 }, { midi: 60, beats: 1 }, { midi: 64, beats: 2 }, { midi: 62, beats: 1 }, { midi: 60, beats: 1 },
      { midi: 59, beats: 1 }, { midi: 57, beats: 2 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 1 }, { midi: 60, beats: 1 }, { midi: 59, beats: 1 }, { midi: 57, beats: 2 },
    ],
  },
  {
    id: 'sugar', title: 'Sugar Rush', style: 'Bubbly bubblegum-pop', emoji: '🍭', tempo: 122,
    notes: [
      { midi: 67, beats: 0.5 }, { midi: 69, beats: 0.5 }, { midi: 71, beats: 1 }, { midi: 69, beats: 0.5 }, { midi: 67, beats: 0.5 },
      { midi: 62, beats: 1 }, { midi: 67, beats: 2 },
      { midi: 71, beats: 0.5 }, { midi: 72, beats: 0.5 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 }, { midi: 67, beats: 2 },
    ],
  },
  {
    id: 'brave', title: 'Brave', style: 'Big power anthem', emoji: '🔥', tempo: 92,
    notes: [
      { midi: 62, beats: 1 }, { midi: 66, beats: 1 }, { midi: 69, beats: 2 }, { midi: 67, beats: 1 }, { midi: 66, beats: 1 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 2 },
      { midi: 69, beats: 1 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 }, { midi: 66, beats: 1 }, { midi: 62, beats: 2 },
    ],
  },
  {
    id: 'whisper', title: 'Whisper', style: 'Soft breathy indie-pop', emoji: '🤍', tempo: 84,
    notes: [
      { midi: 64, beats: 1 }, { midi: 67, beats: 1 }, { midi: 66, beats: 1 }, { midi: 64, beats: 1 }, { midi: 62, beats: 2 },
      { midi: 64, beats: 1 }, { midi: 62, beats: 1 }, { midi: 59, beats: 2 },
      { midi: 62, beats: 1 }, { midi: 64, beats: 1 }, { midi: 62, beats: 2 },
    ],
  },
  {
    id: 'firefly', title: 'Firefly', style: 'Sweet mid-tempo pop', emoji: '✨', tempo: 96,
    notes: [
      { midi: 65, beats: 1 }, { midi: 67, beats: 1 }, { midi: 69, beats: 1 }, { midi: 72, beats: 2 }, { midi: 69, beats: 1 },
      { midi: 67, beats: 1 }, { midi: 65, beats: 2 },
      { midi: 69, beats: 1 }, { midi: 67, beats: 1 }, { midi: 65, beats: 1 }, { midi: 64, beats: 1 }, { midi: 65, beats: 2 },
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

/** Grade one note from how many semitones off it was (octave-agnostic). */
export function rateNote(semisOff: number): { label: string; points: number; klass: string } {
  if (semisOff <= 0.6) return { label: 'Perfect!', points: 100, klass: 'perfect' };
  if (semisOff <= 1.3) return { label: 'Great', points: 70, klass: 'great' };
  if (semisOff <= 2.2) return { label: 'Close', points: 40, klass: 'close' };
  return { label: 'Off', points: 0, klass: 'miss' };
}

/** Stars + a kind message from your overall accuracy percentage. */
export function starsFor(pct: number): { stars: number; message: string } {
  if (pct >= 90) return { stars: 3, message: '🌟 Superstar! Your pitch was spot on.' };
  if (pct >= 70) return { stars: 3, message: '🎉 Amazing singing — really in tune!' };
  if (pct >= 50) return { stars: 2, message: '👏 Nice! Keep practising and you\'ll nail it.' };
  if (pct >= 30) return { stars: 1, message: '🙂 Good try — listen to the sample again and match each note.' };
  return { stars: 0, message: '🎧 Tip: hum along with the sample first, then sing.' };
}

/** Play one soft tone (used for the sample and the count-in ticks). */
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
