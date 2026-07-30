import * as THREE from 'three';
import { STAR_VALUE, TRINKET_VALUE, GEM_VALUE, BURIED_VALUE, type WorldTheme, type TreeStyle } from './islandWorld';

export interface WorldSnapshot {
  /** Star-points earned from pickups this visit — the page banks the growth. */
  earned: number;
  stars: number;      // loose ⭐ picked up
  trinkets: number;   // themed ground collectibles picked up
  gems: number;       // cave crystals mined
  dug: number;        // blocks of earth dug up
  placed: number;     // blocks you've built
  explored: number;   // furthest you've wandered from the shore, in steps
  caveDepth: number;  // how many levels deep in the cave (1 = top)
  stunned: boolean;   // briefly dazed from a bonk
  underground: boolean;
  visitedCave: boolean;
  visitedWaterfall: boolean;
  livePlayers: number;
  prompt: string;
  bubbleLeft: number;
  weaponLeft: number;
  hintActive: boolean;
}

interface EngineOptions {
  theme: WorldTheme;
  characterAsset: string;
  islandId: number;
  onUpdate: (snapshot: WorldSnapshot) => void;
}

interface Pickup { obj: THREE.Object3D; base: number; seed: number; taken: boolean; value: number }
interface LiveFigure { group: THREE.Group; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; targetYaw: number }
interface Chunk { group: THREE.Group; pickups: Pickup[] }

