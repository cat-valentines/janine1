/** One clickable thing in the scene. */
export interface SceneObject {
  id: string;
  icon: string;
  /** Position inside the scene box, in %. */
  x: number;
  y: number;
  size?: number;
  flip?: boolean;
  /** Shown under the object, for suspects. */
  name?: string;
  /** Little items worn/held, drawn on top. */
  worn?: string[];
  correct: boolean;
}

export interface SceneRiddle {
  level: number;
  kind: string;
  /** Brain Test 2 style: a line of story before the question. */
  story?: string;
  question: string;
  /** Who Is? style deduction clues. */
  clues?: string[];
  scene: SceneObject[];
  background: string;
  explain: string;
}

export const TOTAL_LEVELS = 200;

function rand(n: number, salt = 0) {
  const v = Math.sin((n + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function shuffle<T>(list: T[], seed: number) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand(seed, i + 40) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pick = <T,>(list: T[], seed: number, salt = 0) => list[Math.floor(rand(seed, salt) * list.length) % list.length];

const backdrops = ['room', 'park', 'street', 'night', 'beach'];
const backdropFor = (level: number) => pick(backdrops, level, 61);

// ---- Who Is? — deduce the culprit from clues ----------------------------

interface Suspect { hat: boolean; glasses: boolean; scarf: boolean }

const suspectFaces = ['🧑', '👩', '👨', '🧓', '👦', '👧', '🧔', '👱'];

const crimes: Array<{ story: string; question: string; culprit: string }> = [
  { story: 'Somebody ate the whole birthday cake while nobody was looking!', question: 'Who ate the cake?', culprit: 'ate the cake' },
  { story: 'The shop bell rang and a gold coin went missing from the counter.', question: 'Who took the coin?', culprit: 'took the coin' },
  { story: 'Someone let all the chickens out of the pen this morning.', question: 'Who let the chickens out?', culprit: 'let them out' },
  { story: 'A window in the town hall is broken and everyone is pointing fingers.', question: 'Who broke the window?', culprit: 'broke it' },
  { story: 'Somebody has been drawing on the school wall in chalk.', question: 'Who drew on the wall?', culprit: 'drew on the wall' },
  { story: 'The last biscuit vanished from the tin!', question: 'Who took the biscuit?', culprit: 'took it' },
  { story: 'Someone hid the teacher’s glasses as a prank.', question: 'Who hid the glasses?', culprit: 'hid them' },
  { story: 'A muddy footprint leads right through the clean kitchen.', question: 'Who walked through the mud?', culprit: 'did it' },
];

function whoIs(level: number): SceneRiddle {
  // Every suspect gets a different combination of the three traits, so the
  // clues can always narrow it down to exactly one person.
  const combos: Suspect[] = [];
  for (let h = 0; h < 2; h += 1) for (let g = 0; g < 2; g += 1) for (let s = 0; s < 2; s += 1) {
    combos.push({ hat: !!h, glasses: !!g, scarf: !!s });
  }
  const chosen = shuffle(combos, level).slice(0, 5);
  const targetIndex = Math.floor(rand(level, 2) * chosen.length);
  const target = chosen[targetIndex];

  // Add clues one at a time until only one suspect can possibly fit.
  const traits: Array<{ key: keyof Suspect; yes: string; no: string }> = [
    { key: 'hat', yes: 'is wearing a hat', no: 'is NOT wearing a hat' },
    { key: 'glasses', yes: 'is wearing glasses', no: 'is NOT wearing glasses' },
    { key: 'scarf', yes: 'is wearing a scarf', no: 'is NOT wearing a scarf' },
  ];
  const order = shuffle(traits, level + 5);
  const clues: string[] = [];
  const used: Array<keyof Suspect> = [];
  const crime = crimes[level % crimes.length];
  for (const trait of order) {
    used.push(trait.key);
    clues.push(`The one who ${crime.culprit} ${target[trait.key] ? trait.yes : trait.no}.`);
    const fits = chosen.filter((s) => used.every((k) => s[k] === target[k]));
    if (fits.length === 1) break;
  }

  const faces = shuffle(suspectFaces, level + 9).slice(0, chosen.length);
  const names = shuffle(['Robin', 'Skye', 'Ash', 'Wren', 'Fern', 'Bo', 'Kit', 'Sam'], level + 11);
  const scene: SceneObject[] = chosen.map((suspect, i) => {
    const worn: string[] = [];
    if (suspect.hat) worn.push('🎩');
    if (suspect.glasses) worn.push('👓');
    if (suspect.scarf) worn.push('🧣');
    return {
      id: `p${i}`,
      icon: faces[i],
      name: names[i],
      worn,
      x: 10 + i * 19,
      y: 52,
      size: 2.6,
      correct: i === targetIndex,
    };
  });

  return {
    level, kind: 'Who is?',
    story: crime.story,
    question: crime.question,
    clues,
    scene,
    background: backdropFor(level),
    explain: `${names[targetIndex]} is the only one who matches every clue.`,
  };
}

// ---- Imposter — one is not what it seems --------------------------------

const imposterSets: Array<[string, string, string]> = [
  ['🐱', '🐭', 'a mouse in a crowd of cats'],
  ['🐧', '🐦', 'a little bird among the penguins'],
  ['🌲', '🌳', 'a round tree among the pines'],
  ['🍎', '🍅', 'a tomato pretending to be an apple'],
  ['🌕', '🧀', 'a cheese pretending to be the moon'],
  ['⭐', '✨', 'a sparkle among the stars'],
  ['🐑', '☁️', 'a cloud pretending to be a sheep'],
  ['🤖', '🧑', 'a person hiding among the robots'],
];

function imposter(level: number): SceneRiddle {
  const [crowd, fake, why] = imposterSets[Math.floor(rand(level, 3) * imposterSets.length)];
  const count = 13 + Math.floor(rand(level, 4) * 6);
  const oddAt = Math.floor(rand(level, 5) * count);
  const scene: SceneObject[] = Array.from({ length: count }, (_, i) => ({
    id: `i${i}`,
    icon: i === oddAt ? fake : crowd,
    // Scattered, not on a neat grid — you have to actually look.
    x: 8 + rand(level + i, 6) * 80,
    y: 18 + rand(level + i, 7) * 62,
    size: 1.9,
    flip: rand(level + i, 8) > 0.5,
    correct: i === oddAt,
  }));
  return {
    level, kind: 'Spot the imposter',
    story: 'Something here is pretending to be something else…',
    question: 'Click the imposter!',
    scene,
    background: backdropFor(level),
    explain: `It was ${why}!`,
  };
}

// ---- Hidden object — find the one thing ---------------------------------

const clutter = ['📦', '🧦', '🪣', '🧸', '📚', '🍄', '🪴', '🧢', '🕯️', '🎒', '🧶', '🪑', '🍀', '🥾'];
const hidden: Array<[string, string]> = [
  ['🔑', 'the key'], ['💎', 'the gem'], ['🐞', 'the ladybird'], ['🍪', 'the biscuit'],
  ['🪙', 'the gold coin'], ['🐌', 'the snail'], ['🧩', 'the puzzle piece'], ['🪺', 'the nest'],
];

function hiddenObject(level: number): SceneRiddle {
  const [icon, name] = hidden[Math.floor(rand(level, 9) * hidden.length)];
  const count = 16 + Math.floor(rand(level, 10) * 8);
  const at = Math.floor(rand(level, 11) * count);
  const scene: SceneObject[] = Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    icon: i === at ? icon : pick(clutter, level + i, 12),
    x: 6 + rand(level + i, 13) * 84,
    y: 16 + rand(level + i, 14) * 66,
    size: i === at ? 1.2 : 1.7,
    flip: rand(level + i, 15) > 0.5,
    correct: i === at,
  }));
  return {
    level, kind: 'Hidden clue',
    story: 'It is in here somewhere, hiding in all the mess.',
    question: `Find ${name}!`,
    scene,
    background: backdropFor(level),
    explain: `${name.charAt(0).toUpperCase() + name.slice(1)} was tucked in among the clutter.`,
  };
}

