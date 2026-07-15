import { GROUND_BASE, coinsFor, inGap, onSpikes, trackY, truckById, type DriveLevel, type TruckColour } from './drive';

const VIEW_W = 960;
const VIEW_H = 420;

// Physics tuned for a chunky, forgiving toy truck rather than a real vehicle.
const GRAVITY = 1250;
const SPRING = 320;
const DAMP = 22;
const ENGINE = 720;
/** Steepest slope the engine still pushes *forward* along. At a stair edge the
 *  real slope is near-vertical, which would shove the truck straight up and stall it. */
const DRIVE_SLOPE_CAP = 0.62;
const MAX_SPEED = 640;
/** How hard the truck settles onto the slope it is standing on. Without this
 *  the engine torque rears it up and backflips it on every throttle press. */
const ALIGN = 34;
const GROUND_SPIN_DAMP = 0.0008;
const AIR_SPIN_DAMP = 0.55;
const AIR_TORQUE = 4.4;
/** A touch of nose-lift under power, for feel — nowhere near a flip. */
const WHEELIE = 1.1;
const ROLL_DRAG = 1.1;
const DRIVE_DRAG = 0.18;
const WHEEL_R = 21;
const BODY_W = 86;
const BODY_H = 28;

/** Where the wheels sit, in truck-space (0,0 is the middle of the chassis). */
const WHEELS = [
  { x: -30, y: 17 },
  { x: 32, y: 17 },
];

export interface DriveSnapshot {
  coins: number; totalCoins: number;
  distance: number; length: number;
  speed: number;
  status: 'playing' | 'crashed' | 'won';
  level: number; levelName: string;
  message: string;
}

interface EngineOptions {
  level: DriveLevel;
  truck: string;
  onUpdate: (snapshot: DriveSnapshot) => void;
  onCoin: () => void;
}

export class DriveEngine {
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private level: DriveLevel;
  private colour: TruckColour;
  private coinSprite = new Image();

  private x = 90;
  private y = GROUND_BASE - 40;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private spin = 0;
  private wheelSpin = 0;
  private grounded = false;

  private coins: Array<{ x: number; y: number; taken: boolean }>;
  private collected = 0;
  private status: 'playing' | 'crashed' | 'won' = 'playing';
  private message = '';
  private keys = new Set<string>();
  private touch = { gas: false, brake: false };

