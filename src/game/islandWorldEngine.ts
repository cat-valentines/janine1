import * as THREE from 'three';
import { pixelTexture } from './pixelTexture';
import { STAR_VALUE, TRINKET_VALUE, GEM_VALUE, type WorldTheme } from './islandWorld';

export interface WorldSnapshot {
  /** Star-points earned from pickups this visit — the page banks the growth. */
  earned: number;
  stars: number;      // loose ⭐ picked up
  trinkets: number;   // themed ground collectibles picked up
  gems: number;       // cave crystals mined
  underground: boolean;
  visitedCave: boolean;
  visitedWaterfall: boolean;
  livePlayers: number;
  prompt: string;     // a contextual "Press Space to…" hint
  bubbleLeft: number; // seconds of bubble-potion protection left
  weaponLeft: number; // seconds the star sword is drawn
  hintActive: boolean;
}

interface EngineOptions {
  theme: WorldTheme;
  characterAsset: string;
  islandId: number;
  onUpdate: (snapshot: WorldSnapshot) => void;
}

interface Pickup { sprite: THREE.Sprite; base: number; seed: number; taken: boolean }
interface LiveFigure {
  group: THREE.Group;
  pos: THREE.Vector3; target: THREE.Vector3;
  yaw: number; targetYaw: number;
}

const WORLD_RADIUS = 58;      // how far you can wander before the shore
const CAVE_RADIUS = 15;
const PLAYER_SPEED = 9;
const TURN_SPEED = 2.6;
const CAM_BACK = 8;
const CAM_HEIGHT = 5;

