/**
 * Fishing Frenzy — a little 3-D pixel ocean.
 *
 * You skipper a blocky boat out from the dock. **Space drops your rod in.** Then
 * you watch the float, and **press again the moment a fish bites** — quickly,
 * because the good ones give you barely half a second. Every catch goes into
 * your own boat, and the race is to land more than everyone else before the
 * horn, then run them back to the dock to sell.
 *
 * On a tablet it is the same two beats with taps instead of the space bar: tap
 * to cast, tap again to strike.
 *
 * Everything is built from boxes in flat colours to match the rest of the
 * island, and rival boats — animal skippers or real players — are fed in from
 * outside, so one engine runs every mode.
 */
import * as THREE from 'three';
import {
  CAST_PATIENCE, CAST_RANGE, HOLD_SIZE, ROUND_SECONDS, SEA_D, SEA_W, SHORE_Z, TURN_SPEED,
  atShore, biteDelay, boatSpeed, catchWindow, depthAt, holdValue, rollFish, shouldSailHome, struckInTime,
  type FishKind, type FishingBot,
} from './fishing';

/** A fish swimming about under the surface. */
interface SeaFish { id: number; kind: FishKind; group: THREE.Group; x: number; z: number; dir: number; bob: number }

/** Any boat on the water: yours, a bot's, or another player's. */
interface Boat {
  id: string;
  name: string;
  emoji: string;
  group: THREE.Group;
  x: number; z: number; yaw: number;
  hold: string[];
  banked: number;
  you: boolean;
  bot?: FishingBot;
  /** What a bot is up to: which fish it is after, and when its line will land it. */
  targetFish?: number;
  castUntil?: number;
  remote?: boolean;
}

/** What the rod is doing: nothing, waiting for a bite, or a fish is on RIGHT NOW. */
export type RodState = 'in' | 'waiting' | 'biting';

export interface FishingSnapshot {
  secondsLeft: number;
  hold: string[];
  holdValue: number;
  banked: number;
  rod: RodState;
  /** While a fish is on: how much of your striking time is left, 1 → 0. */
  biteLeft: number;
  /** The fish that is biting — only once it has bitten, so there is no peeking. */
  biting: { name: string; emoji: string; price: number; rarity: string } | null;
  /** True when there is a fish near enough to be worth casting at. */
  fishNear: boolean;
  message: string;
  atShore: boolean;
  laden: boolean;
  over: boolean;
  boats: Array<{ id: string; name: string; emoji: string; banked: number; hold: number; you: boolean }>;
}

export interface FishingRival { id: string; name: string; emoji: string; x: number; z: number; yaw: number; banked: number; hold: number }

interface EngineOptions {
  myName: string;
  myEmoji: string;
  bots: FishingBot[];
  onUpdate: (snapshot: FishingSnapshot) => void;
  onBroadcast?: (state: { x: number; z: number; yaw: number; banked: number; hold: number }) => void;
  onOver: (banked: number) => void;
}

