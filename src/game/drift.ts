export interface Pt { x: number; z: number }

/** A neon synthwave circuit — a rounded rectangle with four corners to drift. */
export const TRACK_HALF_X = 66;
export const TRACK_HALF_Z = 44;
export const TRACK_CORNER = 22;
export const ROAD_WIDTH = 15;

/**
 * The centre line of the track, as a closed loop of points.
 *
 * Four straights joined by four quarter-circle corners. Sampled densely so the
 * nearest-point search that keeps the car on the road stays smooth.
 */
export function centerline(): Pt[] {
  const a = TRACK_HALF_X - TRACK_CORNER;
  const b = TRACK_HALF_Z - TRACK_CORNER;
  const r = TRACK_CORNER;
  const pts: Pt[] = [];
  const arc = (cx: number, cz: number, from: number, steps: number) => {
    for (let i = 0; i < steps; i += 1) {
      const t = from + (i / steps) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r });
    }
  };
  const CORNER = 10;
  const STRAIGHT = 8;
  // Right straight (going up), then each corner + straight around the loop.
  for (let i = 0; i < STRAIGHT; i += 1) pts.push({ x: TRACK_HALF_X, z: -b + (2 * b * i) / STRAIGHT });
  arc(a, b, 0, CORNER);
  for (let i = 0; i < STRAIGHT; i += 1) pts.push({ x: a - (2 * a * i) / STRAIGHT, z: TRACK_HALF_Z });
  arc(-a, b, Math.PI / 2, CORNER);
  for (let i = 0; i < STRAIGHT; i += 1) pts.push({ x: -TRACK_HALF_X, z: b - (2 * b * i) / STRAIGHT });
  arc(-a, -b, Math.PI, CORNER);
  for (let i = 0; i < STRAIGHT; i += 1) pts.push({ x: -a + (2 * a * i) / STRAIGHT, z: -TRACK_HALF_Z });
  arc(a, -b, -Math.PI / 2, CORNER);
  return pts;
}

/** Coins strung along the racing line, weaving inside and out through corners. */
export function coinLayout(line: Pt[]): Pt[] {
  const coins: Pt[] = [];
  const every = 4;
  for (let i = 0; i < line.length; i += every) {
    const p = line[i];
    const q = line[(i + 1) % line.length];
    // Sit a little to one side, alternating, so collecting them rewards a line.
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = (Math.floor(i / every) % 2 === 0 ? 1 : -1) * ROAD_WIDTH * 0.24;
    coins.push({ x: p.x + (-dz / len) * side, z: p.z + (dx / len) * side });
  }
  return coins;
}

// ---- car feel -------------------------------------------------------------
// Arcade drift, not a simulator: it should slide when you want it to and grip
// when you don't.

export const ENGINE = 30;
export const REVERSE = 16;
export const MAX_SPEED = 46;
export const STEER_RATE = 2.7;
/** Lateral grip per second when driving normally — high, so it holds a line. */
export const GRIP = 3.6;
/** Lateral grip while the handbrake is down — low, so the back steps out. */
export const DRIFT_GRIP = 0.9;
export const DRAG = 0.5;
export const ROLL_FRICTION = 1.4;
export const CAR_HALF = 1.9;

/** Above this sideways speed, and moving, the car counts as drifting. */
export const DRIFT_MIN_SLIP = 6;
export const DRIFT_MIN_SPEED = 12;
export const DRIFT_MULT_MAX = 5;
/** How fast the drift multiplier climbs while you hold a slide. */
export const DRIFT_MULT_RAMP = 0.9;

export const SESSION_SECONDS = 90;
export const COIN_POINTS = 100;
