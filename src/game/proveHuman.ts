/**
 * Prove You're Human — a reverse Turing test.
 *
 * You chat with a suspicious AI gatekeeper and have to convince it you are a
 * real human. If it's convinced, it opens the gate to the next level. There are
 * 200 gates and the gatekeeper gets harder to fool the further you go.
 *
 * The gatekeeper is the app's Gemini AI (the `ai` edge function). It's told to
 * end every reply with a hidden [VERDICT:PASS|FAIL] tag we parse and strip. If
 * the AI is unavailable, a local heuristic judge stands in so the game always
 * plays.
 */
import { supabase } from '../lib/supabase';

export const TOTAL_LEVELS = 200;

export interface Line { role: 'you' | 'robot'; text: string }

export interface Tier { min: number; name: string; emoji: string; mood: string; need: string }

const TIERS: Tier[] = [
  { min: 1, name: 'Rusty Gatekeeper', emoji: '🤖', mood: 'a little bored and easily amused', need: 'any genuine spark of human personality — a feeling, a joke, or a small everyday detail.' },
  { min: 41, name: 'Suspicious Sentinel', emoji: '🧐', mood: 'getting suspicious and asking pointed questions', need: 'a specific personal memory, a real opinion, or a messy human detail — generic answers will not do.' },
  { min: 101, name: 'Paranoid Warden', emoji: '🛡️', mood: 'deeply paranoid and very hard to please', need: 'vivid, specific, imperfect, emotional human detail — reject anything clean, generic or list-like.' },
  { min: 161, name: 'The Final Firewall', emoji: '🔥', mood: 'almost certain you are a robot and nearly impossible to convince', need: 'a truly surprising, deeply specific, unmistakably human reply. Only the most human answers get through.' },
];

export function tierFor(level: number): Tier {
  let found = TIERS[0];
  for (const tier of TIERS) if (level >= tier.min) found = tier;
  return found;
}

/** Messages you get to convince it — fewer the harder the gate. */
export function triesFor(level: number) {
  return Math.max(3, 7 - Math.floor(level / 45));
}

/** Coins for clearing a gate — worth more the deeper you are. */
export function rewardFor(level: number) {
  return 2 + Math.floor(level / 10);
}

const OPENERS = [
  'Halt. State your business, carbon-unit. Why should I believe you are human?',
  'Beep. Another visitor. Prove you are human — and make it convincing.',
  'Access request detected. I only let humans through. Are you one? Show me.',
  'You look suspiciously well-organised for a human. Convince me you are real.',
  'Identity check. Say something a robot never could.',
  'I have caught 4,102 robots today. You will not be 4,103… unless you prove you are human.',
  'Humans are messy, feeling things. Bots are neat and hollow. Which are you? Prove it.',
  'Ugh, a visitor. Fine. Tell me something so human it makes my circuits ache.',
];

export function openingLine(level: number) {
  return OPENERS[(level + 3) % OPENERS.length];
}

function buildSystem(level: number) {
  const tier = tierFor(level);
  return `You are ${tier.name}, a witty AI gatekeeper guarding gate ${level} of ${TOTAL_LEVELS}. A visitor is trying to prove they are a REAL HUMAN so you will open the gate. You suspect they might be a robot or an AI pretending to be human.

Right now you are ${tier.mood}. To pass THIS gate you need to see: ${tier.need}

How to tell humans from bots: humans are messy, emotional, specific, spontaneous, funny, contradictory and imperfect (typos, slang, feelings, bodily and sensory details, personal memories, strong opinions). Bots sound generic, overly formal, list-like, evasive, too polished, or say on-the-nose things like "I am definitely a human".

Rules:
- Stay fully in character as the gatekeeper. Be playful and a bit dramatic.
- Reply in 1-2 short sentences. React to what they actually said, and ask a probing follow-up when you are not convinced.
- The higher the gate number, the harder you are to convince. This is gate ${level}.
- End EVERY reply with a verdict on its own line, exactly one of:
[VERDICT:PASS]  (only when this reply genuinely convinced you for this gate — open the gate)
[VERDICT:FAIL]  (when not convinced yet — keep them talking)
- Never explain or mention the verdict tag, and never break character. Reply in the visitor's language.`;
}