// ---- Tricky story — Brain Test 2 style lateral thinking -----------------

interface StorySpec {
  story: string;
  question: string;
  answer: string;
  answerIcon: string;
  others: Array<[string, string]>;
  explain: string;
}

const stories: StorySpec[] = [
  {
    story: 'It is pitch dark. You have one match, a candle, a lamp and a fire.',
    question: 'What do you light FIRST?', answer: 'the match', answerIcon: '🔥',
    others: [['🕯️', 'the candle'], ['🪔', 'the lamp'], ['🪵', 'the fire']],
    explain: 'You have to light the match first — nothing else works without it!',
  },
  {
    story: 'A plane crashes exactly on the border of two countries.',
    question: 'Where do you bury the survivors?', answer: 'nowhere', answerIcon: '🚫',
    others: [['🇦', 'country A'], ['🇧', 'country B'], ['⛪', 'the church'],],
    explain: 'You do not bury survivors — they are alive!',
  },
  {
    story: 'The baker, the butcher and the candlestick maker are arguing.',
    question: 'Who has the coldest hands?', answer: 'the butcher', answerIcon: '🥩',
    others: [['🥖', 'the baker'], ['🕯️', 'the candlestick maker'], ['🧑‍🍳', 'the cook']],
    explain: 'The butcher works in the freezer all day!',
  },
  {
    story: 'A rooster sits right on the very top of a pointy roof and lays an egg.',
    question: 'Which way does the egg roll?', answer: 'no egg', answerIcon: '🐓',
    others: [['⬅️', 'left'], ['➡️', 'right'], ['⬇️', 'straight down']],
    explain: 'Roosters do not lay eggs — only hens do!',
  },
  {
    story: 'You are in a race and you overtake the person in second place.',
    question: 'What place are you in now?', answer: 'second', answerIcon: '🥈',
    others: [['🥇', 'first'], ['🥉', 'third'], ['🏁', 'last']],
    explain: 'You took their place — so you are second, not first!',
  },
  {
    story: 'A farmer has ten sheep and all but seven wander off.',
    question: 'How many sheep are left?', answer: 'seven', answerIcon: '7️⃣',
    others: [['3️⃣', 'three'], ['🔟', 'ten'], ['0️⃣', 'none']],
    explain: '"All but seven" means seven stayed behind!',
  },
  {
    story: 'Two mothers and two daughters go fishing. They catch three fish — one each.',
    question: 'How is that possible?', answer: 'three people', answerIcon: '👵',
    others: [['🐟', 'they shared'], ['4️⃣', 'four people'], ['🎣', 'one lied']],
    explain: 'Grandmother, mother, daughter — the mother is both!',
  },
  {
    story: 'You see a house where everything is red: red walls, red chairs, red floor.',
    question: 'What colour are the stairs?', answer: 'no stairs', answerIcon: '🏠',
    others: [['🟥', 'red'], ['⬜', 'white'], ['🟫', 'brown']],
    explain: 'It is a one-storey house — there are no stairs!',
  },
  {
    story: 'A man pushes his car to a hotel and instantly loses all his money.',
    question: 'What is going on?', answer: 'monopoly', answerIcon: '🎲',
    others: [['🚗', 'a car crash'], ['🏨', 'a real hotel'], ['💸', 'a robbery']],
    explain: 'He is playing Monopoly!',
  },
  {
    story: 'Everyone is looking for the escaped hamster. It is somewhere warm and dark.',
    question: 'Where is it?', answer: 'the slipper', answerIcon: '🥿',
    others: [['🪟', 'the window'], ['🌳', 'the tree'], ['🛁', 'the bath']],
    explain: 'Warm and dark — inside the slipper!',
  },
  {
    story: 'What can you hold in your left hand but never in your right?',
    question: 'Click the answer.', answer: 'your right elbow', answerIcon: '💪',
    others: [['✋', 'your left hand'], ['🖐️', 'your right hand'], ['🦶', 'your foot']],
    explain: 'Try it — you cannot hold your right elbow with your right hand!',
  },
  {
    story: 'A cowboy rides into town on Friday, stays three days, and rides out on Friday.',
    question: 'How?', answer: 'the horse', answerIcon: '🐴',
    others: [['📅', 'he lied'], ['⏰', 'time travel'], ['🌙', 'he waited a week']],
    explain: 'His horse is called Friday!',
  },
  {
    story: 'A window is broken. Tom says "Ben did it." Ben says "Tom did it." Only one is telling the truth.',
    question: 'Who broke it?', answer: 'ben', answerIcon: '👦',
    others: [['🧒', 'tom'], ['🐈', 'the cat'], ['🌬️', 'the wind']],
    explain: 'If Tom were lying, Ben would be lying too — so Tom is honest and Ben did it.',
  },
  {
    story: 'You have a fox, a chicken and a bag of grain, and a boat that fits only one.',
    question: 'What do you take across FIRST?', answer: 'the chicken', answerIcon: '🐔',
    others: [['🦊', 'the fox'], ['🌾', 'the grain'], ['🚣', 'nothing']],
    explain: 'Take the chicken — the fox will not eat grain!',
  },
  {
    story: 'A snail climbs 3m up a well each day and slips 2m back each night. The well is 10m deep.',
    question: 'Which day does it get out?', answer: 'day 8', answerIcon: '8️⃣',
    others: [['🔟', 'day 10'], ['9️⃣', 'day 9'], ['5️⃣', 'day 5']],
    explain: 'It gains 1m a day, and on day 8 it climbs the last 3m and escapes!',
  },
  {
    story: 'Some months have 30 days, some have 31.',
    question: 'How many have 28?', answer: 'all of them', answerIcon: '📅',
    others: [['1️⃣', 'just one'], ['2️⃣', 'two'], ['0️⃣', 'none']],
    explain: 'Every month has at least 28 days!',
  },
  {
    story: 'A doctor gives you 3 pills and says take one every half hour.',
    question: 'How long do they last?', answer: '1 hour', answerIcon: '⏰',
    others: [['🕐', '1.5 hours'], ['🕒', '3 hours'], ['🕕', '30 mins']],
    explain: 'First at 0, second at 30, third at 60 — one hour!',
  },
  {
    story: 'The teacher hid a sweet under one of three cups. Cup 1 says "not here". Cup 2 says "cup 1 lies". Only one label is true.',
    question: 'Where is the sweet?', answer: 'cup 1', answerIcon: '1️⃣',
    others: [['2️⃣', 'cup 2'], ['3️⃣', 'cup 3'], ['🚫', 'nowhere']],
    explain: 'If cup 2 is true then cup 1 lies — so it IS under cup 1.',
  },
  {
    story: 'Two coins add up to 30p. One of them is not a 20p.',
    question: 'What are they?', answer: '20p and 10p', answerIcon: '🪙',
    others: [['💰', '15p and 15p'], ['💵', '25p and 5p'], ['🚫', 'impossible']],
    explain: 'One is not a 20p — but the OTHER one is!',
  },
  {
    story: 'A bat and ball cost £1.10 together. The bat costs £1 more than the ball.',
    question: 'What does the ball cost?', answer: '5p', answerIcon: '⚾',
    others: [['🔟', '10p'], ['1️⃣', '1p'], ['💷', '20p']],
    explain: 'Ball 5p + bat £1.05 = £1.10, and the bat is exactly £1 more!',
  },
  {
    story: 'It takes 5 machines 5 minutes to make 5 toys.',
    question: 'How long for 100 machines to make 100 toys?', answer: '5 minutes', answerIcon: '⏱️',
    others: [['💯', '100 mins'], ['🔟', '10 mins'], ['1️⃣', '1 min']],
    explain: 'Each machine makes one toy in 5 minutes — they all work at once!',
  },
  {
    story: 'You are running a race and you pass the person in LAST place.',
    question: 'Is that possible?', answer: 'no', answerIcon: '🚫',
    others: [['🏃', 'yes'], ['🥉', 'only if third'], ['🏁', 'only at the end']],
    explain: 'If you passed them, you would be behind them — so they were not last!',
  },
  {
    story: 'Three cats catch three mice in three minutes.',
    question: 'How many cats catch 100 mice in 100 minutes?', answer: 'three', answerIcon: '🐈',
    others: [['💯', 'a hundred'], ['🔟', 'ten'], ['1️⃣', 'one']],
    explain: 'One cat catches one mouse in 3 minutes — three cats keep up forever!',
  },
  {
    story: 'A girl kicks a ball. It goes 10m, stops, and comes straight back to her.',
    question: 'How?', answer: 'she kicked it up', answerIcon: '⬆️',
    others: [['🐕', 'a dog fetched it'], ['🧲', 'a magnet'], ['🌬️', 'the wind']],
    explain: 'She kicked it straight up in the air!',
  },
  {
    story: 'Two people play five games of chess. Each wins the same number. No draws.',
    question: 'How?', answer: 'different opponents', answerIcon: '♟️',
    others: [['🤝', 'they cheated'], ['5️⃣', 'impossible'], ['🔄', 'they swapped']],
    explain: 'They were not playing each other!',
  },
  {
    story: 'The more of them you take, the more you leave behind.',
    question: 'Click them.', answer: 'footsteps', answerIcon: '👣',
    others: [['🍬', 'sweets'], ['🪙', 'coins'], ['📸', 'photos']],
    explain: 'Every step leaves a footprint behind you!',
  },
  {
    story: 'A shepherd has 20 sheep. A storm comes and all but 8 are lost.',
    question: 'How many are left?', answer: 'eight', answerIcon: '8️⃣',
    others: [['1️⃣2️⃣', 'twelve'], ['0️⃣', 'none'], ['2️⃣0️⃣', 'twenty']],
    explain: '"All but 8" means 8 survived!',
  },
  {
    story: 'What can you put in a bucket to make it lighter?',
    question: 'Click it.', answer: 'a hole', answerIcon: '🕳️',
    others: [['🪶', 'a feather'], ['💨', 'air'], ['🎈', 'a balloon']],
    explain: 'A hole makes it lighter — everything falls out!',
  },
  {
    story: 'A boy falls off a 20-step ladder but is not hurt at all.',
    question: 'How?', answer: 'the bottom step', answerIcon: '🪜',
    others: [['🛏️', 'he landed on a bed'], ['🧤', 'he wore pads'], ['🍀', 'pure luck']],
    explain: 'He fell off the bottom step!',
  },
  {
    story: 'Which is correct: "the yolk of an egg IS white" or "the yolk of an egg ARE white"?',
    question: 'Click the right one.', answer: 'neither', answerIcon: '🥚',
    others: [['1️⃣', 'the first'], ['2️⃣', 'the second'], ['✌️', 'both']],
    explain: 'Neither — the yolk is YELLOW!',
  },
  {
    story: 'A man leaves home, turns left three times, and comes back to find two masked people waiting.',
    question: 'Who are they?', answer: 'catcher and umpire', answerIcon: '⚾',
    others: [['🦹', 'robbers'], ['👮', 'police'], ['🎭', 'actors']],
    explain: 'He is running the bases in baseball!',
  },
  {
    story: 'You walk into a room with a match, a stove, a heater and a candle.',
    question: 'What do you light first?', answer: 'the match', answerIcon: '🔥',
    others: [['🕯️', 'the candle'], ['♨️', 'the heater'], ['🍳', 'the stove']],
    explain: 'Always the match first!',
  },
  {
    story: 'Grandma knits 2 scarves in 2 hours.',
    question: 'How many in 6 hours?', answer: 'six', answerIcon: '🧣',
    others: [['2️⃣', 'two'], ['1️⃣2️⃣', 'twelve'], ['4️⃣', 'four']],
    explain: 'One scarf an hour — so six in six hours!',
  },
  {
    story: 'Something in this room has hands and a face but never smiles.',
    question: 'Click it.', answer: 'the clock', answerIcon: '🕐',
    others: [['🧸', 'the teddy'], ['🪞', 'the mirror'], ['🎭', 'the mask']],
    explain: 'A clock has hands and a face!',
  },
  {
    story: 'A duck was given £9, a spider £36 and a bee £27.',
    question: 'How much for the cat?', answer: '£18', answerIcon: '🐈',
    others: [['💷', '£9'], ['💰', '£27'], ['🪙', '£45']],
    explain: '£4.50 per leg! A cat has 4 legs = £18.',
  },
  {
    story: 'You are the bus driver. Six get on, two get off, then four get on.',
    question: 'What colour are the driver\'s eyes?', answer: 'your eye colour', answerIcon: '👀',
    others: [['🟤', 'brown'], ['🔵', 'blue'], ['🟢', 'green']],
    explain: 'YOU are the bus driver!',
  },
  {
    story: 'What goes on four legs in the morning, two at noon, three in the evening?',
    question: 'Click the answer.', answer: 'a person', answerIcon: '🚶',
    others: [['🐕', 'a dog'], ['🪑', 'a stool'], ['🐴', 'a horse']],
    explain: 'A baby crawls, an adult walks, an elder uses a stick — the Sphinx riddle!',
  },
  {
    story: 'Nobody can see it, nobody can touch it, but it is everywhere in this room.',
    question: 'Click it.', answer: 'the air', answerIcon: '💨',
    others: [['👻', 'a ghost'], ['🕸️', 'dust'], ['🔇', 'silence']],
    explain: 'Air is all around you!',
  },
  {
    story: 'Five birds sit on a fence. You clap loudly at three of them.',
    question: 'How many are left?', answer: 'none', answerIcon: '0️⃣',
    others: [['2️⃣', 'two'], ['5️⃣', 'five'], ['3️⃣', 'three']],
    explain: 'The clap scares them ALL away!',
  },
  {
    story: 'A boy and his dad crash. The dad is fine. At hospital the surgeon says "I cannot operate — that is my son!"',
    question: 'Who is the surgeon?', answer: 'his mum', answerIcon: '👩‍⚕️',
    others: [['👨‍⚕️', 'his uncle'], ['🧓', 'his grandad'], ['👻', 'a ghost']],
    explain: 'The surgeon is his mother!',
  },
  {
    story: 'Which is worth more: a kilo of £1 coins or half a kilo of 2p coins?',
    question: 'Click it.', answer: 'the £1 coins', answerIcon: '🪙',
    others: [['🥈', 'the 2p coins'], ['⚖️', 'the same'], ['❓', 'cannot tell']],
    explain: 'More weight AND each coin is worth far more!',
  },
  {
    story: 'The pet shop owner says: "I have exactly one animal that is not a dog, and one that is not a cat."',
    question: 'How many animals?', answer: 'two', answerIcon: '2️⃣',
    others: [['1️⃣', 'one'], ['3️⃣', 'three'], ['4️⃣', 'four']],
    explain: 'One dog and one cat — the dog is "not a cat" and the cat is "not a dog"!',
  },
];

