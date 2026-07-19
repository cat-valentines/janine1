/**
 * Slip & Grip — a friction physics puzzle.
 *
 * You are a little purple block that can switch its own friction:
 *   🟪 GRIP  — high friction: you speed up fast, stop fast, and steer precisely.
 *   🧊 ICE   — low friction: you can barely push off, but you keep your momentum
 *              and glide for ages. Great for long jumps, terrible for stopping.
 *
 * The world has friction too:
 *   ❄️ ice patches  — so slippery you slide even on GRIP.
 *   🟫 sticky ledges — grippy even on ICE, so you can land and stop.
 *   🟢 bounce pads   — boing you high into the air.
 *   ☁️ moving platforms — ride them across gaps and up to high places.
 */

export const VW = 720, VH = 440;
export const BLOCK = 34;

export interface Rect { x: number; y: number; w: number; h: number }
export type Surface = 'normal' | 'ice' | 'sticky';
export interface Ground extends Rect { surface?: Surface }
export interface Mover { x: number; y: number; w: number; h: number; axis: 'x' | 'y'; amp: number; speed: number; phase: number }

export interface Level {
  title: string;
  hint: string;
  start: { x: number; y: number };
  goal: Rect;
  ground: Ground[];
  spikes: Rect[];
  pads: Rect[];
  movers: Mover[];
}

export const PHYS = {
  g: 1500, jump: 660, bounce: 950,
  gripAccel: 2500, iceAccel: 780,
  gripDamp: 11, iceDamp: 0.5, stickyDamp: 18, airDamp: 0.15,
  gripMax: 220, iceMax: 380,
};

const g = (x: number, y: number, w: number, h: number, surface?: Surface): Ground => ({ x, y, w, h, surface });
const goal = (x: number, y: number): Rect => ({ x, y, w: 40, h: 60 });

export const LEVELS: Level[] = [
  {
    title: 'Warm up',
    hint: 'Move ◀ ▶ and jump ⤴. Tap the big button to switch 🟪 GRIP / 🧊 ICE. Reach the ⭐!',
    start: { x: 70, y: 300 }, goal: goal(650, 328),
    ground: [g(0, 388, 720, 52)], spikes: [], pads: [], movers: [],
  },
  {
    title: 'The Gap',
    hint: 'On 🟪 GRIP you can’t build speed. Switch to 🧊 ICE, race, and leap the gap!',
    start: { x: 60, y: 300 }, goal: goal(650, 328),
    ground: [g(0, 388, 300, 52), g(500, 388, 220, 52)], spikes: [], pads: [], movers: [],
  },
  {
    title: 'Careful!',
    hint: 'Sliding on 🧊 ICE you can’t stop. Use 🟪 GRIP to control your speed and hop the spikes.',
    start: { x: 60, y: 300 }, goal: goal(650, 328),
    ground: [g(0, 388, 720, 52)], spikes: [g(300, 360, 84, 28), g(470, 360, 70, 28)], pads: [], movers: [],
  },
  {
    title: 'Ice Patch',
    hint: 'The shiny ❄️ stripe is slippery ice — you slide even on GRIP! Cross it slow, then stop before the spikes.',
    start: { x: 60, y: 300 }, goal: goal(680, 328),
    ground: [g(0, 388, 340, 52), g(340, 388, 160, 52, 'ice'), g(500, 388, 220, 52)],
    spikes: [g(560, 360, 80, 28)], pads: [], movers: [],
  },
  {
    title: 'Sticky Steps',
    hint: 'The 🟫 rough ledges are sticky — you land and grip, no sliding off. Hop up them!',
    start: { x: 50, y: 300 }, goal: goal(648, 260),
    ground: [g(0, 388, 200, 52), g(280, 348, 110, 18, 'sticky'), g(470, 320, 110, 18, 'sticky'), g(620, 320, 100, 40)],
    spikes: [], pads: [], movers: [],
  },
  {
    title: 'Boing!',
    hint: 'Jump on the 🟢 springy pad to boing up high — carry some speed to sail over the wall!',
    start: { x: 50, y: 300 }, goal: goal(650, 328),
    ground: [g(0, 388, 720, 52), g(430, 300, 40, 88)],
    spikes: [], pads: [g(280, 372, 74, 16)], movers: [],
  },
  {
    title: 'The Big Leap',
    hint: 'Fly across on 🧊 ICE — then switch to 🟪 GRIP to land under control and hop the last spikes.',
    start: { x: 50, y: 300 }, goal: goal(668, 328),
    ground: [g(0, 388, 280, 52), g(480, 388, 240, 52)], spikes: [g(596, 360, 62, 28)], pads: [], movers: [],
  },
  {
    title: 'Moving Bridge',
    hint: 'No bridge across? Hop onto the moving ☁️ platform and ride it to the other side!',
    start: { x: 50, y: 300 }, goal: goal(660, 328),
    ground: [g(0, 388, 240, 52), g(500, 388, 220, 52)],
    spikes: [], pads: [], movers: [{ x: 270, y: 360, w: 140, h: 18, axis: 'x', amp: 95, speed: 0.85, phase: 0 }],
  },
  {
    title: 'Ride Across',
    hint: 'Hop on the moving platform, ride it over the spikes, and jump off the other side!',
    start: { x: 50, y: 300 }, goal: goal(650, 328),
    ground: [g(0, 388, 220, 52), g(500, 388, 220, 52)],
    spikes: [g(220, 412, 280, 28)],
    pads: [], movers: [{ x: 250, y: 360, w: 120, h: 18, axis: 'x', amp: 115, speed: 1.0, phase: 0 }],
  },
  {
    title: 'Grand Finale',
    hint: 'Everything at once! Slide the ❄️ ice, leap the gap, then 🟢 boing over the spikes to the ⭐. You’ve got this!',
    start: { x: 40, y: 300 }, goal: goal(650, 180),
    ground: [g(0, 388, 180, 52), g(180, 388, 140, 52, 'ice'), g(430, 388, 150, 52), g(600, 240, 120, 40)],
    spikes: [g(580, 412, 20, 28)],
    pads: [g(500, 372, 62, 16)], movers: [],
  },
];
