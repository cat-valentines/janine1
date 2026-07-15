export interface TruckColour { id: string; name: string; body: string; dark: string; trim: string }

/** Soft pastels on purpose — no neon. */
export const truckColours: TruckColour[] = [
  { id: 'pink', name: 'Pastel Pink', body: '#f2b8c6', dark: '#d68fa2', trim: '#ffe3ea' },
  { id: 'purple', name: 'Pastel Purple', body: '#c3b3e0', dark: '#9d8bc0', trim: '#e8e0f6' },
  { id: 'blue', name: 'Pastel Blue', body: '#a7cde4', dark: '#7fa9c6', trim: '#dceff9' },
  { id: 'yellow', name: 'Pastel Yellow', body: '#f0dc9a', dark: '#ccb570', trim: '#fdf3d3' },
  { id: 'green', name: 'Pastel Green', body: '#b2d6ac', dark: '#89b382', trim: '#dcefd8' },
];

export const truckById = (id: string) => truckColours.find((truck) => truck.id === id);

/**
 * One contraption on the track.
 *
 * Drive Mad is flat ground plus deliberate obstacles, not rolling hills — so
 * levels are built by placing these rather than by shaping a landscape.
 */
export type Feature =
  | { kind: 'ramp'; x: number; width: number; height: number }
  | { kind: 'drop'; x: number; width: number; height: number }
  | { kind: 'block'; x: number; width: number; height: number }
  | { kind: 'bump'; x: number; width: number; height: number }
  | { kind: 'gap'; x: number; width: number }
  | { kind: 'stairs'; x: number; width: number; height: number; steps: number }
  | { kind: 'spikes'; x: number; width: number }
  // --- contraptions: these move, so they are not part of the static ground ---
  /** A plank on a post. It tips under the truck's own weight. */
  | { kind: 'seesaw'; x: number; width: number; height: number }
  /** A platform that rides up and down. Time your run onto it. */
  | { kind: 'platform'; x: number; width: number; height: number; rise: number; period: number }
  /** A pendulum that swings across the track and clouts the truck. */
  | { kind: 'hammer'; x: number; length: number; period: number; phase: number };

/** Contraptions move every frame, so the static heightmap must ignore them. */
export type MovingKind = 'seesaw' | 'platform' | 'hammer';
export const isMoving = (feature: Feature): boolean =>
  feature.kind === 'seesaw' || feature.kind === 'platform' || feature.kind === 'hammer';

/** How far a seesaw plank can tip: far enough that each end reaches the floor. */
export const seesawTilt = (feature: { width: number; height: number }) =>
  Math.atan2(feature.height, feature.width / 2);
/** How hard the truck's weight swings a plank, and how much the plank resists. */
export const TILT_GAIN = 5.2;
export const TILT_DAMP = 0.06;
export const HAMMER_SWING = 1.15;
export const HAMMER_HEAD = 26;
export const HAMMER_KNOCK = 300;

export interface DriveLevel {
  id: number; name: string; blurb: string; length: number;
  sky: string; ground: string; groundDark: string;
  features: Feature[];
}