/** A stable hue from a player id, so each live player keeps one colour. */
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Seeded RNG so a given island always scatters the same trees and stars. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class IslandWorldEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;
  private theme: WorldTheme;
  private disposables: Array<{ dispose: () => void }> = [];

  private surface = new THREE.Group();
  private cave = new THREE.Group();
  private player = new THREE.Group();
  private position = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();

  private stars: Pickup[] = [];
  private trinkets: Pickup[] = [];
  private gems: Pickup[] = [];
  private sparkles: THREE.Points | null = null;
  private waterfallTex: THREE.CanvasTexture | null = null;
  private caveEntry = new THREE.Vector3();
  private caveExit = new THREE.Vector3();
  private waterfallAt = new THREE.Vector3();

  private earned = 0;
  private starCount = 0;
  private trinketCount = 0;
  private gemCount = 0;
  private underground = false;
  private visitedCave = false;
  private visitedWaterfall = false;
  private prompt = '';

  private livePlayers = new Map<string, LiveFigure>();
  private liveGroup = new THREE.Group();

  // Quest consumables (potions & weapon) — activated from the items tray.
  private hintUntil = 0; private beacon: THREE.Mesh | null = null;
  private bubbleUntil = 0; private bubbleMesh: THREE.Mesh | null = null;
  private weaponUntil = 0; private weaponSprite: THREE.Sprite | null = null;

  private running = true;
  private clock = new THREE.Clock();
  private time = 0;
  private emitAt = 0;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.theme = options.theme;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 600, container.clientHeight || 400);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(64, (container.clientWidth || 600) / (container.clientHeight || 400), 0.1, 260);

    this.scene.add(this.surface, this.cave, this.liveGroup, this.player);
    this.cave.visible = false;

    this.applySurfaceSky();
    this.buildLights();
    this.buildSurface();
    this.buildCave();
    this.buildPlayer(options.characterAsset);

    this.position.set(0, 0, 12);
    this.yaw = Math.PI;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    if (import.meta.env.DEV) (window as unknown as { __ISLAND: IslandWorldEngine }).__ISLAND = this;
    this.emit();   // hand the HUD its opening state right away
    this.loop();
  }

  // ---- scene building ----------------------------------------------------

  private track<T extends { dispose: () => void }>(item: T): T { this.disposables.push(item); return item; }

  private applySurfaceSky() {
    this.scene.background = new THREE.Color(this.theme.skyBottom);
    this.scene.fog = new THREE.Fog(this.theme.fog, 40, 150);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(this.theme.skyTop, this.theme.ground, this.theme.night ? 0.7 : 1.0));
    const sun = new THREE.DirectionalLight(this.theme.sun, this.theme.night ? 0.5 : 0.95);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(this.theme.ambient, this.theme.night ? 0.5 : 0.4));
  }

  /** A big gradient dome so the sky reads top-to-bottom, not a flat wash. */
  private buildSkyDome() {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, this.theme.skyTop);
      g.addColorStop(1, this.theme.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    const geo = this.track(new THREE.SphereGeometry(220, 24, 16));
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.surface.add(new THREE.Mesh(geo, mat));
  }

  private buildSurface() {
    this.buildSkyDome();
    const rand = mulberry32(this.options.islandId * 9161 + 7);

    // The sea around the island, and the island disc itself.
    const seaGeo = this.track(new THREE.CircleGeometry(230, 40));
    const seaMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.water }));
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6;
    this.surface.add(sea);

    const grassTex = pixelTexture(this.theme.ground, this.theme.groundDark, 'grass', 28, 28);
    const groundGeo = this.track(new THREE.CircleGeometry(WORLD_RADIUS + 8, 48));
    const groundMat = this.track(new THREE.MeshLambertMaterial({ map: grassTex }));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.surface.add(ground);

    // A soft shoreline ring so the island edge isn't a hard cut.
    const shoreGeo = this.track(new THREE.RingGeometry(WORLD_RADIUS + 6, WORLD_RADIUS + 12, 48));
    const shoreMat = this.track(new THREE.MeshBasicMaterial({ color: this.theme.waterFoam, transparent: true, opacity: 0.5 }));
    const shore = new THREE.Mesh(shoreGeo, shoreMat);
    shore.rotation.x = -Math.PI / 2; shore.position.y = -0.4;
    this.surface.add(shore);

    this.buildTrees(rand);
    this.buildWaterfall(rand);
    this.buildCaveEntrance(rand);
    this.buildSparkles();
    this.buildPickups(rand);
  }

  /** Cute low-poly trees: a trunk with two stacked foliage cones. */
  private buildTrees(rand: () => number) {
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 6));
    const coneLo = this.track(new THREE.ConeGeometry(2.0, 2.6, 7));
    const coneHi = this.track(new THREE.ConeGeometry(1.4, 2.2, 7));
    const trunkMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.trunk }));
    const leafMat1 = this.track(new THREE.MeshLambertMaterial({ color: this.theme.foliage1 }));
    const leafMat2 = this.track(new THREE.MeshLambertMaterial({ color: this.theme.foliage2 }));
    const bushGeo = this.track(new THREE.SphereGeometry(1.1, 8, 6));

    for (let i = 0; i < 150; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = 6 + rand() * (WORLD_RADIUS - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z - 12) < 5) continue;   // keep the spawn clear
      const s = 0.7 + rand() * 0.8;
      if (rand() < 0.22) {
        // A round bush for variety.
        const bush = new THREE.Mesh(bushGeo, rand() < 0.5 ? leafMat1 : leafMat2);
        bush.scale.setScalar(s); bush.position.set(x, s * 0.7, z);
        this.surface.add(bush);
        continue;
      }
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      const lo = new THREE.Mesh(coneLo, leafMat1); lo.position.y = 3.0;
      const hi = new THREE.Mesh(coneHi, leafMat2); hi.position.y = 4.4;
      tree.add(trunk, lo, hi);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(s);
      tree.rotation.y = rand() * Math.PI;
      this.surface.add(tree);
    }
  }

  /** A rock cliff with an animated sheet of falling water and a splash pool. */
  private buildWaterfall(rand: () => number) {
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * (WORLD_RADIUS - 12), z = Math.sin(a) * (WORLD_RADIUS - 12);
    this.waterfallAt.set(x, 0, z);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.lookAt(0, 0, 0);

    const rockMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.rock }));
    for (let i = 0; i < 5; i += 1) {
      const w = 4 - i * 0.4;
      const geo = this.track(new THREE.BoxGeometry(w, 2.4, 3));
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set((rand() - 0.5) * 1.2, 1.2 + i * 2.1, -1 - i * 0.5);
      group.add(rock);
    }

    // A scrolling canvas of white streaks — the falling water.
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 64;
    this.waterfallTex = this.track(new THREE.CanvasTexture(canvas));
    this.paintWaterfall(0);
    this.waterfallTex.wrapS = this.waterfallTex.wrapT = THREE.RepeatWrapping;
    const fallGeo = this.track(new THREE.PlaneGeometry(3.2, 11));
    const fallMat = this.track(new THREE.MeshBasicMaterial({ map: this.waterfallTex, transparent: true, opacity: 0.9, depthWrite: false }));
    const fall = new THREE.Mesh(fallGeo, fallMat);
    fall.position.set(0, 5.6, 0.7);
    group.add(fall);

    const poolGeo = this.track(new THREE.CircleGeometry(4, 24));
    const poolMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.water, transparent: true, opacity: 0.85 }));
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.05, 2);
    group.add(pool);

    // A puff of mist points at the base.
    const mistGeo = this.track(new THREE.BufferGeometry());
    const pts = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i += 1) { pts[i * 3] = (rand() - 0.5) * 3; pts[i * 3 + 1] = rand() * 2; pts[i * 3 + 2] = 1 + rand() * 2; }
    mistGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mistMat = this.track(new THREE.PointsMaterial({ color: this.theme.waterFoam, size: 0.9, transparent: true, opacity: 0.5, depthWrite: false }));
    group.add(new THREE.Points(mistGeo, mistMat));

    this.surface.add(group);
  }

  /** Redraw the waterfall streaks scrolled by `t`, for the falling illusion. */
  private paintWaterfall(t: number) {
    const canvas = this.waterfallTex?.image as HTMLCanvasElement | undefined;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, 32, 64);
    ctx.fillStyle = this.theme.water;
    ctx.globalAlpha = 0.7; ctx.fillRect(0, 0, 32, 64); ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.waterFoam;
    for (let i = 0; i < 8; i += 1) {
      const x = (i * 4 + 1) % 32;
      const y = (i * 13 + t * 90) % 64;
      ctx.fillRect(x, y, 2, 10);
      ctx.fillRect((x + 2) % 32, (y + 32) % 64, 2, 8);
    }
    if (this.waterfallTex) this.waterfallTex.needsUpdate = true;
  }

  /** A mossy mound with a dark doorway you can walk into. */
  private buildCaveEntrance(rand: () => number) {
    const a = rand() * Math.PI * 2 + 2;
    const x = Math.cos(a) * (WORLD_RADIUS - 18), z = Math.sin(a) * (WORLD_RADIUS - 18);
    this.caveEntry.set(x, 0, z);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.lookAt(0, 0, 0);

    const rockMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.rock }));
    const moundGeo = this.track(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    const mound = new THREE.Mesh(moundGeo, rockMat);
    group.add(mound);

    const archGeo = this.track(new THREE.CircleGeometry(1.7, 20, 0, Math.PI));
    const archMat = this.track(new THREE.MeshBasicMaterial({ color: '#050608' }));
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(0, 0.05, 4.4);
    group.add(arch);

    // A glowing rune over the door so it's easy to spot.
    const glow = this.track(new THREE.PointLight(this.theme.caveGlow, 3, 12, 2));
    glow.position.set(0, 3, 4);
    group.add(glow);
    group.add(this.emojiSprite('💎', 1.6, 0, 3.4, 4.6));

    this.surface.add(group);
  }

  private buildSparkles() {
    const geo = this.track(new THREE.BufferGeometry());
    const n = 220;
    const pts = new Float32Array(n * 3);
    const rand = mulberry32(this.options.islandId * 13 + 1);
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2, r = rand() * WORLD_RADIUS;
      pts[i * 3] = Math.cos(a) * r;
      pts[i * 3 + 1] = 0.6 + rand() * 7;
      pts[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = this.track(new THREE.PointsMaterial({ color: this.theme.glow, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false }));
    this.sparkles = new THREE.Points(geo, mat);
    this.surface.add(this.sparkles);
  }

  /** An emoji drawn onto a canvas sprite — cute, cheap, always faces you. */
  private emojiSprite(emoji: string, scale: number, x = 0, y = 0, z = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.font = '52px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, 32, 36); }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    const mat = this.track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(scale);
    sprite.position.set(x, y, z);
    return sprite;
  }

  private scatterPickups(rand: () => number, emoji: string, count: number, scale: number, y: number, into: THREE.Group): Pickup[] {
    const out: Pickup[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2, r = 5 + rand() * (WORLD_RADIUS - 6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const sprite = this.emojiSprite(emoji, scale, x, y, z);
      into.add(sprite);
      out.push({ sprite, base: y, seed: rand() * 6.28, taken: false });
    }
    return out;
  }

  private buildPickups(rand: () => number) {
    this.stars = this.scatterPickups(rand, '⭐', 26, 1.3, 1.4, this.surface);
    this.trinkets = this.scatterPickups(rand, this.theme.trinket, 18, 1.1, 0.9, this.surface);
  }

  /** The underground crystal cave — a dark ring of rock with glowing gems. */
  private buildCave() {
    const rand = mulberry32(this.options.islandId * 733 + 3);
    const floorGeo = this.track(new THREE.CircleGeometry(CAVE_RADIUS + 2, 32));
    const floorMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.caveWall }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.cave.add(floor);

    const wallGeo = this.track(new THREE.CylinderGeometry(CAVE_RADIUS + 2, CAVE_RADIUS + 2, 12, 32, 1, true));
    const wallMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.caveWall, side: THREE.BackSide }));
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 6;
    this.cave.add(wall);

    const roofGeo = this.track(new THREE.CircleGeometry(CAVE_RADIUS + 2, 32));
    const roof = new THREE.Mesh(roofGeo, wallMat);
    roof.rotation.x = Math.PI / 2; roof.position.y = 12;
    this.cave.add(roof);

    // Ambient cave light + a soft central glow.
    this.cave.add(new THREE.AmbientLight(this.theme.caveGlow, 0.45));
    const core = this.track(new THREE.PointLight(this.theme.caveGlow, 2.4, 40, 2));
    core.position.set(0, 6, 0);
    this.cave.add(core);

    // Stalagmites.
    const spikeMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.rock }));
    for (let i = 0; i < 16; i += 1) {
      const a = rand() * Math.PI * 2, r = 4 + rand() * (CAVE_RADIUS - 3);
      const h = 1 + rand() * 3;
      const geo = this.track(new THREE.ConeGeometry(0.6 + rand() * 0.5, h, 6));
      const spike = new THREE.Mesh(geo, spikeMat);
      spike.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      this.cave.add(spike);
    }

    // Glowing crystals to mine — the cave collectible.
    const crystalGeo = this.track(new THREE.OctahedronGeometry(0.55));
    for (let i = 0; i < 14; i += 1) {
      const a = rand() * Math.PI * 2, r = 3 + rand() * (CAVE_RADIUS - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const mat = this.track(new THREE.MeshStandardMaterial({ color: this.theme.caveGlow, emissive: this.theme.caveGlow, emissiveIntensity: 0.9, roughness: 0.3 }));
      const crystal = new THREE.Mesh(crystalGeo, mat);
      crystal.position.set(x, 0.7, z);
      this.cave.add(crystal);
      // A crystal Mesh stands in for the Pickup's sprite — both expose the
      // position / visible / rotation the collect + animate helpers touch.
      this.gems.push({ sprite: crystal as unknown as THREE.Sprite, base: 0.7, seed: rand() * 6.28, taken: false });
    }

    // The way back up.
    this.caveExit.set(0, 0, CAVE_RADIUS - 2);
    const portal = this.emojiSprite('🪜', 2, 0, 1.6, CAVE_RADIUS - 2);
    this.cave.add(portal);
    const exitGlow = this.track(new THREE.PointLight('#fff0c0', 2, 12, 2));
    exitGlow.position.set(0, 2, CAVE_RADIUS - 2);
    this.cave.add(exitGlow);
  }

  private buildPlayer(asset: string) {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(asset);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
    const mat = this.track(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.1, 2.1, 1);
    sprite.position.y = 1.15;
    this.player.add(sprite);

    // A soft shadow blob so the character sits on the ground.
    const shadowGeo = this.track(new THREE.CircleGeometry(0.8, 16));
    const shadowMat = this.track(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05;
    this.player.add(shadow);
  }

  // ---- live players ------------------------------------------------------

  private nameSprite(text: string, hue: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#101018e0'; ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = `hsl(${hue},70%,60%)`; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 250, 58);
      ctx.font = 'bold 26px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(text.slice(0, 16), 128, 34);
    }
    const mat = this.track(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1); sprite.position.y = 3;
    return sprite;
  }

  private buildLiveFigure(id: string, name: string): THREE.Group {
    const hue = hashHue(id);
    const group = new THREE.Group();
    const body = this.track(new THREE.MeshStandardMaterial({ color: `hsl(${hue},62%,58%)`, emissive: `hsl(${hue},60%,25%)`, emissiveIntensity: 0.5, roughness: 0.6 }));
    const skin = this.track(new THREE.MeshLambertMaterial({ color: '#e7c8b0' }));
    const torsoGeo = this.track(new THREE.BoxGeometry(0.6, 1, 0.35));
    const headGeo = this.track(new THREE.BoxGeometry(0.55, 0.55, 0.55));
    const limbGeo = this.track(new THREE.BoxGeometry(0.16, 0.6, 0.16));
    const torso = new THREE.Mesh(torsoGeo, body); torso.position.y = 1.1;
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.9;
    group.add(torso, head);
    [[-0.38, 1.1], [0.38, 1.1], [-0.16, 0.35], [0.16, 0.35]].forEach(([x, y]) => {
      const limb = new THREE.Mesh(limbGeo, body); limb.position.set(x, y, 0); group.add(limb);
    });
    group.add(this.nameSprite(`@${name}`, hue));
    return group;
  }

  getSelfState() {
    return { x: this.position.x, z: this.position.z, yaw: this.yaw, level: this.options.islandId };
  }

  /** The nearest thing worth collecting right now (stars above, gems below). */
  private nearestPickup(): THREE.Object3D | null {
    const list = this.underground ? this.gems : this.stars;
    let best: THREE.Object3D | null = null; let bestD = Infinity;
    for (const item of list) {
      if (item.taken) continue;
      const o = item.sprite as unknown as THREE.Object3D;
      const d = Math.hypot(o.position.x - this.position.x, o.position.z - this.position.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  /** Hint Potion: shine a bright beacon over the nearest star for a few seconds. */
  showHint() {
    const target = this.nearestPickup();
    if (!target) return;
    if (!this.beacon) {
      const geo = this.track(new THREE.CylinderGeometry(0.5, 0.5, 20, 8, 1, true));
      const mat = this.track(new THREE.MeshBasicMaterial({ color: this.theme.glow, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      this.beacon = new THREE.Mesh(geo, mat);
      this.scene.add(this.beacon);
    }
    this.beacon.position.set(target.position.x, 10, target.position.z);
    this.beacon.visible = true;
    this.hintUntil = this.time + 7;
  }

  /** Bubble Potion: a protective bubble around you for `sec` seconds. */
  activateBubble(sec = 20) {
    if (!this.bubbleMesh) {
      const geo = this.track(new THREE.SphereGeometry(1.7, 16, 12));
      const mat = this.track(new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.24, depthWrite: false }));
      this.bubbleMesh = new THREE.Mesh(geo, mat);
      this.bubbleMesh.position.y = 1.1;
      this.player.add(this.bubbleMesh);
    }
    this.bubbleMesh.visible = true;
    this.bubbleUntil = this.time + sec;
  }

  /** Star Sword: draw a glowing blade and move faster for `sec` seconds. */
  equipWeapon(sec = 20) {
    if (!this.weaponSprite) {
      this.weaponSprite = this.emojiSprite('⚔️', 1.3, 0.95, 1.15, 0);
      this.player.add(this.weaponSprite);
    }
    this.weaponSprite.visible = true;
    this.weaponUntil = this.time + sec;
  }

  /** Draw the real players where they say they are (only on this island). */
  setLivePlayers(players: Array<{ id: string; name: string; x: number; z: number; yaw: number; level: number }>) {
    const here = new Set<string>();
    players.forEach((p) => {
      if (p.level !== this.options.islandId) return;
      here.add(p.id);
      let live = this.livePlayers.get(p.id);
      if (!live) {
        const group = this.buildLiveFigure(p.id, p.name);
        this.liveGroup.add(group);
        live = { group, pos: new THREE.Vector3(p.x, 0, p.z), target: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, targetYaw: p.yaw };
        this.livePlayers.set(p.id, live);
      }
      live.target.set(p.x, 0, p.z);
      live.targetYaw = p.yaw;
    });
    this.livePlayers.forEach((live, id) => {
      if (here.has(id)) return;
      this.liveGroup.remove(live.group);
      this.livePlayers.delete(id);
    });
  }

  // ---- input & actions ---------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Space') this.useSpace();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private useSpace() {
    if (!this.underground && this.position.distanceTo(this.caveEntry) < 4) { this.enterCave(); return; }
    if (this.underground && new THREE.Vector3(this.position.x, 0, this.position.z).distanceTo(this.caveExit) < 3) this.exitCave();
  }

  private enterCave() {
    this.underground = true;
    this.visitedCave = true;
    this.surface.visible = false;
    this.liveGroup.visible = false;
    this.cave.visible = true;
    this.scene.background = new THREE.Color(this.theme.caveWall);
    this.scene.fog = new THREE.Fog(this.theme.caveWall, 8, 34);
    this.position.set(0, 0, CAVE_RADIUS - 4);
    this.yaw = 0;
  }

  private exitCave() {
    this.underground = false;
    this.cave.visible = false;
    this.surface.visible = true;
    this.liveGroup.visible = true;
    this.applySurfaceSky();
    this.position.copy(this.caveEntry).add(new THREE.Vector3(0, 0, 0));
    // Step back out toward the island centre so you don't re-trigger the door.
    const toCentre = new THREE.Vector3(-this.caveEntry.x, 0, -this.caveEntry.z).normalize().multiplyScalar(5);
    this.position.add(toCentre);
    this.yaw = Math.atan2(-this.position.x, -this.position.z);
  }

  // ---- per-frame ---------------------------------------------------------

  private movePlayer(dt: number) {
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    const fwd = k.has('ArrowUp') || k.has('KeyW');
    const back = k.has('ArrowDown') || k.has('KeyS');
    if (left) this.yaw += TURN_SPEED * dt;
    if (right) this.yaw -= TURN_SPEED * dt;
    let move = 0;
    if (fwd) move += 1;
    if (back) move -= 0.6;
    if (move !== 0) {
      const speed = PLAYER_SPEED * (this.time < this.weaponUntil ? 1.5 : 1);   // sword speeds you up
      const nx = this.position.x - Math.sin(this.yaw) * speed * move * dt;
      const nz = this.position.z - Math.cos(this.yaw) * speed * move * dt;
      const limit = this.underground ? CAVE_RADIUS - 1 : WORLD_RADIUS;
      const d = Math.hypot(nx, nz);
      if (d <= limit) { this.position.x = nx; this.position.z = nz; }
      else { this.position.x = (nx / d) * limit; this.position.z = (nz / d) * limit; }
    }
    this.player.position.set(this.position.x, 0, this.position.z);
  }

  private followCamera(dt: number) {
    const target = new THREE.Vector3(
      this.position.x + Math.sin(this.yaw) * CAM_BACK,
      CAM_HEIGHT,
      this.position.z + Math.cos(this.yaw) * CAM_BACK,
    );
    this.camera.position.lerp(target, Math.min(1, dt * 5));
    this.camera.lookAt(this.position.x, 1.2, this.position.z);
  }

  private collect(list: Pickup[], radius: number, value: number, onGot: () => void) {
    for (const item of list) {
      if (item.taken) continue;
      const obj = item.sprite;
      const dx = obj.position.x - this.position.x;
      const dz = obj.position.z - this.position.z;
      if (Math.hypot(dx, dz) < radius) {
        item.taken = true;
        obj.visible = false;
        this.earned += value;
        onGot();
      }
    }
  }

  private animatePickups(list: Pickup[], dt: number) {
    for (const item of list) {
      if (item.taken) continue;
      item.sprite.position.y = item.base + Math.sin(this.time * 2 + item.seed) * 0.18;
      // Spinning only matters for the 3-D crystals, but harmless on sprites.
      (item.sprite as unknown as THREE.Object3D).rotation.y += dt * 1.5;
    }
  }

  private moveLivePlayers(dt: number) {
    this.livePlayers.forEach((live) => {
      live.pos.lerp(live.target, Math.min(1, dt * 8));
      live.group.position.copy(live.pos);
      live.group.rotation.y = live.targetYaw;
    });
  }

  private computePrompt() {
    if (!this.underground && this.position.distanceTo(this.caveEntry) < 4) this.prompt = '🕳️ Press Space to enter the cave';
    else if (this.underground && new THREE.Vector3(this.position.x, 0, this.position.z).distanceTo(this.caveExit) < 3) this.prompt = '🪜 Press Space to climb back up';
    else if (!this.underground && this.position.distanceTo(this.waterfallAt) < 7) this.prompt = '💧 A magical waterfall!';
    else this.prompt = '';
    if (!this.underground && this.position.distanceTo(this.waterfallAt) < 7) this.visitedWaterfall = true;
  }

  private emit() {
    this.options.onUpdate({
      earned: this.earned,
      stars: this.starCount, trinkets: this.trinketCount, gems: this.gemCount,
      underground: this.underground, visitedCave: this.visitedCave, visitedWaterfall: this.visitedWaterfall,
      livePlayers: this.livePlayers.size, prompt: this.prompt,
      bubbleLeft: Math.max(0, Math.ceil(this.bubbleUntil - this.time)),
      weaponLeft: Math.max(0, Math.ceil(this.weaponUntil - this.time)),
      hintActive: this.time < this.hintUntil,
    });
  }

  /** Expire the timed consumables and gently spin the hint beacon. */
  private tickConsumables(dt: number) {
    if (this.beacon) { if (this.time > this.hintUntil) this.beacon.visible = false; else this.beacon.rotation.y += dt; }
    if (this.bubbleMesh && this.time > this.bubbleUntil) this.bubbleMesh.visible = false;
    if (this.weaponSprite && this.time > this.weaponUntil) this.weaponSprite.visible = false;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    this.movePlayer(dt);
    this.followCamera(dt);
    this.moveLivePlayers(dt);

    if (this.underground) {
      this.animatePickups(this.gems, dt);
      this.collect(this.gems, 1.5, GEM_VALUE, () => { this.gemCount += 1; });
    } else {
      this.animatePickups(this.stars, dt);
      this.animatePickups(this.trinkets, dt);
      this.collect(this.stars, 1.5, STAR_VALUE, () => { this.starCount += 1; });
      this.collect(this.trinkets, 1.5, TRINKET_VALUE, () => { this.trinketCount += 1; });
      if (this.sparkles) this.sparkles.rotation.y += dt * 0.05;
      this.paintWaterfall(this.time);
    }

    this.tickConsumables(dt);
    this.computePrompt();
    if (this.time - this.emitAt > 0.15) { this.emitAt = this.time; this.emit(); }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
