// Slip & Grip has 5000 levels. The first CURATED are hand-made (frictionLevels.ts);
// the rest are generated on demand from the level number, so every level N always
// produces the exact same puzzle without shipping a giant data file. Each generated
// level is solvable BY CONSTRUCTION: it is a left-to-right run of ground platforms
// whose gaps are always jumpable (≤ the block's ice-jump reach) and whose obstacles
// (spikes, walls, tall bounce-walls) always have a run-up and a landing, so there is
// always a way through. Difficulty ramps and every 50 levels is a themed "world".
import type { Level, Ground, Mover, Rect, Surface } from './friction';
import { LEVELS } from './frictionLevels';

export const CURATED = LEVELS.length;
export const TOTAL_LEVELS = 5000;

// Small deterministic RNG (mulberry32) so a level number always rebuilds identically.
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Theme = 'basic' | 'ice' | 'sticky' | 'spikes' | 'movers' | 'mixed' | 'hurdles' | 'bounce';
const THEMES: Theme[] = ['basic', 'ice', 'sticky', 'spikes', 'movers', 'mixed', 'hurdles', 'bounce'];

const GROUND_Y = 388, GROUND_H = 52;
// Physics-derived limits (see PHYS in friction.ts): a normal jump lifts the block ~145px,
// a bounce pad ~300px. Walls up to ~100px are jumpable; taller ones need a pad.
const JUMP_WALL = 96;        // hurdle height — safely jumpable
const BOUNCE_WALL_MIN = 152; // taller than a jump can clear, so a pad is required
const TITLES: Record<Theme, string[]> = {
  basic: ['The Gap', 'Long Jump', 'Leap', 'Over the Edge', 'Chasm', 'Careful Steps'],
  ice: ['Icy Slide', 'Frozen', 'No Brakes', 'Slick Path', 'Slippery', 'Cold Snap'],
  sticky: ['Grippy', 'Cling On', 'Rough Road', 'Sticky Steps', 'Hold Fast'],
  spikes: ['Spike Hop', 'Pointy', 'Ouch!', 'Mind the Spikes', 'Thorns'],
  movers: ['Moving Bridge', 'Hop Aboard', 'Ride Across', 'Floaty', 'All Aboard'],
  mixed: ['Everything!', 'Grand Run', 'The Gauntlet', 'Mix It Up', 'Big Test'],
  hurdles: ['Hurdles', 'Over the Wall', 'Hop the Fence', 'Leapfrog', 'Wall Run'],
  bounce: ['Boing!', 'Big Bounce', 'Springy', 'Launch', 'Trampoline'],
};

const cache = new Map<number, Level>();

/** The level for a 0-based index: curated first, then generated. */
export function getLevel(i: number): Level {
  if (i < CURATED) return LEVELS[i];
  const hit = cache.get(i);
  if (hit) return hit;
  const made = generate(i);
  cache.set(i, made);
  return made;
}