export const driveLevels: DriveLevel[] = [
  {
    id: 1, name: 'First Drive', blurb: 'Flat ground, a tipping plank and one jump.', length: 2800,
    sky: '#a9dcf2', ground: '#7cb35a', groundDark: '#4f7d38',
    features: [
      { kind: 'bump', x: 620, width: 180, height: 26 },
      // Drive up the low end and your own weight tips it over.
      { kind: 'seesaw', x: 1180, width: 300, height: 62 },
      { kind: 'ramp', x: 1900, width: 80, height: 48 },
      { kind: 'gap', x: 1980, width: 110 },
      { kind: 'drop', x: 2090, width: 80, height: 48 },
      { kind: 'platform', x: 2420, width: 150, height: 8, rise: 78, period: 3.4 },
    ],
  },
  {
    id: 2, name: 'Tipping Point', blurb: 'Seesaws and a swinging hammer.', length: 3200,
    sky: '#f0c98a', ground: '#c2a55e', groundDark: '#8c7440',
    features: [
      { kind: 'seesaw', x: 560, width: 300, height: 64 },
      { kind: 'hammer', x: 1180, length: 150, period: 2.4, phase: 0 },
      { kind: 'block', x: 1520, width: 120, height: 52 },
      { kind: 'drop', x: 1640, width: 90, height: 52 },
      { kind: 'ramp', x: 2020, width: 85, height: 54 },
      { kind: 'gap', x: 2105, width: 130 },
      { kind: 'drop', x: 2235, width: 85, height: 54 },
      { kind: 'hammer', x: 2660, length: 165, period: 2, phase: 1.1 },
      { kind: 'seesaw', x: 2880, width: 280, height: 58 },
    ],
  },
  {
    id: 3, name: 'Swing Time', blurb: 'Ride the lift. Duck the hammers.', length: 3600,
    sky: '#8fc8e0', ground: '#6fa060', groundDark: '#456b3c',
    features: [
      { kind: 'ramp', x: 640, width: 90, height: 58 },
      { kind: 'gap', x: 730, width: 150 },
      { kind: 'drop', x: 880, width: 90, height: 58 },
      // A lift over a pit: get on at the bottom, ride up, drive off.
      { kind: 'gap', x: 1340, width: 200 },
      { kind: 'platform', x: 1370, width: 140, height: 8, rise: 96, period: 3.8 },
      { kind: 'hammer', x: 1900, length: 160, period: 1.9, phase: 0 },
      { kind: 'hammer', x: 2080, length: 160, period: 1.9, phase: Math.PI },
      { kind: 'seesaw', x: 2400, width: 320, height: 70 },
      { kind: 'spikes', x: 2900, width: 120 },
      { kind: 'ramp', x: 3160, width: 90, height: 60 },
      { kind: 'gap', x: 3250, width: 160 },
      { kind: 'drop', x: 3410, width: 90, height: 60 },
    ],
  },
  {
    id: 4, name: 'Truck Trouble', blurb: 'Every contraption at once. Good luck!', length: 4200,
    sky: '#cfd8e3', ground: '#9a9490', groundDark: '#69645f',
    features: [
      { kind: 'seesaw', x: 520, width: 290, height: 60 },
      { kind: 'hammer', x: 1000, length: 155, period: 1.8, phase: 0.4 },
      { kind: 'ramp', x: 1320, width: 85, height: 56 },
      { kind: 'gap', x: 1405, width: 150 },
      { kind: 'drop', x: 1555, width: 85, height: 56 },
      { kind: 'stairs', x: 1900, width: 240, height: 84, steps: 7 },
      { kind: 'drop', x: 2140, width: 110, height: 84 },
      { kind: 'gap', x: 2440, width: 210 },
      { kind: 'platform', x: 2470, width: 150, height: 8, rise: 104, period: 3.2 },
      { kind: 'hammer', x: 2900, length: 165, period: 1.7, phase: 0 },
      { kind: 'hammer', x: 3080, length: 165, period: 1.7, phase: Math.PI },
      { kind: 'seesaw', x: 3380, width: 300, height: 66 },
      { kind: 'ramp', x: 3820, width: 85, height: 58 },
      { kind: 'spikes', x: 3905, width: 140 },
    ],
  },
];

export const levelById = (id: number) => driveLevels.find((level) => level.id === id);

export const GROUND_BASE = 330;
export const FLAT_START = 320;
export const GAP_FLOOR = GROUND_BASE + 600;

const within = (x: number, f: { x: number; width: number }) => x > f.x && x < f.x + f.width;

/** True where the track falls away and the truck must jump. */
export function inGap(x: number, level: DriveLevel) {
  return level.features.some((f) => f.kind === 'gap' && within(x, f));
}

/** True on a spike strip — touching one ends the run. */
export function onSpikes(x: number, level: DriveLevel) {
  return level.features.some((f) => f.kind === 'spikes' && within(x, f));
}

/**
 * Height of the solid ground at x. The same curve is used to draw and to drive
 * on. Contraptions are deliberately absent: they move, so the engine adds them
 * on top of this every frame.
 */
export function trackY(x: number, level: DriveLevel) {
  if (x < FLAT_START) return GROUND_BASE;
  if (inGap(x, level)) return GAP_FLOOR;
  let y = GROUND_BASE;
  for (const f of level.features) {
    if (isMoving(f)) continue;
    if (!within(x, f as { x: number; width: number })) continue;
    const t = (x - f.x) / (f as { width: number }).width;
    if (f.kind === 'ramp') y -= t * f.height;
    else if (f.kind === 'drop') y -= (1 - t) * f.height;
    else if (f.kind === 'block') y -= f.height;
    else if (f.kind === 'bump') y -= Math.sin(t * Math.PI) * f.height;
    else if (f.kind === 'stairs') y -= (Math.floor(t * f.steps) + 1) / f.steps * f.height;
  }
  return y;
}

/** Coins float just above the track, all the way along. */
export function coinsFor(level: DriveLevel) {
  const coins: Array<{ x: number; y: number; taken: boolean }> = [];
  for (let x = FLAT_START + 160; x < level.length - 120; x += 260) {
    if (inGap(x, level)) {
      // Coins over a gap sit high, so you grab them mid-jump.
      coins.push({ x, y: trackY(x - 60, level) - 120, taken: false });
      continue;
    }
    if (onSpikes(x, level)) continue;
    coins.push({ x, y: trackY(x, level) - 48, taken: false });
  }
  return coins;
}