  private running = true;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    this.level = options.level;
    this.colour = truckById(options.truck) ?? { id: 'blue', name: 'Blue', body: '#a7cde4', dark: '#7fa9c6', trim: '#dceff9' };
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.coinSprite.src = '/assets/pixel-coin.png';
    this.coins = coinsFor(options.level);
    this.bind();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'KeyD', 'KeyA'].includes(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  /** Phone buttons drive the same inputs as the arrow keys. */
  setTouch(which: 'gas' | 'brake', on: boolean) { this.touch[which] = on; }

  private bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private unbind() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private get gas() { return this.touch.gas || this.keys.has('ArrowRight') || this.keys.has('KeyD'); }
  private get brake() { return this.touch.brake || this.keys.has('ArrowLeft') || this.keys.has('KeyA'); }

  // ---- physics -----------------------------------------------------------

  private groundAt(x: number) { return trackY(x, this.level); }

  /** Slope of the track, so wheels push away from the surface properly. */
  private normalAt(x: number) {
    const dy = this.groundAt(x + 3) - this.groundAt(x - 3);
    const len = Math.hypot(6, dy);
    return { x: dy / len, y: -6 / len };
  }

  private toWorld(point: { x: number; y: number }) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return { x: this.x + point.x * cos - point.y * sin, y: this.y + point.x * sin + point.y * cos };
  }

  /** Angle of the ground under x, in radians. */
  private slopeAt(x: number) {
    return Math.atan2(this.groundAt(x + 4) - this.groundAt(x - 4), 8);
  }

  private update(dt: number) {
    this.vy += GRAVITY * dt;
    this.grounded = false;
    let slope = 0;

    WHEELS.forEach((offset) => {
      const world = this.toWorld(offset);
      const ground = this.groundAt(world.x);
      const penetration = world.y + WHEEL_R - ground;
      if (penetration <= 0) return;
      this.grounded = true;
      slope = this.slopeAt(world.x);
      const normal = this.normalAt(world.x);
      const into = this.vx * normal.x + this.vy * normal.y;
      // Suspension pushes straight out of the ground. Applied as pure linear
      // force: routing it through torque is what made the truck somersault.
      const force = penetration * SPRING - into * DAMP;
      this.vx += normal.x * force * dt;
      this.vy += normal.y * force * dt;
      this.y -= penetration * 0.4;
    });

    const throttle = (this.gas ? 1 : 0) - (this.brake ? 1 : 0);

    if (this.grounded) {
      const driveSlope = Math.max(-DRIVE_SLOPE_CAP, Math.min(DRIVE_SLOPE_CAP, slope));
      const tangent = { x: Math.cos(driveSlope), y: Math.sin(driveSlope) };
      if (throttle !== 0 && Math.abs(this.vx) < MAX_SPEED) {
        this.vx += tangent.x * ENGINE * throttle * dt;
        this.vy += tangent.y * ENGINE * throttle * dt;
      }
      const drag = throttle === 0 ? ROLL_DRAG : DRIVE_DRAG;
      this.vx -= this.vx * drag * dt;

      // Settle the body onto the slope, then damp hard so it stays put.
      let diff = slope - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.spin += diff * ALIGN * dt;
      if (throttle > 0) this.spin -= WHEELIE * dt;
      this.spin *= Math.pow(GROUND_SPIN_DAMP, dt);
    } else {
      // Airborne: the arrows tip the truck, exactly like Drive Mad.
      this.spin += throttle * AIR_TORQUE * dt;
      this.spin *= Math.pow(AIR_SPIN_DAMP, dt);
    }

    this.angle += this.spin * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.wheelSpin += this.vx * dt * 0.08;

    // Crash if the chassis itself scrapes the ground (flipped or nose-dived).
    const corners = [
      { x: -BODY_W / 2, y: -BODY_H / 2 }, { x: BODY_W / 2, y: -BODY_H / 2 },
      { x: -BODY_W / 2, y: BODY_H / 2 }, { x: BODY_W / 2, y: BODY_H / 2 },
    ];
    for (const corner of corners) {
      const world = this.toWorld(corner);
      if (world.y > this.groundAt(world.x) + 2) { this.crash('💥 The truck crashed!'); return; }
    }
    if (this.grounded && onSpikes(this.x, this.level)) { this.crash('🌵 You hit the spikes!'); return; }
    if (this.y > GROUND_BASE + 320) { this.crash('🕳️ You fell down the gap!'); return; }

    this.coins.forEach((coin) => {
      if (coin.taken) return;
      if (Math.hypot(coin.x - this.x, coin.y - this.y) > 34) return;
      coin.taken = true;
      this.collected += 1;
      this.options.onCoin();
    });

    if (this.x >= this.level.length) {
      this.status = 'won';
      this.message = '🏁 You made it!';
    }
  }

  private crash(why: string) {
    this.status = 'crashed';
    this.message = why;
  }

  // ---- drawing -----------------------------------------------------------

  private draw() {
    const { ctx } = this;
    const camX = this.x - 250;
    const camY = Math.min(0, this.y - 250);

    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, this.level.sky);
    sky.addColorStop(1, '#f3f7e9');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(-camX, -camY);

    // The track: one filled ribbon following trackY, skipping the gaps.
    ctx.fillStyle = this.level.ground;
    ctx.strokeStyle = this.level.groundDark;
    ctx.lineWidth = 6;
    let drawing = false;
    ctx.beginPath();
    for (let x = camX - 20; x < camX + VIEW_W + 20; x += 6) {
      if (inGap(x, this.level)) {
        if (drawing) { ctx.lineTo(x, GROUND_BASE + 700); ctx.closePath(); ctx.fill(); ctx.beginPath(); drawing = false; }
        continue;
      }
      const y = trackY(x, this.level);
      if (!drawing) { ctx.moveTo(x, GROUND_BASE + 700); ctx.lineTo(x, y); drawing = true; }
      else ctx.lineTo(x, y);
    }
    if (drawing) { ctx.lineTo(camX + VIEW_W + 20, GROUND_BASE + 700); ctx.closePath(); ctx.fill(); }

    // A darker crust on top of the ground.
    ctx.beginPath();
    let pen = false;
    for (let x = camX - 20; x < camX + VIEW_W + 20; x += 6) {
      if (inGap(x, this.level)) { pen = false; continue; }
      const y = trackY(x, this.level);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Spike strips, drawn sitting on the track.
    this.level.features.forEach((f) => {
      if (f.kind !== 'spikes') return;
      if (f.x + f.width < camX - 40 || f.x > camX + VIEW_W + 40) return;
      // Small, low razors: they hug the ground rather than tower over it.
      for (let sx = f.x; sx < f.x + f.width; sx += 9) {
        const gy = trackY(sx + 4.5, this.level);
        ctx.fillStyle = '#6d6a72';
        ctx.beginPath();
        ctx.moveTo(sx, gy);
        ctx.lineTo(sx + 4.5, gy - 11);
        ctx.lineTo(sx + 9, gy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#403e45';
        ctx.beginPath();
        ctx.moveTo(sx + 4.5, gy - 11);
        ctx.lineTo(sx + 9, gy);
        ctx.lineTo(sx + 6, gy);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Finish flag.
    const fx = this.level.length;
    if (fx > camX - 40 && fx < camX + VIEW_W + 40) {
      const fy = trackY(fx, this.level);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(fx - 2, fy - 96, 5, 96);
      ctx.fillStyle = '#e8503a';
      ctx.fillRect(fx + 3, fy - 96, 44, 26);
      ctx.fillStyle = '#fffaf0';
      for (let i = 0; i < 3; i += 1) ctx.fillRect(fx + 3 + i * 15, fy - 96 + (i % 2) * 13, 7, 13);
    }

    this.coins.forEach((coin) => {
      if (coin.taken || coin.x < camX - 40 || coin.x > camX + VIEW_W + 40) return;
      if (this.coinSprite.complete && this.coinSprite.naturalWidth) {
        ctx.drawImage(this.coinSprite, coin.x - 11, coin.y - 11, 22, 22);
      } else {
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // The truck.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.colour.dark;
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2 + 4, BODY_W, BODY_H);
    ctx.fillStyle = this.colour.body;
    ctx.fillRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H);
    // Cab and window.
    ctx.fillStyle = this.colour.body;
    ctx.fillRect(4, -BODY_H / 2 - 21, 36, 22);
    ctx.fillStyle = this.colour.trim;
    ctx.fillRect(11, -BODY_H / 2 - 16, 22, 12);
    ctx.restore();

    WHEELS.forEach((offset) => {
      const world = this.toWorld(offset);
      ctx.save();
      ctx.translate(world.x, world.y);
      ctx.rotate(this.wheelSpin);
      ctx.fillStyle = '#2f2a30';
      ctx.beginPath();
      ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.colour.trim;
      ctx.beginPath();
      ctx.arc(0, 0, WHEEL_R * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f2a30';
      ctx.fillRect(-2, -WHEEL_R * 0.45, 4, WHEEL_R * 0.9);
      ctx.restore();
    });

    ctx.restore();
  }

  private snapshot(): DriveSnapshot {
    return {
      coins: this.collected, totalCoins: this.coins.length,
      distance: Math.max(0, Math.round(this.x)), length: this.level.length,
      speed: Math.round(Math.abs(this.vx) / 6),
      status: this.status,
      level: this.level.id, levelName: this.level.name,
      message: this.message,
    };
  }

  dispose() {
    this.running = false;
    this.unbind();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.028);
    this.last = now;
    if (this.status === 'playing') this.update(dt);
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