function trickyStory(level: number): SceneRiddle {
  const spec = stories[level % stories.length];
  const options = shuffle([
    { icon: spec.answerIcon, name: spec.answer, correct: true },
    ...spec.others.map(([icon, name]) => ({ icon, name, correct: false })),
  ], level + 17);
  const scene: SceneObject[] = options.map((o, i) => ({
    id: `s${i}`,
    icon: o.icon,
    name: o.name,
    x: 12 + i * 22,
    y: 54,
    size: 2.8,
    correct: o.correct,
  }));
  return {
    level, kind: 'Tricky story',
    story: spec.story,
    question: spec.question,
    scene,
    background: backdropFor(level),
    explain: spec.explain,
  };
}

// ---- Odd one out, in a scene -------------------------------------------

const groups: Array<{ name: string; items: string[] }> = [
  { name: 'fruit', items: ['🍎', '🍌', '🍇', '🍓', '🍊', '🍐', '🍑'] },
  { name: 'animal', items: ['🐶', '🐱', '🐴', '🐮', '🐷', '🐰', '🦊'] },
  { name: 'vehicle', items: ['🚗', '🚌', '🚂', '✈️', '🚲', '🛵', '⛵'] },
  { name: 'tool', items: ['🔨', '🪛', '🔧', '🪚', '⛏️', '📏', '🧰'] },
  { name: 'minibeast', items: ['🐝', '🐞', '🦋', '🐛', '🕷️', '🐜', '🦗'] },
];