const CHUNK = 16;           // world units per streamed chunk
const LOAD_RADIUS = 3;      // chunks kept loaded around you (endless world)
const PLAYER_SPEED = 9;
const TURN_SPEED = 2.6;
const CAM_BACK = 8;
const CAM_HEIGHT = 5;
const CAVE_RADIUS = 15;
const MAX_PITS = 140;

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Seeded RNG so a chunk always generates the same trees & stars. */
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
  private avatar = new THREE.Group();
  private liveGroup = new THREE.Group();
  private chunkGroup = new THREE.Group();
  private pitGroup = new THREE.Group();

  private position = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();
  private walkPhase = 0;
  private limbs: { legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group } | null = null;

  // Shared building blocks, made once and reused across every chunk.
  private shared!: {
    trunk: THREE.Material; leaf1: THREE.Material; leaf2: THREE.Material; cap: THREE.Material;
    crystal: THREE.Material; rock: THREE.Material;
    trunkGeo: THREE.BufferGeometry; coneGeo: THREE.BufferGeometry; ballGeo: THREE.BufferGeometry;
    crystalGeo: THREE.BufferGeometry; rockGeo: THREE.BufferGeometry; frondGeo: THREE.BufferGeometry;
  };

  private ground!: THREE.Mesh;
  private chunks = new Map<string, Chunk>();
  private stars: Pickup[] = [];      // active surface pickups from loaded chunks
  private buried: Pickup[] = [];     // treasure dug out of the ground (dropped when grabbed)
  private gems: Pickup[] = [];
  private takenIds = new Set<string>();
  private dugCells = new Set<string>();
  private pits: THREE.Mesh[] = [];
  private placedCells = new Map<string, THREE.Mesh>();
  private placedGroup = new THREE.Group();
  private placedCount = 0;
  private caveDepth = 1;
  private caveContent = new THREE.Group();
  private stunUntil = 0;
  private attackReadyAt = 0;

  private earned = 0;
  private starCount = 0;
  private trinketCount = 0;
  private gemCount = 0;
  private dugCount = 0;
  private explored = 0;
  private underground = false;
  private visitedCave = false;
  private visitedWaterfall = false;
  private prompt = '';

  private caveEntry = new THREE.Vector3(0, 0, -34);
  private waterfallAt = new THREE.Vector3(40, 0, 8);
  private caveExit = new THREE.Vector3(0, 0, CAVE_RADIUS - 2);
  private waterfallTex: THREE.CanvasTexture | null = null;
  private sparkles: THREE.Points | null = null;

  private livePlayers = new Map<string, LiveFigure>();
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

    this.camera = new THREE.PerspectiveCamera(64, (container.clientWidth || 600) / (container.clientHeight || 400), 0.1, 320);

    this.scene.add(this.surface, this.cave, this.liveGroup, this.avatar);
    this.surface.add(this.chunkGroup, this.pitGroup, this.placedGroup);
    this.cave.add(this.caveContent);
    this.cave.visible = false;

    this.applySurfaceSky();
    this.buildLights();
    this.buildSharedParts();
    this.buildGround();
    this.buildWaterfall();
    this.buildCaveEntranceMound();
    this.buildSparkles();
    this.buildCave();
    this.buildAvatar(options.characterAsset);

    this.position.set(0, 0, 12);
    this.yaw = Math.PI;
    this.updateChunks();
    // Place the camera correctly on the very first frame (no swoop from origin).
    this.camera.position.set(this.position.x + Math.sin(this.yaw) * CAM_BACK, CAM_HEIGHT, this.position.z + Math.cos(this.yaw) * CAM_BACK);
    this.camera.lookAt(this.position.x, 1.2, this.position.z);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    if (import.meta.env.DEV) (window as unknown as { __ISLAND: IslandWorldEngine }).__ISLAND = this;
    this.emit();
    this.loop();
  }

  private track<T extends { dispose: () => void }>(item: T): T { this.disposables.push(item); return item; }

  private applySurfaceSky() {
    this.scene.background = new THREE.Color(this.theme.skyBottom);
    this.scene.fog = new THREE.Fog(this.theme.fog, 46, 165);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(this.theme.skyTop, this.theme.ground, this.theme.night ? 0.75 : 1.05));
    const sun = new THREE.DirectionalLight(this.theme.sun, this.theme.night ? 0.5 : 0.95);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(this.theme.ambient, this.theme.night ? 0.5 : 0.4));
  }

  private buildSkyDome() {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, this.theme.skyTop); g.addColorStop(1, this.theme.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 128);
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    const geo = this.track(new THREE.SphereGeometry(280, 24, 16));
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    const dome = new THREE.Mesh(geo, mat);
    dome.userData.follow = true;   // keep centred on the player so it's endless
    this.surface.add(dome);
    this.skyDome = dome;
  }
  private skyDome: THREE.Mesh | null = null;

  /** One flat, endless grass field that follows you (fog hides the far edge). */
  private buildGround() {
    this.buildSkyDome();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = this.theme.ground; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = this.theme.groundDark;
      [[2, 3], [7, 1], [12, 5], [4, 9], [10, 11], [14, 13], [1, 14], [8, 6], [5, 5]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    tex.magFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(120, 120);
    const geo = this.track(new THREE.PlaneGeometry(480, 480));
    const mat = this.track(new THREE.MeshLambertMaterial({ map: tex }));
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.surface.add(this.ground);
  }

  private buildSharedParts() {
    const t = this.theme;
    this.shared = {
      trunk: this.track(new THREE.MeshLambertMaterial({ color: t.trunk })),
      leaf1: this.track(new THREE.MeshLambertMaterial({ color: t.foliage1 })),
      leaf2: this.track(new THREE.MeshLambertMaterial({ color: t.foliage2 })),
      cap: this.track(new THREE.MeshLambertMaterial({ color: t.glow })),
      crystal: this.track(new THREE.MeshStandardMaterial({ color: t.caveGlow, emissive: t.caveGlow, emissiveIntensity: 0.7, roughness: 0.3 })),
      rock: this.track(new THREE.MeshLambertMaterial({ color: t.rock })),
      trunkGeo: this.track(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 6)),
      coneGeo: this.track(new THREE.ConeGeometry(1.8, 2.6, 7)),
      ballGeo: this.track(new THREE.SphereGeometry(1.4, 8, 6)),
      crystalGeo: this.track(new THREE.OctahedronGeometry(1)),
      rockGeo: this.track(new THREE.DodecahedronGeometry(0.9)),
      frondGeo: this.track(new THREE.ConeGeometry(0.5, 2.4, 5)),
    };
    this.pitGeo = this.track(new THREE.BoxGeometry(0.95, 1, 0.95));
    this.pitMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.dirt }));
    this.blockGeo = this.track(new THREE.BoxGeometry(0.98, 1, 0.98));
    this.blockMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.foliage1 }));
  }
  private pitGeo!: THREE.BufferGeometry;
  private pitMat!: THREE.Material;
  private blockGeo!: THREE.BufferGeometry;
  private blockMat!: THREE.Material;

  /** A themed tree — every biome has its own signature shape. */
  private buildTree(style: TreeStyle, rand: () => number): THREE.Group {
    const s = this.shared;
    const g = new THREE.Group();
    const trunk = () => { const m = new THREE.Mesh(s.trunkGeo, s.trunk); m.position.y = 1.2; g.add(m); };
    if (style === 'round') {
      trunk();
      const a = new THREE.Mesh(s.ballGeo, s.leaf1); a.position.y = 3; g.add(a);
      const b = new THREE.Mesh(s.ballGeo, s.leaf2); b.position.y = 4.1; b.scale.setScalar(0.75); g.add(b);
    } else if (style === 'pine') {
      trunk();
      for (let i = 0; i < 3; i += 1) { const c = new THREE.Mesh(s.coneGeo, s.leaf1); c.position.y = 2.6 + i * 1.1; c.scale.setScalar(1 - i * 0.24); g.add(c); }
    } else if (style === 'willow') {
      trunk();
      const cap = new THREE.Mesh(s.ballGeo, s.leaf2); cap.position.y = 3.4; cap.scale.set(1.6, 1.1, 1.6); g.add(cap);
      for (let i = 0; i < 5; i += 1) { const d = new THREE.Mesh(s.ballGeo, s.leaf1); const a = (i / 5) * Math.PI * 2; d.position.set(Math.cos(a) * 1.6, 2.2, Math.sin(a) * 1.6); d.scale.set(0.3, 0.9, 0.3); g.add(d); }
    } else if (style === 'mushroom') {
      const stalk = new THREE.Mesh(s.trunkGeo, s.leaf2); stalk.scale.set(1.1, 1.1, 1.1); stalk.position.y = 1.3; g.add(stalk);
      const cap = new THREE.Mesh(s.ballGeo, s.cap); cap.position.y = 3; cap.scale.set(1.5, 0.9, 1.5); g.add(cap);
    } else if (style === 'crystal') {
      for (let i = 0; i < 3; i += 1) { const c = new THREE.Mesh(s.crystalGeo, s.crystal); c.position.set((rand() - 0.5) * 1.2, 0.8 + i * 1.1, (rand() - 0.5) * 1.2); c.scale.setScalar(1 - i * 0.22); g.add(c); }
    } else { // palm
      const st = new THREE.Mesh(s.trunkGeo, s.trunk); st.scale.set(0.7, 1.7, 0.7); st.position.y = 2; st.rotation.z = 0.12; g.add(st);
      for (let i = 0; i < 6; i += 1) { const f = new THREE.Mesh(s.frondGeo, s.leaf1); const a = (i / 6) * Math.PI * 2; f.position.set(Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9); f.rotation.z = Math.cos(a) * 0.9; f.rotation.x = Math.sin(a) * 0.9; g.add(f); }
    }
    return g;
  }

  // One shared material per emoji, so thousands of streamed plants/stars don't
  // each allocate a texture. Sprites carry their own scale/position/visibility.
  private emojiMats = new Map<string, THREE.SpriteMaterial>();
  private emojiSprite(emoji: string, scale: number, x = 0, y = 0, z = 0) {
    let mat = this.emojiMats.get(emoji);
    if (!mat) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.font = '52px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, 32, 36); }
      mat = this.track(new THREE.SpriteMaterial({ map: this.track(new THREE.CanvasTexture(canvas)), transparent: true, depthWrite: false }));
      this.emojiMats.set(emoji, mat);
    }
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(scale);
    sprite.position.set(x, y, z);
    return sprite;
  }

  // ---- endless chunk streaming ------------------------------------------

  private chunkKey(cx: number, cz: number) { return `${cx},${cz}`; }

  /** Build all the trees, plants and pickups for one chunk of the world. */
  private makeChunk(cx: number, cz: number): Chunk {
    const rand = mulberry32((this.options.islandId * 92821) ^ (cx * 40503) ^ (cz * 12569) ^ 0x9e37);
    const group = new THREE.Group();
    const pickups: Pickup[] = [];
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const clearSpawn = cx === 0 && cz === 0;      // keep the drop-in point open

    const trees = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < trees; i += 1) {
      const x = ox + rand() * CHUNK, z = oz + rand() * CHUNK;
      if (clearSpawn && Math.hypot(x, z - 12) < 6) continue;
      const tree = this.buildTree(this.theme.treeStyle, rand);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.7 + rand() * 0.7);
      tree.rotation.y = rand() * Math.PI;
      group.add(tree);
    }
    for (let i = 0; i < 2; i += 1) {
      const rock = new THREE.Mesh(this.shared.rockGeo, this.shared.rock);
      rock.position.set(ox + rand() * CHUNK, 0.3, oz + rand() * CHUNK);
      rock.scale.setScalar(0.5 + rand() * 0.9);
      group.add(rock);
    }
    for (let i = 0; i < 6; i += 1) {
      group.add(this.emojiSprite(this.theme.flower, 0.7, ox + rand() * CHUNK, 0.4, oz + rand() * CHUNK));
    }
    // Loose stars + themed trinkets — the endless supply you explore for.
    const spawnPickup = (emoji: string, value: number, y: number, scale: number, tag: string) => {
      const x = ox + rand() * CHUNK, z = oz + rand() * CHUNK;
      const id = `${cx},${cz},${tag}`;
      if (this.takenIds.has(id)) return;
      const obj = this.emojiSprite(emoji, scale, x, y, z);
      group.add(obj);
      pickups.push({ obj, base: y, seed: rand() * 6.28, taken: false, value });
      obj.userData.pickupId = id;
    };
    for (let i = 0; i < 3; i += 1) spawnPickup('⭐', STAR_VALUE, 1.3, 1.2, `s${i}`);
    for (let i = 0; i < 2; i += 1) spawnPickup(this.theme.trinket, TRINKET_VALUE, 0.9, 1.0, `t${i}`);

    return { group, pickups };
  }

  /** Load chunks near the player, drop the far ones — an endless world. */
  private updateChunks() {
    if (this.underground) return;
    const pcx = Math.floor(this.position.x / CHUNK), pcz = Math.floor(this.position.z / CHUNK);
    const want = new Set<string>();
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx += 1) for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz += 1) {
      const cx = pcx + dx, cz = pcz + dz, key = this.chunkKey(cx, cz);
      want.add(key);
      if (!this.chunks.has(key)) {
        const chunk = this.makeChunk(cx, cz);
        this.chunkGroup.add(chunk.group);
        this.chunks.set(key, chunk);
        this.stars.push(...chunk.pickups.filter((p) => p.value !== GEM_VALUE));
      }
    }
    this.chunks.forEach((chunk, key) => {
      if (want.has(key)) return;
      this.chunkGroup.remove(chunk.group);
      this.stars = this.stars.filter((p) => !chunk.pickups.includes(p));
      this.chunks.delete(key);
    });
  }

  // ---- waterfall / cave / sparkles --------------------------------------

  private buildWaterfall() {
    const group = new THREE.Group();
    group.position.copy(this.waterfallAt);
    group.lookAt(this.waterfallAt.x - 1, 0, this.waterfallAt.z - 1);
    for (let i = 0; i < 5; i += 1) {
      const geo = this.track(new THREE.BoxGeometry(4 - i * 0.4, 2.4, 3));
      const rock = new THREE.Mesh(geo, this.shared.rock);
      rock.position.set((i % 2 - 0.5) * 1.2, 1.2 + i * 2.1, -1 - i * 0.5);
      group.add(rock);
    }
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 64;
    this.waterfallTex = this.track(new THREE.CanvasTexture(canvas));
    this.paintWaterfall(0);
    this.waterfallTex.wrapS = this.waterfallTex.wrapT = THREE.RepeatWrapping;
    const fall = new THREE.Mesh(this.track(new THREE.PlaneGeometry(3.2, 11)), this.track(new THREE.MeshBasicMaterial({ map: this.waterfallTex, transparent: true, opacity: 0.9, depthWrite: false })));
    fall.position.set(0, 5.6, 0.7); group.add(fall);
    const pool = new THREE.Mesh(this.track(new THREE.CircleGeometry(4, 20)), this.track(new THREE.MeshLambertMaterial({ color: this.theme.water, transparent: true, opacity: 0.85 })));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, 2); group.add(pool);
    this.surface.add(group);
  }

  private paintWaterfall(t: number) {
    const canvas = this.waterfallTex?.image as HTMLCanvasElement | undefined;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = this.theme.water; ctx.globalAlpha = 0.7; ctx.fillRect(0, 0, 32, 64); ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.waterFoam;
    for (let i = 0; i < 8; i += 1) {
      const x = (i * 4 + 1) % 32; const y = (i * 13 + t * 90) % 64;
      ctx.fillRect(x, y, 2, 10); ctx.fillRect((x + 2) % 32, (y + 32) % 64, 2, 8);
    }
    if (this.waterfallTex) this.waterfallTex.needsUpdate = true;
  }

  private buildCaveEntranceMound() {
    const group = new THREE.Group();
    group.position.copy(this.caveEntry);
    group.lookAt(0, 0, 0);
    const mound = new THREE.Mesh(this.track(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), this.shared.rock);
    group.add(mound);
    const arch = new THREE.Mesh(this.track(new THREE.CircleGeometry(1.7, 20, 0, Math.PI)), this.track(new THREE.MeshBasicMaterial({ color: '#050608' })));
    arch.position.set(0, 0.05, 4.4); group.add(arch);
    const glow = this.track(new THREE.PointLight(this.theme.caveGlow, 3, 12, 2)); glow.position.set(0, 3, 4); group.add(glow);
    group.add(this.emojiSprite('💎', 1.5, 0, 3.4, 4.6));
    this.surface.add(group);
  }

  private buildSparkles() {
    const geo = this.track(new THREE.BufferGeometry());
    const n = 260; const pts = new Float32Array(n * 3);
    const rand = mulberry32(this.options.islandId * 13 + 1);
    for (let i = 0; i < n; i += 1) { const a = rand() * Math.PI * 2, r = rand() * 90; pts[i * 3] = Math.cos(a) * r; pts[i * 3 + 1] = 0.6 + rand() * 9; pts[i * 3 + 2] = Math.sin(a) * r; }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = this.track(new THREE.PointsMaterial({ color: this.theme.glow, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false }));
    this.sparkles = new THREE.Points(geo, mat);
    this.sparkles.userData.follow = true;
    this.surface.add(this.sparkles);
  }

  private buildCave() {
    const floor = new THREE.Mesh(this.track(new THREE.CircleGeometry(CAVE_RADIUS + 2, 32)), this.track(new THREE.MeshLambertMaterial({ color: this.theme.caveWall })));
    floor.rotation.x = -Math.PI / 2; this.cave.add(floor);
    const wallMat = this.track(new THREE.MeshLambertMaterial({ color: this.theme.caveWall, side: THREE.BackSide }));
    const wall = new THREE.Mesh(this.track(new THREE.CylinderGeometry(CAVE_RADIUS + 2, CAVE_RADIUS + 2, 12, 32, 1, true)), wallMat);
    wall.position.y = 6; this.cave.add(wall);
    const roof = new THREE.Mesh(this.track(new THREE.CircleGeometry(CAVE_RADIUS + 2, 32)), wallMat);
    roof.rotation.x = Math.PI / 2; roof.position.y = 12; this.cave.add(roof);
    this.cave.add(new THREE.AmbientLight(this.theme.caveGlow, 0.5));
    const core = this.track(new THREE.PointLight(this.theme.caveGlow, 2.4, 40, 2)); core.position.set(0, 6, 0); this.cave.add(core);
    this.cave.add(this.emojiSprite('🪜', 2, 0, 1.6, CAVE_RADIUS - 2));
    const exitGlow = this.track(new THREE.PointLight('#fff0c0', 2, 12, 2)); exitGlow.position.set(0, 2, CAVE_RADIUS - 2); this.cave.add(exitGlow);
    this.populateCave();
  }

  /** Fill the cave for the current depth — deeper means more, bigger, richer crystals. */
  private populateCave() {
    // Clear the last level's contents and its gems.
    while (this.caveContent.children.length) this.caveContent.remove(this.caveContent.children[0]);
    this.gems = [];
    const depth = this.caveDepth;
    const rand = mulberry32(this.options.islandId * 733 + depth * 101 + 3);
    const spikeMat = this.shared.rock;
    for (let i = 0; i < 14 + depth * 2; i += 1) {
      const a = rand() * Math.PI * 2, r = 4 + rand() * (CAVE_RADIUS - 3), h = 1 + rand() * 3;
      const spike = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.6 + rand() * 0.5, h, 6)), spikeMat);
      spike.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); this.caveContent.add(spike);
    }
    const crystalGeo = this.track(new THREE.OctahedronGeometry(0.55));
    const value = Math.round(GEM_VALUE * (1 + (depth - 1) * 0.5));   // deeper crystals are worth more
    for (let i = 0; i < 12 + depth * 4; i += 1) {
      const a = rand() * Math.PI * 2, r = 3 + rand() * (CAVE_RADIUS - 4);
      const mat = this.track(new THREE.MeshStandardMaterial({ color: this.theme.caveGlow, emissive: this.theme.caveGlow, emissiveIntensity: 0.9, roughness: 0.3 }));
      const crystal = new THREE.Mesh(crystalGeo, mat);
      crystal.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r);
      crystal.scale.setScalar(1 + Math.min(1.2, (depth - 1) * 0.25));
      this.caveContent.add(crystal);
      this.gems.push({ obj: crystal, base: 0.7, seed: rand() * 6.28, taken: false, value });
    }
    // A "dig deeper" shaft glowing in the middle.
    const shaft = this.emojiSprite('🕳️', 2, 0, 0.4, 0);
    this.caveContent.add(shaft);
  }

  // ---- animated 3-D character -------------------------------------------

  private limb(w: number, h: number, d: number, mat: THREE.Material, px: number, py: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.y = -h / 2;   // hang below the pivot so it swings from the top
    pivot.add(mesh);
    return pivot;
  }

  private buildAvatar(asset: string) {
    const hue = hashHue(asset);
    const body = this.track(new THREE.MeshLambertMaterial({ color: `hsl(${hue},55%,60%)` }));
    const tex = new THREE.TextureLoader().load(asset);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter;
    const faceMat = this.track(new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
    const sideMat = this.track(new THREE.MeshLambertMaterial({ color: `hsl(${hue},45%,72%)` }));

    const torso = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.9, 1, 0.5)), body);
    torso.position.y = 1.15; this.avatar.add(torso);

    // Head: the character's art on the front & back faces so you always see them.
    const headGeo = this.track(new THREE.BoxGeometry(0.85, 0.85, 0.85));
    const head = new THREE.Mesh(headGeo, [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
    head.position.y = 2.05; this.avatar.add(head);

    const legL = this.limb(0.28, 0.9, 0.28, body, -0.22, 0.9);
    const legR = this.limb(0.28, 0.9, 0.28, body, 0.22, 0.9);
    const armL = this.limb(0.22, 0.85, 0.22, body, -0.62, 1.55);
    const armR = this.limb(0.22, 0.85, 0.22, body, 0.62, 1.55);
    this.avatar.add(legL, legR, armL, armR);
    this.limbs = { legL, legR, armL, armR };

    const shadow = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.8, 16)), this.track(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; this.avatar.add(shadow);
  }

  // ---- live players ------------------------------------------------------

  private nameSprite(text: string, hue: number) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#101018e0'; ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = `hsl(${hue},70%,60%)`; ctx.lineWidth = 5; ctx.strokeRect(3, 3, 250, 58);
      ctx.font = 'bold 26px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(text.slice(0, 16), 128, 34);
    }
    const mat = this.track(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    const sprite = new THREE.Sprite(mat); sprite.scale.set(3, 0.75, 1); sprite.position.y = 3; return sprite;
  }

  private buildLiveFigure(id: string, name: string): THREE.Group {
    const hue = hashHue(id);
    const group = new THREE.Group();
    const body = this.track(new THREE.MeshStandardMaterial({ color: `hsl(${hue},62%,58%)`, emissive: `hsl(${hue},60%,25%)`, emissiveIntensity: 0.5, roughness: 0.6 }));
    const skin = this.track(new THREE.MeshLambertMaterial({ color: '#e7c8b0' }));
    const torso = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.6, 1, 0.35)), body); torso.position.y = 1.1;
    const head = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.55, 0.55, 0.55)), skin); head.position.y = 1.9;
    group.add(torso, head);
    [[-0.38, 1.1], [0.38, 1.1], [-0.16, 0.35], [0.16, 0.35]].forEach(([x, y]) => { const l = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.16, 0.6, 0.16)), body); l.position.set(x, y, 0); group.add(l); });
    group.add(this.nameSprite(`@${name}`, hue));
    return group;
  }

  getSelfState() { return { x: this.position.x, z: this.position.z, yaw: this.yaw, level: this.options.islandId }; }

  setLivePlayers(players: Array<{ id: string; name: string; x: number; z: number; yaw: number; level: number }>) {
    const here = new Set<string>();
    players.forEach((p) => {
      if (p.level !== this.options.islandId) return;
      here.add(p.id);
      let live = this.livePlayers.get(p.id);
      if (!live) {
        const group = this.buildLiveFigure(p.id, p.name);
        group.userData.name = p.name;
        this.liveGroup.add(group);
        live = { group, pos: new THREE.Vector3(p.x, 0, p.z), target: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, targetYaw: p.yaw };
        this.livePlayers.set(p.id, live);
      }
      live.target.set(p.x, 0, p.z); live.targetYaw = p.yaw;
    });
    this.livePlayers.forEach((live, id) => { if (here.has(id)) return; this.liveGroup.remove(live.group); this.livePlayers.delete(id); });
  }

  // ---- input & actions ---------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyG'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Space') this.useSpace();
    if (event.code === 'KeyF') this.dig();
    if (event.code === 'KeyG') this.place();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private useSpace() {
    if (!this.underground && this.position.distanceTo(this.caveEntry) < 4) { this.enterCave(); return; }
    if (this.underground && new THREE.Vector3(this.position.x, 0, this.position.z).distanceTo(this.caveExit) < 3) this.exitCave();
  }

  private cellKey(x: number, z: number) { return `${Math.round(x)},${Math.round(z)}`; }

  /** The cell directly in front of the player (where you dig / place). */
  private frontCell(): { cx: number; cz: number } {
    return { cx: Math.round(this.position.x - Math.sin(this.yaw) * 1.1), cz: Math.round(this.position.z - Math.cos(this.yaw) * 1.1) };
  }

  /** Dig the square of earth in front of you — Minecraft-style. Underground, dig
   *  the central shaft to tunnel a level deeper. Sometimes there's buried treasure. */
  dig(): { dug: boolean; treasure: boolean; deeper?: number } {
    if (this.underground) {
      // Tunnel deeper if you're near the central shaft.
      if (Math.hypot(this.position.x, this.position.z) < 4) { this.caveDepth += 1; this.populateCave(); this.position.set(0, 0, 3); return { dug: true, treasure: false, deeper: this.caveDepth }; }
      return { dug: false, treasure: false };
    }
    let { cx, cz } = this.frontCell();
    // Digging a block you placed just removes it again.
    const placedKey = this.cellKey(cx, cz);
    const placed = this.placedCells.get(placedKey);
    if (placed) { this.placedGroup.remove(placed); this.placedCells.delete(placedKey); return { dug: true, treasure: false }; }
    if (this.dugCells.has(this.cellKey(cx, cz))) { cx = Math.round(this.position.x); cz = Math.round(this.position.z); }
    const key = this.cellKey(cx, cz);
    if (this.dugCells.has(key)) return { dug: false, treasure: false };
    this.dugCells.add(key);
    this.dugCount += 1;

    // The pit (shared geometry/material — cheap to make many).
    const pit = new THREE.Mesh(this.pitGeo, this.pitMat);
    pit.position.set(cx, -0.55, cz);
    this.pitGroup.add(pit);
    this.pits.push(pit);
    if (this.pits.length > MAX_PITS) { const old = this.pits.shift(); if (old) this.pitGroup.remove(old); }

    // Buried treasure — a gem or extra star every so often.
    const lucky = ((cx * 73856093) ^ (cz * 19349663) ^ this.options.islandId) >>> 0;
    const treasure = (lucky % 100) < 35;
    if (treasure) {
      const gem = (lucky % 3) === 0;
      const obj = this.emojiSprite(gem ? '💎' : '⭐', gem ? 1.1 : 1.2, cx, 0.3, cz);
      this.surface.add(obj);
      obj.userData.rise = this.time + 0.4;   // pop it up out of the hole
      this.buried.push({ obj, base: 0.9, seed: 0, taken: false, value: gem ? BURIED_VALUE : STAR_VALUE });
      // Never let uncollected treasure pile up forever during a long dig session.
      while (this.buried.length > 60) { const old = this.buried.shift(); if (old) this.surface.remove(old.obj); }
    }
    return { dug: true, treasure };
  }

  private enterCave() {
    this.underground = true; this.visitedCave = true;
    this.surface.visible = false; this.liveGroup.visible = false; this.cave.visible = true;
    this.scene.background = new THREE.Color(this.theme.caveWall);
    this.scene.fog = new THREE.Fog(this.theme.caveWall, 8, 34);
    this.position.set(0, 0, CAVE_RADIUS - 4); this.yaw = 0;
  }
  private exitCave() {
    this.underground = false; this.caveDepth = 1; this.populateCave();
    this.cave.visible = false; this.surface.visible = true; this.liveGroup.visible = true;
    this.applySurfaceSky();
    this.position.copy(this.caveEntry);
    this.position.add(new THREE.Vector3(-this.caveEntry.x, 0, -this.caveEntry.z).normalize().multiplyScalar(5));
    this.yaw = Math.atan2(-this.position.x, -this.position.z);
    this.updateChunks();
  }

  /** Place a grass block in front of you — build like Minecraft. */
  place(): boolean {
    if (this.underground) return false;
    const { cx, cz } = this.frontCell();
    const key = this.cellKey(cx, cz);
    if (this.placedCells.has(key)) return false;
    this.dugCells.delete(key);   // filling a pit back in
    const block = new THREE.Mesh(this.blockGeo, this.blockMat);
    block.position.set(cx, 0.5, cz);
    this.placedGroup.add(block);
    this.placedCells.set(key, block);
    this.placedCount += 1;
    return true;
  }

  isBubbled() { return this.time < this.bubbleUntil; }

  /** Swing your sword at the nearest live player in front — needs the sword equipped.
   *  Returns whom you hit so the page can tell them over the network. */
  attack(): { id: string; name: string } | null {
    if (this.underground) return null;
    if (this.time >= this.weaponUntil) return null;    // only when the Star Sword is drawn
    if (this.time < this.attackReadyAt) return null;   // brief cooldown
    this.attackReadyAt = this.time + 0.5;
    if (this.weaponSprite) this.weaponSprite.material.rotation = 0.9;   // a quick swing pose
    let result: { id: string; name: string } | null = null;
    let bestD = 3;   // must be within 3 units
    this.livePlayers.forEach((live, id) => {
      const d = Math.hypot(live.pos.x - this.position.x, live.pos.z - this.position.z);
      if (d < bestD) { bestD = d; result = { id, name: (live.group.userData.name as string) ?? 'player' }; }
    });
    return result;
  }

  /** You got bonked. If your bubble is up you're safe; otherwise you're knocked
   *  back and briefly dazed. Returns true if the hit landed. */
  takeHit(from: { x: number; z: number }): boolean {
    if (this.isBubbled()) return false;
    const dir = new THREE.Vector3(this.position.x - from.x, 0, this.position.z - from.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    dir.normalize().multiplyScalar(3.2);
    this.position.x += dir.x; this.position.z += dir.z;
    this.stunUntil = this.time + 1;
    return true;
  }

  // ---- per-frame ---------------------------------------------------------

  private movePlayer(dt: number) {
    const k = this.keys;
    const stunned = this.time < this.stunUntil;   // just got bonked — dazed for a moment
    const left = !stunned && (k.has('ArrowLeft') || k.has('KeyA'));
    const right = !stunned && (k.has('ArrowRight') || k.has('KeyD'));
    const fwd = !stunned && (k.has('ArrowUp') || k.has('KeyW'));
    const back = !stunned && (k.has('ArrowDown') || k.has('KeyS'));
    if (left) this.yaw += TURN_SPEED * dt;
    if (right) this.yaw -= TURN_SPEED * dt;
    if (stunned) this.avatar.rotation.y += dt * 8;   // dizzy spin
    let move = 0;
    if (fwd) move += 1;
    if (back) move -= 0.6;
    if (move !== 0) {
      const speed = PLAYER_SPEED * (this.time < this.weaponUntil ? 1.5 : 1);
      const nx = this.position.x - Math.sin(this.yaw) * speed * move * dt;
      const nz = this.position.z - Math.cos(this.yaw) * speed * move * dt;
      if (this.underground) {
        const d = Math.hypot(nx, nz);
        if (d <= CAVE_RADIUS - 1) { this.position.x = nx; this.position.z = nz; }
      } else {
        this.position.x = nx; this.position.z = nz;
        this.explored = Math.max(this.explored, Math.round(Math.hypot(nx, nz)));
      }
      this.walkPhase += dt * 9 * Math.abs(move);
    }
    // Place & face the avatar; animate the walk.
    this.avatar.position.set(this.position.x, 0, this.position.z);
    if (!stunned) this.avatar.rotation.y = this.yaw + Math.PI;
    if (this.limbs) {
      const moving = move !== 0;
      const swing = moving ? Math.sin(this.walkPhase) * 0.6 : this.limbs.legL.rotation.x * 0.8;
      this.limbs.legL.rotation.x = swing;
      this.limbs.legR.rotation.x = -swing;
      this.limbs.armL.rotation.x = -swing;
      this.limbs.armR.rotation.x = swing;
      this.avatar.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.12 : 0;   // a little bounce
    }
  }

  private followCamera(dt: number) {
    const target = new THREE.Vector3(this.position.x + Math.sin(this.yaw) * CAM_BACK, CAM_HEIGHT, this.position.z + Math.cos(this.yaw) * CAM_BACK);
    this.camera.position.lerp(target, Math.min(1, dt * 5));
    this.camera.lookAt(this.position.x, 1.2, this.position.z);
    // Keep the endless bits centred on the player.
    if (!this.underground) {
      this.ground.position.set(this.position.x, 0, this.position.z);
      const mat = this.ground.material as THREE.MeshLambertMaterial;
      if (mat.map) mat.map.offset.set(this.position.x / 4, -this.position.z / 4);
      if (this.skyDome) this.skyDome.position.set(this.position.x, 0, this.position.z);
      if (this.sparkles) this.sparkles.position.set(this.position.x, 0, this.position.z);
    }
  }

  private collect(list: Pickup[], radius: number, onGot: (value: number) => void) {
    for (const item of list) {
      if (item.taken) continue;
      const dx = item.obj.position.x - this.position.x, dz = item.obj.position.z - this.position.z;
      if (Math.hypot(dx, dz) < radius) {
        item.taken = true; item.obj.visible = false;
        this.earned += item.value; onGot(item.value);
        const id = item.obj.userData.pickupId as string | undefined;
        if (id) this.takenIds.add(id);
      }
    }
  }

  /** Buried treasure adds star-points but isn't a quest collectible, and is
   *  removed from the scene the moment you grab it so digging can't leak memory. */
  private collectBuried() {
    for (let i = this.buried.length - 1; i >= 0; i -= 1) {
      const item = this.buried[i];
      const dx = item.obj.position.x - this.position.x, dz = item.obj.position.z - this.position.z;
      if (Math.hypot(dx, dz) < 1.5) {
        this.earned += item.value;
        this.surface.remove(item.obj);
        this.buried.splice(i, 1);
      }
    }
  }

  private animatePickups(list: Pickup[], dt: number) {
    for (const item of list) {
      if (item.taken) continue;
      const rise = item.obj.userData.rise as number | undefined;
      if (rise && this.time < rise) item.obj.position.y = 0.3 + (item.base - 0.3) * (1 - (rise - this.time) / 0.4);
      else item.obj.position.y = item.base + Math.sin(this.time * 2 + item.seed) * 0.18;
      item.obj.rotation.y += dt * 1.5;
    }
  }

  private moveLivePlayers(dt: number) {
    this.livePlayers.forEach((live) => { live.pos.lerp(live.target, Math.min(1, dt * 8)); live.group.position.copy(live.pos); live.group.rotation.y = live.targetYaw; });
  }

  private computePrompt() {
    if (!this.underground && this.position.distanceTo(this.caveEntry) < 4) this.prompt = '🕳️ Press Space to enter the cave';
    else if (this.underground && new THREE.Vector3(this.position.x, 0, this.position.z).distanceTo(this.caveExit) < 3) this.prompt = '🪜 Press Space to climb back to the surface';
    else if (this.underground && Math.hypot(this.position.x, this.position.z) < 4) this.prompt = `⛏️ Dig here to tunnel deeper (Level ${this.caveDepth} → ${this.caveDepth + 1})`;
    else if (!this.underground && this.position.distanceTo(this.waterfallAt) < 8) { this.prompt = '💧 A magical waterfall!'; this.visitedWaterfall = true; }
    else this.prompt = this.underground ? '💎 Mine crystals — deeper levels are richer' : '⛏️ Dig · 🧱 Build · explore for stars';
  }

  showHint() {
    const list = this.underground ? this.gems : this.stars;
    let best: THREE.Object3D | null = null, bestD = Infinity;
    for (const item of list) { if (item.taken) continue; const d = Math.hypot(item.obj.position.x - this.position.x, item.obj.position.z - this.position.z); if (d < bestD) { bestD = d; best = item.obj; } }
    if (!best) return;
    if (!this.beacon) {
      const geo = this.track(new THREE.CylinderGeometry(0.5, 0.5, 20, 8, 1, true));
      const mat = this.track(new THREE.MeshBasicMaterial({ color: this.theme.glow, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      this.beacon = new THREE.Mesh(geo, mat); this.scene.add(this.beacon);
    }
    this.beacon.position.set(best.position.x, 10, best.position.z); this.beacon.visible = true; this.hintUntil = this.time + 7;
  }

  activateBubble(sec = 20) {
    if (!this.bubbleMesh) {
      this.bubbleMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(1.7, 16, 12)), this.track(new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.24, depthWrite: false })));
      this.bubbleMesh.position.y = 1.1; this.avatar.add(this.bubbleMesh);
    }
    this.bubbleMesh.visible = true; this.bubbleUntil = this.time + sec;
  }

  equipWeapon(sec = 20) {
    if (!this.weaponSprite) { this.weaponSprite = this.emojiSprite('⚔️', 1.3, 0.95, 1.15, 0); this.avatar.add(this.weaponSprite); }
    this.weaponSprite.visible = true; this.weaponUntil = this.time + sec;
  }

  private emit() {
    this.options.onUpdate({
      earned: this.earned, stars: this.starCount, trinkets: this.trinketCount, gems: this.gemCount,
      dug: this.dugCount, placed: this.placedCount, explored: this.explored, caveDepth: this.caveDepth,
      stunned: this.time < this.stunUntil,
      underground: this.underground, visitedCave: this.visitedCave, visitedWaterfall: this.visitedWaterfall,
      livePlayers: this.livePlayers.size, prompt: this.prompt,
      bubbleLeft: Math.max(0, Math.ceil(this.bubbleUntil - this.time)),
      weaponLeft: Math.max(0, Math.ceil(this.weaponUntil - this.time)),
      hintActive: this.time < this.hintUntil,
    });
  }

  private tickConsumables(dt: number) {
    if (this.beacon) { if (this.time > this.hintUntil) this.beacon.visible = false; else this.beacon.rotation.y += dt; }
    if (this.bubbleMesh && this.time > this.bubbleUntil) this.bubbleMesh.visible = false;
    if (this.weaponSprite && this.time > this.weaponUntil) this.weaponSprite.visible = false;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }

  private lastChunkAt = new THREE.Vector3(999, 0, 999);
  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    this.movePlayer(dt);
    this.followCamera(dt);
    this.moveLivePlayers(dt);

    if (this.underground) {
      this.animatePickups(this.gems, dt);
      this.collect(this.gems, 1.5, () => { this.gemCount += 1; });
    } else {
      // Restream chunks only when you've actually moved to a new chunk.
      if (Math.abs(this.position.x - this.lastChunkAt.x) > 4 || Math.abs(this.position.z - this.lastChunkAt.z) > 4) {
        this.lastChunkAt.copy(this.position); this.updateChunks();
      }
      this.animatePickups(this.stars, dt);
      // Loose stars vs themed trinkets — tell them apart by value (buried treasure
      // is handled separately so it can't count toward the CAVE-crystals quest).
      this.collect(this.stars, 1.5, (v) => {
        if (v === TRINKET_VALUE) this.trinketCount += 1;
        else this.starCount += 1;
      });
      this.animatePickups(this.buried, dt);
      this.collectBuried();
      this.paintWaterfall(this.time);
    }

    this.tickConsumables(dt);
    this.computePrompt();
    if (this.time - this.emitAt > 0.15) { this.emitAt = this.time; this.emit(); }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
