import {
  BIGGEST, BOUNCE, CUP_FLOOR, CUP_RIM, CUP_X1, CUP_X2, DEAD_LINE, DROPPABLE, DROP_COOLDOWN,
  DROP_Y, GRAVITY, MOVE_SPEED, OVERFLOW_SECONDS, VIEW_H, VIEW_W, gruits, mergeScore,
} from './gruits';

interface Body {
  id: number;
  tier: number;
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  /** Seconds since it was dropped, so a falling piece cannot end the game. */
  age: number;
  /** Grows while it sits above the dead line. */
  overflow: number;
  /** Set on a merge, for the little pop animation. */
  pop: number;
}

export interface GruitsSnapshot {
  score: number;
  best: number;
  next: number;
  biggest: number;
  status: 'playing' | 'over';
  /** 0..1 — how close the cup is to overflowing, for the warning bar. */
  danger: number;
  message: string;
}

interface EngineOptions {
  best: number;
  onUpdate: (snapshot: GruitsSnapshot) => void;
  onScore: (points: number) => void;
}

/** Heavier pieces shove lighter ones. Area is a good enough stand-in for mass. */
const massOf = (body: Body) => body.r * body.r;

export class GruitsEngine {
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;

  private bodies: Body[] = [];
  private nextId = 1;
  private dropX = VIEW_W / 2;
  private current = 0;
  private next = 0;
  private cooldown = 0;
  private score = 0;
  private best = 0;
  private biggest = 0;
  private status: 'playing' | 'over' = 'playing';
  private message = '';
  private messageUntil = 0;
  private danger = 0;

  private keys = new Set<string>();
  private running = true;
  private last = 0;
  private time = 0;
  private seed = 1;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    this.best = options.best;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.current = this.pick();
    this.next = this.pick();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas = canvas;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private canvas: HTMLCanvasElement;

