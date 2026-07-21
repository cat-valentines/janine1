import * as THREE from 'three';
import { animateWalk, buildBody, emojiTexture, faceTexture, type Limbs } from './blockBody';
import { DRAIN_IDLE, DRAIN_WALK, FOREST_X, MAX_ENERGY, RIVER_WIDTH, RIVER_X, STREET_WIDTH, STREET_Z, TOWN_D, TOWN_W, VENOM_DRAIN, VENOM_SECONDS, WORLD_D, WORLD_W, foodEnergy, forestCamps, townHouses, townShops, type TownShop } from './town';
import { pixelTexture, shade, type PixelPattern } from './pixelTexture';

const EYE = 1.6;
const HALF = 0.32;
const GRAVITY = 22;
const JUMP = 7.2;
const SPEED = 5.4;
const GROUND_Y = 0;
const PLAYER_HEIGHT = 1.8;

/** Everything in your pack, by forage id. */
export type Gathered = Record<string, number>;

export interface TownSnapshot {
  /** The shop you are standing inside, if any. */
  inside: string;
  /** The house you are standing at, if any. */
  atHouse: string;
  /** What you are close enough to gather from, if anything. */
  target: string;
  gathered: Gathered;
  inForest: boolean;
  /** 0-100. Runs down as you walk; eat or sleep to bring it back. */
  energy: number;
  venom: boolean;
  /** A snake is stalking you — back away! */
  snakeNear: boolean;
  /** True when standing on a camp bed. */
  canSleep: boolean;
  campName: string;
  /** True in sell mode when you are standing at your own market stand. */
  atStall: boolean;
  message: string;
}

interface EngineOptions {
  characterAsset: string;
  /** What the player already has, so a pack survives leaving town. */
  supplies: Gathered;
  onUpdate: (snapshot: TownSnapshot) => void;
  /** Called whenever the pack changes, so it can be saved right away. */
  onGather: (supplies: Gathered) => void;
  /** Sell mode: the player gets their own market stand on the street. */
  selling?: boolean;
}

type ResourceKind = 'tree' | 'rock' | 'berry' | 'mushroom' | 'apple' | 'herb' | 'carrot' | 'crate' | 'nest';

interface Resource {
  kind: ResourceKind; x: number; z: number;
  hits: number; group: THREE.Group; gone: boolean;
  /** Sprites drawn with the resource, removed with it. */
  extras?: THREE.Object3D[];
}

type CritterKind = 'deer' | 'turtle' | 'snake' | 'bird';

interface Critter {
  kind: CritterKind; sprite: THREE.Sprite;
  x: number; z: number; y: number; dir: number; speed: number;
  hits: number; gone: boolean;
}

interface Solid { x1: number; z1: number; x2: number; z2: number; y1: number; y2: number }