function oddOneOut(level: number): SceneRiddle {
  const a = Math.floor(rand(level, 18) * groups.length);
  const b = (a + 1 + Math.floor(rand(level, 19) * (groups.length - 1))) % groups.length;
  const home = groups[a];
  const away = groups[b];
  const chosen = shuffle(home.items, level + 21).slice(0, 6);
  const oddAt = Math.floor(rand(level, 22) * 7);
  const icons = [...chosen];
  icons.splice(oddAt, 0, pick(away.items, level, 23));
  const scene: SceneObject[] = icons.map((icon, i) => ({
    id: `o${i}`,
    icon,
    x: 10 + (i % 4) * 24,
    y: i < 4 ? 34 : 66,
    size: 2.2,
    correct: i === oddAt,
  }));
  return {
    level, kind: 'Odd one out',
    story: 'Six of these belong together. One snuck in.',
    question: 'Click the one that does NOT belong.',
    scene,
    background: backdropFor(level),
    explain: `Everything else is a ${home.name} — that one is a ${away.name}.`,
  };
}

// ---- Count and click ----------------------------------------------------

function countScene(level: number): SceneRiddle {
  const icon = pick(['🐤', '🍄', '⭐', '🐟', '🌸', '🐞'], level, 24);
  const count = 4 + Math.floor(rand(level, 25) * 6);
  const scene: SceneObject[] = [];
  for (let i = 0; i < count; i += 1) {
    scene.push({
      id: `c${i}`, icon,
      x: 8 + rand(level + i, 26) * 78,
      y: 16 + rand(level + i, 27) * 46,
      size: 1.8, flip: rand(level + i, 28) > 0.5,
      correct: false,
    });
  }
  // The answer buttons live along the bottom of the same scene.
  const answers = shuffle([count, count + 1, count - 1, count + 2], level + 29);
  answers.forEach((n, i) => {
    scene.push({ id: `a${n}`, icon: '', name: String(n), x: 12 + i * 22, y: 84, size: 1.6, correct: n === count });
  });
  return {
    level, kind: 'Count them',
    story: `Count carefully — they are scattered about.`,
    question: `How many ${icon} are there? Click the number.`,
    scene,
    background: backdropFor(level),
    explain: `There were exactly ${count}.`,
  };
}

const makers = [whoIs, imposter, hiddenObject, oddOneOut, countScene];

export function getRiddle(level: number): SceneRiddle {
  // Every 5th level is a hand-written tricky story. There are more stories than
  // slots, so no story ever repeats across the 200 levels.
  if (level % 5 === 1) return trickyStory(Math.floor(level / 5));
  const maker = makers[(level + Math.floor(level / 5)) % makers.length];
  return maker(level);
}

export function levelReward(level: number) {
  if (level % 50 === 0) return 25;
  if (level % 10 === 0) return 5;
  if (level % 5 === 0) return 2;
  return 0;
}
