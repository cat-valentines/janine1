/**
 * Tongue Twister — say the phrase three times in twenty seconds, out loud.
 *
 * The player records themselves; the browser's speech recognition transcribes
 * what it hears, and we count how many clean passes of the twister it caught.
 * It is a reading-and-speaking exercise, so the matching is deliberately
 * forgiving — the point is to say it fast and clearly, not to fool a robot.
 */

export const TWISTERS: string[] = [
  // classics
  'She sells sea shells by the sea shore',
  'Peter Piper picked a peck of pickled peppers',
  'How much wood would a woodchuck chuck if a woodchuck could chuck wood',
  'Betty bought a bit of butter but the butter was bitter',
  'A proper copper coffee pot',
  'Red lorry yellow lorry',
  'Unique New York',
  'Truly rural',
  'Fuzzy Wuzzy was a bear',
  'Freshly fried flying fish',
  'Round the rugged rock the ragged rascal ran',
  'Which witch is which',
  'I scream you scream we all scream for ice cream',
  'Rubber baby buggy bumpers',
  'Give papa a cup of proper coffee in a copper coffee cup',
  // animals
  'A big black bug bit a big black bear',
  'Six slippery snails slid slowly seaward',
  'A skunk sat on a stump and thunk the stump stunk',
  'Kitty caught the kitten in the kitchen',
  'Two tiny tigers take two taxis to town',
  'Wayne went to Wales to watch walruses',
  'Eleven benevolent elephants',
  'The blue bluebird blinks',
  'Nine nice night nurses nursing nicely',
  'If a dog chews shoes whose shoes does he choose',
  // food
  'Fresh fried fish',
  'Betty bought a bit of butter',
  'How can a clam cram in a clean cream can',
  'Cooks cook cupcakes quickly',
  'Fred fed Ted bread and Ted fed Fred bread',
  'The great Greek grape growers grow great Greek grapes',
  // silly & fast
  'Four furious friends fought for the phone',
  'Thin sticks thick bricks',
  'Black background brown background',
  'Send toast to ten tense stout saints',
  'Snap crackle pop',
  'Wristwatch strap',
  'Toy boat toy boat toy boat',
  'Lesser leather never weathered wetter weather better',
  'Can you can a can as a canner can can a can',
  'Six sticky skeletons',
];

/** lower-case, letters and numbers only, single-spaced. */
export const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const wordsOf = (text: string) => normalize(text).split(' ').filter(Boolean);

/** Small edit distance for two short words. */
function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Two words count as "the same" if they're close — speech isn't exact. */
function near(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Only treat a prefix as a match when the *shorter* word is itself long
  // enough — otherwise a short word like "sea" wrongly swallows a run-together
  // "seashells", stealing the "shells" that the compound branch should catch.
  const short = Math.min(a.length, b.length);
  if (short >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return Math.max(a.length, b.length) >= 3 && lev(a, b) <= 1;
}

/**
 * How many times the whole twister appears, in order, in what was heard.
 *
 * Forgiving on purpose: it skips filler words, tolerates one dropped word, and
 * accepts a run-together compound ("seashells" == "sea" + "shells"), because
 * recognisers mangle exactly these things.
 */
export function countReps(target: string, spoken: string): number {
  const t = wordsOf(target);
  const sp = wordsOf(spoken);
  if (!t.length) return 0;
  let reps = 0;
  let ti = 0;
  for (const w of sp) {
    let advance = 0;
    if (near(w, t[ti])) advance = 1;
    else if (ti + 1 < t.length && near(w, t[ti + 1])) advance = 2; // a word slipped past
    else {
      // a compound word that ran two or three target words together
      let merged = t[ti] ?? '';
      for (let k = 1; k < 3 && ti + k < t.length; k += 1) {
        merged += t[ti + k];
        if (near(w, merged)) { advance = k + 1; break; }
      }
    }
    if (advance) {
      ti += advance;
      if (ti >= t.length) { reps += 1; ti = 0; }
    }
  }
  return reps;
}

/** Whether this browser can actually listen and transcribe. */
export const speechSupported = () =>
  typeof window !== 'undefined' &&
  !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
     (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