export class TownEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;

  private avatar: THREE.Group;
  private limbs: Limbs;
  private position = new THREE.Vector3(6, GROUND_Y, STREET_Z);
  private velocity = new THREE.Vector3();
  private yaw = -Math.PI / 2;
  private pitch = -0.05;
  private grounded = true;
  private walkPhase = 0;
  private keys = new Set<string>();
  private pointerLocked = false;
  private view: 'first' | 'third' = 'third';

  /** Walls to bump into. Doorways are simply left out of this list. */
  private solids: Solid[] = [];
  private resources: Resource[] = [];
  private critters: Critter[] = [];
  private gathered: Gathered = {};
  private river: THREE.Mesh | null = null;
  private fishSprites: THREE.Sprite[] = [];
  private swing = 0;
  private energy = MAX_ENERGY;
  private venomUntil = 0;
  private beds: Array<{ x: number; z: number; name: string }> = [];
  private message = '';
  private messageUntil = 0;
  private time = 0;

  /** Your market stand (sell mode): where it sits, and the item sprites on it. */
  private stall: { x: number; z: number } | null = null;
  private standSprites: THREE.Sprite[] = [];

  private running = true;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.gathered = { ...options.supplies };

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(74, container.clientWidth / container.clientHeight, 0.1, 400);
    this.scene.background = new THREE.Color('#bfe4f2');
    this.scene.fog = new THREE.Fog('#dcefdc', 70, 240);
    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#7f8f6f', 2.2));
    const sun = new THREE.DirectionalLight('#ffeec9', 1.35);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);

    this.buildGround();
    townShops.forEach((shop) => this.buildShop(shop));
    this.buildHouses();
    this.buildTrees();
    // Sell mode: your stand sits just down the street, straight ahead of where
    // you start, so you see it the moment you walk in.
    if (options.selling) this.buildStall();

    const built = buildBody('#4a7fb5', '#f2d0b4', 1, faceTexture(options.characterAsset), '#f2d0b4');
    this.avatar = built.group;
    this.limbs = built.limbs;
    this.scene.add(this.avatar);

    this.bind();
    this.loop();
  }

  // ---- world -------------------------------------------------------------

  private box(x: number, y: number, z: number, w: number, h: number, d: number, colour: string, solid = true, pattern: PixelPattern | null = null) {
    const flat = h <= 1.2;
    const rx = Math.max(1, Math.round((flat ? w : Math.max(w, d)) / 2));
    const ry = Math.max(1, Math.round((flat ? d : h) / 2));
    const material = pattern
      ? new THREE.MeshLambertMaterial({ map: pixelTexture(colour, shade(colour), pattern, rx, ry) })
      : new THREE.MeshLambertMaterial({ color: colour });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    this.scene.add(mesh);
    if (solid) this.solids.push({ x1: x, z1: z, x2: x + w, z2: z + d, y1: y, y2: y + h });
    return mesh;
  }

  private buildGround() {
    this.box(0, -1, 0, WORLD_W, 1, WORLD_D, '#6fa34f', false, 'grass');
    // Deeper, darker grass once you are properly in the forest.
    this.box(FOREST_X, -0.99, 0, WORLD_W - FOREST_X, 1, WORLD_D, '#4f8b3b', false, 'grass');
    // The street: a cobbled strip running the length of town.
    this.box(0, -0.95, STREET_Z - STREET_WIDTH / 2, TOWN_W, 1, STREET_WIDTH, '#c9b99a', false, 'cobble');
    // A dirt trail carrying on out of town, into the countryside and forest.
    this.box(TOWN_W, -0.94, STREET_Z - 2, WORLD_W - TOWN_W, 1, 4, '#b08a5a', false, 'path');
    // and a branch wandering off north into the deep trees
    this.box(FOREST_X + 24, -0.94, STREET_Z, 4, 1, WORLD_D - STREET_Z - 4, '#b08a5a', false, 'path');
    this.box(FOREST_X + 24, -0.94, 120, WORLD_W - FOREST_X - 28, 1, 4, '#b08a5a', false, 'path');
    this.box(250, -0.94, 120, 4, 1, WORLD_D - 124, '#b08a5a', false, 'path');
    // Street furniture: lanterns, benches and flower pots down both kerbs.
    for (let x = 8; x < TOWN_W - 6; x += 13) {
      this.lantern(x, STREET_Z - STREET_WIDTH / 2 - 0.8);
      this.lantern(x + 6, STREET_Z + STREET_WIDTH / 2 + 0.4);
      this.box(x + 2, 0, STREET_Z - STREET_WIDTH / 2 - 1.4, 2.2, 0.5, 0.8, '#8a6642', false, 'planks');
      this.prop('🌷', x + 3.6, 0.6, STREET_Z + STREET_WIDTH / 2 + 1.2, 0.9);
      this.prop('🌼', x + 9, 0.5, STREET_Z - STREET_WIDTH / 2 - 1.1, 0.7);
      this.prop('🦋', x + 5, 1.8, STREET_Z + STREET_WIDTH / 2 + 2.2, 0.6);
      // A crate and barrel outside, like a real market street.
      this.box(x + 10, 0, STREET_Z + STREET_WIDTH / 2 + 0.6, 1.1, 1.1, 1.1, '#a8763f', false, 'planks');
      this.box(x + 11.4, 0, STREET_Z - STREET_WIDTH / 2 - 1.6, 1, 1.3, 1, '#8a6642', false, 'planks');
    }
    this.well(TOWN_W / 2 - 2, STREET_Z + 6);
    this.bunting();
    // Town wall, so nobody wanders into nothing.
    // No town wall on purpose: you can wander off the street anywhere you like.
    this.buildForest();
    this.buildRiver();
  }

  /** A deterministic scatter of choppable trees, rocks and berry bushes. */
  private buildForest() {
    const rand = (n: number) => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < 620; i += 1) {
      const x = FOREST_X - 12 + rand(i) * (WORLD_W - FOREST_X + 4);
      const z = 3 + rand(i + 900) * (WORLD_D - 6);
      // Leave the town's own patch alone.
      if (x < TOWN_W + 3 && z < TOWN_D + 3) continue;
      // Keep the trail and the river clear so you can always walk through.
      if (Math.abs(z - STREET_Z) < 4 && x < RIVER_X) continue;
      if (Math.abs(x - (FOREST_X + 26)) < 4) continue;
      if (Math.abs(x - RIVER_X) < RIVER_WIDTH) continue;
      if (x < TOWN_W + 3) continue;
      const roll = rand(i + 50);
      if (roll < 0.46) this.addTree(x, z, i);
      else if (roll < 0.60) this.addRock(x, z);
      else if (roll < 0.72) this.addBush(x, z, 'berry', '🫐');
      else if (roll < 0.80) this.addBush(x, z, 'mushroom', '🍄');
      else if (roll < 0.87) this.addTree(x, z, i, 'apple');
      else if (roll < 0.94) this.addBush(x, z, 'herb', '🌿');
      else this.addBush(x, z, 'carrot', '🥕');
    }
    forestCamps.forEach((camp) => this.addCamp(camp.x, camp.z, camp.name));
    this.addCritters();
  }

  /** A camp hut you can actually walk into, with a bed to sleep in. */
  private addCamp(x: number, z: number, name = 'Camp') {
    const w = 7;
    const d = 6;
    const h = 3.2;
    // Walls with a doorway in the front (+z) side.
    this.box(x, 0, z, 1, h, d, '#c9a06a', true, 'planks');
    this.box(x + w - 1, 0, z, 1, h, d, '#c9a06a', true, 'planks');
    this.box(x, 0, z, w, h, 1, '#c9a06a', true, 'planks');
    const doorX = x + w / 2 - 1.5;
    this.box(x, 0, z + d - 1, doorX - x, h, 1, '#c9a06a', true, 'planks');
    this.box(doorX + 3, 0, z + d - 1, x + w - (doorX + 3), h, 1, '#c9a06a', true, 'planks');
    this.box(doorX, 2.4, z + d - 1, 3, h - 2.4, 1, '#c9a06a', true, 'planks');
    this.box(x - 0.5, h, z - 0.5, w + 1, 0.9, d + 1, '#8a5f3f', true, 'shingle');
    this.box(x, 0, z, w, 0.1, d, '#d9cdb4', false, 'planks');
    // The bed: walk onto it to sleep.
    this.box(x + 1.2, 0, z + 1.2, 2.2, 0.6, 3.2, '#8a6642', false, 'planks');
    this.box(x + 1.2, 0.6, z + 1.2, 2.2, 0.25, 3.2, '#b6c8e0', false, 'noise');
    this.prop('🛏️', x + 2.3, 1.4, z + 2.8, 1.1);
    this.beds.push({ x: x + 2.3, z: z + 2.8, name });
    this.prop('⛺', x + w / 2, 4.6, z + d / 2, 1.6);
    // Campfire.
    this.box(x + 6, 0, z + 1, 1.4, 0.4, 1.4, '#6d6a72', false, 'cobble');
    this.prop('🔥', x + 6.7, 0.9, z + 1.7, 1.3);
    for (let i = 0; i < 4; i += 1) {
      this.box(x + 5 + (i % 2) * 3.4, 0, z + (i < 2 ? -0.6 : 3.2), 1.2, 0.5, 1.2, '#8a6642', false, 'planks');
    }
    // The supply crate.
    const group = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#a8763f', shade('#a8763f'), 'planks', 2, 2) }));
    crate.position.y = 0.8;
    group.add(crate);
    group.position.set(x + 5.2, 0, z + 2);
    this.scene.add(group);
    const mark = this.prop('📦', x + 5.2, 2.3, z + 2, 0.9);
    this.resources.push({ kind: 'crate', x: x + 5.2, z: z + 2, hits: 1, group, gone: false, extras: [mark] });
  }

  /** Deer, snakes and birds in the trees; turtles in the river. */
  private addCritters() {
    const rand = (n: number) => { const v = Math.sin(n * 91.7) * 43758.5453; return v - Math.floor(v); };
    const add = (kind: CritterKind, icon: string, x: number, z: number, y: number, speed: number, hits: number) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon) }));
      sprite.scale.setScalar(kind === 'deer' ? 1.8 : kind === 'bird' ? 0.9 : 1.1);
      sprite.position.set(x, y, z);
      this.scene.add(sprite);
      this.critters.push({ kind, sprite, x, z, y, dir: rand(x + z) * Math.PI * 2, speed, hits, gone: false });
    };
    for (let i = 0; i < 16; i += 1) {
      add('deer', '🦌', FOREST_X + 8 + rand(i) * (WORLD_W - FOREST_X - 16), 6 + rand(i + 40) * (WORLD_D - 12), 0.9, 1.6, 2);
    }
    for (let i = 0; i < 10; i += 1) {
      add('turtle', '🐢', RIVER_X + (i % 2 ? 2.5 : -2.5), 12 + i * 24, -0.25, 0.5, 1);
    }
    for (let i = 0; i < 12; i += 1) {
      add('snake', '🐍', FOREST_X + 14 + rand(i + 7) * (WORLD_W - FOREST_X - 20), 5 + rand(i + 70) * (WORLD_D - 10), 0.4, 1.1, 1);
    }
    for (let i = 0; i < 20; i += 1) {
      add('bird', '🐦', FOREST_X + 6 + rand(i + 3) * (WORLD_W - FOREST_X - 12), 4 + rand(i + 90) * (WORLD_D - 8), 6 + rand(i) * 3, 2.4, 1);
    }
  }

  private addTree(x: number, z: number, seed: number, kind: ResourceKind = 'tree') {
    const group = new THREE.Group();
    const tall = 3 + Math.floor((Math.sin(seed * 3.7) * 0.5 + 0.5) * 3);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, tall, 1),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#5f4026', shade('#5f4026'), 'planks', 1, tall) }));
    trunk.position.set(0, tall / 2, 0);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 4.4),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#3f7d24', shade('#3f7d24'), 'grass', 3, 3) }));
    leaves.position.set(0, tall + 1.2, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#57a02f', shade('#57a02f'), 'grass', 2, 2) }));
    top.position.set(0, tall + 3.2, 0);
    group.add(trunk, leaves, top);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.solids.push({ x1: x - 0.5, z1: z - 0.5, x2: x + 0.5, z2: z + 0.5, y1: 0, y2: tall });
    const extras: THREE.Object3D[] = [];
    if (kind === 'apple') {
      // Apples hanging in the branches.
      [[-1.2, 0.6], [1.1, -0.9], [0.3, 1.2]].forEach(([ox, oz]) =>
        extras.push(this.prop('🍎', x + ox, tall + 1.2, z + oz, 0.7)));
    }
    this.resources.push({ kind, x, z, hits: kind === 'apple' ? 2 : 3, group, gone: false, extras });
  }

  private addRock(x: number, z: number) {
    const group = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#8a8f94', shade('#8a8f94'), 'cobble', 2, 2) }));
    rock.position.y = 0.7;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 1),
      new THREE.MeshLambertMaterial({ map: pixelTexture('#a0a5aa', shade('#a0a5aa'), 'cobble', 1, 1) }));
    cap.position.set(0.2, 1.6, -0.1);
    group.add(rock, cap);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.solids.push({ x1: x - 0.9, z1: z - 0.9, x2: x + 0.9, z2: z + 0.9, y1: 0, y2: 1.4 });
    this.resources.push({ kind: 'rock', x, z, hits: 2, group, gone: false });
  }

  /** A low bush with its crop shown above it. */
  private addBush(x: number, z: number, kind: ResourceKind, icon: string) {
    const group = new THREE.Group();
    const green = kind === 'mushroom' ? '#5f6b3a' : kind === 'carrot' ? '#6f8b3a' : '#3f7d24';
    const bush = new THREE.Mesh(new THREE.BoxGeometry(1.8, kind === 'carrot' ? 0.5 : 1.4, 1.8),
      new THREE.MeshLambertMaterial({ map: pixelTexture(green, shade(green), 'grass', 2, 2) }));
    bush.position.y = kind === 'carrot' ? 0.25 : 0.7;
    group.add(bush);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const crop = this.prop(icon, x, kind === 'carrot' ? 0.9 : 1.7, z, 0.8);
    this.resources.push({ kind, x, z, hits: 1, group, gone: false, extras: [crop] });
  }

  /** An animated river: the water texture drifts, and fish swim in it. */
  private buildRiver() {
    const texture = pixelTexture('#4a90c2', shade('#4a90c2', 0.82), 'noise', 8, 40);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(RIVER_WIDTH, 0.5, WORLD_D),
      new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.85 }),
    );
    water.position.set(RIVER_X, -0.55, WORLD_D / 2);
    this.scene.add(water);
    this.river = water;
    // Sandy banks.
    this.box(RIVER_X - RIVER_WIDTH / 2 - 2, -0.97, 0, 2, 1, WORLD_D, '#ddc98f', false, 'path');
    this.box(RIVER_X + RIVER_WIDTH / 2, -0.97, 0, 2, 1, WORLD_D, '#ddc98f', false, 'path');
    // A little plank bridge where the trail meets the water.
    this.box(RIVER_X - RIVER_WIDTH / 2 - 2, -0.4, STREET_Z - 2.5, RIVER_WIDTH + 4, 0.4, 5, '#8a6642', false, 'planks');
    for (let i = 0; i < 10; i += 1) {
      const fish = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🐟') }));
      fish.scale.setScalar(0.85);
      // The water spans y -0.8..-0.3, so the fish sit just under the surface.
      fish.position.set(RIVER_X + (i % 2 ? 2 : -2), -0.42, 10 + i * 14);
      this.scene.add(fish);
      this.fishSprites.push(fish);
    }
  }

  /**
   * A shop is four walls with a gap for the door, so you walk in rather than
   * clicking a button. The door always faces the street.
   */
  private buildShop(shop: TownShop) {
    const { x, z, width, depth, height, wall, roof } = shop;
    const facesUp = z < STREET_Z;
    const doorZ = facesUp ? z + depth - 1 : z;
    const doorX = x + width / 2 - 1.5;

    // Side walls.
    this.box(x, 0, z, 1, height, depth, wall, true, 'planks');
    this.box(x + width - 1, 0, z, 1, height, depth, wall, true, 'planks');
    // Back wall.
    this.box(x, 0, facesUp ? z : z + depth - 1, width, height, 1, wall, true, 'planks');
    // Front wall, split either side of the doorway.
    const frontZ = facesUp ? z + depth - 1 : z;
    this.box(x, 0, frontZ, doorX - x, height, 1, wall, true, 'planks');
    this.box(doorX + 3, 0, frontZ, x + width - (doorX + 3), height, 1, wall, true, 'planks');
    // Lintel above the door, so the gap reads as a doorway.
    this.box(doorX, 2.6, frontZ, 3, height - 2.6, 1, wall, true, 'planks');

    // Shingled roof with an overhang.
    this.box(x - 0.6, height, z - 0.6, width + 1.2, 1.2, depth + 1.2, roof, true, 'shingle');
    this.box(x, 0, z, width, 0.1, depth, '#d9cdb4', false, 'planks');

    const out = facesUp ? 1 : -1;
    // Windows either side of the door.
    [x + 1.6, x + width - 2.6].forEach((wx) => {
      this.box(wx, 1.6, frontZ + (facesUp ? 0.9 : -0.1), 1.6, 1.4, 0.2, '#bfe3f5', false);
      this.box(wx - 0.2, 1.4, frontZ + (facesUp ? 0.9 : -0.1), 2, 0.25, 0.25, '#5f4830', false, 'planks');
      this.prop('🌼', wx + 0.8, 1.3, frontZ + out * 0.5 + (facesUp ? 0.9 : -0.1), 0.45);
    });
    // Striped awning over the door.
    for (let i = 0; i < 5; i += 1) {
      this.box(doorX - 1 + i * 1.1, 3.1, frontZ + (facesUp ? 1 : -1.1), 1.1, 0.3, 1.1,
        i % 2 ? '#fffaf0' : shade(roof, 1.25), false);
    }

    // A painted wooden shop sign hanging over the door.
    const signZ = doorZ + (facesUp ? 1.6 : -1.6);
    this.box(doorX + 1.35, 4.3, signZ, 0.3, 1.2, 0.3, '#4a3a2a', false, 'planks');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(5, 1.4, 0.25),
      [0, 1, 2, 3, 4, 5].map((face) => new THREE.MeshLambertMaterial(
        face === 4 || face === 5 ? { map: this.signTexture(shop) } : { color: '#5f4026' })),
    );
    board.position.set(doorX + 1.5, 3.7, signZ);
    this.scene.add(board);

    // The shopkeeper, standing behind their counter.
    const keeper = buildBody('#8a6a9a', '#f2d0b4', 1);
    keeper.group.position.set(x + width / 2, 0, facesUp ? z + 1.6 : z + depth - 1.6);
    keeper.group.rotation.y = facesUp ? 0 : Math.PI;
    this.scene.add(keeper.group);
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(shop.keeperIcon) }));
    face.scale.setScalar(1.1);
    face.position.set(x + width / 2, 2.4, keeper.group.position.z);
    this.scene.add(face);

    // Counter.
    this.box(x + 1.5, 0, facesUp ? z + 2.6 : z + depth - 3.6, width - 3, 1, 1, '#8a6642');
  }

  /** A small emoji prop standing in the world. */
  private prop(icon: string, x: number, y: number, z: number, size = 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon) }));
    sprite.scale.setScalar(size);
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    return sprite;
  }

  /** Your own market stand on the west end of the street: a counter with a
   *  striped canopy, ready for you to lay your foraged goods out to sell. */
  private buildStall() {
    const cx = 9, cz = STREET_Z - 0.6;   // counter footprint on the street, straight ahead of spawn
    this.stall = { x: cx + 2, z: cz + 0.6 };
    // counter table
    this.box(cx, 0, cz, 4, 1.1, 1.2, '#a9713f');
    this.box(cx, 1.05, cz - 0.1, 4, 0.15, 1.4, '#c68a4f');   // overhang top
    // four posts
    [[cx, cz], [cx + 3.7, cz], [cx, cz + 1], [cx + 3.7, cz + 1]].forEach(([px, pz]) => this.box(px, 0, pz, 0.22, 3, 0.22, '#6f4a28'));
    // striped canopy
    for (let i = 0; i < 5; i += 1) this.box(cx + i * 0.8, 3, cz - 0.2, 0.8, 0.2, 1.6, i % 2 ? '#e4574c' : '#f4efe6', false);
    // a sign so it reads as "your stall"
    this.prop('🧺', cx + 2, 3.7, cz + 0.4, 1.4);
    this.prop('🪙', cx + 0.5, 1.7, cz + 0.5, 0.7);
  }

  /** Lay the chosen goods out on the counter so the stand shows what's for sale. */
  setStandItems(icons: string[]) {
    this.standSprites.forEach((s) => { this.scene.remove(s); s.material.map?.dispose(); s.material.dispose(); });
    this.standSprites = [];
    if (!this.stall) return;
    const start = this.stall.x - 1.3;
    icons.slice(0, 6).forEach((icon, i) => {
      const s = this.prop(icon, start + i * 0.52, 1.5, this.stall!.z, 0.55);
      this.standSprites.push(s);
    });
  }

  private lantern(x: number, z: number) {
    this.box(x, 0, z, 0.3, 3, 0.3, '#4a3a2a', false, 'planks');
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.7, 0.6),
      new THREE.MeshLambertMaterial({ color: '#ffe9a0', emissive: new THREE.Color('#8a6f1a') }),
    );
    glow.position.set(x + 0.15, 3.3, z + 0.15);
    this.scene.add(glow);
  }

  /** A little wishing well for the middle of town. */
  private well(x: number, z: number) {
    this.box(x, 0, z, 3.4, 1.1, 3.4, '#8a8f84', true, 'cobble');
    this.box(x + 0.5, 1.1, z + 0.5, 2.4, 0.2, 2.4, '#4a90c2', false);
    this.box(x + 0.2, 1.1, z + 0.2, 0.3, 2.4, 0.3, '#5f4026', false, 'planks');
    this.box(x + 2.9, 1.1, z + 2.9, 0.3, 2.4, 0.3, '#5f4026', false, 'planks');
    this.box(x - 0.3, 3.4, z - 0.3, 4, 0.6, 4, '#96453c', false, 'shingle');
  }

  /** Bunting strung over the street — the cute detail that sells a town. */
  /** Bunting strung ACROSS the street, so you walk under it. */
  private bunting() {
    const colours = ['#f2b8c6', '#c3b3e0', '#a7cde4', '#f0dc9a', '#b2d6ac'];
    [20, 36, 52].forEach((x) => {
      for (let i = 0; i <= 8; i += 1) {
        const t = i / 8;
        const z = STREET_Z - 4 + t * 8;
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.8, 0.8),
          new THREE.MeshLambertMaterial({ color: colours[i % colours.length] }),
        );
        // Sag in the middle of the string.
        flag.position.set(x, 5.4 - Math.sin(t * Math.PI) * 0.7, z);
        flag.rotation.x = Math.PI / 4;
        this.scene.add(flag);
      }
    });
  }

  /** The shop's name painted on a wooden board. */
  private signTexture(shop: TownShop) {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f3e2bf';
      ctx.fillRect(0, 0, 200, 56);
      ctx.fillStyle = '#5f4026';
      ctx.fillRect(0, 0, 200, 4);
      ctx.fillRect(0, 52, 200, 4);
      ctx.font = '30px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(shop.sign, 8, 29);
      ctx.fillStyle = '#4a3520';
      ctx.font = 'bold 17px "Courier New", monospace';
      ctx.fillText(shop.name.toUpperCase(), 48, 30);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  private buildHouses() {
    townHouses.forEach((house) => {
      this.box(house.x, 0, house.z, 8, 4, 7, '#b08a5a', true, 'planks');
      this.box(house.x - 0.5, 4, house.z - 0.5, 9, 1.2, 8, '#8a4f3f', true, 'shingle');
      this.box(house.x + 1, 1.6, house.z + 6.9, 1.4, 1.2, 0.2, '#bfe3f5', false);
      this.box(house.x + 5.6, 1.6, house.z + 6.9, 1.4, 1.2, 0.2, '#bfe3f5', false);
      this.prop('🌻', house.x + 0.8, 0.6, house.z + 7.6, 0.9);
      this.box(house.x + 3.4, 0, house.z + 6.8, 1.4, 2.4, 0.3, '#6b4423', false);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(house.forSale ? '🏷️' : '🏠') }));
      sign.scale.setScalar(1.6);
      sign.position.set(house.x + 4, 6, house.z + 3.5);
      this.scene.add(sign);
    });
  }

  private buildTrees() {
    // A hint of the forest at the far end, for the next pass.
    for (let i = 0; i < 16; i += 1) {
      const x = 4 + (i * 11) % (TOWN_W - 8);
      const z = i % 2 === 0 ? 2.5 : TOWN_D - 3.5;
      if (Math.abs(z - STREET_Z) < 8) continue;
      this.box(x, 0, z, 1, 3, 1, '#5f4026', true, 'planks');
      this.box(x - 1.5, 3, z - 1.5, 4, 3, 4, '#3f7d24', true, 'grass');
    }
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyF') this.view = this.view === 'third' ? 'first' : 'third';
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onPointerDown = () => {
    if (!this.pointerLocked) this.renderer.domElement.requestPointerLock();
    // Gather on the same click that grabs the mouse, rather than eating it.
    this.gather();
  };

  /** The nearest thing in front of you that can be gathered. */
  private nearest() {
    let best: Resource | null = null;
    let bestDist = 4.2;
    this.resources.forEach((r) => {
      if (r.gone) return;
      const d = Math.hypot(r.x - this.position.x, r.z - this.position.z);
      if (d < bestDist) { bestDist = d; best = r; }
    });
    return best as Resource | null;
  }

  private nearRiver() {
    return Math.abs(this.position.x - RIVER_X) < RIVER_WIDTH / 2 + 3.5;
  }

  private take(id: string, amount: number, note: string) {
    this.gathered[id] = (this.gathered[id] ?? 0) + amount;
    // Saved the moment it is picked up — nothing is lost by walking away.
    this.options.onGather({ ...this.gathered });
    this.say(note);
  }

  /** The nearest critter in reach. */
  private nearestCritter() {
    let best: Critter | null = null;
    let bestDist = 4;
    this.critters.forEach((c) => {
      if (c.gone) return;
      const d = Math.hypot(c.x - this.position.x, c.z - this.position.z);
      if (d < bestDist) { bestDist = d; best = c; }
    });
    return best as Critter | null;
  }

  private gather() {
    // Swing the arm whatever you hit, so chopping feels like chopping.
    this.swing = 1;

    const critter = this.nearestCritter();
    if (critter) {
      critter.hits -= 1;
      if (critter.hits > 0) { this.say('💨 It got away — try again!', 1.2); return; }
      critter.gone = true;
      this.scene.remove(critter.sprite);
      if (critter.kind === 'deer') this.take('venison', 2, '🍖 You hunted a deer. +2 venison');
      else if (critter.kind === 'turtle') this.take('herb', 1, '🐢 The turtle shared a herb and swam off.');
      else if (critter.kind === 'bird') this.take('egg', 1, '🥚 The bird left an egg behind.');
      else this.take('herb', 1, '🐍 You chased the snake off.');
      return;
    }

    const target = this.nearest();
    if (!target) {
      if (this.nearRiver()) this.take('fish', 1, '🐟 You caught a fish!');
      return;
    }
    target.hits -= 1;
    if (target.hits > 0) {
      target.group.position.x = target.x + 0.12;
      this.say(target.kind === 'tree' || target.kind === 'apple' ? '🪓 Chop! Keep going…' : '⛏️ Almost…', 1);
      return;
    }
    target.gone = true;
    this.scene.remove(target.group);
    target.extras?.forEach((extra) => this.scene.remove(extra));
    // A felled tree stops blocking the way.
    this.solids = this.solids.filter((sd) => !(sd.x1 <= target.x && sd.x2 >= target.x && sd.z1 <= target.z && sd.z2 >= target.z && sd.y1 === 0 && sd.y2 < 9));

    if (target.kind === 'tree') this.take('wood', 3, '🪵 Timber! +3 wood');
    else if (target.kind === 'apple') { this.take('apple', 3, '🍎 +3 apples and +2 wood'); this.gathered.wood = (this.gathered.wood ?? 0) + 2; this.options.onGather({ ...this.gathered }); }
    else if (target.kind === 'rock') this.take('stone', 2, '🪨 +2 stone');
    else if (target.kind === 'berry') this.take('berries', 2, '🫐 +2 wild berries');
    else if (target.kind === 'mushroom') this.take('mushroom', 2, '🍄 +2 mushrooms');
    else if (target.kind === 'herb') this.take('herb', 2, '🌿 +2 green herbs');
    else if (target.kind === 'carrot') this.take('carrot', 2, '🥕 +2 wild carrots');
    else if (target.kind === 'crate') {
      // A camp crate is a bundle of supplies.
      ['wood', 'stone', 'berries', 'mushroom'].forEach((id) => { this.gathered[id] = (this.gathered[id] ?? 0) + 2; });
      this.options.onGather({ ...this.gathered });
      this.say('📦 Camp supplies! +2 wood, stone, berries and mushrooms');
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointerLocked) return;
    this.yaw -= event.movementX * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0024, -1.2, 1.2);
  };
  private onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.renderer.domElement; };

  private bind() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private unbind() {
    const canvas = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  /** Arrow keys as well as WASD, since that is what a kid reaches for. */
  private get forward() {
    return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
  }
  private get strafe() {
    return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
  }

  // ---- movement ----------------------------------------------------------

  private blocked(x: number, y: number, z: number) {
    if (x < 0.4 || z < 0.4 || x > WORLD_W - 0.4 || z > WORLD_D - 0.4) return true;
    // The player's whole height must clear the solid. Checking only the top
    // made the beam above each doorway block the door at ground level.
    return this.solids.some((s) =>
      x + HALF > s.x1 && x - HALF < s.x2
      && z + HALF > s.z1 && z - HALF < s.z2
      && y < s.y2 && y + PLAYER_HEIGHT > s.y1);
  }

  private move(dt: number) {
    const move = new THREE.Vector3(
      Math.sin(this.yaw) * -this.forward + Math.cos(this.yaw) * this.strafe,
      0,
      Math.cos(this.yaw) * -this.forward - Math.sin(this.yaw) * this.strafe,
    );
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(SPEED * dt);
    if (this.grounded && this.keys.has('Space')) this.velocity.y = JUMP;

    const next = this.position.clone();
    if (move.x && !this.blocked(next.x + move.x, next.y, next.z)) next.x += move.x;
    if (move.z && !this.blocked(next.x, next.y, next.z + move.z)) next.z += move.z;
    this.velocity.y -= GRAVITY * dt;
    next.y += this.velocity.y * dt;
    this.grounded = false;
    if (next.y <= GROUND_Y) { next.y = GROUND_Y; this.velocity.y = 0; this.grounded = true; }
    this.position.copy(next);

    this.walkPhase = moving ? this.walkPhase + dt * 9 : 0;
    animateWalk(this.limbs, this.walkPhase, moving);

    // Energy runs down as you go, and venom burns through it.
    const venomous = this.time < this.venomUntil;
    const drain = (moving ? DRAIN_WALK : DRAIN_IDLE) + (venomous ? VENOM_DRAIN : 0);
    this.energy = Math.max(0, this.energy - drain * dt);
  }

  /** The closest stalking snake, so the player can be warned. */
  private snakeNear() {
    let best = 99;
    this.critters.forEach((c) => {
      if (c.gone || c.kind !== 'snake') return;
      best = Math.min(best, Math.hypot(c.x - this.position.x, c.z - this.position.z));
    });
    return best;
  }

  /** Snakes bite if you get too close. Keep away, or eat it off. */
  private checkSnakes() {
    if (this.time < this.venomUntil) return;
    const bite = this.critters.find((c) => !c.gone && c.kind === 'snake'
      && Math.hypot(c.x - this.position.x, c.z - this.position.z) < 2.2);
    if (!bite) return;
    this.venomUntil = this.time + VENOM_SECONDS;
    this.say('🐍 A snake bit you! Venom is draining your energy — eat something!', 4);
  }

  /** The bed you are standing on, if any. */
  private bedHere() {
    return this.beds.find((bed) => Math.hypot(bed.x - this.position.x, bed.z - this.position.z) < 2.4);
  }

  sleep() {
    const bed = this.bedHere();
    if (!bed) return;
    this.energy = MAX_ENERGY;
    this.venomUntil = 0;
    this.say(`😴 You slept at ${bed.name}. Energy full!`, 3);
  }

  /** Eat something from the pack to get energy back. */
  eat(id: string) {
    if ((this.gathered[id] ?? 0) <= 0) return;
    const gain = foodEnergy[id] ?? 8;
    this.gathered[id] -= 1;
    if (this.gathered[id] <= 0) delete this.gathered[id];
    this.energy = Math.min(MAX_ENERGY, this.energy + gain);
    // Eating flushes the venom out.
    if (this.time < this.venomUntil) this.venomUntil = 0;
    this.options.onGather({ ...this.gathered });
    this.say(`😋 Yum! +${gain} energy`, 1.6);
  }

  /** Sell up to `count` of a foraged good from your stand. Returns how many
   *  actually sold (capped by what you have). The page hands out the coins. */
  sell(id: string, count: number): number {
    const have = this.gathered[id] ?? 0;
    const n = Math.min(have, Math.max(1, count));
    if (n <= 0) return 0;
    this.gathered[id] -= n;
    if (this.gathered[id] <= 0) delete this.gathered[id];
    this.options.onGather({ ...this.gathered });
    return n;
  }

  /** Which shop's four walls the player is standing between. */
  private shopHere() {
    return townShops.find((shop) =>
      this.position.x > shop.x && this.position.x < shop.x + shop.width
      && this.position.z > shop.z && this.position.z < shop.z + shop.depth);
  }

  private houseHere() {
    return townHouses.find((house) => Math.hypot(this.position.x - (house.x + 4), this.position.z - (house.z + 3.5)) < 6);
  }

  private updateCamera() {
    const eye = this.position.clone().add(new THREE.Vector3(0, EYE, 0));
    const look = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.avatar.position.copy(this.position);
    this.avatar.rotation.y = this.yaw;
    this.avatar.visible = this.view === 'third';
    if (this.view === 'first') {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      return;
    }
    const back = look.clone().normalize();
    let distance = 4.2;
    for (let s = 0.3; s <= 4.2; s += 0.3) {
      const probe = eye.clone().add(back.clone().multiplyScalar(s));
      if (this.blocked(probe.x, probe.y, probe.z)) { distance = Math.max(0, s - 0.4); break; }
    }
    if (distance < 0.8) {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      this.avatar.visible = false;
      return;
    }
    this.camera.position.copy(eye.clone().add(back.multiplyScalar(distance)));
    this.camera.lookAt(eye);
  }

  private say(text: string, seconds = 2) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  private snapshot(): TownSnapshot {
    const shop = this.shopHere();
    const house = this.houseHere();
    const critter = this.nearestCritter();
    const target = this.nearest();
    return {
      inside: shop?.id ?? '',
      atHouse: house?.id ?? '',
      target: critter ? critter.kind : target ? target.kind : (this.nearRiver() ? 'river' : ''),
      gathered: { ...this.gathered },
      inForest: this.position.x > FOREST_X - 12,
      energy: Math.round(this.energy),
      venom: this.time < this.venomUntil,
      snakeNear: this.snakeNear() < 9,
      canSleep: !!this.bedHere(),
      campName: this.bedHere()?.name ?? '',
      atStall: !!this.stall && Math.hypot(this.position.x - this.stall.x, this.position.z - this.stall.z) < 6,
      message: this.time < this.messageUntil ? this.message : '',
    };
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  dispose() {
    this.running = false;
    this.unbind();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.move(dt);
    this.checkSnakes();
    // The river drifts downstream and the fish bob along with it.
    if (this.river) {
      const map = (this.river.material as THREE.MeshLambertMaterial).map;
      if (map) map.offset.y = (this.time * 0.06) % 1;
    }
    this.critters.forEach((c, i) => {
      if (c.gone) return;
      if (c.kind === 'turtle') {
        // Turtles drift down the river.
        c.z = (c.z + dt * c.speed) % WORLD_D;
        c.x = RIVER_X + Math.sin(this.time * 0.6 + i) * 2.2;
        c.sprite.position.set(c.x, -0.25 + Math.sin(this.time * 2 + i) * 0.06, c.z);
        return;
      }
      const toPlayer = Math.hypot(this.position.x - c.x, this.position.z - c.z);
      let speed = c.speed;
      if (c.kind === 'snake' && toPlayer < 14) {
        // Sneaky: slither straight at you, and speed up for the strike.
        c.dir = Math.atan2(this.position.z - c.z, this.position.x - c.x);
        speed = toPlayer < 5 ? c.speed * 2.2 : c.speed * 1.3;
      } else if (c.kind === 'deer' && toPlayer < 10) {
        // Deer are shy — they bolt away from you.
        c.dir = Math.atan2(c.z - this.position.z, c.x - this.position.x);
        speed = c.speed * 2.4;
      } else {
        // Everyone else wanders, turning gently and staying in the forest.
        c.dir += Math.sin(this.time * 0.5 + i * 2.1) * dt * 0.9;
      }
      const nx = c.x + Math.cos(c.dir) * speed * dt;
      const nz = c.z + Math.sin(c.dir) * speed * dt;
      if (nx > FOREST_X - 10 && nx < WORLD_W - 3 && nz > 3 && nz < WORLD_D - 3) { c.x = nx; c.z = nz; }
      else c.dir += Math.PI;
      const bob = c.kind === 'bird' ? Math.sin(this.time * 2 + i) * 0.5
        : c.kind === 'snake' && toPlayer < 14 ? Math.abs(Math.sin(this.time * 7)) * 0.25
        : 0;
      c.sprite.position.set(c.x, c.y + bob, c.z);
    });
    this.fishSprites.forEach((fish, i) => {
      fish.position.z = ((fish.position.z + dt * (2 + i * 0.4)) % WORLD_D);
      fish.position.x = RIVER_X + Math.sin(this.time * 1.4 + i) * 2.4;
      fish.position.y = -0.45 + Math.sin(this.time * 3 + i) * 0.08;
    });
    // Ease the chopping arm back down.
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.4);
      this.limbs.armR.rotation.x = -this.swing * 2.2;
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
