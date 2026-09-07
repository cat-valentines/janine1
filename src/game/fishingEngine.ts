/**
 * Fishing Frenzy, on a canvas.
 *
 * The sea is drawn top-down: deep water at the top, your home shore along the
 * bottom. Drive the boat with the arrow keys (or the on-screen controls, which
 * send the same key events), press Space near a fish to cast, then press again
 * to stop the reel marker in the green. Sail back to the shore to sell.
 *
 * Rival boats — animal bots, or real players in a live game — are fed in from
 * outside, so the same engine runs every mode.
 */
import {
  CAST_RANGE, HOLD_SIZE, REEL_SWEEP, ROUND_SECONDS, SEA_H, SEA_W, SHORE_Y,
  atShore, boatSpeed, depthAt, holdValue, reelHit, reelWindow, rollFish, shouldSailHome,
  type FishKind, type FishingBot,
} from './fishing';

/** A fish swimming about in the sea. */
interface SeaFish { id: number; kind: FishKind; x: number; y: number; vx: number; vy: number; caught: boolean }

/** Any boat on the water: yours, a bot's, or another player's. */
interface Boat {
  id: string;
  name: string;
  emoji: string;
  x: number; y: number;
  hold: string[];
  banked: number;
  you: boolean;
  bot?: FishingBot;
  /** What the bot is up to right now. */
  targetFish?: number;
  reelUntil?: number;
  /** For a real player's boat, where they told us they were. */
  remote?: boolean;
}

export interface FishingSnapshot {
  secondsLeft: number;
  hold: string[];
  holdValue: number;
  banked: number;
  /** The fish you could cast at right now, if any. */
  nearby: { name: string; emoji: string; price: number; rarity: string } | null;
  /** While reeling: the marker and the green band, all 0–1. */
  reel: { marker: number; bandStart: number; band: number; fish: string; emoji: string } | null;
  message: string;
  atShore: boolean;
  /** True once the hold is heavy enough to be slowing the boat down. */
  laden: boolean;
  over: boolean;
  boats: Array<{ id: string; name: string; emoji: string; banked: number; hold: number; you: boolean }>;
}

export interface FishingRival { id: string; name: string; emoji: string; x: number; y: number; banked: number; hold: number }

interface EngineOptions {
  myName: string;
  myEmoji: string;
  bots: FishingBot[];
  onUpdate: (snapshot: FishingSnapshot) => void;
  /** Called whenever your boat or score changes, so a live game can broadcast it. */
  onBroadcast?: (state: { x: number; y: number; banked: number; hold: number }) => void;
  onOver: (banked: number) => void;
}

const FISH_COUNT = 26;

export class FishingEngine {
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private fish: SeaFish[] = [];
  private boats: Boat[] = [];
  private me: Boat;
  private nextFishId = 1;

  private keys = new Set<string>();
  private running = true;
  private last = 0;
  private time = 0;
  private secondsLeft = ROUND_SECONDS;
  private message = '';
  private messageUntil = 0;
  private over = false;
  private broadcastAt = 0;

  /** The cast in progress: which fish, the sweeping marker, and the green band. */
  private reel: { fish: SeaFish; marker: number; dir: 1 | -1; bandStart: number; band: number } | null = null;
  /** Space must be released between the cast and the strike, or one long press does both. */
  private actionHeld = false;

  private sprites = new Map<string, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    canvas.width = SEA_W;
    canvas.height = SEA_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;

    this.me = { id: 'me', name: options.myName || 'You', emoji: options.myEmoji || '🚤', x: SEA_W / 2, y: SHORE_Y - 10, hold: [], banked: 0, you: true };
    this.boats = [this.me];
    options.bots.forEach((bot, i) => {
      this.boats.push({
        id: `bot-${bot.id}`, name: bot.name, emoji: bot.emoji, bot,
        x: SEA_W / 2 + (i + 1) * 90 * (i % 2 ? -1 : 1), y: SHORE_Y - 10, hold: [], banked: 0, you: false,
      });
      const image = new Image();
      image.src = bot.asset;
      this.sprites.set(bot.id, image);
    });