function generate(i: number): Level {
  const R = mulberry32(((i + 1) * 2654435761) >>> 0);
  const gi = i - CURATED;                       // 0-based generated index
  const d = Math.min(1, gi / 1200);             // difficulty ramp, maxes ~level 1300
  const theme = THEMES[Math.floor(gi / 50) % THEMES.length];
  const wideTheme = theme === 'spikes' || theme === 'movers' || theme === 'hurdles' || theme === 'bounce';

  // Wall worlds want exactly two wide platforms (room for a run-up + a landing);
  // spike/mover worlds want a few; the rest pack in more as difficulty rises.
  const nPlat = (theme === 'hurdles' || theme === 'bounce') ? 2
    : wideTheme ? 2 + Math.floor(R() * 2)
      : 2 + Math.floor(R() * (1 + Math.round(d * 3)));
  const maxGap = 110 + d * 140;                 // 110..250 — all ≤ the block's ~330px ice jump

  const platW: number[] = [];
  const wideBudget = theme === 'hurdles' || theme === 'bounce';
  for (let k = 0; k < nPlat; k++) platW.push((wideBudget ? 200 : 90) + R() * (wideBudget ? 110 : 90) + (1 - d) * 30);
  // Keep gaps small in wall worlds so the wide platforms survive the fit-scaling.
  const gMin = theme === 'movers' ? 140 : 70;
  const gMax = theme === 'movers' ? 240 : theme === 'bounce' ? 100 : theme === 'hurdles' ? 150 : maxGap;
  const gapW: number[] = [];
  for (let k = 0; k < nPlat - 1; k++) gapW.push(gMin + R() * (gMax - gMin));

  // Fit the built platforms into the left ~585px; the right end is reserved for a
  // dedicated goal platform (added below). Only ever scales down, keeping gaps safe.
  const totalW = platW.reduce((a, b) => a + b, 0) + gapW.reduce((a, b) => a + b, 0);
  const s = Math.min(1, 585 / totalW);

  const ground: Ground[] = [];
  const spikes: Rect[] = [];
  const movers: Mover[] = [];
  const walls: Ground[] = [];
  const pads: Rect[] = [];
  let cx = 0;
  let anyIce = false, anySticky = false;

  for (let k = 0; k < nPlat; k++) {
    const pw = platW[k] * s;
    const isFirst = k === 0;

    // Surface — never on the start platform. Wall worlds stay plain so obstacles are fair.
    let surface: Surface = 'normal';
    if (!isFirst && theme !== 'hurdles' && theme !== 'bounce') {
      const r = R();
      if (theme === 'ice') surface = r < 0.65 ? 'ice' : 'normal';
      else if (theme === 'sticky') surface = r < 0.65 ? 'sticky' : 'normal';
      else if (theme === 'mixed') { if (r < 0.3) surface = 'ice'; else if (r < 0.5) surface = 'sticky'; }
      else if (r < 0.16 + d * 0.16) surface = R() < 0.5 ? 'ice' : 'sticky';
    }
    if (surface === 'ice') anyIce = true;
    if (surface === 'sticky') anySticky = true;

    const g: Ground = { x: cx, y: GROUND_Y, w: pw, h: GROUND_H };
    if (surface !== 'normal') g.surface = surface;
    ground.push(g);

    // Spikes: on any non-start plain platform (not in wall worlds) with room to hop.
    if (!isFirst && surface === 'normal' && pw > 104 && theme !== 'hurdles' && theme !== 'bounce') {
      const pSpike = theme === 'spikes' ? 0.85 : 0.2 + d * 0.35;
      if (R() < pSpike) {
        const sw = 34 + R() * 30;
        const minX = cx + 40;
        const maxX = Math.min(cx + pw - sw - 26, cx + pw * 0.62);
        if (maxX > minX) {
          const sx = minX + R() * (maxX - minX);
          spikes.push({ x: sx, y: 360, w: sw, h: 28 });
          if (theme === 'spikes' && d > 0.35 && R() < 0.5) {
            const sx2 = sx + sw + 58 + R() * 24;
            if (sx2 + 34 < cx + pw - 20) spikes.push({ x: sx2, y: 360, w: 34, h: 28 });
          }
        }
      }
    }

    // Hurdles: 1–2 low walls to jump, with a run-up before and a landing after.
    if (theme === 'hurdles' && !isFirst && pw > 190) {
      let wx = cx + 92;
      const count = 1 + (d > 0.4 && R() < 0.55 ? 1 : 0);
      for (let wI = 0; wI < count; wI += 1) {
        const wh = 55 + R() * (JUMP_WALL - 55);        // 55..96 — jumpable
        if (wx + 22 > cx + pw - 78) break;
        walls.push({ x: wx, y: GROUND_Y - wh, w: 22, h: wh });
        wx += 22 + 96 + R() * 30;                       // space to land between hurdles
      }
    }

    cx += pw;

    if (k < nPlat - 1) {
      const gap = gapW[k] * s;
      const pMover = theme === 'movers' ? 0.7 : theme === 'mixed' ? 0.45 : 0.12;
      if (gap > 108 && R() < pMover) {
        const mw = 118;
        const mx = cx + gap / 2 - mw / 2;
        const amp = Math.max(45, (gap - mw) / 2 + 28);
        movers.push({ x: mx, y: 358, w: mw, h: 18, axis: 'x', amp, speed: 0.8 + R() * 0.5, phase: R() * 6.28 });
      }
      cx += gap;
    }
  }

  // Guarantee each themed world actually delivers its signature feature.
  const widest = () => { let bi = -1, bw = 0; for (let k = 1; k < ground.length; k++) { if (ground[k].w > bw) { bw = ground[k].w; bi = k; } } return bi; };
  if (theme === 'spikes' && spikes.length === 0) {
    const bi = widest();
    if (bi >= 0 && ground[bi].w > 88) { const g = ground[bi]; delete g.surface; const sx = g.x + Math.max(40, (g.w - 34) / 2); if (sx + 34 < g.x + g.w - 20) spikes.push({ x: sx, y: 360, w: 34, h: 28 }); }
  }
  if ((theme === 'ice' || theme === 'sticky') && !anyIce && !anySticky) {
    const k = ground.length > 1 ? 1 : 0;
    if (k >= 1 && !spikes.some((sp) => sp.x >= ground[k].x && sp.x <= ground[k].x + ground[k].w)) {
      ground[k].surface = theme === 'ice' ? 'ice' : 'sticky';
      if (theme === 'ice') anyIce = true; else anySticky = true;
    }
  }
  if (theme === 'movers' && movers.length === 0) {
    let bx = 0, bg = 0;
    for (let k = 0; k < ground.length - 1; k++) { const gap = ground[k + 1].x - (ground[k].x + ground[k].w); if (gap > bg) { bg = gap; bx = ground[k].x + ground[k].w; } }
    if (bg > 90) { const mw = 118; movers.push({ x: bx + bg / 2 - mw / 2, y: 358, w: mw, h: 18, axis: 'x', amp: Math.max(45, (bg - mw) / 2 + 28), speed: 1, phase: R() * 6.28 }); }
  }
  if (theme === 'hurdles' && walls.length === 0) {
    const bi = widest(); const g = bi >= 0 ? ground[bi] : ground[0];
    if (g.w > 190) walls.push({ x: g.x + 92, y: GROUND_Y - 70, w: 22, h: 70 });
  }
  // Bounce puts its pad + tall wall on the LAST built platform, which flows straight
  // into the goal platform (no gap after it, below) — so a big bounce always lands on
  // continuous ground, never in a pit.
  if (theme === 'bounce' && pads.length === 0) {
    const g = ground[nPlat - 1];
    const wh = BOUNCE_WALL_MIN + 6;   // 158 — well past the ~145px a jump can clear
    if (g.w > 160) { const px = g.x + 56; pads.push({ x: px, y: 372, w: 62, h: 16 }); walls.push({ x: px + 80, y: GROUND_Y - wh, w: 24, h: wh }); }
  }

  // Always append a clean, wide goal platform on the right, one jumpable gap away.
  // Bounce joins it directly (gap 0) so a big bounce always has ground to land on.
  const builtRight = cx;
  const goalGap = theme === 'bounce' ? 0 : 60 + R() * 120;
  const goalPlatX = Math.min(600, builtRight + goalGap);
  ground.push({ x: goalPlatX, y: GROUND_Y, w: 700 - goalPlatX, h: GROUND_H });
  const goalX = 700 - 52;                                        // 648 — well inside the goal platform

  ground.push(...walls);   // walls are just tall, narrow ground blocks sitting on a platform

  const feats: string[] = [];
  if (nPlat > 1) feats.push('build speed on 🧊 ice for the jumps');
  if (anyIce) feats.push('the shiny ❄️ ice is slippery — you slide even on grip');
  if (anySticky) feats.push('sticky 🟫 ledges grip you, even on ice');
  if (spikes.length) feats.push('use 🟪 grip to stop and hop the spikes');
  if (movers.length) feats.push('ride the ☁️ moving platform across');
  if (pads.length) feats.push('spring off the 🟢 pad to clear the tall wall');
  else if (walls.length) feats.push('jump over the 🧱 walls');
  let hint = feats.length ? feats.join(' · ') : 'reach the ⭐!';
  hint = hint.charAt(0).toUpperCase() + hint.slice(1) + '.';

  const pool = TITLES[theme];
  const title = pool[Math.floor(R() * pool.length)];

  return {
    title,
    hint,
    start: { x: ground[0].x + 20, y: 350 },
    goal: { x: goalX, y: 328, w: 40, h: 60 },
    ground,
    spikes,
    pads,
    movers,
  };
}
