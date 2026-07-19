import { LEVELS, PHYS, VW, VH, BLOCK, type Rect, type Surface, type Mover } from './friction';

type Solid = { x: number; y: number; w: number; h: number; kind: 'ground' | 'pad' | 'mover'; surface: Surface; delta?: number; axis?: 'x' | 'y' };

export interface FrictionSnapshot {
  level: number;
  total: number;
  title: string;
  hint: string;
  mode: 'grip' | 'ice';
  deaths: number;
  status: 'play' | 'complete';
}

interface Options { onUpdate: (s: FrictionSnapshot) => void }

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class FrictionEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: Options;

  private lvl = 0;
  private mode: 'grip' | 'ice' = 'grip';
  private deaths = 0;
  private status: FrictionSnapshot['status'] = 'play';
  private b = { x: 0, y: 0, vx: 0, vy: 0, ground: false };
  private keys = new Set<string>();
  private trail: Array<{ x: number; y: number; life: number }> = [];
  private flash = 0;
  private winPause = 0;
  private paid = false;
  private snow: Array<{ x: number; y: number; r: number; vy: number; ph: number }> = [];
  private blinkT = 2.5;
  private animT = 0;
  private squash = 0;      // landing squash pulse
  private wasGround = true;
  private lt = 0;          // level time (drives moving platforms; resets on death)
  private surf: Surface = 'normal';
  private moverRects: Array<{ x: number; y: number; w: number; h: number; axis: 'x' | 'y'; delta: number }> = [];
  private scored: (coins: number) => void = () => {};

  private w = 0; private h = 0;
  private running = true;
  private raf = 0;
  private last = 0;
  private lastSig = '';

  constructor(canvas: HTMLCanvasElement, opts: Options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.opts = opts;
    for (let i = 0; i < 46; i++) this.snow.push({ x: Math.random() * VW, y: Math.random() * VH, r: 1.4 + Math.random() * 2.4, vy: 16 + Math.random() * 34, ph: Math.random() * 6.28 });
    this.load(0);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  onComplete(cb: (coins: number) => void) { this.scored = cb; }

  private load(i: number) {
    this.lvl = i;
    const L = LEVELS[i];
    this.b = { x: L.start.x, y: L.start.y, vx: 0, vy: 0, ground: false };
    this.mode = 'grip';
    this.trail = [];
    this.status = 'play';
    this.lt = 0; this.surf = 'normal';
    this.moverRects = L.movers.map((m) => {
      const off = Math.sin(m.phase) * m.amp;
      return { x: m.axis === 'x' ? m.x + off : m.x, y: m.axis === 'y' ? m.y + off : m.y, w: m.w, h: m.h, axis: m.axis, delta: 0 };
    });
  }

  /** Jump to a specific level (used by the level dots). */
  goto(i: number) { if (i >= 0 && i < LEVELS.length) { this.paid = this.paid && i === LEVELS.length - 1; this.load(i); } }
  restart() { this.load(this.lvl); }
  replayAll() { this.deaths = 0; this.paid = false; this.load(0); }
  /** Flip friction mode — called by the big on-screen button and the F key. */
  toggle() { if (this.status === 'play') this.mode = this.mode === 'grip' ? 'ice' : 'grip'; }

  // ---- input ---------------------------------------------------------------
  private onKey = (e: KeyboardEvent) => {
    const c = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyF', 'KeyW', 'KeyA', 'KeyD', 'KeyS'].includes(c)) e.preventDefault();
    if ((c === 'KeyF' || c === 'ArrowDown' || c === 'KeyS') && !e.repeat) { this.toggle(); return; }
    this.keys.add(c);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private held(a: string, b: string) { return (this.keys.has(a) ? 1 : 0) - (this.keys.has(b) ? 1 : 0); }

  // ---- simulation ----------------------------------------------------------
  private die() { this.deaths++; this.flash = 1; this.load(this.lvl); }

  private moverNow(m: Mover, dt: number) {
    const off = Math.sin(this.lt * m.speed + m.phase) * m.amp;
    const prev = Math.sin((this.lt - dt) * m.speed + m.phase) * m.amp;
    return { x: m.axis === 'x' ? m.x + off : m.x, y: m.axis === 'y' ? m.y + off : m.y, w: m.w, h: m.h, axis: m.axis, delta: off - prev };
  }

  private update(dt: number) {
    if (this.status !== 'play') return;
    if (this.winPause > 0) { this.winPause -= dt; return; }
    const L = LEVELS[this.lvl];
    const ice = this.mode === 'ice';
    this.lt += dt;

    const movers = L.movers.map((m) => this.moverNow(m, dt));
    this.moverRects = movers;

    // friction depends on your mode AND the ground under you
    const accel = this.surf === 'ice' && this.b.ground ? PHYS.iceAccel
      : this.surf === 'sticky' && this.b.ground ? PHYS.gripAccel
        : (ice ? PHYS.iceAccel : PHYS.gripAccel);
    const max = (ice || (this.b.ground && this.surf === 'ice')) ? PHYS.iceMax : PHYS.gripMax;
    let damp: number;
    if (!this.b.ground) damp = PHYS.airDamp;
    else if (this.surf === 'ice') damp = PHYS.iceDamp;
    else if (this.surf === 'sticky') damp = PHYS.stickyDamp;
    else damp = ice ? PHYS.iceDamp : PHYS.gripDamp;

    const dir = this.held('ArrowRight', 'ArrowLeft') + this.held('KeyD', 'KeyA');
    if (dir) this.b.vx += dir * accel * dt;
    if (!dir || Math.sign(dir) !== Math.sign(this.b.vx)) this.b.vx *= Math.exp(-damp * dt);
    this.b.vx = Math.max(-max, Math.min(max, this.b.vx));

    const jump = this.held('ArrowUp', 'zzz') + this.held('KeyW', 'zzz') + (this.keys.has('Space') ? 1 : 0);
    if (jump > 0 && this.b.ground) { this.b.vy = -PHYS.jump; this.b.ground = false; }
    this.b.vy += PHYS.g * dt;

    // everything you can stand on: ground (with surface), bounce pads, movers
    const solids: Solid[] = [
      ...L.ground.map((gr) => ({ x: gr.x, y: gr.y, w: gr.w, h: gr.h, kind: 'ground' as const, surface: gr.surface ?? 'normal' })),
      ...L.pads.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, kind: 'pad' as const, surface: 'normal' as Surface })),
      ...movers.map((mr) => ({ x: mr.x, y: mr.y, w: mr.w, h: mr.h, kind: 'mover' as const, surface: 'normal' as Surface, delta: mr.delta, axis: mr.axis })),
    ];
    const box = () => ({ x: this.b.x, y: this.b.y, w: BLOCK, h: BLOCK });

    this.b.x += this.b.vx * dt;
    for (const so of solids) if (overlap(box(), so)) { if (this.b.vx > 0) this.b.x = so.x - BLOCK; else if (this.b.vx < 0) this.b.x = so.x + so.w; this.b.vx = 0; }

    this.b.y += this.b.vy * dt;
    this.b.ground = false; this.surf = 'normal';
    let carry = 0;
    for (const so of solids) {
      if (!overlap(box(), so)) continue;
      if (this.b.vy > 0) {
        this.b.y = so.y - BLOCK;
        if (so.kind === 'pad') { this.b.vy = -PHYS.bounce; }
        else { this.b.vy = 0; this.b.ground = true; this.surf = so.surface; if (so.kind === 'mover' && so.axis === 'x') carry = so.delta ?? 0; }
      } else if (this.b.vy < 0) { this.b.y = so.y + so.h; this.b.vy = 0; }
    }
    this.b.x += carry;  // ride horizontal platforms

    if (this.b.x < 0) { this.b.x = 0; this.b.vx = 0; }
    if (this.b.x + BLOCK > VW) { this.b.x = VW - BLOCK; this.b.vx = 0; }

    if ((ice || this.surf === 'ice') && this.b.ground && Math.abs(this.b.vx) > 60) this.trail.push({ x: this.b.x + BLOCK / 2, y: this.b.y + BLOCK - 3, life: 1 });
    this.trail = this.trail.filter((p) => (p.life -= dt * 2) > 0);

    for (const sp of L.spikes) if (overlap(box(), sp)) { this.die(); return; }
    if (this.b.y > VH + 80) { this.die(); return; }

    if (overlap(box(), L.goal)) {
      if (this.lvl >= LEVELS.length - 1) { this.status = 'complete'; if (!this.paid) { this.paid = true; this.scored(14 + Math.max(0, 10 - this.deaths)); } }
      else { this.winPause = 0.35; this.load(this.lvl + 1); }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
  }

  // ---- render --------------------------------------------------------------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  private draw() {
    const ctx = this.ctx;
    if (!this.w || !this.h) { this.resize(); if (!this.w) return; }
    const L = LEVELS[this.lvl];
    const s = Math.min(this.w / VW, this.h / VH);
    const ox = (this.w - VW * s) / 2, oy = (this.h - VH * s) / 2;

    ctx.fillStyle = '#20183f'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(s, s);

    // soft dawn sky
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#8f7fd6'); sky.addColorStop(0.55, '#c9a7dd'); sky.addColorStop(1, '#ffd6c4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);

    // gentle sun glow
    const sun = ctx.createRadialGradient(120, 96, 8, 120, 96, 60);
    sun.addColorStop(0, '#fff4d8'); sun.addColorStop(1, '#fff4d800');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(120, 96, 60, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(120, 96, 30, 0, 6.283); ctx.fill();

    // rolling snowy hills (parallax)
    ctx.fillStyle = '#e7d9f6'; blob(ctx, 170, 440, 200, 150);
    ctx.fillStyle = '#efe3fb'; blob(ctx, 560, 440, 240, 170);
    ctx.fillStyle = '#f8f0ff'; blob(ctx, 370, 470, 220, 170);

    // snowflakes
    ctx.fillStyle = '#ffffff';
    for (const f of this.snow) { ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;

    // ground — snowy, slippery ice, or sticky, depending on its surface
    for (const gr of L.ground) drawGround(ctx, gr.x, gr.y, gr.w, gr.h, gr.surface ?? 'normal');
    // moving platforms
    for (const mr of this.moverRects) drawMover(ctx, mr.x, mr.y, mr.w, mr.h);
    // bounce pads
    for (const p of L.pads) drawPad(ctx, p.x, p.y, p.w, p.h);

    // hazards: cute-but-spiky pink crystals
    for (const sp of L.spikes) {
      const n = Math.max(1, Math.round(sp.w / 22));
      const bw = sp.w / n;
      for (let i = 0; i < n; i++) {
        const x = sp.x + i * bw, cx = x + bw / 2;
        ctx.fillStyle = '#ff8fc4';
        ctx.beginPath(); ctx.moveTo(x + 1, sp.y + sp.h); ctx.lineTo(cx, sp.y); ctx.lineTo(x + bw - 1, sp.y + sp.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd0e8';
        ctx.beginPath(); ctx.moveTo(cx, sp.y); ctx.lineTo(cx - 2.5, sp.y + sp.h - 4); ctx.lineTo(cx, sp.y + sp.h - 4); ctx.closePath(); ctx.fill();
      }
    }

    // goal: a glowing bobbing star
    const gx = L.goal.x + L.goal.w / 2, gy = L.goal.y + 16 + Math.sin(this.animT * 2) * 4;
    const glow = ctx.createRadialGradient(gx, gy, 4, gx, gy, 34);
    glow.addColorStop(0, '#fff1a8bb'); glow.addColorStop(1, '#fff1a800');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx, gy, 34, 0, 6.283); ctx.fill();
    star(ctx, gx, gy, 16, 7, '#ffd84d', '#ffeffb');
    // little pole so it reads as a goal
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy + 12); ctx.lineTo(gx, L.goal.y + L.goal.h); ctx.stroke();

    // ice trail
    for (const p of this.trail) { ctx.globalAlpha = p.life * 0.55; ctx.fillStyle = '#bff0ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5 * p.life + 1, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;

    this.drawBlock(ctx);

    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,140,190,${this.flash * 0.4})`; ctx.fillRect(0, 0, this.w, this.h); }
  }

  private drawBlock(ctx: CanvasRenderingContext2D) {
    const ice = this.mode === 'ice';
    const cx = this.b.x + BLOCK / 2, cy = this.b.y + BLOCK / 2;
    // squash & stretch from vertical speed + landing pulse, plus a tiny idle bob
    const vfac = Math.max(-1, Math.min(1, this.b.vy / 660));
    let sy = 1 - vfac * 0.12 - this.squash * 0.22;
    let sx = 1 / sy;
    const bob = this.b.ground ? Math.sin(this.animT * 3) * 0.6 : 0;

    ctx.save();
    ctx.translate(cx, cy + bob); ctx.scale(sx, sy); ctx.translate(-cx, -cy);
    const bx = this.b.x, by = this.b.y;
    // body
    ctx.save();
    ctx.shadowColor = ice ? '#8fe4ff99' : '#4c1d9566'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    const bg = ctx.createLinearGradient(bx, by, bx, by + BLOCK);
    if (ice) { bg.addColorStop(0, '#d6f3ff'); bg.addColorStop(1, '#8fd8ff'); }
    else { bg.addColorStop(0, '#b79bfa'); bg.addColorStop(1, '#8b5cf6'); }
    ctx.fillStyle = bg; roundRect(ctx, bx, by, BLOCK, BLOCK, 10); ctx.fill();
    ctx.restore();
    // glossy shine
    ctx.fillStyle = '#ffffff55'; roundRect(ctx, bx + 5, by + 4, BLOCK - 20, 8, 4); ctx.fill();
    // rosy cheeks
    ctx.fillStyle = ice ? '#8fb6d6aa' : '#ff9ecb';
    ctx.beginPath(); ctx.arc(bx + 8, by + 22, 3.2, 0, 6.283); ctx.arc(bx + BLOCK - 8, by + 22, 3.2, 0, 6.283); ctx.fill();
    // eyes (blink)
    const open = this.blinkT > 0;
    const eyeCol = ice ? '#123a52' : '#3a2170';
    if (open) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(bx + 12, by + 15, 4.4, 0, 6.283); ctx.arc(bx + BLOCK - 12, by + 15, 4.4, 0, 6.283); ctx.fill();
      ctx.fillStyle = eyeCol;
      const look = Math.max(-1.4, Math.min(1.4, this.b.vx / 160));
      ctx.beginPath(); ctx.arc(bx + 12 + look, by + 16, 2.3, 0, 6.283); ctx.arc(bx + BLOCK - 12 + look, by + 16, 2.3, 0, 6.283); ctx.fill();
    } else {
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx + 8, by + 15); ctx.lineTo(bx + 16, by + 15); ctx.moveTo(bx + BLOCK - 16, by + 15); ctx.lineTo(bx + BLOCK - 8, by + 15); ctx.stroke();
    }
    // smile
    ctx.strokeStyle = eyeCol; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(bx + BLOCK / 2, by + 21, 4.5, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    // frost sparkles on ice
    if (ice) { ctx.fillStyle = '#ffffff'; sparkle(ctx, bx + 6, by + 9, 2.4); sparkle(ctx, bx + BLOCK - 7, by + BLOCK - 9, 1.8); }
    ctx.restore();
  }

  private ambient(dt: number) {
    this.animT += dt;
    for (const f of this.snow) {
      f.y += f.vy * dt;
      f.x += Math.sin(this.animT * 0.8 + f.ph) * 8 * dt;
      if (f.y > VH + 4) { f.y = -4; f.x = Math.random() * VW; }
    }
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
    if (this.b.ground && !this.wasGround) this.squash = 1;   // landed — squish!
    this.wasGround = this.b.ground;
    this.squash = Math.max(0, this.squash - dt * 4);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.05) dt = 0.05;
    this.ambient(dt);
    this.update(dt);
    this.draw();
    this.emit();
  };

  private emit() {
    const L = LEVELS[this.lvl];
    const snap: FrictionSnapshot = {
      level: this.lvl + 1, total: LEVELS.length, title: L.title, hint: L.hint,
      mode: this.mode, deaths: this.deaths, status: this.status,
    };
    const sig = [snap.level, snap.mode, snap.deaths, snap.status].join('|');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.opts.onUpdate(snap);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ground tile, drawn to match its surface (normal snow / slippery ice / sticky). */
function drawGround(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, surface: Surface) {
  if (surface === 'ice') {
    const ig = ctx.createLinearGradient(0, y, 0, y + h);
    ig.addColorStop(0, '#c9f4ff'); ig.addColorStop(1, '#7fd0f2');
    ctx.fillStyle = ig; roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.fillStyle = '#ffffffcc'; roundRect(ctx, x + 4, y + 2, w - 8, 5, 3); ctx.fill();   // glossy shine
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < w; i += 34) sparkle(ctx, x + 14 + i, y + 18 + (i % 68 ? 0 : 8), 2.4);
    return;
  }
  if (surface === 'sticky') {
    const sg = ctx.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, '#8a6a52'); sg.addColorStop(1, '#5e4636');
    ctx.fillStyle = sg; roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.fillStyle = '#a98263';
    for (let i = 6; i < w - 4; i += 12) { ctx.beginPath(); ctx.arc(x + i, y + 5, 2.4, 0, 6.283); ctx.fill(); }  // rough bumps
    return;
  }
  // normal snowy
  const ng = ctx.createLinearGradient(0, y, 0, y + h);
  ng.addColorStop(0, '#bfe0ff'); ng.addColorStop(1, '#8bb4e6');
  ctx.fillStyle = ng; roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.fillStyle = '#ffffff'; roundRect(ctx, x, y - 3, w, 15, 8); ctx.fill();
  ctx.fillStyle = '#dcebff';
  for (let ix = x + 16; ix < x + w - 10; ix += 46) {
    ctx.beginPath(); ctx.moveTo(ix, y + 12); ctx.lineTo(ix + 5, y + 12); ctx.lineTo(ix + 2.5, y + 24); ctx.closePath(); ctx.fill();
  }
}

/** A floating (cloud-backed) moving platform. */
function drawMover(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#ffffff55';
  for (let i = 0; i < w; i += 26) { ctx.beginPath(); ctx.arc(x + 12 + i, y + h + 3, 10, 0, 6.283); ctx.fill(); }  // cloud puffs
  const mg = ctx.createLinearGradient(0, y, 0, y + h);
  mg.addColorStop(0, '#f4e7bf'); mg.addColorStop(1, '#d8b06e');
  ctx.fillStyle = mg; roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.fillStyle = '#fff6df'; roundRect(ctx, x + 3, y + 2, w - 6, 4, 2); ctx.fill();
}

/** A springy bounce pad. */
function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#3f8f57'; roundRect(ctx, x, y + h - 6, w, 8, 3); ctx.fill();   // base
  const pg = ctx.createLinearGradient(0, y, 0, y + h);
  pg.addColorStop(0, '#9df07a'); pg.addColorStop(1, '#5bd35b');
  ctx.fillStyle = pg; roundRect(ctx, x, y, w, h - 3, 7); ctx.fill();
  ctx.strokeStyle = '#1e5c33'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  const cx = x + w / 2;
  for (const dy of [0, 5]) { ctx.beginPath(); ctx.moveTo(cx - 8, y + 8 + dy); ctx.lineTo(cx, y + 3 + dy); ctx.lineTo(cx + 8, y + 8 + dy); ctx.stroke(); }
}

/** A soft rounded hill mound. */
function blob(ctx: CanvasRenderingContext2D, cx: number, baseY: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, baseY, rx, ry, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

/** A five-point star with a lighter core. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, fill: string, core: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, inner * 0.55, 0, 6.283); ctx.fillStyle = core; ctx.fill();
}

/** A tiny four-point twinkle. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.35, y - r * 0.35); ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.35, y + r * 0.35); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.35, y + r * 0.35);
  ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.35, y - r * 0.35); ctx.closePath(); ctx.fill();
}