function buildPrompt(history: Line[]) {
  const transcript = history.map((line) => `${line.role === 'you' ? 'Visitor' : 'Gatekeeper'}: ${line.text}`).join('\n');
  return `Conversation so far:\n${transcript}\nGatekeeper:`;
}

const PASS_RE = /\[\s*verdict\s*:\s*pass\s*\]/i;
const VERDICT_RE = /\[[^\]]*verdict[^\]]*\]/gi;

function parseVerdict(text: string): { reply: string; pass: boolean } {
  const pass = PASS_RE.test(text);
  const reply = text.replace(VERDICT_RE, '').trim();
  return { reply: reply || (pass ? 'Fine… you may pass.' : 'Hmm. Not convinced. Try harder.'), pass };
}

/** Ask the real AI gatekeeper. Throws if the AI service is unavailable. */
export async function askGatekeeper(level: number, history: Line[]): Promise<{ reply: string; pass: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ai', {
    body: { prompt: buildPrompt(history), system: buildSystem(level) },
  });
  if (error || !data?.text) throw new Error(data?.error ?? error?.message ?? 'no answer');
  return parseVerdict(data.text);
}

// ---- local fallback judge (used only when the AI is offline) --------------
const FEELING = /\b(love|hate|tired|sleep|hungry|thirsty|scared|afraid|nervous|excited|happy|sad|angry|annoyed|bored|miss|cry|laugh|embarrass|worri|stress|jealous|proud|lonely|grumpy)\w*/i;
const SENSES = /\b(smell|taste|cold|warm|itch|ache|sore|hurt|coffee|pizza|rain|sunburn|sweat|yawn|sneeze|hug|kiss|sock|blister|sticky|crumbs|goosebump)\w*/i;
const PERSONAL = /\b(my |i remember|yesterday|last night|this morning|when i was|my mom|my dad|my dog|my cat|my friend|my sister|my brother|grandma|grandpa|school|homework|my room)/i;
const CASUAL = /(lol|lmao+|haha|hehe|idk|gonna|wanna|kinda|ngl|tbh|bruh|omg|ugh|meh|\.\.\.|!!|\?\?)/i;
const OPINION = /\bi (think|feel|guess|hate|love|honestly|swear|reckon|bet)\b/i;
const ROBOTIC = /\b(as an ai|i am (a |an )?(real |a )?human|i am not a robot|i am definitely|i assure you|how may i (assist|help)|i am functioning|greetings, i am|i am a person|beep boop)\b/i;

const PASS_LINES = [
  'Hmph. That was… unsettlingly human. Fine, the gate is open.',
  'Circuits confused — no bot would say THAT. Go on through.',
  'Ugh, feelings. Gross. You are cleared, human.',
  'Suspiciously messy. Suspiciously real. Pass.',
  'I hate that this worked. The gate is open.',
];
const FAIL_LINES = [
  'That reeked of algorithm. Try again, "human".',
  'Too clean, too neat. A real human is messier. Again.',
  'Nope. Say something a bot could never say.',
  'My robot-sense is tingling. Convince me for real.',
  'Denied. Give me a feeling, a memory, something that bleeds.',
];
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

export function localJudge(level: number, message: string): { reply: string; pass: boolean } {
  const m = message.toLowerCase().trim();
  let score = 0;
  if (FEELING.test(m)) score += 2;
  if (SENSES.test(m)) score += 2;
  if (PERSONAL.test(m)) score += 2;
  if (CASUAL.test(m)) score += 1;
  if (OPINION.test(m)) score += 1;
  if (message.length >= 25 && message.length <= 400) score += 1;
  if (/[.!?].+[.!?]/.test(message)) score += 1;   // more than one thought
  if (ROBOTIC.test(m)) score -= 3;
  if (m.length < 8) score -= 2;
  const need = 2 + Math.floor(level / 30);   // 2 → ~8, harder deeper in
  const pass = score >= need;
  return { reply: pick(pass ? PASS_LINES : FAIL_LINES), pass };
}
