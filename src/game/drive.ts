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
  | { kind: 'spikes'; x: number; width: number };

export interface DriveLevel {
  id: number; name: string; blurb: string; length: number;
  sky: string; ground: string; groundDark: string;
  features: Feature[];
}

export const driveLevels: DriveLevel[] = [
  {
    id: 1, name: 'First Drive', blurb: 'Learn the truck. A hump and one jump.', length: 2800,
    sky: '#a9dcf2', ground: '#7cb35a', groundDark: '#4f7d38',
    features: [
      { kind: 'bump', x: 760, width: 200, height: 30 },
      // Short, steep kicker -> gap -> matching landing ramp.
      { kind: 'ramp', x: 1500, width: 80, height: 48 },
      { kind: 'gap', x: 1580, width: 110 },
      { kind: 'drop', x: 1690, width: 80, height: 48 },
      { kind: 'bump', x: 2280, width: 160, height: 34 },
    ],
  },
  {
    id: 2, name: 'Up And Over', blurb: 'Stairs, a wall, and spikes to clear.', length: 3200,
    sky: '#f0c98a', ground: '#c2a55e', groundDark: '#8c7440',
    features: [
      { kind: 'stairs', x: 650, width: 260, height: 84, steps: 7 },
      { kind: 'block', x: 910, width: 130, height: 84 },
      { kind: 'drop', x: 1040, width: 110, height: 84 },
      { kind: 'ramp', x: 1500, width: 85, height: 54 },
      { kind: 'gap', x: 1585, width: 130 },
      { kind: 'drop', x: 1715, width: 85, height: 54 },
      { kind: 'ramp', x: 2150, width: 85, height: 58 },
      { kind: 'spikes', x: 2235, width: 130 },
      { kind: 'bump', x: 2700, width: 180, height: 36 },
    ],
  },
  {
    id: 3, name: 'Big Air', blurb: 'Long jumps. Tip the truck to land flat.', length: 3600,
    sky: '#8fc8e0', ground: '#6fa060', groundDark: '#456b3c',
    features: [
      { kind: 'ramp', x: 700, width: 90, height: 62 },
      { kind: 'gap', x: 790, width: 170 },
      { kind: 'drop', x: 960, width: 90, height: 62 },
      { kind: 'block', x: 1500, width: 90, height: 44 },
      { kind: 'ramp', x: 1950, width: 95, height: 70 },
      { kind: 'gap', x: 2045, width: 200 },
      { kind: 'drop', x: 2245, width: 95, height: 70 },
      { kind: 'stairs', x: 2700, width: 220, height: 70, steps: 6 },
      { kind: 'drop', x: 2920, width: 100, height: 70 },
      { kind: 'ramp', x: 3150, width: 90, height: 60 },
      { kind: 'gap', x: 3240, width: 160 },
      { kind: 'drop', x: 3400, width: 90, height: 60 },
    ],
  },
  {
    id: 4, name: 'Truck Trouble', blurb: 'Everything at once. Good luck!', length: 4200,
    sky: '#cfd8e3', ground: '#9a9490', groundDark: '#69645f',
    features: [
      { kind: 'bump', x: 560, width: 140, height: 36 },
      { kind: 'ramp', x: 900, width: 85, height: 56 },
      { kind: 'gap', x: 985, width: 150 },
      { kind: 'drop', x: 1135, width: 85, height: 56 },
      { kind: 'ramp', x: 1450, width: 85, height: 60 },
      { kind: 'spikes', x: 1535, width: 130 },
      { kind: 'stairs', x: 2000, width: 280, height: 100, steps: 8 },
      { kind: 'drop', x: 2280, width: 120, height: 100 },
      { kind: 'block', x: 2600, width: 90, height: 50 },
      { kind: 'ramp', x: 3050, width: 95, height: 72 },
      { kind: 'gap', x: 3145, width: 210 },
      { kind: 'drop', x: 3355, width: 95, height: 72 },
      { kind: 'ramp', x: 3700, width: 85, height: 58 },
      { kind: 'spikes', x: 3785, width: 140 },
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

/** Height of the track at x. The same curve is used to draw and to drive on. */
export function trackY(x: number, level: DriveLevel) {
  if (x < FLAT_START) return GROUND_BASE;
  if (inGap(x, level)) return GAP_FLOOR;
  let y = GROUND_BASE;
  for (const f of level.features) {
    if (!within(x, f)) continue;
    const t = (x - f.x) / f.width;
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