const FISH_COUNT = 30;
const lam = (color: string) => new THREE.MeshLambertMaterial({ color });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class FishingEngine {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private options: EngineOptions;

  private fish: SeaFish[] = [];
  private boats: Boat[] = [];
  private me: Boat;
  private nextFishId = 1;
  private swell = new THREE.Group();

  /** Your rod: what it is doing, and the float sitting on the water. */
  private rod: RodState = 'in';
  private line: THREE.Line | null = null;
  private float: THREE.Mesh;
  private castAt = 0;
  private biteAt = 0;
  private hooked: SeaFish | null = null;

  private keys = new Set<string>();
  private actionHeld = false;
  private running = true;
  private last = 0;
  private time = 0;
  private secondsLeft = ROUND_SECONDS;
  private message = '';
  private messageUntil = 0;
  private over = false;
  private broadcastAt = 0;

  constructor(mount: HTMLElement, options: EngineOptions) {
    this.options = options;
    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 560;

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // chunky on purpose
    this.renderer.setSize(width, height);
    mount.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 600);
    this.scene.background = new THREE.Color('#8fd6ff');
    this.scene.fog = new THREE.Fog('#8fd6ff', 70, 220);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.9));
    const sun = new THREE.DirectionalLight('#fff3d0', 0.7);
    sun.position.set(40, 70, 20);
    this.scene.add(sun);

    this.buildSea();
    this.buildShore();

    this.me = this.addBoat({ id: 'me', name: options.myName || 'You', emoji: options.myEmoji || '🚤', you: true, x: 0, z: SHORE_Z + 5 });
    options.bots.forEach((bot, i) => this.addBoat({
      id: `bot-${bot.id}`, name: bot.name, emoji: bot.emoji, you: false, bot,
      x: (i + 1) * 7 * (i % 2 ? -1 : 1), z: SHORE_Z + 5,
    }));

    this.float = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lam('#e0685f'));
    this.float.visible = false;
    this.scene.add(this.float);

    for (let i = 0; i < FISH_COUNT; i += 1) this.spawnFish();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('pointerdown', this.onTap);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ---- the world -----------------------------------------------------------

  private buildSea() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SEA_W * 2.4, SEA_D * 2.4), lam('#1d7fb8'));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.4, SEA_D / 2);
    this.scene.add(water);

    // A grid of chunky tiles over the water: it reads as blocky pixel swell and
    // makes the deep water visibly darker, so "sail further out" is obvious.
    const tileGeo = new THREE.BoxGeometry(13, 0.5, 13);
    const shallow = lam('#3ba0d0');
    const mid = lam('#1d7fb8');
    const deep = lam('#0f5583');
    for (let x = -SEA_W / 2; x < SEA_W / 2; x += 14) {
      for (let z = 0; z < SEA_D; z += 14) {
        const depth = depthAt(z + 7);
        const tile = new THREE.Mesh(tileGeo, depth > 0.66 ? deep : depth > 0.33 ? mid : shallow);
        tile.position.set(x + 7, -0.25, z + 7);
        this.swell.add(tile);
      }
    }
    this.scene.add(this.swell);
  }

  private buildShore() {
    const sand = new THREE.Mesh(new THREE.BoxGeometry(SEA_W, 1.4, 30), lam('#e8d5a8'));
    sand.position.set(0, 0.2, -12);
    this.scene.add(sand);

    const dock = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 14), lam('#b0763f'));
    dock.position.set(0, 0.55, 3);
    this.scene.add(dock);
    for (const x of [-6, 0, 6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7), lam('#8a5a2f'));
      post.position.set(x, 0.2, 9.5);
      this.scene.add(post);
    }

    for (const [x, colour, roof] of [[-13, '#e0b18a', '#a8503f'], [13, '#cfe0f0', '#3f6ba8']] as const) {
      const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 7), lam(colour));
      hut.position.set(x, 3.4, -10);
      this.scene.add(hut);
      const top = new THREE.Mesh(new THREE.ConeGeometry(7, 3.4, 4), lam(roof));
      top.position.set(x, 7.8, -10);
      top.rotation.y = Math.PI / 4;
      this.scene.add(top);
    }
    // A bright sign, so a new player can see where the fish get sold.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(11, 2.6, 0.4), lam('#f2c94c'));
    sign.position.set(0, 3.4, -2);
    this.scene.add(sign);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 12), lam('#e0a13a'));
    coin.position.set(0, 6, -2);
    coin.rotation.x = Math.PI / 2;
    this.scene.add(coin);
  }

  /** A blocky pixel fish, coloured by how rare it is. */
  private buildFish(kind: FishKind): THREE.Group {
    const group = new THREE.Group();
    const size = { common: 0.85, good: 1.15, rare: 1.5, legendary: 2.1 }[kind.rarity];
    const colour = { common: '#7ec8e8', good: '#5fd08a', rare: '#c07ae0', legendary: '#f2b03a' }[kind.rarity];
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.7, size * 1.7), lam(colour));
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(size * 0.22, size * 0.8, size * 0.6), lam(colour));
    tail.position.z = -size * 1.1;
    group.add(tail);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(size * 0.82, size * 0.26, size * 1.3), lam('#f6fbff'));
    belly.position.y = -size * 0.28;
    group.add(belly);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(size * 0.17, size * 0.17, size * 0.17), lam('#20202a'));
      eye.position.set(side * size * 0.42, size * 0.17, size * 0.68);
      group.add(eye);
    }
    return group;
  }

  private spawnFish() {
    const z = 8 + Math.random() * (SEA_D - 16);
    const kind = rollFish(depthAt(z));
    const group = this.buildFish(kind);
    const x = (Math.random() - 0.5) * (SEA_W - 14);
    group.position.set(x, -1.4, z);
    this.scene.add(group);
    this.fish.push({ id: (this.nextFishId += 1), kind, group, x, z, dir: Math.random() * Math.PI * 2, bob: Math.random() * 6 });
  }

  private removeFish(fish: SeaFish) {
    this.scene.remove(fish.group);
    fish.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
    this.fish = this.fish.filter((f) => f !== fish);
    this.spawnFish();
  }

  /** A blocky boat, with a little skipper standing up in it. */
  private addBoat(spec: { id: string; name: string; emoji: string; you: boolean; bot?: FishingBot; x: number; z: number; remote?: boolean }): Boat {
    const group = new THREE.Group();
    const hullColour = spec.you ? '#f2c94c' : spec.remote ? '#9fd3f0' : '#e08a5a';
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.6), lam(hullColour));
    hull.position.y = 0.35;
    group.add(hull);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 4.9), lam('#8a5a2f'));
    rim.position.y = 0.85;
    group.add(rim);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 0.24), lam('#8a5a2f'));
    mast.position.set(0, 2.6, -0.4);
    group.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 2), lam(spec.you ? '#fff6e0' : '#ffe6cf'));
    sail.position.set(0, 3, -1.1);
    group.add(sail);
    const skipper = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 0.75), lam('#f0b98a'));
    skipper.position.set(0, 1.45, 0.8);
    group.add(skipper);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.24, 1.05), lam(spec.you ? '#c2452f' : '#4a7fb5'));
    hat.position.set(0, 2.05, 0.8);
    group.add(hat);
    // The rod, pointing out over the bow.
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.6), lam('#6b4a2a'));
    rod.position.set(0.5, 1.8, 1.8);
    rod.rotation.x = -0.35;
    group.add(rod);

    group.position.set(spec.x, 0, spec.z);
    this.scene.add(group);
    const boat: Boat = {
      id: spec.id, name: spec.name, emoji: spec.emoji, group,
      x: spec.x, z: spec.z, yaw: 0, hold: [], banked: 0, you: spec.you, bot: spec.bot, remote: spec.remote,
    };
    this.boats.push(boat);
    return boat;
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
  /** A tap on the sea is the same as pressing space — cast, then strike. */
  private onTap = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.action();
  };

  /** Drop the rod in, or strike at whatever just bit. */
  private action() {
    if (this.over) return;
    if (this.rod === 'biting') { this.strike(); return; }
    if (this.rod === 'waiting') { this.reelIn('You pulled the line back in.'); return; }
    if (this.me.hold.length >= HOLD_SIZE) { this.say('Your boat is full — sail back and sell!'); return; }
    this.cast();
  }

  /** Called by the page for the on-screen action button. */
  press() { if (!this.actionHeld) { this.actionHeld = true; this.action(); } }
  release() { this.actionHeld = false; }

  private cast() {
    const fish = this.nearestFish();
    this.rod = 'waiting';
    this.castAt = this.time;
    this.hooked = fish;
    this.biteAt = fish ? this.time + biteDelay(fish.kind) : Infinity;
    this.float.visible = true;
    this.showLine(true);
    this.say(fish ? '🎣 Line in! Watch the float…' : '🎣 Nothing about here — sail somewhere fishier.');
  }

  private strike() {
    const fish = this.hooked;
    this.rod = 'in';
    this.hooked = null;
    this.float.visible = false;
    this.showLine(false);
    if (!fish) return;
    if (struckInTime(fish.kind, this.time - this.biteAt)) {
      this.me.hold.push(fish.kind.id);
      this.say(`${fish.kind.emoji} ${fish.kind.name}! Worth 🪙 ${fish.kind.price} at the dock.`);
      this.removeFish(fish);
      this.broadcast(true);
    } else {
      this.say(`${fish.kind.emoji} Too slow — it wriggled off!`);
    }
  }

  private reelIn(why: string) {
    this.rod = 'in';
    this.hooked = null;
    this.float.visible = false;
    this.showLine(false);
    if (why) this.say(why);
  }

  private showLine(on: boolean) {
    if (this.line) { this.scene.remove(this.line); this.line.geometry.dispose(); this.line = null; }
    if (!on) return;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.scene.add(this.line);
  }

  private nearestFish(): SeaFish | null {
    let best: SeaFish | null = null;
    let bestDist = CAST_RANGE;
    for (const fish of this.fish) {
      const d = Math.hypot(fish.x - this.me.x, fish.z - this.me.z);
      if (d < bestDist) { bestDist = d; best = fish; }
    }
    return best;
  }

  /** Where the float lands: just off the bow. */
  private floatSpot() {
    return { x: this.me.x - Math.sin(this.me.yaw) * 3.6, z: this.me.z + Math.cos(this.me.yaw) * 3.6 };
  }

  // ---- sailing --------------------------------------------------------------

  private steer(dt: number) {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS');
    if (left) this.me.yaw += TURN_SPEED * dt;
    if (right) this.me.yaw -= TURN_SPEED * dt;

    const drive = (up ? 1 : 0) - (down ? 0.6 : 0);
    if (drive === 0) return;
    // Sailing off with the line out drags it away, so the rod comes back in.
    if (this.rod !== 'in') this.reelIn('You sailed off and lost the line.');
    const speed = boatSpeed(this.me.hold.length) * drive;
    this.me.x = clamp(this.me.x - Math.sin(this.me.yaw) * speed * dt, -SEA_W / 2 + 5, SEA_W / 2 - 5);
    this.me.z = clamp(this.me.z + Math.cos(this.me.yaw) * speed * dt, 2, SEA_D - 5);
  }

  /** The animal skippers: sail to a fish, cast, land it, run home when heavy. */
  private steerBot(boat: Boat, dt: number) {
    const bot = boat.bot!;
    if (boat.castUntil && this.time < boat.castUntil) return;
    if (boat.castUntil) {
      boat.castUntil = undefined;
      const fish = this.fish.find((f) => f.id === boat.targetFish);
      if (fish && Math.random() < bot.skill) { boat.hold.push(fish.kind.id); this.removeFish(fish); }
      boat.targetFish = undefined;
      return;
    }

    const heading = shouldSailHome(boat.hold, boat.z, this.secondsLeft);
    let tx: number, tz: number;
    if (heading) { tx = 0; tz = SHORE_Z - 3; }
    else {
      let target = this.fish.find((f) => f.id === boat.targetFish);
      if (!target) {
        const reachable = this.fish.filter((f) => depthAt(f.z) <= bot.daring);
        target = reachable.sort((a, b) =>
          (b.kind.price - a.kind.price) - (Math.hypot(b.x - boat.x, b.z - boat.z) - Math.hypot(a.x - boat.x, a.z - boat.z)) * 0.4)[0];
        boat.targetFish = target?.id;
      }
      if (!target) return;
      tx = target.x; tz = target.z;
      if (Math.hypot(tx - boat.x, tz - boat.z) < CAST_RANGE * 0.8) {
        // They wait for a bite too, so a bot is never instant.
        boat.castUntil = this.time + biteDelay(target.kind) + catchWindow(target.kind) * 0.6;
        return;
      }
    }
    const dx = tx - boat.x, dz = tz - boat.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = boatSpeed(boat.hold.length) * bot.speed;
    boat.x = clamp(boat.x + (dx / dist) * speed * dt, -SEA_W / 2 + 5, SEA_W / 2 - 5);
    boat.z = clamp(boat.z + (dz / dist) * speed * dt, 2, SEA_D - 5);
    boat.yaw = Math.atan2(-dx, dz);
  }

  private sell(boat: Boat) {
    if (!boat.hold.length || !atShore(boat.z)) return;
    const value = holdValue(boat.hold);
    boat.banked += value;
    const count = boat.hold.length;
    boat.hold = [];
    if (boat.you) { this.say(`💰 Sold ${count} fish for 🪙 ${value}!`); this.broadcast(true); }
  }

  // ---- live rivals ----------------------------------------------------------

  setRivals(rivals: FishingRival[]) {
    for (const boat of this.boats) {
      if (boat.remote && !rivals.some((r) => r.id === boat.id)) this.scene.remove(boat.group);
    }
    this.boats = this.boats.filter((b) => !b.remote || rivals.some((r) => r.id === b.id));
    for (const rival of rivals) {
      let boat = this.boats.find((b) => b.id === rival.id);
      if (!boat) boat = this.addBoat({ id: rival.id, name: rival.name, emoji: rival.emoji, you: false, remote: true, x: rival.x, z: rival.z });
      boat.x = rival.x; boat.z = rival.z; boat.yaw = rival.yaw;
      boat.banked = rival.banked;
      boat.hold = new Array(rival.hold).fill('sardine');
      boat.name = rival.name;
    }
  }

  private broadcast(force = false) {
    if (!this.options.onBroadcast) return;
    if (!force && this.time - this.broadcastAt < 0.12) return;
    this.broadcastAt = this.time;
    this.options.onBroadcast({ x: this.me.x, z: this.me.z, yaw: this.me.yaw, banked: this.me.banked, hold: this.me.hold.length });
  }

  private say(text: string) { this.message = text; this.messageUntil = this.time + 2.4; }

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
    this.render();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    for (const fish of this.fish) {
      if (fish === this.hooked && this.rod !== 'in') continue;   // a hooked fish is being drawn in
      fish.x += Math.sin(fish.dir) * fish.kind.speed * 0.06 * dt * 10;
      fish.z += Math.cos(fish.dir) * fish.kind.speed * 0.06 * dt * 10;
      if (Math.abs(fish.x) > SEA_W / 2 - 7 || fish.z < 5 || fish.z > SEA_D - 5 || depthAt(fish.z) < fish.kind.minDepth) fish.dir += Math.PI;
      fish.x = clamp(fish.x, -SEA_W / 2 + 6, SEA_W / 2 - 6);
      fish.z = clamp(fish.z, 5, SEA_D - 5);
    }

    this.steer(dt);
    for (const boat of this.boats) if (boat.bot) this.steerBot(boat, dt);
    for (const boat of this.boats) if (!boat.remote) this.sell(boat);

    // The rod: wait for the bite, then you have a moment to strike.
    if (this.rod === 'waiting' && this.hooked && this.time >= this.biteAt) this.rod = 'biting';
    if (this.rod === 'biting' && this.hooked && this.time - this.biteAt > catchWindow(this.hooked.kind)) {
      this.reelIn(`${this.hooked.kind.emoji} Too slow — it got away!`);
    }
    if (this.rod === 'waiting' && this.time - this.castAt > CAST_PATIENCE) this.reelIn('Nothing biting — try somewhere else.');

    // The hooked fish swims up toward the float, so you can see it coming.
    if (this.hooked && this.rod !== 'in') {
      const spot = this.floatSpot();
      this.hooked.x += (spot.x - this.hooked.x) * Math.min(1, dt * 1.5);
      this.hooked.z += (spot.z - this.hooked.z) * Math.min(1, dt * 1.5);
    }

    for (const fish of this.fish) {
      fish.bob += dt;
      fish.group.position.set(fish.x, -1.4 + Math.sin(fish.bob * 2) * 0.25, fish.z);
      fish.group.rotation.y = fish.dir;
    }
    for (const boat of this.boats) {
      boat.group.position.set(boat.x, Math.sin(this.time * 1.6 + boat.x) * 0.16, boat.z);
      boat.group.rotation.y = boat.yaw;
      boat.group.rotation.z = Math.sin(this.time * 1.2 + boat.z) * 0.035;
    }
    this.swell.position.y = Math.sin(this.time * 1.4) * 0.12;

    // The float bobs gently, then dips hard the moment a fish is on it.
    if (this.rod !== 'in') {
      const spot = this.floatSpot();
      const dip = this.rod === 'biting' ? -Math.abs(Math.sin(this.time * 18)) * 0.6 : Math.sin(this.time * 2.4) * 0.12;
      this.float.position.set(spot.x, 0.3 + dip, spot.z);
      (this.float.material as THREE.MeshLambertMaterial).color.set(this.rod === 'biting' ? '#f2c94c' : '#e0685f');
      this.line?.geometry.setFromPoints([new THREE.Vector3(this.me.x, 2.4, this.me.z), this.float.position.clone()]);
    }
    this.broadcast();
  }

  private finish() {
    this.over = true;
    this.reelIn('');
    const lost = this.me.hold.length;
    this.say(lost ? `🔔 Horn! You lost ${lost} fish still on the boat.` : '🔔 Horn! Time is up.');
    this.options.onOver(this.me.banked);
  }

  private render() {
    // Chase camera: behind and above your boat, looking the way it points.
    const back = 12, up = 7;
    const want = new THREE.Vector3(this.me.x + Math.sin(this.me.yaw) * back, up, this.me.z - Math.cos(this.me.yaw) * back);
    this.camera.position.lerp(want, 0.12);
    this.camera.lookAt(this.me.x - Math.sin(this.me.yaw) * 7, 0.5, this.me.z + Math.cos(this.me.yaw) * 7);
    this.renderer.render(this.scene, this.camera);
  }

  private snapshot(): FishingSnapshot {
    const biting = this.rod === 'biting' && this.hooked ? this.hooked.kind : null;
    return {
      secondsLeft: Math.ceil(this.secondsLeft),
      hold: [...this.me.hold],
      holdValue: holdValue(this.me.hold),
      banked: this.me.banked,
      rod: this.rod,
      biteLeft: biting ? Math.max(0, 1 - (this.time - this.biteAt) / catchWindow(biting)) : 0,
      biting: biting ? { name: biting.name, emoji: biting.emoji, price: biting.price, rarity: biting.rarity } : null,
      fishNear: !!this.nearestFish(),
      message: this.time < this.messageUntil ? this.message : '',
      atShore: atShore(this.me.z),
      laden: this.me.hold.length >= HOLD_SIZE / 2,
      over: this.over,
      boats: this.boats.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, banked: b.banked, hold: b.hold.length, you: b.you })),
    };
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.onTap);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose()); else mat?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
