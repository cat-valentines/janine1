import {
  COIN_SIZE, GRAVITY, GROUND_Y, JUMP_V, MAX_SPEED, PLAYER_SIZE, START_SPEED,
  buildCourse, runnerThemes, type Obstacle, type RunnerCoin, type RunnerTheme,
} from './runner';
import type { CharacterId } from './types';

const WIDTH = 960;
const HEIGHT = 380;
const PLAYER_X = 170;

export interface RunnerSnapshot {
  distance: number; coins: number; best: number;
  status: 'playing' | 'dead' | 'finished';
  themeName: string; themeIcon: string;
}

interface EngineOptions {
  character: CharacterId;
  characterAsset: string;
  seed: number;
  best: number;
  onUpdate: (snapshot: RunnerSnapshot) => void;
  onCoin: () => void;
}

export class RunnerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private theme: RunnerTheme;
  private sprite = new Image();
  private coinSprite = new Image();

  private obstacles: Obstacle[];
  private coins: RunnerCoin[];
  private finish: number;

  private scroll = 0;
  private speed = START_SPEED;
  private y = GROUND_Y - PLAYER_SIZE;
  private vy = 0;
  private grounded = true;
  private spin = 0;
  private collected = 0;
  private status: 'playing' | 'dead' | 'finished' = 'playing';
  private holding = false;

  private running = true;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.options = options;
    this.theme = runnerThemes[options.character];
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.sprite.src = options.characterAsset;
    this.coinSprite.src = '/assets/pixel-coin.png';

    const course = buildCourse(options.seed);
    this.obstacles = course.obstacles;
    this.coins = course.coins.map((coin) => ({ ...coin }));
    this.finish = course.finish;

    this.bind();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ---- input -------------------------------------------------------------

  private jump() {
    if (this.status !== 'playing' || !this.grounded) return;
    this.vy = -JUMP_V;
    this.grounded = false;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'KeyW') return;
    event.preventDefault();
    this.holding = true;
    this.jump();
  };
  private onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') this.holding = false;
  };
  private onPointerDown = () => { this.holding = true; this.jump(); };
  private onPointerUp = () => { this.holding = false; };

  private bind() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private unbind() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  // ---- simulation --------------------------------------------------------

  private hitBox(obstacle: Obstacle) {
    // Spikes get a slimmer box than they look, so near-misses feel fair.
    const inset = obstacle.kind === 'block' ? 0 : 7;
    return {
      left: obstacle.x + inset,
      right: obstacle.x + obstacle.width - inset,
      top: GROUND_Y - obstacle.height,
      bottom: GROUND_Y,
    };
  }

  private update(dt: number) {
    this.speed = Math.min(MAX_SPEED, this.speed + dt * 14);
    this.scroll += this.speed * dt;
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    this.spin = this.grounded ? 0 : this.spin + dt * 9;

    const left = this.scroll + PLAYER_X;
    const right = left + PLAYER_SIZE;
    let floor = GROUND_Y;

    for (const obstacle of this.obstacles) {
      if (obstacle.x + obstacle.width < left - 200) continue;
      if (obstacle.x > right + 200) break;
      const box = this.hitBox(obstacle);
      if (right <= box.left || left >= box.right) continue;

      if (obstacle.kind !== 'block') {
        // Any touch of a spike is fatal.
        if (this.y + PLAYER_SIZE > box.top + 6) { this.die(); return; }
        continue;
      }
      // Landing on top of a block is fine; running into its side is not.
      const wasAbove = this.y + PLAYER_SIZE - this.vy * dt <= box.top + 2;
      if (wasAbove && this.vy >= 0) floor = Math.min(floor, box.top);
      else if (this.y + PLAYER_SIZE > box.top + 4) { this.die(); return; }
    }

    if (this.y + PLAYER_SIZE >= floor) {
      this.y = floor - PLAYER_SIZE;
      this.vy = 0;
      this.grounded = true;
      if (this.holding) this.jump(); // holding space keeps you hopping
    } else this.grounded = false;

    this.coins.forEach((coin) => {
      if (coin.taken) return;
      if (Math.abs(coin.x - (left + PLAYER_SIZE / 2)) > COIN_SIZE) return;
      if (Math.abs(coin.y - (this.y + PLAYER_SIZE / 2)) > COIN_SIZE + 8) return;
      coin.taken = true;
      this.collected += 1;
      this.options.onCoin();
    });

    if (this.scroll > this.finish) this.status = 'finished';
  }

  private die() {
    this.status = 'dead';
  }

  // ---- drawing -----------------------------------------------------------

  private draw() {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, this.theme.skyTop);
    sky.addColorStop(1, this.theme.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Parallax hills, drifting slower than the ground.
    ctx.fillStyle = this.theme.far;
    for (let i = -1; i < 8; i += 1) {
      const hx = ((i * 260 - this.scroll * 0.25) % (WIDTH + 520) + WIDTH + 520) % (WIDTH + 520) - 260;
      ctx.beginPath();
      ctx.arc(hx, GROUND_Y + 30, 120, Math.PI, 0);
      ctx.fill();
    }
    // Scenery emoji, also parallaxed.
    ctx.font = '30px serif';
    ctx.textAlign = 'center';
    for (let i = -1; i < 10; i += 1) {
      const dx = ((i * 220 - this.scroll * 0.45) % (WIDTH + 440) + WIDTH + 440) % (WIDTH + 440) - 220;
      ctx.fillText(this.theme.decor[i % this.theme.decor.length] ?? '🌿', dx, GROUND_Y - 6);
    }

    ctx.fillStyle = this.theme.ground;
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = this.theme.groundLine;
    ctx.fillRect(0, GROUND_Y, WIDTH, 5);
    ctx.fillStyle = this.theme.groundDark;
    for (let i = 0; i < 24; i += 1) {
      const gx = ((i * 60 - this.scroll) % (WIDTH + 120) + WIDTH + 120) % (WIDTH + 120) - 60;
      ctx.fillRect(gx, GROUND_Y + 16, 30, 6);
    }

    this.obstacles.forEach((obstacle) => {
      const sx = obstacle.x - this.scroll;
      if (sx < -140 || sx > WIDTH + 60) return;
      if (obstacle.kind === 'block') {
        ctx.fillStyle = this.theme.obstacle;
        ctx.fillRect(sx, GROUND_Y - obstacle.height, obstacle.width, obstacle.height);
        ctx.fillStyle = this.theme.obstacleDark;
        ctx.fillRect(sx, GROUND_Y - obstacle.height, obstacle.width, 6);
        return;
      }
      const count = obstacle.kind === 'spikes3' ? 3 : 1;
      for (let i = 0; i < count; i += 1) {
        const bx = sx + i * 26;
        ctx.fillStyle = this.theme.obstacle;
        ctx.beginPath();
        ctx.moveTo(bx, GROUND_Y);
        ctx.lineTo(bx + 17, GROUND_Y - obstacle.height);
        ctx.lineTo(bx + 34, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = this.theme.obstacleDark;
        ctx.beginPath();
        ctx.moveTo(bx + 17, GROUND_Y - obstacle.height);
        ctx.lineTo(bx + 34, GROUND_Y);
        ctx.lineTo(bx + 24, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
    });

    this.coins.forEach((coin) => {
      if (coin.taken) return;
      const sx = coin.x - this.scroll;
      if (sx < -40 || sx > WIDTH + 40) return;
      if (this.coinSprite.complete && this.coinSprite.naturalWidth) {
        ctx.drawImage(this.coinSprite, sx - COIN_SIZE / 2, coin.y - COIN_SIZE / 2, COIN_SIZE, COIN_SIZE);
      } else {
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath();
        ctx.arc(sx, coin.y, COIN_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // The character slides along, tumbling while airborne like Geometry Dash.
    ctx.save();
    ctx.translate(PLAYER_X + PLAYER_SIZE / 2, this.y + PLAYER_SIZE / 2);
    ctx.rotate(this.spin);
    if (this.sprite.complete && this.sprite.naturalWidth) {
      ctx.drawImage(this.sprite, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    } else {
      ctx.fillStyle = '#b45f55';
      ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    }
    ctx.restore();
  }

  private snapshot(): RunnerSnapshot {
    return {
      distance: Math.floor(this.scroll / 10),
      coins: this.collected,
      best: this.options.best,
      status: this.status,
      themeName: this.theme.name,
      themeIcon: this.theme.icon,
    };
  }

  dispose() {
    this.running = false;
    this.unbind();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.033);
    this.last = now;
    if (this.status === 'playing') this.update(dt);
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