  /** Small deterministic PRNG, so a round is reproducible while testing. */
  private pick() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return Math.floor((this.seed / 4294967296) * DROPPABLE);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Space') this.drop();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private pointerX(event: PointerEvent) {
    const box = this.canvas.getBoundingClientRect();
    return ((event.clientX - box.left) / box.width) * VIEW_W;
  }
  private onPointerMove = (event: PointerEvent) => {
    if (this.status !== 'playing') return;
    this.dropX = this.clampDrop(this.pointerX(event));
  };
  private onPointerDown = (event: PointerEvent) => {
    if (this.status !== 'playing') return;
    this.dropX = this.clampDrop(this.pointerX(event));
    this.drop();
  };

  private clampDrop(x: number) {
    const r = gruits[this.current].r;
    return Math.max(CUP_X1 + r, Math.min(CUP_X2 - r, x));
  }

  private say(text: string, seconds = 1.4) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  drop() {
    if (this.status !== 'playing' || this.cooldown > 0) return;
    this.cooldown = DROP_COOLDOWN;
    const gruit = gruits[this.current];
    this.bodies.push({
      id: this.nextId++, tier: this.current,
      x: this.clampDrop(this.dropX), y: DROP_Y,
      vx: 0, vy: 0, r: gruit.r, age: 0, overflow: 0, pop: 0,
    });
    this.current = this.next;
    this.next = this.pick();
  }

  // ---- physics -----------------------------------------------------------

  private walls(body: Body) {
    if (body.x - body.r < CUP_X1) { body.x = CUP_X1 + body.r; body.vx = Math.abs(body.vx) * BOUNCE; }
    if (body.x + body.r > CUP_X2) { body.x = CUP_X2 - body.r; body.vx = -Math.abs(body.vx) * BOUNCE; }
    if (body.y + body.r > CUP_FLOOR) {
      body.y = CUP_FLOOR - body.r;
      body.vy = -Math.abs(body.vy) * BOUNCE;
      body.vx *= 0.88;
    }
  }

  /**
   * Push two overlapping pieces apart and bleed off the speed they met with.
   *
   * Position and velocity are corrected separately: fixing only velocity lets a
   * stack sink into itself, and fixing only position makes it jitter forever.
   */
  private collide(a: Body, b: Body) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const least = a.r + b.r;
    if (distance >= least || distance === 0) return false;

    const nx = dx / distance;
    const ny = dy / distance;
    const ma = massOf(a);
    const mb = massOf(b);
    const total = ma + mb;

    // Leave a sliver of overlap (the slop) so resting pieces stop fighting.
    const overlap = Math.max(0, least - distance - 0.4);
    a.x -= nx * overlap * (mb / total) * 0.8;
    a.y -= ny * overlap * (mb / total) * 0.8;
    b.x += nx * overlap * (ma / total) * 0.8;
    b.y += ny * overlap * (ma / total) * 0.8;

    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing < 0) {
      const impulse = (-(1 + BOUNCE) * closing) / (1 / ma + 1 / mb);
      a.vx -= (impulse * nx) / ma;
      a.vy -= (impulse * ny) / ma;
      b.vx += (impulse * nx) / mb;
      b.vy += (impulse * ny) / mb;
    }
    return true;
  }

  /** Two of the same touching become the next one up. */
  private merges() {
    for (let i = 0; i < this.bodies.length; i += 1) {
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const a = this.bodies[i];
        const b = this.bodies[j];
        if (a.tier !== b.tier) continue;
        // Touching is enough. Demanding real overlap never fires: the collision
        // solver has already pushed them apart to just under a.r + b.r.
        if (Math.hypot(b.x - a.x, b.y - a.y) > a.r + b.r) continue;

        const tier = a.tier;
        const points = mergeScore(tier);
        this.score += points;
        this.best = Math.max(this.best, this.score);
        this.options.onScore(points);
        this.bodies.splice(j, 1);
        this.bodies.splice(i, 1);

        if (tier < BIGGEST) {
          const grown = gruits[tier + 1];
          this.biggest = Math.max(this.biggest, tier + 1);
          this.bodies.push({
            id: this.nextId++, tier: tier + 1,
            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
            vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2,
            r: grown.r, age: Math.min(a.age, b.age), overflow: 0, pop: 0.24,
          });
          if (tier + 1 === BIGGEST) this.say('🍉 A watermelon! Amazing!', 2.4);
          else if (tier >= 6) this.say(`${grown.icon} ${grown.name}!`, 1.2);
        } else {
          // Two watermelons just vanish, and pay handsomely.
          this.say('🍉🍉 Double watermelon — they popped!', 2.4);
        }
        // One merge per frame keeps the loop honest about what it just removed.
        return;
      }
    }
  }

  private update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    const move = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    if (move) this.dropX = this.clampDrop(this.dropX + move * MOVE_SPEED * dt);

    // Several small steps beat one big one: a tall stack settles instead of
    // squeezing through itself.
    const steps = 3;
    const h = dt / steps;
    for (let step = 0; step < steps; step += 1) {
      this.bodies.forEach((body) => {
        body.vy += GRAVITY * h;
        body.x += body.vx * h;
        body.y += body.vy * h;
        body.age += h;
        if (body.pop > 0) body.pop = Math.max(0, body.pop - h);
      });
      // A few passes let a pile push itself apart properly.
      for (let pass = 0; pass < 4; pass += 1) {
        for (let i = 0; i < this.bodies.length; i += 1) {
          for (let j = i + 1; j < this.bodies.length; j += 1) {
            this.collide(this.bodies[i], this.bodies[j]);
          }
        }
        this.bodies.forEach((body) => this.walls(body));
      }
    }

    this.merges();

    // Overflow: a piece must be old enough to have settled, and stay up there.
    let worst = 0;
    this.bodies.forEach((body) => {
      const above = body.y - body.r < DEAD_LINE;
      if (above && body.age > 1) body.overflow += dt;
      else body.overflow = 0;
      worst = Math.max(worst, body.overflow);
    });
    this.danger = Math.min(1, worst / OVERFLOW_SECONDS);
    if (worst >= OVERFLOW_SECONDS) {
      this.status = 'over';
      this.say('🥣 The cup overflowed!', 6);
    }
  }

  // ---- drawing -----------------------------------------------------------

  /** Every gruit has a little face: sparkly eyes, blushed cheeks and a smile. */
  private drawGruit(body: Body) {
    const { ctx } = this;
    const gruit = gruits[body.tier];
    const r = body.r;
    const squash = 1 + body.pop * 1.1;
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(squash, 2 - squash);

    // A soft rim, then a gradient body lit from the top-left, so each one looks
    // like a round little thing rather than a flat sticker.
    ctx.fillStyle = gruit.dark;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const shade = ctx.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.1, 0, 0, r * 1.02);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.22, gruit.colour);
    shade.addColorStop(1, gruit.dark);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, -r * 0.04, r * 0.93, 0, Math.PI * 2);
    ctx.fill();
    // Glossy highlight.
    ctx.fillStyle = '#ffffff66';
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.44, r * 0.24, r * 0.15, -0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff30';
    ctx.beginPath();
    ctx.ellipse(r * 0.36, r * 0.34, r * 0.16, r * 0.1, -0.55, 0, Math.PI * 2);
    ctx.fill();

    // The fruit itself, worn like a little hat, so you can still tell them apart.
    ctx.font = `${Math.round(r * 0.66)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gruit.icon, 0, -r * 0.56);

    // Blushed cheeks.
    ctx.fillStyle = '#ff8fa388';
    ctx.beginPath();
    ctx.ellipse(-r * 0.46, r * 0.26, r * 0.16, r * 0.11, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.46, r * 0.26, r * 0.16, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes, with a glint each.
    const eyeX = r * 0.3;
    const eyeY = r * 0.12;
    const eyeR = Math.max(1.6, r * 0.13);
    ctx.fillStyle = '#2b2033';
    ctx.beginPath();
    ctx.ellipse(-eyeX, eyeY, eyeR * 0.82, eyeR, 0, 0, Math.PI * 2);
    ctx.ellipse(eyeX, eyeY, eyeR * 0.82, eyeR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeX + eyeR * 0.28, eyeY - eyeR * 0.34, eyeR * 0.3, 0, Math.PI * 2);
    ctx.arc(eyeX + eyeR * 0.28, eyeY - eyeR * 0.34, eyeR * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // A smile — wide open on the little ones, gentler on the big ones.
    ctx.strokeStyle = '#2b2033';
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.19, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  private draw() {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#ffe9c9');
    sky.addColorStop(1, '#ffd2a6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // The cup.
    ctx.fillStyle = '#fff7ea';
    ctx.fillRect(CUP_X1, CUP_RIM, CUP_X2 - CUP_X1, CUP_FLOOR - CUP_RIM);
    ctx.strokeStyle = '#8d5a2b';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(CUP_X1, CUP_RIM);
    ctx.lineTo(CUP_X1, CUP_FLOOR);
    ctx.lineTo(CUP_X2, CUP_FLOOR);
    ctx.lineTo(CUP_X2, CUP_RIM);
    ctx.stroke();

    // The line you must not rest above.
    ctx.strokeStyle = this.danger > 0.05 ? '#e0452f' : '#e0452f44';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(CUP_X1, DEAD_LINE);
    ctx.lineTo(CUP_X2, DEAD_LINE);
    ctx.stroke();
    ctx.setLineDash([]);

    this.bodies.forEach((body) => this.drawGruit(body));

    // The piece waiting to drop, and its guide line.
    if (this.status === 'playing') {
      const gruit = gruits[this.current];
      ctx.strokeStyle = '#8d5a2b44';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.moveTo(this.dropX, DROP_Y + gruit.r);
      ctx.lineTo(this.dropX, CUP_FLOOR);
      ctx.stroke();
      ctx.setLineDash([]);
      this.drawGruit({ id: -1, tier: this.current, x: this.dropX, y: DROP_Y, vx: 0, vy: 0, r: gruit.r, age: 0, overflow: 0, pop: 0 });
    }
  }

  private snapshot(): GruitsSnapshot {
    return {
      score: this.score, best: this.best,
      next: this.next, biggest: this.biggest,
      status: this.status, danger: this.danger,
      message: this.time < this.messageUntil ? this.message : '',
    };
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.032);
    this.last = now;
    this.time += dt;
    if (this.status === 'playing') this.update(dt);
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