    for (let i = 0; i < FISH_COUNT; i += 1) this.spawnFish();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ---- input ---------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'Space' && !this.actionHeld) { this.actionHeld = true; this.action(); }
  };
  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'Space') this.actionHeld = false;
  };

  /** Space: cast at the nearest fish, or strike if the reel is already running. */
  private action() {
    if (this.over) return;
    if (this.reel) { this.strike(); return; }
    const fish = this.nearestFish(this.me);
    if (!fish) { this.say('Sail closer to a fish first!'); return; }
    if (this.me.hold.length >= HOLD_SIZE) { this.say('Your hold is full — sail back and sell!'); return; }
    const band = reelWindow(fish.kind);
    this.reel = { fish, marker: 0, dir: 1, bandStart: Math.random() * (1 - band), band };
  }

  /** Stop the marker. In the green, the fish is yours. */
  private strike() {
    if (!this.reel) return;
    const { fish, marker, bandStart, band } = this.reel;
    this.reel = null;
    if (reelHit(marker, bandStart, band)) {
      fish.caught = true;
      this.me.hold.push(fish.kind.id);
      this.say(`${fish.kind.emoji} ${fish.kind.name}! Worth 🪙 ${fish.kind.price} at the shore.`);
      this.replaceFish(fish);
      this.broadcast(true);
    } else {
      this.say(`${fish.kind.emoji} It wriggled off the hook!`);
    }
  }

  /** Called by the page when the on-screen action button is pressed. */
  press() { if (!this.actionHeld) { this.actionHeld = true; this.action(); } }
  release() { this.actionHeld = false; }

  // ---- the sea -------------------------------------------------------------

  private spawnFish(atY?: number) {
    const y = atY ?? 40 + Math.random() * (SHORE_Y - 70);
    const kind = rollFish(depthAt(y));
    const angle = Math.random() * Math.PI * 2;
    this.fish.push({
      id: this.nextFishId += 1,
      kind,
      x: 30 + Math.random() * (SEA_W - 60),
      y,
      vx: Math.cos(angle) * kind.speed,
      vy: Math.sin(angle) * kind.speed * 0.5,
      caught: false,
    });
  }

  /** A caught fish is gone — put a fresh one somewhere else so the sea stays full. */
  private replaceFish(fish: SeaFish) {
    this.fish = this.fish.filter((f) => f !== fish);
    this.spawnFish();
  }

  private nearestFish(boat: Boat, range = CAST_RANGE): SeaFish | null {
    let best: SeaFish | null = null;
    let bestDist = range;
    for (const fish of this.fish) {
      if (fish.caught) continue;
      const d = Math.hypot(fish.x - boat.x, fish.y - boat.y);
      if (d < bestDist) { bestDist = d; best = fish; }
    }
    return best;
  }

  // ---- moving ---------------------------------------------------------------

  private steer(dt: number) {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }   // no free speed on the diagonal
    // Reeling holds the boat still — you cannot drive and land a fish at once.
    // A heavy hold slows you down, so the run home really does cost you.
    const speed = this.reel ? 0 : boatSpeed(this.me.hold.length);
    this.me.x = clamp(this.me.x + dx * speed * dt, 22, SEA_W - 22);
    this.me.y = clamp(this.me.y + dy * speed * dt, 22, SEA_H - 26);
  }

  /** The animal skippers: pick a fish, sail to it, reel it, run home when heavy. */
  private steerBot(boat: Boat, dt: number) {
    const bot = boat.bot!;
    if (boat.reelUntil && this.time < boat.reelUntil) return;   // busy landing one
    if (boat.reelUntil && this.time >= boat.reelUntil) {
      boat.reelUntil = undefined;
      const fish = this.fish.find((f) => f.id === boat.targetFish);
      if (fish && !fish.caught && Math.random() < bot.skill) {
        fish.caught = true;
        boat.hold.push(fish.kind.id);
        this.replaceFish(fish);
      }
      boat.targetFish = undefined;
      return;
    }

    const heading = shouldSailHome(boat.hold, boat.y, this.secondsLeft);
    let tx: number, ty: number;
    if (heading) { tx = boat.x; ty = SHORE_Y + 6; }
    else {
      let target = this.fish.find((f) => f.id === boat.targetFish && !f.caught);
      if (!target) {
        // Pick the most valuable fish it dares sail to, that isn't miles away.
        const reachable = this.fish.filter((f) => !f.caught && depthAt(f.y) <= bot.daring);
        target = reachable.sort((a, b) =>
          (b.kind.price - a.kind.price) - (Math.hypot(b.x - boat.x, b.y - boat.y) - Math.hypot(a.x - boat.x, a.y - boat.y)) * 0.05,
        )[0];
        boat.targetFish = target?.id;
      }
      if (!target) return;
      tx = target.x; ty = target.y;
      if (Math.hypot(tx - boat.x, ty - boat.y) < CAST_RANGE * 0.6) {
        boat.reelUntil = this.time + 0.7 + Math.random() * 0.8;   // it takes them a moment too
        return;
      }
    }
    const dx = tx - boat.x, dy = ty - boat.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = boatSpeed(boat.hold.length) * bot.speed;
    boat.x = clamp(boat.x + (dx / dist) * speed * dt, 22, SEA_W - 22);
    boat.y = clamp(boat.y + (dy / dist) * speed * dt, 22, SEA_H - 26);
  }

  /** At the shore, a full hold turns into money. */
  private sell(boat: Boat) {
    if (!boat.hold.length || !atShore(boat.y)) return;
    const value = holdValue(boat.hold);
    boat.banked += value;
    const count = boat.hold.length;
    boat.hold = [];
    if (boat.you) {
      this.say(`💰 Sold ${count} fish for 🪙 ${value}!`);
      this.broadcast(true);
    }
  }

  // ---- live rivals ----------------------------------------------------------

  /** Put the other real players' boats on the water. */
  setRivals(rivals: FishingRival[]) {
    const keep = this.boats.filter((b) => b.you || b.bot);
    this.boats = [
      ...keep,
      ...rivals.map((r) => ({
        id: r.id, name: r.name, emoji: r.emoji, x: r.x, y: r.y,
        hold: new Array(r.hold).fill('sardine'), banked: r.banked, you: false, remote: true,
      })),
    ];
  }

  private broadcast(force = false) {
    if (!this.options.onBroadcast) return;
    if (!force && this.time - this.broadcastAt < 0.12) return;
    this.broadcastAt = this.time;
    this.options.onBroadcast({ x: this.me.x, y: this.me.y, banked: this.me.banked, hold: this.me.hold.length });
  }

  private say(text: string) { this.message = text; this.messageUntil = this.time + 2.6; }

  // ---- the loop -------------------------------------------------------------

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (!this.over) {
      this.secondsLeft = Math.max(0, this.secondsLeft - dt);
      this.update(dt);
      if (this.secondsLeft <= 0) this.finish();
    }
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // The fish drift about, turning back at the edges.
    for (const fish of this.fish) {
      fish.x += fish.vx * dt;
      fish.y += fish.vy * dt;
      if (fish.x < 20 || fish.x > SEA_W - 20) fish.vx *= -1;
      // Fish stay in water deep enough for them, and out of the shore strip.
      if (fish.y < 26 || fish.y > SHORE_Y - 18 || depthAt(fish.y) < fish.kind.minDepth) fish.vy *= -1;
      fish.x = clamp(fish.x, 20, SEA_W - 20);
      fish.y = clamp(fish.y, 26, SHORE_Y - 18);
    }

    this.steer(dt);
    for (const boat of this.boats) if (boat.bot) this.steerBot(boat, dt);
    for (const boat of this.boats) if (!boat.remote) this.sell(boat);

    if (this.reel) {
      // The marker sweeps back and forth until you press.
      this.reel.marker += this.reel.dir * (dt / REEL_SWEEP) * 2;
      if (this.reel.marker >= 1) { this.reel.marker = 1; this.reel.dir = -1; }
      if (this.reel.marker <= 0) { this.reel.marker = 0; this.reel.dir = 1; }
      // Sail away from the fish and the line snaps.
      if (Math.hypot(this.reel.fish.x - this.me.x, this.reel.fish.y - this.me.y) > CAST_RANGE * 1.7) {
        this.reel = null;
        this.say('The line snapped!');
      }
    }
    this.broadcast();
  }

  private finish() {
    this.over = true;
    this.reel = null;
    const lost = this.me.hold.length;
    if (lost) this.say(`🔔 Horn! You lost ${lost} fish still in the hold.`);
    else this.say('🔔 Horn! Time is up.');
    this.options.onOver(this.me.banked);
  }

  private snapshot(): FishingSnapshot {
    const near = this.reel ? null : this.nearestFish(this.me);
    return {
      secondsLeft: Math.ceil(this.secondsLeft),
      hold: [...this.me.hold],
      holdValue: holdValue(this.me.hold),
      banked: this.me.banked,
      nearby: near ? { name: near.kind.name, emoji: near.kind.emoji, price: near.kind.price, rarity: near.kind.rarity } : null,
      reel: this.reel ? {
        marker: this.reel.marker, bandStart: this.reel.bandStart, band: this.reel.band,
        fish: this.reel.fish.kind.name, emoji: this.reel.fish.kind.emoji,
      } : null,
      message: this.time < this.messageUntil ? this.message : '',
      atShore: atShore(this.me.y),
      laden: this.me.hold.length >= HOLD_SIZE / 2,
      over: this.over,
      boats: this.boats.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, banked: b.banked, hold: b.hold.length, you: b.you })),
    };
  }

  // ---- drawing --------------------------------------------------------------

  private draw() {
    const ctx = this.ctx;
    // The sea: darker the further out you go, so depth is visible at a glance.
    const water = ctx.createLinearGradient(0, 0, 0, SHORE_Y);
    water.addColorStop(0, '#0d3b63');
    water.addColorStop(0.45, '#1d6a9c');
    water.addColorStop(1, '#5fb6d4');
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, SEA_W, SHORE_Y);

    // Gentle moving swell.
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 2;
    for (let row = 0; row < 9; row += 1) {
      const y = 40 + row * 60;
      ctx.beginPath();
      for (let x = 0; x <= SEA_W; x += 24) {
        const wobble = Math.sin((x / 90) + this.time * 1.1 + row) * 4;
        if (x === 0) ctx.moveTo(x, y + wobble); else ctx.lineTo(x, y + wobble);
      }
      ctx.stroke();
    }

    // The shore, with the market hut you sell at.
    ctx.fillStyle = '#e8d5a8';
    ctx.fillRect(0, SHORE_Y, SEA_W, SEA_H - SHORE_Y);
    ctx.fillStyle = '#f2e4c0';
    ctx.fillRect(0, SHORE_Y, SEA_W, 8);
    ctx.font = '30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🏠', SEA_W / 2 - 90, SEA_H - 18);
    ctx.fillText('💰', SEA_W / 2, SEA_H - 18);
    ctx.fillText('🏠', SEA_W / 2 + 90, SEA_H - 18);
    ctx.fillStyle = '#7a5c2e';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText('SELL YOUR FISH HERE', SEA_W / 2, SHORE_Y + 22);

    // Depth labels down the left, so "go deeper for better fish" is obvious.
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui';
    ctx.fillStyle = '#ffffff88';
    ctx.fillText('DEEP — rare fish 🐳', 12, 26);
    ctx.fillText('shallow — small fish 🐟', 12, SHORE_Y - 26);

    // Fish.
    ctx.textAlign = 'center';
    for (const fish of this.fish) {
      ctx.font = `${fish.kind.rarity === 'legendary' ? 30 : fish.kind.rarity === 'rare' ? 26 : 20}px system-ui`;
      ctx.save();
      ctx.translate(fish.x, fish.y);
      if (fish.vx < 0) ctx.scale(-1, 1);
      ctx.fillText(fish.kind.emoji, 0, 0);
      ctx.restore();
    }

    // Boats: rivals first, so yours is always drawn on top.
    for (const boat of this.boats) if (!boat.you) this.drawBoat(boat);
    this.drawBoat(this.me);

    // The line from your boat to the fish you are reeling.
    if (this.reel) {
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.me.x, this.me.y);
      ctx.lineTo(this.reel.fish.x, this.reel.fish.y);
      ctx.stroke();
    } else {
      // A ring round the fish you could cast at.
      const near = this.nearestFish(this.me);
      if (near) {
        ctx.strokeStyle = '#f6e06a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(near.x, near.y - 6, 22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawBoat(boat: Boat) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(boat.x, boat.y);
    // Hull.
    ctx.fillStyle = boat.you ? '#f2c94c' : boat.remote ? '#9fd3f0' : '#e08a5a';
    ctx.strokeStyle = '#2b241d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(24, 0);
    ctx.lineTo(16, 14);
    ctx.lineTo(-16, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Whoever is skipping it.
    const sprite = boat.bot ? this.sprites.get(boat.bot.id) : null;
    if (sprite?.complete && sprite.naturalWidth) ctx.drawImage(sprite, -16, -34, 32, 32);
    else { ctx.font = '24px system-ui'; ctx.textAlign = 'center'; ctx.fillText(boat.emoji, 0, -8); }
    // Name and what they are carrying.
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00000066';
    ctx.fillRect(-34, 16, 68, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${boat.you ? 'You' : boat.name.split(' ')[0]} 🐟${boat.hold.length}`, 0, 27);
    ctx.restore();
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
