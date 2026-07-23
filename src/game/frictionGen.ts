// Slip & Grip has 5000 levels. The first CURATED are hand-made (frictionLevels.ts);
// the rest are generated on demand from the level number, so every level N always
// produces the exact same puzzle without shipping a giant data file. Each generated
// level is solvable BY CONSTRUCTION: it is a left-to-right run of ground platforms
// whose gaps are always jumpable (≤ the block's ice-jump reach) and whose spikes
// always have a run-up and a landing, so "run right, jump every gap, hop every
// spike" always finishes it. Difficulty and the mix of ice / sticky / spikes /
// moving bridges ramp up, and every 50 levels is a themed "world".
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

type Theme = 'basic' | 'ice' | 'sticky' | 'spikes' | 'movers' | 'mixed';
const THEMES: Theme[] = ['basic', 'ice', 'sticky', 'spikes', 'movers', 'mixed'];

const GROUND_Y = 388, GROUND_H = 52;
const TITLES: Record<Theme, string[]> = {
  basic: ['The Gap', 'Long Jump', 'Leap', 'Over the Edge', 'Chasm', 'Careful Steps'],
  ice: ['Icy Slide', 'Frozen', 'No Brakes', 'Slick Path', 'Slippery', 'Cold Snap'],
  sticky: ['Grippy', 'Cling On', 'Rough Road', 'Sticky Steps', 'Hold Fast'],
  spikes: ['Spike Hop', 'Pointy', 'Ouch!', 'Mind the Spikes', 'Thorns'],
  movers: ['Moving Bridge', 'Hop Aboard', 'Ride Across', 'Floaty', 'All Aboard'],
  mixed: ['Everything!', 'Grand Run', 'The Gauntlet', 'Mix It Up', 'Big Test'],
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
  // Spike & mover worlds want fewer, wider platforms/gaps (room to hop, wide gaps to
  // ride a platform across); other worlds pack in more platforms as difficulty rises.
  const nPlat = (theme === 'spikes' || theme === 'movers') ? 2 + Math.floor(R() * 2)
    : 2 + Math.floor(R() * (1 + Math.round(d * 3)));
  const maxGap = 110 + d * 140;                 // 110..250 — all ≤ the block's ~330px ice jump

  const platW: number[] = [];
  for (let k = 0; k < nPlat; k++) platW.push(90 + R() * 90 + (1 - d) * 30);
  const gMin = theme === 'movers' ? 140 : 70;   // mover worlds keep gaps wide so a cloud bridge fits
  const gMax = theme === 'movers' ? 240 : maxGap;
  const gapW: number[] = [];
  for (let k = 0; k < nPlat - 1; k++) gapW.push(gMin + R() * (gMax - gMin));

  // Fit the built platforms into the left ~585px; the right end is reserved for a
  // dedicated goal platform (added below). Only ever scales down, keeping gaps safe.
  const totalW = platW.reduce((a, b) => a + b, 0) + gapW.reduce((a, b) => a + b, 0);
  const s = Math.min(1, 585 / totalW);

  const ground: Ground[] = [];
  const spikes: Rect[] = [];
  const movers: Mover[] = [];
  let cx = 0;
  let anyIce = false, anySticky = false;

  for (let k = 0; k < nPlat; k++) {
    const pw = platW[k] * s;
    const isFirst = k === 0;

    // Surface — never on the start platform (and the goal platform is separate, below).
    let surface: Surface = 'normal';
    if (!isFirst) {
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

    // Spikes: on any non-start plain platform with room for a run-up AND a landing.
    if (!isFirst && surface === 'normal' && pw > 104) {
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

    cx += pw;

    if (k < nPlat - 1) {
      const gap = gapW[k] * s;
      // A moving cloud bridge across the gap (optional — the gap is jumpable anyway).
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
  if (theme === 'spikes' && spikes.length === 0) {
    let bi = -1, bw = 0;
    for (let k = 1; k < ground.length; k++) { if (ground[k].w > bw) { bw = ground[k].w; bi = k; } }
    if (bi >= 0 && bw > 88) { const g = ground[bi]; delete g.surface; const sx = g.x + Math.max(40, (g.w - 34) / 2); if (sx + 34 < g.x + g.w - 20) spikes.push({ x: sx, y: 360, w: 34, h: 28 }); }
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

  // Always append a clean, wide goal platform on the right, one jumpable gap away,
  // so the ⭐ is guaranteed to sit safely on solid ground within the screen.
  const builtRight = cx;
  const goalGap = 60 + R() * 120;                       // ≤ 180 — clearable even on grip
  const goalPlatX = Math.min(600, builtRight + goalGap);
  ground.push({ x: goalPlatX, y: GROUND_Y, w: 700 - goalPlatX, h: GROUND_H });
  const goalX = 700 - 52;                               // 648 — well inside the goal platform

  const feats: string[] = [];
  if (nPlat > 1) feats.push('build speed on 🧊 ice for the jumps');
  if (anyIce) feats.push('the shiny ❄️ ice is slippery — you slide even on grip');
  if (anySticky) feats.push('sticky 🟫 ledges grip you, even on ice');
  if (spikes.length) feats.push('use 🟪 grip to stop and hop the spikes');
  if (movers.length) feats.push('ride the ☁️ moving platform across');
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
    pads: [],
    movers,
  };
}
