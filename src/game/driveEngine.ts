import * as THREE from 'three';
import {
  GROUND_BASE, HAMMER_HEAD, HAMMER_KNOCK, HAMMER_SWING, TILT_DAMP, TILT_GAIN,
  coinsFor, inGap, isMoving, onSpikes, seesawTilt, trackY, truckById,
  type DriveLevel, type Feature, type TruckColour,
} from './drive';

const VIEW_W = 960;
const VIEW_H = 420;

// Physics tuned for a chunky, forgiving toy truck rather than a real vehicle.
// It runs on a flat 2D plane — the same trick Drive Mad uses — and the 3D scene
// below is only a view onto it, so none of these numbers change.
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

// ---- 3D scene -------------------------------------------------------------

/** Physics is in pixels; the scene is in metres. One metre is 32 pixels. */
const S = 1 / 32;
/** Physics y grows downwards, three.js y grows upwards. */
const up = (y: number) => -y * S;

const ROAD_HALF = 3.2;
/** How often the track is sampled. Reading trackY means the road you see and
 *  the road you drive on can never drift apart. */
const COLUMN = 4;
const FLOOR_DEPTH = 420;
const TRUCK_D = 1.5;
/** The tallest step the truck can drive up onto a lift. */
const PLATFORM_STEP = 30;
const BANK_IN = 4.2;
const BANK_OUT = 12;

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
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private options: EngineOptions;
  private level: DriveLevel;
  private colour: TruckColour;

  private truck = new THREE.Group();
  private wheelMeshes: THREE.Object3D[] = [];
  private seesaws: Array<{ feature: Extract<Feature, { kind: 'seesaw' }>; angle: number; spin: number; mesh: THREE.Object3D }> = [];
  private platforms: Array<{ feature: Extract<Feature, { kind: 'platform' }>; y: number; mesh: THREE.Object3D }> = [];
  private hammers: Array<{ feature: Extract<Feature, { kind: 'hammer' }>; angle: number; pivotY: number; nextHit: number; mesh: THREE.Object3D }> = [];
  private coinMeshes: THREE.Mesh[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

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
  private time = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.options = options;
    this.level = options.level;
    this.colour = truckById(options.truck) ?? { id: 'blue', name: 'Blue', body: '#a7cde4', dark: '#7fa9c6', trim: '#dceff9' };
    this.coins = coinsFor(options.level);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // `false` keeps three.js from overwriting the canvas's CSS size.
    this.renderer.setSize(VIEW_W, VIEW_H, false);

    const sky = new THREE.Color(this.level.sky);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 34, 96);

    this.camera = new THREE.PerspectiveCamera(45, VIEW_W / VIEW_H, 0.1, 200);
    this.camera.position.set(this.x * S, up(this.y) + 2, 13);

    const ambient = new THREE.HemisphereLight('#ffffff', this.level.groundDark, 2.1);
    const sun = new THREE.DirectionalLight('#fff6e0', 1.5);
    sun.position.set(-18, 34, 26);
    this.scene.add(ambient, sun);

    this.buildTrack();
    this.buildContraptions();
    this.buildBanks();
    this.buildSpikes();
    this.buildFinish();
    this.buildCoins();
    this.buildTruck();

    this.bind();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private track(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.disposables.push(geometry, material);
  }

  /**
   * The road, as one continuous ribbon following trackY, with side walls.
   *
   * Built from stacked blocks instead, every slope becomes a visible staircase
   * of step faces — a ramp has to actually be a slope.
   */
  private buildTrack() {
    // Contiguous stretches of track. A gap ends one and starts the next.
    const runs: Array<Array<{ x: number; top: number }>> = [];
    let run: Array<{ x: number; top: number }> = [];
    for (let x = -90; x < this.level.length + 260; x += COLUMN) {
      const mid = x + COLUMN / 2;
      if (inGap(mid, this.level)) { if (run.length) { runs.push(run); run = []; } continue; }
      run.push({ x: mid, top: trackY(mid, this.level) });
    }
    if (run.length) runs.push(run);

    type Point = [number, number, number];
    const quad = (out: number[], a: Point, b: Point, c: Point, d: Point) => {
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    };

    const tops: number[] = [];
    const sides: number[] = [];
    const floor = up(GROUND_BASE + FLOOR_DEPTH);
    const H = ROAD_HALF;

    runs.forEach((slices) => {
      for (let i = 0; i < slices.length - 1; i += 1) {
        const x1 = slices[i].x * S;
        const y1 = up(slices[i].top);
        const x2 = slices[i + 1].x * S;
        const y2 = up(slices[i + 1].top);
        quad(tops, [x1, y1, -H], [x1, y1, H], [x2, y2, H], [x2, y2, -H]);
        quad(sides, [x1, y1, H], [x1, floor, H], [x2, floor, H], [x2, y2, H]);
        quad(sides, [x2, y2, -H], [x2, floor, -H], [x1, floor, -H], [x1, y1, -H]);
      }
      // Cap both ends, so a gap reads as a hole with walls rather than a void.
      const first = slices[0];
      const last = slices[slices.length - 1];
      const fx = first.x * S;
      const fy = up(first.top);
      quad(sides, [fx, fy, -H], [fx, floor, -H], [fx, floor, H], [fx, fy, H]);
      const lx = last.x * S;
      const ly = up(last.top);
      quad(sides, [lx, ly, H], [lx, floor, H], [lx, floor, -H], [lx, ly, -H]);
    });

    const surface = new THREE.MeshLambertMaterial({ color: this.level.groundDark });
    const under = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.level.groundDark).multiplyScalar(0.58) });
    this.disposables.push(surface, under);

    [[tops, surface], [sides, under]].forEach(([data, material]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data as number[], 3));
      // Unindexed triangles, so this gives each face its own flat normal.
      geometry.computeVertexNormals();
      this.disposables.push(geometry);
      this.scene.add(new THREE.Mesh(geometry, material as THREE.Material));
    });
  }

  /** Seesaws, lifts and hammers: the parts of the course that move. */
  private buildContraptions() {
    const plankMat = new THREE.MeshLambertMaterial({ color: '#a9773f' });
    const metalMat = new THREE.MeshLambertMaterial({ color: '#6f6b74' });
    const headMat = new THREE.MeshLambertMaterial({ color: '#b5443a' });
    this.disposables.push(plankMat, metalMat, headMat);

    this.level.features.forEach((feature) => {
      if (!isMoving(feature)) return;

      if (feature.kind === 'seesaw') {
        const plankGeo = new THREE.BoxGeometry(feature.width * S, 7 * S, ROAD_HALF * 2);
        const postGeo = new THREE.BoxGeometry(14 * S, feature.height * S, 0.5);
        this.disposables.push(plankGeo, postGeo);
        const pivotX = feature.x + feature.width / 2;
        // The plank hangs off a group centred on the pivot, so rotating the
        // group is the same as the plank tipping about its post.
        const group = new THREE.Group();
        group.position.set(pivotX * S, up(GROUND_BASE - feature.height), 0);
        group.add(new THREE.Mesh(plankGeo, plankMat));
        const post = new THREE.Mesh(postGeo, metalMat);
        post.position.set(pivotX * S, up(GROUND_BASE - feature.height / 2), 0);
        this.scene.add(group, post);
        // Rests tipped towards the truck, so there is a low end to drive up.
        this.seesaws.push({ feature, angle: -seesawTilt(feature), spin: 0, mesh: group });
      }

      if (feature.kind === 'platform') {
        const geo = new THREE.BoxGeometry(feature.width * S, 10 * S, ROAD_HALF * 2);
        this.disposables.push(geo);
        const mesh = new THREE.Mesh(geo, metalMat);
        this.scene.add(mesh);
        this.platforms.push({ feature, y: GROUND_BASE - feature.height, mesh });
      }

      if (feature.kind === 'hammer') {
        const armGeo = new THREE.BoxGeometry(6 * S, feature.length * S, 6 * S);
        const headGeo = new THREE.BoxGeometry(HAMMER_HEAD * 2 * S, HAMMER_HEAD * 1.5 * S, ROAD_HALF * 1.5);
        this.disposables.push(armGeo, headGeo);
        const pivotY = GROUND_BASE - feature.length - 46;
        const group = new THREE.Group();
        group.position.set(feature.x * S, up(pivotY), 0);
        const arm = new THREE.Mesh(armGeo, metalMat);
        // Hang the arm and head below the pivot the group turns about.
        arm.position.y = -feature.length * S / 2;
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = -feature.length * S;
        group.add(arm, head);
        this.scene.add(group);
        this.hammers.push({ feature, angle: 0, pivotY, nextHit: 0, mesh: group });
      }
    });
  }

  /** The surface of a seesaw at x, or null when x is off the end of the plank. */
  private seesawSurface(seesaw: { feature: Extract<Feature, { kind: 'seesaw' }>; angle: number }, x: number) {
    const { feature, angle } = seesaw;
    const pivotX = feature.x + feature.width / 2;
    const half = (feature.width / 2) * Math.cos(angle);
    if (x < pivotX - half || x > pivotX + half) return null;
    return (GROUND_BASE - feature.height) + (x - pivotX) * Math.tan(angle);
  }

  /**
   * The top of a lift at x, or null when the truck is not above it.
   *
   * One-way on purpose: a solid platform hovering over the ground would put an
   * invisible vertical wall across the track, and the truck simply hits it.
   */
  private platformSurface(platform: { feature: Extract<Feature, { kind: 'platform' }>; y: number }, x: number) {
    const { feature } = platform;
    if (x < feature.x || x > feature.x + feature.width) return null;
    const wheelBottom = this.y + WHEEL_R + 17;
    if (wheelBottom > platform.y + PLATFORM_STEP) return null;
    return platform.y;
  }

  private stepContraptions(dt: number) {
    this.seesaws.forEach((seesaw) => {
      const limit = seesawTilt(seesaw.feature);
      const pivotX = seesaw.feature.x + seesaw.feature.width / 2;
      const half = seesaw.feature.width / 2;
      const surface = this.seesawSurface(seesaw, this.x);
      // "Loaded" means the truck is actually resting on the plank.
      const loaded = surface !== null && Math.abs(this.y + 21 - surface) < 26;
      if (loaded) {
        // Weight past the pivot tips it — that is the whole trick of a seesaw.
        seesaw.spin += ((this.x - pivotX) / half) * TILT_GAIN * dt;
      } else {
        seesaw.spin += Math.sign(seesaw.angle || -1) * TILT_GAIN * 0.35 * dt;
      }
      seesaw.spin *= Math.pow(TILT_DAMP, dt);
      seesaw.angle += seesaw.spin * dt;
      if (seesaw.angle > limit) { seesaw.angle = limit; seesaw.spin = 0; }
      if (seesaw.angle < -limit) { seesaw.angle = -limit; seesaw.spin = 0; }
    });

    this.platforms.forEach((platform) => {
      const { feature } = platform;
      const t = (Math.cos((this.time / feature.period) * Math.PI * 2) * 0.5 + 0.5);
      platform.y = GROUND_BASE - feature.height - feature.rise * (1 - t);
    });

    this.hammers.forEach((hammer) => {
      hammer.angle = HAMMER_SWING * Math.sin((this.time / hammer.feature.period) * Math.PI * 2 + hammer.feature.phase);
    });
  }

  /** A hammer head that reaches the truck knocks it flying. */
  private hammerHits() {
    this.hammers.forEach((hammer) => {
      if (this.time < hammer.nextHit) return;
      const headX = hammer.feature.x + Math.sin(hammer.angle) * hammer.feature.length;
      const headY = hammer.pivotY + Math.cos(hammer.angle) * hammer.feature.length;
      const dx = this.x - headX;
      const dy = this.y - headY;
      const distance = Math.hypot(dx, dy);
      if (distance > HAMMER_HEAD + 32) return;
      hammer.nextHit = this.time + 0.6;
      const nx = dx / (distance || 1);
      const ny = dy / (distance || 1);
      this.vx += nx * HAMMER_KNOCK;
      this.vy += ny * HAMMER_KNOCK - 140;
      // Spin the truck the way the head was travelling.
      this.spin += Math.cos(hammer.angle) * (nx > 0 ? 5 : -5);
    });
  }

  /** Grassy banks either side, with trees, so the road runs through somewhere. */
  private buildBanks() {
    const width = BANK_OUT - BANK_IN;
    const length = this.level.length + 400;
    const geometry = new THREE.BoxGeometry(length * S, 6, width);
    const material = new THREE.MeshLambertMaterial({ color: this.level.ground });
    this.track(geometry, material);
    [-1, 1].forEach((side) => {
      const bank = new THREE.Mesh(geometry, material);
      bank.position.set((this.level.length / 2 - 90) * S, up(GROUND_BASE) - 3, side * (BANK_IN + width / 2));
      this.scene.add(bank);
    });

    const trunkGeo = new THREE.BoxGeometry(0.34, 1.5, 0.34);
    const leafGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#5f4026' });
    const leafMat = new THREE.MeshLambertMaterial({ color: this.level.groundDark });
    this.track(trunkGeo, trunkMat);
    this.disposables.push(leafGeo, leafMat);
    // Far bank only. The camera sits out past the near bank, so a tree on this
    // side of the road would stand directly between it and the truck.
    for (let x = -60; x < this.level.length + 200; x += 95) {
      // Two staggered rows, so the backdrop has some depth to it.
      const row = (x / 95) % 2 === 0 ? 0 : 1;
      const z = -(BANK_IN + 1.8 + row * 3.4 + ((x * 7) % 24) / 10);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x * S, up(GROUND_BASE) + 0.75, z);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x * S, up(GROUND_BASE) + 2.2, z);
      this.scene.add(trunk, leaves);
    }
  }

  private buildSpikes() {
    const geometry = new THREE.ConeGeometry(0.13, 0.42, 5);
    const material = new THREE.MeshLambertMaterial({ color: '#6d6a72' });
    this.track(geometry, material);
    this.level.features.forEach((feature) => {
      if (feature.kind !== 'spikes') return;
      for (let sx = feature.x; sx < feature.x + feature.width; sx += 9) {
        const top = trackY(sx + 4.5, this.level);
        for (let z = -2.4; z <= 2.4; z += 1.2) {
          const spike = new THREE.Mesh(geometry, material);
          spike.position.set((sx + 4.5) * S, up(top) + 0.21, z);
          this.scene.add(spike);
        }
      }
    });
  }

  private buildFinish() {
    const top = trackY(this.level.length, this.level);
    const poleGeo = new THREE.BoxGeometry(0.12, 3.2, 0.12);
    const poleMat = new THREE.MeshLambertMaterial({ color: '#4a3a2a' });
    const flagGeo = new THREE.BoxGeometry(1.5, 0.9, 0.06);
    const flagMat = new THREE.MeshLambertMaterial({ color: '#e8503a' });
    this.track(poleGeo, poleMat);
    this.disposables.push(flagGeo, flagMat);
    [-2.6, 2.6].forEach((z) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(this.level.length * S, up(top) + 1.6, z);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(this.level.length * S + 0.8, up(top) + 2.8, z);
      this.scene.add(pole, flag);
    });
  }

  private buildCoins() {
    const geometry = new THREE.CylinderGeometry(11 * S, 11 * S, 0.1, 18);
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: '#f2c94c', emissive: '#5a4300' });
    this.track(geometry, material);
    this.coins.forEach((coin) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(coin.x * S, up(coin.y), 0);
      this.coinMeshes.push(mesh);
      this.scene.add(mesh);
    });
  }

  private buildTruck() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.colour.body });
    const darkMat = new THREE.MeshLambertMaterial({ color: this.colour.dark });
    const trimMat = new THREE.MeshLambertMaterial({ color: this.colour.trim });
    const tyreMat = new THREE.MeshLambertMaterial({ color: '#2f2a30' });
    this.disposables.push(bodyMat, darkMat, trimMat, tyreMat);

    const chassisGeo = new THREE.BoxGeometry(BODY_W * S, BODY_H * S, TRUCK_D);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    const skirtGeo = new THREE.BoxGeometry(BODY_W * S, 8 * S, TRUCK_D + 0.04);
    const skirt = new THREE.Mesh(skirtGeo, darkMat);
    skirt.position.y = -BODY_H / 2 * S;
    // The cab sits on the back half, matching the flat-side truck silhouette.
    const cabGeo = new THREE.BoxGeometry(36 * S, 22 * S, TRUCK_D * 0.88);
    const cab = new THREE.Mesh(cabGeo, bodyMat);
    cab.position.set(22 * S, up(-BODY_H / 2 - 10), 0);
    const windowGeo = new THREE.BoxGeometry(22 * S, 12 * S, TRUCK_D * 0.9);
    const glass = new THREE.Mesh(windowGeo, trimMat);
    glass.position.set(22 * S, up(-BODY_H / 2 - 24), 0);
    this.disposables.push(chassisGeo, skirtGeo, cabGeo, windowGeo);
    this.truck.add(chassis, skirt, cab, glass);

    const tyreGeo = new THREE.CylinderGeometry(WHEEL_R * S, WHEEL_R * S, 0.3, 16);
    tyreGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.45 * S, WHEEL_R * 0.45 * S, 0.34, 12);
    hubGeo.rotateX(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.05, WHEEL_R * 0.9 * S, 0.36);
    this.disposables.push(tyreGeo, hubGeo, spokeGeo);
    WHEELS.forEach((offset) => {
      [-1, 1].forEach((side) => {
        const wheel = new THREE.Group();
        wheel.add(new THREE.Mesh(tyreGeo, tyreMat));
        wheel.add(new THREE.Mesh(hubGeo, trimMat));
        wheel.add(new THREE.Mesh(spokeGeo, tyreMat));
        wheel.position.set(offset.x * S, up(offset.y), side * (TRUCK_D / 2 + 0.02));
        this.wheelMeshes.push(wheel);
        this.truck.add(wheel);
      });
    });
    this.scene.add(this.truck);
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

  /**
   * The surface under x: the solid ground, or a contraption standing above it.
   * Screen y grows downwards, so the highest surface is the smallest number.
   */
  private groundAt(x: number) {
    let y = trackY(x, this.level);
    this.seesaws.forEach((seesaw) => {
      const surface = this.seesawSurface(seesaw, x);
      if (surface !== null && surface < y) y = surface;
    });
    this.platforms.forEach((platform) => {
      const surface = this.platformSurface(platform, x);
      if (surface !== null && surface < y) y = surface;
    });
    return y;
  }

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
    this.stepContraptions(dt);
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
    this.hammerHits();

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

    this.coins.forEach((coin, index) => {
      if (coin.taken) return;
      if (Math.hypot(coin.x - this.x, coin.y - this.y) > 34) return;
      coin.taken = true;
      this.coinMeshes[index].visible = false;
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

  private draw(dt: number) {
    const tx = this.x * S;
    const ty = up(this.y);

    this.truck.position.set(tx, ty, 0);
    // Physics y points down and three.js y points up, so the angle flips.
    this.truck.rotation.z = -this.angle;
    this.wheelMeshes.forEach((wheel) => { wheel.rotation.z = -this.wheelSpin; });

    this.coinMeshes.forEach((coin, index) => {
      if (coin.visible) coin.rotation.y = this.time * 2.4 + index;
    });

    // Physics y points down and three.js y points up, so every angle flips.
    this.seesaws.forEach((seesaw) => { seesaw.mesh.rotation.z = -seesaw.angle; });
    this.platforms.forEach((platform) => {
      platform.mesh.position.set(
        (platform.feature.x + platform.feature.width / 2) * S,
        up(platform.y) - 5 * S,
        0,
      );
    });
    this.hammers.forEach((hammer) => { hammer.mesh.rotation.z = -hammer.angle; });

    // Sit ahead of the truck so there is road to read, and never duck below
    // the base of the track.
    const lead = tx + 2.2;
    const height = Math.max(ty + 1.9, up(GROUND_BASE) + 1.4);
    const target = new THREE.Vector3(lead, height, 13);
    this.camera.position.lerp(target, Math.min(1, dt * 5));
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - 1.1, 0);

    this.renderer.render(this.scene, this.camera);
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
    this.disposables.forEach((item) => item.dispose());
    this.renderer.dispose();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.028);
    this.last = now;
    this.time += dt;
    if (this.status === 'playing') this.update(dt);
    this.draw(dt);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
