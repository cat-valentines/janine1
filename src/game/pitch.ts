/**
 * Microphone pitch detection for the singing game.
 *
 * A voice is monophonic, so autocorrelation is enough: we look for the lag at
 * which the waveform best repeats — that lag is the pitch period. We only search
 * lags inside the human vocal range, which keeps it fast enough for every frame.
 */

const MIN_FREQ = 75;    // ~D#2, below most singing
const MAX_FREQ = 1100;  // ~C#6, above most kids' singing

/** Best-guess fundamental frequency in Hz, or -1 when it's silence / unvoiced. */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return -1;   // too quiet to be a note

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / MIN_FREQ));
  const energy0 = rms * rms * size;

  let bestLag = -1;
  let bestCorr = 0;
  const corr: number[] = new Array(maxLag + 2).fill(0);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < size - lag; i += 1) sum += buf[i] * buf[i + lag];
    corr[lag] = sum;
    if (sum > bestCorr) { bestCorr = sum; bestLag = lag; }
  }
  if (bestLag < 0) return -1;
  // Normalised correlation as a voiced/unvoiced confidence gate.
  if (bestCorr / energy0 < 0.25) return -1;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  let peak = bestLag;
  const x1 = corr[bestLag - 1] ?? corr[bestLag];
  const x2 = corr[bestLag];
  const x3 = corr[bestLag + 1] ?? corr[bestLag];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) peak = bestLag - b / (2 * a);

  return sampleRate / peak;
}

/** Frequency → MIDI note number (A4 = 440 Hz = 69). Fractional. */
export const freqToMidi = (freq: number) => 69 + 12 * Math.log2(freq / 440);
/** MIDI note number → frequency. */
export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** A readable note name, e.g. "A4". */
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/**
 * How far (in semitones) a sung note is from a target, IGNORING octave — so a
 * lower voice singing the right note an octave down still counts as on-pitch.
 * Returns 0 = perfect, up to 6 = as wrong as possible.
 */
export function semitonesOff(sungMidi: number, targetMidi: number): number {
  let d = ((sungMidi - targetMidi) % 12 + 12) % 12; // 0..12
  if (d > 6) d = 12 - d;                              // fold to nearest, 0..6
  return d;
}
