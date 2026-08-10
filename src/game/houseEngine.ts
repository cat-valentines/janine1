import * as THREE from 'three';
import { EMPTY, blockById, cropById, cropReady, type Animal, type Plot } from './building';
import { SX, SY, SZ, blocksMovement, inside, isSolid, spawnHeight, voxelAt, withVoxel, type Furniture, type FurnitureKind } from './voxel';

/** Build a solid-colour 3-D furniture piece (table/chair/sofa/bed/lamp). */
export function buildFurnitureMesh(kind: FurnitureKind, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const legMat = new THREE.MeshLambertMaterial({ color: '#6a4a30' });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); return mesh;
  };
  if (kind === 'table') {
    box(0.9, 0.09, 0.9, 0, 0.55, 0);
    [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].forEach(([x, z]) => box(0.08, 0.5, 0.08, x, 0.27, z, legMat));
  } else if (kind === 'chair') {
    box(0.5, 0.08, 0.5, 0, 0.44, 0);
    box(0.5, 0.5, 0.08, 0, 0.68, -0.21);
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => box(0.06, 0.42, 0.06, x, 0.21, z, legMat));
  } else if (kind === 'sofa') {
    box(0.95, 0.28, 0.55, 0, 0.28, 0.03);
    box(0.95, 0.42, 0.13, 0, 0.5, -0.2);
    box(0.13, 0.34, 0.55, -0.42, 0.4, 0.03);
    box(0.13, 0.34, 0.55, 0.42, 0.4, 0.03);
  } else if (kind === 'bed') {
    box(0.9, 0.22, 1.3, 0, 0.28, 0);
    box(0.68, 0.12, 0.32, 0, 0.44, -0.45, new THREE.MeshLambertMaterial({ color: '#f4efe8' }));   // pillow
    box(0.94, 0.5, 0.08, 0, 0.42, -0.68);   // headboard
  } else {  // lamp
    box(0.28, 0.06, 0.28, 0, 0.03, 0, legMat);
    box(0.06, 0.95, 0.06, 0, 0.5, 0, legMat);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.34, 12), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    shade.position.y = 1.08; g.add(shade);
    const light = new THREE.PointLight(color, 0.7, 4.5, 2); light.position.y = 1.0; g.add(light);
  }
  return g;
}
import { buildTerrainRegion, isTerrainSolid, rand, seasonOrder, seasonStyles, terrainHeight, treeAt, PASTURE_END, type Season } from './terrain';
import { buildPetMesh, makeLivePet, stepPet, type LivePet } from './petMesh';
import { buildAnimalMesh, buildFishMesh, wildKindFor } from './animalMesh';
import type { PetSpecies } from '../lib/pets';

export type Mode = 'build' | 'walk';
export type View = 'first' | 'third';

const EYE = 1.6;
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;
const GRAVITY = 22;
const JUMP = 7.4;
const SPEED = 4.6;
/** How far around you the hills + trees are meshed, and how far you walk before
 *  that patch re-centres on you — so the land streams on endlessly as you go.
 *  The patch reaches past where the fog turns opaque, so its edge never shows. */
const LAND_PATCH = 56;
const LAND_STEP = 18;
/** Seconds for one full day → night → day. A gentle few-minute cycle. */
const DAY_LENGTH = 220;
/** Seconds each season lasts before the world drifts into the next one. */
const SEASON_LENGTH = 200;
/** The season right now, from a GLOBAL clock — so it's automatic and identical
 *  for every player at the same moment (no manual switching). */
function globalSeason(): Season { return seasonOrder[Math.floor(Date.now() / (SEASON_LENGTH * 1000)) % seasonOrder.length]; }
/** The underground cave you can walk into: a bounded cavern of rock + jewels. */
const CAVE_W = 34, CAVE_H = 34, CAVE_CEIL = 6;
/** The single shared landscape seed — the same public land for every player. */
const SHARED_LAND_SEED = 71077345;
/** The fenced animal pasture, all within the flat (dry) strip south of the plot. */
const PEN_X0 = 1, PEN_X1 = SX - 1, PEN_Z0 = SZ + 3, PEN_Z1 = SZ + 12;
const NIGHT_SKY = new THREE.Color('#0a1230');
const DUSK_SKY = new THREE.Color('#e6884a');

interface EngineOptions {
  world: string;
  season: Season;
  seed: number;
  furniture: Furniture[];
  /** Shop item id -> emoji. Furniture comes from the shop, not the block palette. */
  furnitureIcons: Record<string, string>;
  characterAsset: string;
  /** The animals you're raising and the crops you've planted — they live on your land. */
  animals: Animal[];
  garden: Array<Plot | null>;
  onChangeWorld: (update: (previous: string) => string) => void;
  onPlaceFurniture: (cell: { x: number; y: number; z: number }) => void;
  /** Called when you walk into an apple to forage it — adds to your food. */
  onFood?: () => void;
  /** Called when you mine a jewel from a crystal by a cave — adds to your box. */
  onGem?: () => void;
  /** Called when you hunt a wild animal, or catch a fish — both give you food. */
  onHunt?: () => void;
  onFish?: () => void;
  /** Chopping a tree gives wood; placing a wood block spends it; out of wood warns. */
  onWood?: () => void;
  onUseWood?: () => void;
  onNeedWood?: () => void;
  /** The pet you've set walking, to trot along beside you (or null for none). */
  petSpecies?: PetSpecies | null;
  petDye?: string | null;
  /** Emoji for each pet-shop supply you own, to display in your pet corner. */
  petSupplies?: string[];
  /** Pet-house type ids you own — real blocky huts you can walk into. */
  petHouses?: string[];
  /** Walk into a wild animal to catch it into your fenced pasture. */
  onCollectAnimal?: (kind: string) => void;
  /** Jump on a ripe crop in the garden to harvest it (food for your box). */
  onHarvest?: () => void;
}

interface Wanderer { group: THREE.Object3D; legs: THREE.Object3D[]; x: number; z: number; dir: number; speed: number; phase: number; kind?: string }
interface Apple { mesh: THREE.Mesh; x: number; z: number; y: number; regrowAt: number }
interface Gem { mesh: THREE.Object3D; x: number; z: number; taken: boolean }
/** Another real player walking your land live, with their @name floating above,
 *  their house pitched at their own plot (dx,dz) out on the land. */
interface Neighbour {
  group: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  x: number; z: number; tx: number; tz: number; yaw: number; tyaw: number; phase: number;
  name: string; dx: number; dz: number; baseY: number;
  houseGroup: THREE.Group | null; houseStr: string;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hueFromId(id: string): number { return hashId(id) % 360; }

/** Emoji drawn to a texture, so shop furniture shows up in the 3D house. */
function emojiTexture(emoji: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '96px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export class HouseEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private blockGroup = new THREE.Group();
  private terrainGroup = new THREE.Group();
  // The streamed hills/trees live in their own group so they can re-mesh around
  // you without touching the endless ground plane below them.
  private landGroup = new THREE.Group();
  private landGeo = new THREE.BoxGeometry(1, 1, 1);
  private ground: THREE.Mesh | null = null;
  private terrainCenter = { x: Infinity, z: Infinity };
  // A gentle Minecraft-style day → night cycle.
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private dayTime = 0.32;   // 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset
  private daySky = new THREE.Color();
  private skyNow = new THREE.Color();
  // Waterfalls tumbling down the mountain cliffs — one scrolling texture, shared,
  // in their own group so the forage sweep never disposes the shared resources.
  private waterfallMat: THREE.MeshBasicMaterial | null = null;
  private waterfallGeo = new THREE.PlaneGeometry(1, 1);
  private waterfallGroup = new THREE.Group();
  private forageGroup = new THREE.Group();
  private apples: Apple[] = [];
  private gems: Gem[] = [];
  private wild: Wanderer[] = [];   // deer/rabbits/boar you can hunt for food
  private fishList: Array<{ group: THREE.Object3D; tail: THREE.Object3D; x: number; z: number }> = [];
  private caveMouths: Array<{ x: number; z: number }> = [];
  private choppable: Array<{ group: THREE.Object3D; x: number; z: number; chopped: boolean }> = [];
  /** Terrain (background) trees you've chopped, so they stay gone (keyed "x,z"). */
  private choppedTrees = new Set<string>();
  private chopCool = 0;   // brief pause between chopping terrain trees
  private wood = 0;   // a mirror of your wood store, so we can gate wood blocks
  // Your walking pet companion.
  private pet: LivePet | null = null;
  private forageTime = 0;
  // Underground: swapped in when you walk into a cave mouth.
  private inCave = false;
  private caveGroup = new THREE.Group();
  private caveWalls = new Set<string>();
  private caveGems: Gem[] = [];
  private torch: THREE.PointLight | null = null;
  private caveReturn = new THREE.Vector3();
  private furnitureGroup = new THREE.Group();
  private livestockGroup = new THREE.Group();
  // A basket by your house holding the apples you've foraged and stashed.
  private pantryGroup = new THREE.Group();
  // Pet-shop supplies you've bought, arranged in a pet corner of your yard.
  private petSupplyGroup = new THREE.Group();
  // Blocky pet houses you've bought — solid walls you can walk INTO via the door.
  private petHouseGroup = new THREE.Group();
  private petHouseWalls = new Set<string>();
  private petHouseSpots: Array<{ x: number; z: number }> = [];   // interior centres, for resting
  private wanderers: Wanderer[] = [];
  /** Ripe crops in the garden — jump on one to harvest it. */
  private gardenCrops: Array<{ sprite: THREE.Object3D; x: number; z: number }> = [];
  private avatar = new THREE.Group();
  // Limb pivots so the arms and legs swing from the shoulder/hip when walking.
  private legL: THREE.Group | null = null;
  private legR: THREE.Group | null = null;
  private armL: THREE.Group | null = null;
  private armR: THREE.Group | null = null;
  private walkPhase = 0;
  private sitting = false;   // relaxing on a chair/sofa — frozen until you stand
  /** Other real players on the land right now, keyed by their user id. */
  private neighbours = new Map<string, Neighbour>();
  /** Other players' saved houses on the land — a persistent neighbourhood, shown
   *  even when their owner isn't online (keyed by user id). */
  private houseOnly = new Map<string, THREE.Group>();
  private highlight: THREE.LineSegments;

  private world: string;
  private furniture: Furniture[];
  private options: EngineOptions;
  private season: Season;
  private seed: number;

  private mode: Mode = 'build';
  private view: View = 'third';
  private picked = 'W';
  private pickedFurniture = '';
  private erasing = false;

  /** Maps each InstancedMesh back to the voxels it drew, for picking. */
  private instanceCells = new Map<THREE.InstancedMesh, Array<{ x: number; y: number; z: number }>>();

  private position = new THREE.Vector3(SX / 2, 1, SZ / 2);
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.2;
  private grounded = false;
  private keys = new Set<string>();
  private orbit = { radius: 26, theta: Math.PI / 4, phi: 1.0, target: new THREE.Vector3(SX / 2, 2, SZ / 2) };
  private dragging = false;
  private pointerLocked = false;
  private running = true;
  private clock = new THREE.Clock();
  private hovered: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;
  private pointer = new THREE.Vector2(0, 0);
  private container: HTMLElement;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.world = options.world;
    this.furniture = options.furniture;
    this.season = globalSeason();   // automatic + the same for everyone (ignores any saved pick)
    // ONE shared world for everybody — the same hills, water, mountains, forage,
    // caves and jewels for every player, so it's a truly public land you can all
    // explore together (your own house is still your own private build).
    this.seed = SHARED_LAND_SEED;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 260);
    this.applySky();

    this.hemi = new THREE.HemisphereLight('#ffffff', '#6f8f5f', 2.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4d8', 1.5);
    this.sun.position.set(18, 30, 12);
    this.scene.add(this.sun);

    this.scene.add(this.blockGroup, this.terrainGroup, this.landGroup, this.forageGroup, this.waterfallGroup, this.furnitureGroup, this.livestockGroup, this.pantryGroup, this.petSupplyGroup, this.petHouseGroup, this.caveGroup, this.avatar);
    this.caveGroup.visible = false;

    const edge = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: '#20222a' }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.buildAvatar(options.characterAsset);
    this.rebuildTerrain();
    this.rebuildBlocks();
    this.rebuildFurniture();
    this.buildLivestock();
    this.resetPlayer();
    if (options.petSpecies) this.setPet(options.petSpecies, options.petDye);
    if (options.petSupplies?.length) this.setPetSupplies(options.petSupplies);
    if (options.petHouses?.length) this.setPetHouses(options.petHouses);

    this.bind();
    this.loop();
  }

  // ---- world -------------------------------------------------------------

  private applySky() {
    const style = seasonStyles[this.season];
    this.scene.background = new THREE.Color(style.sky);
    // Dense by ~54 units — just inside the streamed patch (56) — so the land
    // always fades into haze and you never see where the meshed hills stop.
    this.scene.fog = new THREE.Fog(style.fog, 24, 60);
  }

  /** Advance the sky and sun a little each frame so the world drifts from day to
   *  dusk to night to dawn on its own — like Minecraft. Never fully dark, so you
   *  can always keep building. */
  private updateDayNight(dt: number) {
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    const elevation = Math.sin((this.dayTime - 0.25) * Math.PI * 2);   // -1 midnight … +1 noon
    const daylight = Math.max(0, elevation);
    // Sky: night → day over the dawn/dusk band, with a warm glow when the sun is low.
    this.daySky.set(seasonStyles[this.season].sky);
    const t = Math.min(1, Math.max(0, (elevation + 0.25) / 0.5));
    this.skyNow.copy(NIGHT_SKY).lerp(this.daySky, t);
    const warm = Math.max(0, 1 - Math.abs(elevation) / 0.32) * (elevation > -0.28 ? 1 : 0);
    this.skyNow.lerp(DUSK_SKY, warm * 0.45);
    (this.scene.background as THREE.Color).copy(this.skyNow);
    this.scene.fog?.color.copy(this.skyNow);
    // Lights: bright noon, soft glow at night; sun warms and sinks at the edges.
    this.hemi.intensity = 0.55 + daylight * 1.7;
    this.sun.intensity = 0.15 + daylight * 1.35;
    this.sun.color.setHSL(0.11, 0.5, 0.5 + warm * 0.12).lerp(new THREE.Color('#fff4d8'), 1 - warm);
    // Move the sun across the sky, following you so its direction stays steady.
    const ang = (this.dayTime - 0.25) * Math.PI * 2;
    this.sun.position.set(this.position.x + Math.cos(ang) * 26, 8 + elevation * 34, this.position.z + 14);
  }

  private rebuildTerrain() {
    // Endless land: a huge flat grass plane just under the hills. It follows you
    // (see the loop) so there's never a visible edge — the land goes on forever.
    if (!this.ground) {
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: seasonStyles[this.season].grass }));
      this.ground.rotation.x = -Math.PI / 2;
      this.terrainGroup.add(this.ground);
    } else {
      (this.ground.material as THREE.MeshLambertMaterial).color.set(seasonStyles[this.season].grass);
    }
    this.terrainCenter = { x: Infinity, z: Infinity };  // force a fresh stream for the new season
    this.streamLand();   // (also re-scatters the forage around you)
  }

  /** Re-mesh the hills + trees in a patch centred on the player, so as you walk
   *  fresh land keeps appearing ahead of you and stale land drops behind. One
   *  InstancedMesh per colour keeps the whole landscape to a few draw calls. */
  private streamLand() {
    const cx = Math.round(this.position.x), cz = Math.round(this.position.z);
    this.terrainCenter = { x: cx, z: cz };
    // Free the previous patch's materials (the box geometry is shared, so kept).
    this.landGroup.children.forEach((child) => {
      const mat = (child as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose()); else (mat as THREE.Material | undefined)?.dispose();
    });
    this.landGroup.clear();
    const byColour = new Map<string, Array<{ x: number; y: number; z: number }>>();
    buildTerrainRegion(this.season, this.seed, cx - LAND_PATCH, cx + LAND_PATCH, cz - LAND_PATCH, cz + LAND_PATCH, (tx, tz) => this.choppedTrees.has(`${tx},${tz}`)).forEach((block) => {
      const list = byColour.get(block.colour) ?? [];
      list.push({ x: block.x, y: block.y, z: block.z });
      byColour.set(block.colour, list);
    });
    const matrix = new THREE.Matrix4();
    const water = seasonStyles[this.season].water;
    byColour.forEach((cells, colour) => {
      const material = new THREE.MeshLambertMaterial({ color: colour, transparent: colour === water, opacity: colour === water ? 0.8 : 1 });
      const mesh = new THREE.InstancedMesh(this.landGeo, material, cells.length);
      cells.forEach((cell, index) => { matrix.setPosition(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5); mesh.setMatrixAt(index, matrix); });
      mesh.instanceMatrix.needsUpdate = true;
      this.landGroup.add(mesh);
    });
    this.scatterForage(cx, cz);      // food follows you across the endless land
    this.scatterCreatures(cx, cz);   // animals to hunt + fish to catch, too
  }

  /** Scatter fruit trees + berry bushes across the patch of land around you, so
   *  the endless world is full of food wherever you roam. Deterministic by cell,
   *  so the same orchards always grow in the same spots. Re-run as the land
   *  streams (see streamLand), following you across the world. */
  private scatterForage(cx: number, cz: number) {
    this.forageGroup.traverse((obj) => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as (THREE.Material & { map?: THREE.Texture }) | (THREE.Material & { map?: THREE.Texture })[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => { mm.map?.dispose?.(); mm.dispose(); });
    });
    this.forageGroup.clear();
    this.waterfallGroup.clear();   // shared geo/mat, so just detach — never dispose
    this.apples = [];
    this.gems = [];
    this.caveMouths = [];
    this.choppable = [];
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#7b5330' });
    const leafMat = new THREE.MeshLambertMaterial({ color: seasonStyles[this.season].leaves });
    const bushMat = new THREE.MeshLambertMaterial({ color: seasonStyles[this.season].leavesAlt });
    const appleMat = new THREE.MeshLambertMaterial({ color: '#e0453a', emissive: '#4a1410' });
    const rockMat = new THREE.MeshLambertMaterial({ color: '#5c5750' });
    const caveMat = new THREE.MeshLambertMaterial({ color: '#15120f' });
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3, 6);
    const canopyGeo = new THREE.SphereGeometry(1.7, 8, 6);
    const bushGeo = new THREE.SphereGeometry(0.85, 7, 5);
    const fruitGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const gemGeo = new THREE.OctahedronGeometry(0.34);
    const rockGeo = new THREE.DodecahedronGeometry(0.9);
    const caveGeo = new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    // Different wild berries — blueberry, strawberry, raspberry, blackberry, cranberry.
    const BERRIES = ['#4a6fd0', '#e0455f', '#c22a55', '#2a2438', '#d0304a'];
    // Gem colours — sapphire, amethyst, emerald, ruby, topaz.
    const GEMS = ['#43b0ff', '#b264ff', '#3fd68a', '#ff5470', '#ffd24a'];
    const R = LAND_PATCH;
    // Sample a coarse grid; each spot deterministically may grow food, or — up on
    // the rocky mountains — hide a cave mouth twinkling with jewels to mine.
    for (let z = cz - R; z < cz + R; z += 7) {
      for (let x = cx - R; x < cx + R; x += 7) {
        if (x > -3 && x < SX + 3 && z > -3 && z < SZ + 3) continue;   // leave the build plot clear
        const h = terrainHeight(Math.round(x), Math.round(z), this.seed);
        if (h < 1) continue;                                           // in the water
        const r = rand(x * 1.3, z * 1.3, this.seed + 31);
        const jx = x + (rand(x, z, this.seed + 5) - 0.5) * 3.5;
        const jz = z + (rand(z, x, this.seed + 7) - 0.5) * 3.5;
        const gy = this.groundY(jx, jz);
        if (h <= 12 && r > 0.9) {
          // A fruit tree, hung with apples you can walk into to forage.
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.5; tree.add(trunk);
          const canopy = new THREE.Mesh(canopyGeo, leafMat); canopy.position.y = 3.4; tree.add(canopy);
          tree.position.set(jx, gy, jz);
          tree.scale.setScalar(0.85 + rand(x + 1, z, this.seed + 2) * 0.5);
          this.forageGroup.add(tree);
          this.choppable.push({ group: tree, x: jx, z: jz, chopped: false });   // walk into the trunk to chop it for wood
          const n = 1 + Math.floor(rand(x, z + 1, this.seed + 4) * 2);
          for (let j = 0; j < n; j += 1) {
            const ax = jx + (rand(x + j, z, this.seed + j) - 0.5) * 2.6;
            const az = jz + (rand(x, z + j, this.seed + j) - 0.5) * 2.6;
            const ay = this.groundY(ax, az) + 0.35;
            const apple = new THREE.Mesh(fruitGeo, appleMat);
            apple.position.set(ax, ay, az);
            this.forageGroup.add(apple);
            this.apples.push({ mesh: apple, x: ax, z: az, y: ay, regrowAt: 0 });
          }
        } else if (h <= 12 && r > 0.72) {
          // A berry bush of some wild kind — also foragable.
          const bush = new THREE.Mesh(bushGeo, bushMat);
          bush.position.set(jx, gy + 0.5, jz);
          bush.scale.set(1 + rand(x, z, this.seed + 8) * 0.6, 0.8, 1 + rand(z, x, this.seed + 9) * 0.6);
          this.forageGroup.add(bush);
          const colour = BERRIES[Math.floor(rand(x, z, this.seed + 12) * BERRIES.length) % BERRIES.length];
          const berryMat = new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.2 });
          const by = gy + 0.7;
          for (let b = 0; b < 3; b += 1) {
            const berry = new THREE.Mesh(fruitGeo, berryMat);
            berry.position.set(jx + (b - 1) * 0.24, by + (b % 2) * 0.16, jz);
            berry.scale.setScalar(0.7);
            this.forageGroup.add(berry);
          }
          this.apples.push({ mesh: bush, x: jx, z: jz, y: by, regrowAt: 0 });
        }
        // Up in the rocky heights: cave mouths and lone crystals to mine.
        if (h >= 7) {
          const gr = rand(x * 2.1, z * 2.1, this.seed + 51);
          const gemColour = GEMS[Math.floor(rand(x, z, this.seed + 61) * GEMS.length) % GEMS.length];
          const gemMat = () => new THREE.MeshStandardMaterial({ color: gemColour, emissive: gemColour, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 });
          const dropGem = (px: number, pz: number) => {
            const gem = new THREE.Mesh(gemGeo, gemMat());
            gem.position.set(px, this.groundY(px, pz) + 0.5, pz);
            this.forageGroup.add(gem);
            this.gems.push({ mesh: gem, x: px, z: pz, taken: false });
          };
          // A waterfall down a steep mountain face — pointed down its steepest side.
          if (h > 9) {
            const rx = Math.round(x), rz = Math.round(z);
            const dirs = [
              { drop: h - terrainHeight(rx + 7, rz, this.seed), ox: 3.6, oz: 0, ry: Math.PI / 2 },
              { drop: h - terrainHeight(rx - 7, rz, this.seed), ox: -3.6, oz: 0, ry: -Math.PI / 2 },
              { drop: h - terrainHeight(rx, rz + 7, this.seed), ox: 0, oz: 3.6, ry: 0 },
              { drop: h - terrainHeight(rx, rz - 7, this.seed), ox: 0, oz: -3.6, ry: Math.PI },
            ];
            const steep = dirs.reduce((a, b) => (b.drop > a.drop ? b : a));
            if (steep.drop > 5 && rand(x, z, this.seed + 91) > 0.45) {
              const drop = Math.min(18, steep.drop);
              const wf = new THREE.Mesh(this.waterfallGeo, this.waterfallMaterial());
              wf.scale.set(2.6, drop, 1);
              wf.rotation.y = steep.ry;
              wf.position.set(jx + steep.ox, this.groundY(jx, jz) - drop / 2 + 1, jz + steep.oz);
              this.waterfallGroup.add(wf);
            }
          }
          if (gr > 0.94) {
            // A cave mouth set into the slope — walk up to it to head underground.
            const cave = new THREE.Mesh(caveGeo, caveMat);
            cave.position.set(jx, gy + 0.2, jz);
            cave.rotation.x = Math.PI;
            this.forageGroup.add(cave);
            this.caveMouths.push({ x: jx, z: jz });
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set(jx + 1.4, gy + 0.2, jz + 0.4);
            this.forageGroup.add(rock);
            for (let g = 0; g < 3; g += 1) dropGem(jx + (rand(x + g, z, this.seed + g) - 0.5) * 2.4, jz + (rand(x, z + g, this.seed + g) - 0.5) * 2.4);
          } else if (gr > 0.83) {
            dropGem(jx, jz);
          }
        }
      }
    }
  }

  /** Walk into an apple to forage it for food; apples grow back after a while. */
  private checkForage(dt: number) {
    this.forageTime += dt;
    for (const apple of this.apples) {
      if (apple.regrowAt > 0) {
        if (this.forageTime >= apple.regrowAt) { apple.regrowAt = 0; apple.mesh.visible = true; }
        continue;
      }
      const dx = apple.x - this.position.x, dz = apple.z - this.position.z;
      if (dx * dx + dz * dz < 1.6) {
        apple.mesh.visible = false;
        apple.regrowAt = this.forageTime + 18;   // grows back in 18s
        this.options.onFood?.();
      }
    }
  }

  /** Walk into a glowing crystal to mine a jewel for your box. Each gem spins so
   *  you can spot it from afar. */
  private checkGems(dt: number) {
    for (const gem of this.gems) {
      if (gem.taken) continue;
      gem.mesh.rotation.y += dt * 1.6;
      gem.mesh.position.y += Math.sin(this.forageTime * 2 + gem.x) * 0.002;
      const dx = gem.x - this.position.x, dz = gem.z - this.position.z;
      if (dx * dx + dz * dz < 1.7) {
        gem.taken = true;
        gem.mesh.visible = false;
        this.options.onGem?.();
      }
    }
  }

  /** One shared, downward-scrolling water texture for every waterfall. */
  private waterfallMaterial() {
    if (this.waterfallMat) return this.waterfallMat;
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#bfe8ff'; ctx.fillRect(0, 0, 32, 64);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.8;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        const sx = (i * 6 + 2);
        for (let y = 0; y <= 64; y += 8) ctx.lineTo(sx + Math.sin(y * 0.3 + i) * 2, y);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    this.waterfallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    return this.waterfallMat;
  }

  /** Your current wood store, mirrored from the page so we can gate wood blocks. */
  setWood(n: number) { this.wood = n; }

  /** Walk into ANY tree to chop it for wood — the fruit trees you forage from,
   *  and the wild background trees dotted across the land. */
  private checkChop(dt: number) {
    // Fruit trees (their own objects) — hide instantly.
    for (const tree of this.choppable) {
      if (tree.chopped) continue;
      if (Math.hypot(tree.x - this.position.x, tree.z - this.position.z) < 1.6) {
        tree.chopped = true;
        tree.group.visible = false;
        this.options.onWood?.();
      }
    }
    // Wild terrain trees — mark the trunk chopped and re-stream so it falls.
    this.chopCool = Math.max(0, this.chopCool - dt);
    if (this.chopCool > 0) return;
    const cx = Math.floor(this.position.x), cz = Math.floor(this.position.z);
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const tx = cx + dx, tz = cz + dz, key = `${tx},${tz}`;
      if (this.choppedTrees.has(key) || treeAt(tx, tz, this.seed) === 0) continue;
      if (Math.hypot(tx + 0.5 - this.position.x, tz + 0.5 - this.position.z) < 1.7) {
        this.choppedTrees.add(key);
        this.chopCool = 0.7;
        this.options.onWood?.();
        this.streamLand();   // rebuild the patch so the felled tree disappears
        return;
      }
    }
  }

  /** Scatter wild animals to hunt and fish in the water, across the land around
   *  you. Deterministic by cell, re-run as the land streams (see streamLand). */
  private scatterCreatures(cx: number, cz: number) {
    this.wild = [];
    this.fishList = [];
    const R = LAND_PATCH;
    for (let z = cz - R; z < cz + R; z += 11) {
      for (let x = cx - R; x < cx + R; x += 11) {
        if (x > -4 && x < SX + 4 && z > -4 && z < SZ + 4) continue;   // not right on your plot
        const h = terrainHeight(Math.round(x), Math.round(z), this.seed);
        const r = rand(x * 0.7, z * 0.7, this.seed + 71);
        if (h >= 1 && h <= 10 && r > 0.82) {
          // A wild animal, wandering — walk into it to catch/hunt it.
          const kind = wildKindFor(Math.floor(rand(x, z, this.seed + 73) * 5));
          const jx = x + (rand(x, z, this.seed + 5) - 0.5) * 4, jz = z + (rand(z, x, this.seed + 7) - 0.5) * 4;
          const built = buildAnimalMesh(kind);
          built.group.position.set(jx, this.groundY(jx, jz), jz);
          this.forageGroup.add(built.group);
          this.wild.push({ group: built.group, legs: built.legs, kind, x: jx, z: jz, dir: rand(x, z, this.seed + 3) * Math.PI * 2, speed: 0.5 + rand(z, x, this.seed + 2) * 0.7, phase: (x + z) * 0.3 });
        } else if (h === 0 && r > 0.68) {
          // A blocky fish bobbing on the water — walk to the shore to catch it.
          const built = buildFishMesh();
          built.group.position.set(x + 0.5, 1.0, z + 0.5);
          this.forageGroup.add(built.group);
          this.fishList.push({ group: built.group, tail: built.tail, x: x + 0.5, z: z + 0.5 });
        }
      }
    }
  }

  /** Wild animals roam (never into the water), legs trotting; walk into one to
   *  catch it for your farm. Fish bob on the water; get close to catch one. */
  private moveWild(dt: number) {
    for (const w of this.wild) {
      if (!w.group.visible) continue;
      w.phase += dt;
      w.dir += Math.sin(w.phase * 0.7) * dt;
      const nx = w.x + Math.cos(w.dir) * w.speed * dt, nz = w.z + Math.sin(w.dir) * w.speed * dt;
      // Stay out of the water — turn back at the shoreline.
      if (terrainHeight(Math.round(nx), Math.round(nz), this.seed) <= 0) { w.dir += Math.PI; }
      else { w.x = nx; w.z = nz; }
      w.group.position.set(w.x, this.groundY(w.x, w.z), w.z);
      w.group.rotation.y = Math.atan2(Math.cos(w.dir), Math.sin(w.dir));
      const sw = Math.sin(w.phase * 8) * 0.5;
      w.legs.forEach((leg, i) => { leg.rotation.x = ((i % 2) === (Math.floor(i / 2) % 2) ? sw : -sw); });
      // No auto-catch: walking up just lets you SEE them. Catching is deliberate
      // — press the 🪝 Catch button when you're near one (see catchNearbyAnimal).
    }
    for (const f of this.fishList) {
      if (!f.group.visible) continue;
      // bob on the surface, turn slowly, and wag the tail fin like a real fish
      f.group.position.y = 1.0 + Math.sin(this.forageTime * 3 + f.x) * 0.1;
      f.group.rotation.y = Math.sin(this.forageTime * 0.6 + f.x) * 0.8;
      f.tail.rotation.y = Math.sin(this.forageTime * 9 + f.x) * 0.5;
      const dx = f.x - this.position.x, dz = f.z - this.position.z;
      if (dx * dx + dz * dz < 3.2) { f.group.visible = false; this.options.onFish?.(); }
    }
  }

  setSeason(season: Season) {
    if (season === this.season) return;
    this.season = season;
    this.applySky();
    this.rebuildTerrain();
    this.rebuildBlocks();
  }
  getSeason() { return this.season; }

  private emojiSprite(icon: string, size: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon), transparent: true }));
    sprite.scale.setScalar(size);
    return sprite;
  }

  private groundY(x: number, z: number) {
    return Math.max(1, terrainHeight(Math.round(x), Math.round(z), this.seed));
  }

  /** Put the animals you're raising out to roam your land, and plant the crops
   *  you've grown in a garden patch — so everything you raise lives on your land. */
  private buildLivestock() {
    this.livestockGroup.clear();
    this.wanderers = [];
    this.gardenCrops = [];
    // Crops: a tidy patch in the yard just south of the house.
    const patchX = 2, patchZ = SZ + 1.5;
    this.options.garden.forEach((plot, i) => {
      if (!plot) return;
      const crop = cropById(plot.crop);
      if (!crop) return;
      const cx = patchX + (i % 3) * 1.5, cz = patchZ + Math.floor(i / 3) * 1.5;
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.2), new THREE.MeshLambertMaterial({ color: '#6b4a2a' }));
      soil.position.set(cx, 1.05, cz);
      this.livestockGroup.add(soil);
      const ready = cropReady(plot, Date.now());
      const sprite = this.emojiSprite(ready ? crop.icon : crop.seedIcon, ready ? 1.0 : 0.6);
      sprite.position.set(cx, ready ? 1.65 : 1.4, cz);
      this.livestockGroup.add(sprite);
      if (ready) this.gardenCrops.push({ sprite, x: cx, z: cz });
    });
    // A flat grass pad over the (dry, flattened) pasture strip, so it's solid
    // green ground — never rolling hills or water under your animals.
    const padW = SX, padD = PASTURE_END - SZ;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(padW, padD), new THREE.MeshLambertMaterial({ color: seasonStyles[this.season].grass }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(SX / 2, 1.0, SZ + padD / 2);
    this.livestockGroup.add(pad);
    // Animals: blocky critters that roam the pasture behind the garden.
    this.options.animals.slice(0, 24).forEach((animal) => this.penAnimal(animal.type));
    // A wooden fence around the pasture — your pen, so animals never run off, and
    // where the wild ones you catch come to live.
    {
      const fenceMat = new THREE.MeshLambertMaterial({ color: '#8a5a2f' });
      const postGeo = new THREE.BoxGeometry(0.14, 1, 0.14);
      const railGeo = new THREE.BoxGeometry(2, 0.1, 0.08);
      const post = (px: number, pz: number) => { const m = new THREE.Mesh(postGeo, fenceMat); m.position.set(px, 1.5, pz); this.livestockGroup.add(m); };
      const rail = (px: number, pz: number, along: 'x' | 'z') => { const m = new THREE.Mesh(railGeo, fenceMat); m.position.set(px, 1.62, pz); if (along === 'z') m.rotation.y = Math.PI / 2; this.livestockGroup.add(m); };
      const X0 = PEN_X0, X1 = PEN_X1, Z0 = PEN_Z0, Z1 = PEN_Z1;
      for (let x = X0; x <= X1; x += 2) { post(x, Z0); post(x, Z1); if (x < X1) { rail(x + 1, Z0, 'x'); rail(x + 1, Z1, 'x'); } }
      for (let z = Z0; z <= Z1; z += 2) { post(X0, z); post(X1, z); if (z < Z1) { rail(X0, z + 1, 'z'); rail(X1, z + 1, 'z'); } }
    }
  }

  /** Drop an animal of this kind into the fenced pasture (a starting farm animal,
   *  or a wild one you just caught). */
  private penAnimal(kind: string) {
    const x = PEN_X0 + 1 + Math.random() * (PEN_X1 - PEN_X0 - 2), z = PEN_Z0 + 1 + Math.random() * (PEN_Z1 - PEN_Z0 - 2);
    const built = buildAnimalMesh(kind);
    built.group.position.set(x, 1.0, z);
    this.livestockGroup.add(built.group);
    this.wanderers.push({ group: built.group, legs: built.legs, kind, x, z, dir: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.6, phase: Math.random() * 6 });
  }

  /** Amble the animals gently around their flat, fenced pasture, legs trotting.
   *  The pasture is level dry ground, so no jitter and no paddling in the water. */
  private moveAnimals(dt: number) {
    for (const w of this.wanderers) {
      w.phase += dt;
      w.dir += Math.sin(w.phase * 0.6) * dt * 0.9;
      w.x += Math.cos(w.dir) * w.speed * dt;
      w.z += Math.sin(w.dir) * w.speed * dt;
      if (w.x < PEN_X0) { w.x = PEN_X0; w.dir = Math.PI - w.dir; }
      if (w.x > PEN_X1) { w.x = PEN_X1; w.dir = Math.PI - w.dir; }
      if (w.z < PEN_Z0) { w.z = PEN_Z0; w.dir = -w.dir; }
      if (w.z > PEN_Z1) { w.z = PEN_Z1; w.dir = -w.dir; }
      w.group.position.set(w.x, 1.0, w.z);   // flat pasture — fixed ground height
      w.group.rotation.y = Math.atan2(Math.cos(w.dir), Math.sin(w.dir));
      const sw = Math.sin(w.phase * 7) * 0.5;
      w.legs.forEach((leg, i) => { leg.rotation.x = ((i % 2) === (Math.floor(i / 2) % 2) ? sw : -sw); });
    }
  }

  // ---- setup -------------------------------------------------------------

  private buildAvatar(asset: string) {
    const skin = new THREE.MeshLambertMaterial({ color: '#f2d0b4' });
    const shirt = new THREE.MeshLambertMaterial({ color: '#4a7fb5' });
    const legs = new THREE.MeshLambertMaterial({ color: '#3c4a63' });

    // The character PNGs have transparent backgrounds; used directly the alpha
    // renders as a black box around the face, so flatten them onto a head colour.
    const headMaterial = new THREE.MeshLambertMaterial({ color: '#f6e7d4' });
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#f6e7d4';
      ctx.fillRect(0, 0, 128, 128);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 4, 4, 120, 120);
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      headMaterial.map = texture;
      headMaterial.needsUpdate = true;
    };
    image.src = asset;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMaterial);
    head.position.y = 1.5;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), shirt);
    body.position.y = 0.95;

    // Each limb hangs inside a pivot group placed at the shoulder/hip, so
    // rotating the group swings the whole limb from the top like a real leg.
    const limb = (w: number, h: number, d: number, mat: THREE.Material, px: number, pivotY: number) => {
      const g = new THREE.Group();
      g.position.set(px, pivotY, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.y = -h / 2;
      g.add(mesh);
      return g;
    };
    this.armL = limb(0.16, 0.58, 0.16, skin, -0.34, 1.24);
    this.armR = limb(0.16, 0.58, 0.16, skin, 0.34, 1.24);
    this.legL = limb(0.18, 0.62, 0.18, legs, -0.13, 0.63);
    this.legR = limb(0.18, 0.62, 0.18, legs, 0.13, 0.63);

    this.avatar.add(head, body, this.armL, this.armR, this.legL, this.legR);
  }

  private resetPlayer() {
    const x = Math.floor(SX / 2);
    const z = Math.floor(SZ / 2);
    this.position.set(x + 0.5, spawnHeight(this.world, x, z), z + 0.5);
    this.velocity.set(0, 0, 0);
  }

  /** A little name-tag drawn on a canvas that hangs over a neighbour. */
  private neighbourName(text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1c2a1ad8';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#a6e08f';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.font = 'bold 24px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e6ffd8';
      ctx.fillText(text.slice(0, 16), 128, 34);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    sprite.scale.set(2.4, 0.6, 1);
    sprite.position.y = 2.5;
    return sprite;
  }

  /** Each player's house sits at their own scattered spot out on the land, so the
   *  world reads as a little village. Stable per id, and kept clear of your plot. */
  private plotCentre(id: string) {
    // Keep houses close enough to actually SEE (within the ~56-unit view), spread
    // on two rings so they don't overlap: 6 nearby, then 12 a little further out.
    const h = hashId(id);
    const slot = h % 18;
    const inner = slot < 6;
    const idx = inner ? slot : slot - 6;
    const count = inner ? 6 : 12;
    const r = inner ? 26 : 42;
    const angle = (idx / count) * Math.PI * 2 + (inner ? 0 : 0.26);
    return { x: Math.round(Math.cos(angle) * r), z: Math.round(Math.sin(angle) * r) };
  }

  /** A simple blocky person, colour-tinted by id, for another live player. */
  private buildNeighbour(id: string, name: string): Neighbour {
    const hue = hueFromId(id);
    const shirt = new THREE.MeshLambertMaterial({ color: `hsl(${hue}, 60%, 55%)`, emissive: `hsl(${hue}, 60%, 18%)` });
    const skin = new THREE.MeshLambertMaterial({ color: '#f2d0b4' });
    const legMat = new THREE.MeshLambertMaterial({ color: '#3c4a63' });
    const group = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skin); head.position.y = 1.5;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), shirt); body.position.y = 0.95;
    const limb = (w: number, h: number, mat: THREE.Material, px: number, pivotY: number) => {
      const g = new THREE.Group(); g.position.set(px, pivotY, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat); mesh.position.y = -h / 2; g.add(mesh);
      return g;
    };
    const armL = limb(0.16, 0.58, skin, -0.34, 1.24);
    const armR = limb(0.16, 0.58, skin, 0.34, 1.24);
    const legL = limb(0.18, 0.62, legMat, -0.13, 0.63);
    const legR = limb(0.18, 0.62, legMat, 0.13, 0.63);
    group.add(head, body, armL, armR, legL, legR, this.neighbourName(`@${name}`));
    const c = this.plotCentre(id);
    const baseY = Math.max(1, terrainHeight(c.x, c.z, this.seed));   // sit on the ground, never underwater
    // dx/dz translate the neighbour's own (SX/2,SZ/2)-centred coords out to their plot.
    return { group, legL, legR, x: 0, z: 0, tx: 0, tz: 0, yaw: 0, tyaw: 0, phase: 0, name, dx: c.x - SX / 2, dz: c.z - SZ / 2, baseY, houseGroup: null, houseStr: '' };
  }

  /** Mesh a neighbour's saved house out at their plot, so you can see it on the land. */
  private buildHouseMesh(worldStr: string, dx: number, dz: number, baseY: number) {
    const group = new THREE.Group();
    const byType = new Map<string, Array<{ x: number; y: number; z: number }>>();
    for (let y = 0; y < SY; y += 1) for (let z = 0; z < SZ; z += 1) for (let x = 0; x < SX; x += 1) {
      const id = voxelAt(worldStr, x, y, z);
      if (id === EMPTY || !blockById(id)) continue;
      const list = byType.get(id) ?? []; list.push({ x, y, z }); byType.set(id, list);
    }
    const matrix = new THREE.Matrix4();
    byType.forEach((cells, id) => {
      const block = blockById(id); if (!block) return;
      const glass = id === 'G', water = id === '~';
      const style = seasonStyles[this.season];
      const colour = id === '#' ? style.grass : id === '~' ? style.water : block.colour;
      const material = new THREE.MeshLambertMaterial({ color: colour, transparent: glass || water, opacity: glass ? 0.45 : water ? 0.75 : 1, emissive: id === 'A' ? new THREE.Color('#a9821f') : new THREE.Color('#000000') });
      const mesh = new THREE.InstancedMesh(this.landGeo, material, cells.length);
      cells.forEach((cell, i) => { matrix.setPosition(cell.x + dx + 0.5, cell.y + baseY + 0.5, cell.z + dz + 0.5); mesh.setMatrixAt(i, matrix); });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });
    return group;
  }

  /** Free a group's materials (and textures). Geometry may be shared, so keep it. */
  private freeMaterials(group: THREE.Object3D) {
    group.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as (THREE.Material & { map?: THREE.Texture }) | (THREE.Material & { map?: THREE.Texture })[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
    });
  }

  /** Where I am, to shout to the other players walking the land. */
  getSelfState() {
    return { x: this.position.x, z: this.position.z, yaw: this.yaw, level: 0 };
  }

  /** Set (or clear) the pet that trots along beside you, in its (dyed) colour. */
  setPet(species: PetSpecies | null, dye?: string | null) {
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this.pet.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
      this.pet = null;
    }
    if (!species) return;
    this.pet = makeLivePet(buildPetMesh(species, dye), this.position.x + 1, this.position.z + 1);
    this.pet.group.visible = !this.inCave;
    this.scene.add(this.pet.group);
  }

  private movePet(dt: number) {
    if (!this.pet || this.inCave) return;
    stepPet(this.pet, this.position.x, this.position.z, this.yaw, dt, (x, z) => this.groundY(x, z), this.forageTime);
  }

  /** Lay out the pet-shop supplies you've bought in a little corner of the yard,
   *  on a rug, so everything you buy really shows up at your house. */
  setPetSupplies(emojis: string[]) {
    this.petSupplyGroup.traverse((o) => {
      const mesh = o as THREE.Mesh & { material?: THREE.SpriteMaterial };
      mesh.geometry?.dispose?.();
      const mat = mesh.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
      if (mat) { mat.map?.dispose?.(); mat.dispose(); }
    });
    this.petSupplyGroup.clear();
    if (!emojis.length) return;
    // A cosy rug in the front-yard pet corner, north of the house.
    const cornerX = 3, cornerZ = -3;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshLambertMaterial({ color: '#c98fd0', transparent: true, opacity: 0.7 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cornerX + 3, this.groundY(cornerX + 3, cornerZ - 1) + 0.02, cornerZ - 1);
    this.petSupplyGroup.add(rug);
    emojis.slice(0, 24).forEach((emoji, i) => {
      const sx = cornerX + (i % 6) * 1.5, sz = cornerZ - Math.floor(i / 6) * 1.5;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true }));
      sprite.scale.setScalar(1.1);
      sprite.position.set(sx, this.groundY(sx, sz) + 0.7, sz);
      this.petSupplyGroup.add(sprite);
    });
  }

  /** Pitch the pet houses you've bought as REAL blocky huts in the front yard —
   *  solid walls with a doorway, so you (and your pet) can actually walk inside. */
  setPetHouses(ids: string[]) {
    this.petHouseGroup.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
    this.petHouseGroup.clear();
    this.petHouseWalls.clear();
    this.petHouseSpots = [];
    const COLOURS: Record<string, { wall: string; roof: string; glass?: boolean }> = {
      doghouse: { wall: '#8a5a2f', roof: '#96453c' },
      cathouse: { wall: '#8d8d95', roof: '#5a5a66' },
      birdcage: { wall: '#f2c94c', roof: '#d0a83c' },
      aquarium: { wall: '#a9d8e8', roof: '#7fb8d0', glass: true },
      hutch: { wall: '#b07a4a', roof: '#7a4a22' },
    };
    ids.slice(0, 4).forEach((id, i) => {
      const c = COLOURS[id] ?? COLOURS.hutch;
      const ox = 2 + i * 4, oz = -7;   // a row across the flat front yard
      const wallMat = new THREE.MeshLambertMaterial({ color: c.wall, transparent: !!c.glass, opacity: c.glass ? 0.45 : 1 });
      const wallGeo = new THREE.BoxGeometry(1, 2.4, 1);
      // 3x3 footprint, hollow, with a doorway on the south side (facing the plot).
      for (let dz = 0; dz < 3; dz += 1) for (let dx = 0; dx < 3; dx += 1) {
        const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
        const isDoor = dx === 1 && dz === 2;   // front-centre doorway
        if (!edge || isDoor) continue;
        const cx = ox + dx, cz = oz + dz;
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(cx + 0.5, 2.2, cz + 0.5);
        this.petHouseGroup.add(wall);
        this.petHouseWalls.add(`${cx},${cz}`);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 3.4), new THREE.MeshLambertMaterial({ color: c.roof }));
      roof.position.set(ox + 1.5, 3.55, oz + 1.5);
      this.petHouseGroup.add(roof);
      this.petHouseSpots.push({ x: ox + 1.5, z: oz + 1.5 });   // interior centre, where the pet naps
    });
  }

  /** The interior spot of a pet house you're standing by (to send your pet to
   *  rest), or null. */
  getNearbyPetHouse(): { x: number; z: number } | null {
    if (this.inCave || this.mode !== 'walk' || !this.pet) return null;
    let best: { x: number; z: number } | null = null; let bestD = 3;
    for (const s of this.petHouseSpots) {
      const d = Math.hypot(s.x - this.position.x, s.z - this.position.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  isPetResting() { return !!this.pet?.resting; }

  /** Send your pet to nap in the pet house you're by. */
  restPet(): boolean {
    const spot = this.getNearbyPetHouse();
    if (!spot || !this.pet) return false;
    this.pet.resting = true;
    this.pet.restX = spot.x; this.pet.restZ = spot.z;
    return true;
  }
  /** Wake the pet — it goes back to following you. */
  wakePet() { if (this.pet) this.pet.resting = false; }

  /** The nearest chair/sofa you're standing by (to sit on), or null. */
  getNearbySeat() { return this.nearestFurniture(['chair', 'sofa'], 1.8); }
  /** The nearest bed you're standing by (to sleep in), or null. */
  getNearbyBed() { return this.nearestFurniture(['bed'], 2.2); }

  /** True if you're standing right by a cave mouth (to head underground). */
  getNearbyCave(): boolean {
    if (this.inCave || this.mode !== 'walk') return false;
    return this.caveMouths.some((c) => Math.hypot(this.position.x - c.x, this.position.z - c.z) < 3.5);
  }
  isInCave() { return this.inCave; }

  /** True if you're standing by your storage chest (to open your box). */
  getNearbyChest(): boolean {
    if (this.inCave || this.mode !== 'walk') return false;
    return Math.hypot(this.position.x - (SX / 2 + 4), this.position.z - SZ / 2) < 3;
  }

  /** The kind of wild animal you're standing near (to offer a Catch button), or null. */
  getNearbyWildAnimal(): string | null {
    if (this.inCave || this.mode !== 'walk') return null;
    let best: string | null = null; let bestD = 2.4;
    for (const w of this.wild) {
      if (!w.group.visible) continue;
      const d = Math.hypot(w.x - this.position.x, w.z - this.position.z);
      if (d < bestD) { bestD = d; best = w.kind ?? 'rabbit'; }
    }
    return best;
  }

  /** Catch the nearest wild animal you're standing by: it hops into your pasture. */
  catchNearbyAnimal(): string | null {
    let target: Wanderer | null = null; let bestD = 2.4;
    for (const w of this.wild) {
      if (!w.group.visible) continue;
      const d = Math.hypot(w.x - this.position.x, w.z - this.position.z);
      if (d < bestD) { bestD = d; target = w; }
    }
    if (!target) return null;
    target.group.visible = false;
    const kind = target.kind ?? 'rabbit';
    this.penAnimal(kind);
    this.options.onCollectAnimal?.(kind);
    return kind;
  }

  /** If you're standing by a house whose owner is NOT online, its name — so we
   *  can show a friendly "they're not home, come back later" sign. */
  getNearbyOfflineHouse(): string | null {
    if (this.inCave || this.mode !== 'walk') return null;
    let best: string | null = null;
    let bestD = 14;
    this.houseOnly.forEach((group, id) => {
      const c = this.plotCentre(id);
      const d = Math.hypot(this.position.x - c.x, this.position.z - c.z);
      if (d < bestD) { bestD = d; best = (group.userData.houseName as string) ?? 'a builder'; }
    });
    return best;
  }

  /** Walk into the cave: build a dark underground cavern of rock and jewels, drop
   *  the player in with a torch, and hide the surface until they climb back out. */
  enterCave() {
    if (this.inCave || this.mode !== 'walk' || !this.getNearbyCave()) return false;
    this.caveReturn.copy(this.position);
    this.buildCave();
    // Hide the whole surface world while you're down below.
    for (const g of [this.blockGroup, this.terrainGroup, this.landGroup, this.forageGroup, this.waterfallGroup, this.furnitureGroup, this.livestockGroup, this.pantryGroup]) g.visible = false;
    this.neighbours.forEach((n) => { n.group.visible = false; if (n.houseGroup) n.houseGroup.visible = false; });
    this.houseOnly.forEach((g) => { g.visible = false; });
    if (this.pet) this.pet.group.visible = false;
    this.caveGroup.visible = true;
    // Deep, dark cavern light + a torch that follows you.
    this.hemi.intensity = 0.25; this.hemi.color.set('#6a6f8a'); this.sun.intensity = 0;
    this.scene.background = new THREE.Color('#05060a');
    this.scene.fog = new THREE.Fog('#05060a', 4, 22);
    if (!this.torch) { this.torch = new THREE.PointLight('#ffcf8a', 2.4, 16, 1.5); this.scene.add(this.torch); }
    this.torch.visible = true;
    // Drop in at the open entrance, on the floor.
    this.position.set(CAVE_W / 2, 1.1, 3);
    this.velocity.set(0, 0, 0);
    this.yaw = 0; this.sitting = false;
    this.inCave = true;
    return true;
  }

  /** Climb back out of the cave to exactly where you went in. */
  leaveCave() {
    if (!this.inCave) return;
    this.inCave = false;
    this.caveGroup.traverse((obj) => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((mm) => mm.dispose());
    });
    this.caveGroup.clear();
    this.caveGems = [];
    this.caveWalls.clear();
    this.caveGroup.visible = false;
    if (this.torch) this.torch.visible = false;
    for (const g of [this.blockGroup, this.terrainGroup, this.landGroup, this.forageGroup, this.waterfallGroup, this.furnitureGroup, this.livestockGroup, this.pantryGroup]) g.visible = true;
    this.neighbours.forEach((n) => { n.group.visible = true; if (n.houseGroup) n.houseGroup.visible = true; });
    this.houseOnly.forEach((g) => { g.visible = true; });
    if (this.pet) this.pet.group.visible = true;
    this.applySky();   // day/night resumes and re-tints the sky next frame
    this.position.copy(this.caveReturn);
    this.velocity.set(0, 0, 0);
  }

  /** Carve a bounded cavern: rock border + scattered pillars leaving winding
   *  tunnels, a floor and ceiling, and jewels glinting in the dark to mine. */
  private buildCave() {
    this.caveWalls.clear();
    this.caveGems = [];
    const seed = Math.round(this.caveReturn.x * 13 + this.caveReturn.z * 7) + 1;
    const solid: Array<{ x: number; z: number }> = [];
    for (let r = 0; r < CAVE_H; r += 1) {
      for (let c = 0; c < CAVE_W; c += 1) {
        const border = c === 0 || r === 0 || c === CAVE_W - 1 || r === CAVE_H - 1;
        // Keep a clear 3-wide entrance area near the drop-in point.
        const nearEntrance = Math.abs(c - CAVE_W / 2) < 3 && r < 6;
        const pillar = rand(c * 1.7, r * 1.9, seed) > 0.82;
        if ((border || pillar) && !nearEntrance) { this.caveWalls.add(`${c},${r}`); solid.push({ x: c, z: r }); }
      }
    }
    // Floor + ceiling planes.
    const rockMat = new THREE.MeshLambertMaterial({ color: '#3a352f' });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CAVE_W, CAVE_H), new THREE.MeshLambertMaterial({ color: '#2a2620' }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(CAVE_W / 2, 0.95, CAVE_H / 2);
    this.caveGroup.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CAVE_W, CAVE_H), new THREE.MeshLambertMaterial({ color: '#17140f' }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(CAVE_W / 2, CAVE_CEIL, CAVE_H / 2);
    this.caveGroup.add(ceil);
    // Rock walls/pillars as one instanced mesh (each column CAVE_CEIL tall).
    const geo = new THREE.BoxGeometry(1, CAVE_CEIL - 1, 1);
    const walls = new THREE.InstancedMesh(geo, rockMat, solid.length);
    const m = new THREE.Matrix4();
    solid.forEach((cell, i) => { m.setPosition(cell.x + 0.5, 1 + (CAVE_CEIL - 1) / 2, cell.z + 0.5); walls.setMatrixAt(i, m); });
    walls.instanceMatrix.needsUpdate = true;
    this.caveGroup.add(walls);
    // Jewels scattered on the open floor.
    const gemGeo = new THREE.OctahedronGeometry(0.34);
    const GEMS = ['#43b0ff', '#b264ff', '#3fd68a', '#ff5470', '#ffd24a'];
    for (let i = 0; i < 26; i += 1) {
      const c = 2 + Math.floor(rand(i, i * 3, seed + 5) * (CAVE_W - 4));
      const r = 4 + Math.floor(rand(i * 2, i, seed + 9) * (CAVE_H - 6));
      if (this.caveWalls.has(`${c},${r}`)) continue;
      const colour = GEMS[i % GEMS.length];
      const gem = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.7, roughness: 0.2 }));
      gem.position.set(c + 0.5, 1.35, r + 0.5);
      this.caveGroup.add(gem);
      this.caveGems.push({ mesh: gem, x: c + 0.5, z: r + 0.5, taken: false });
    }
  }

  private caveSolidAt(x: number, y: number, z: number) {
    if (y < 0.9 || y >= CAVE_CEIL) return true;               // floor + ceiling
    const c = Math.floor(x), r = Math.floor(z);
    if (c < 0 || r < 0 || c >= CAVE_W || r >= CAVE_H) return true;  // outer rock
    return this.caveWalls.has(`${c},${r}`);
  }

  private nearestFurniture(kinds: FurnitureKind[], range: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = range;
    this.furniture.forEach((piece) => {
      if (!piece.kind || !kinds.includes(piece.kind)) return;
      const cx = piece.x + 0.5, cz = piece.z + 0.5;
      const d = Math.hypot(this.position.x - cx, this.position.z - cz);
      if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
    });
    return best;
  }

  /** Sit down on the chair/sofa you're next to. You stay put until you stand. */
  sit() {
    if (this.sitting || this.mode !== 'walk') return false;
    const seat = this.getNearbySeat();
    if (!seat) return false;
    this.position.x = seat.x; this.position.z = seat.z;
    this.velocity.set(0, 0, 0);
    this.sitting = true;
    return true;
  }
  standUp() { this.sitting = false; }
  isSitting() { return this.sitting; }

  /** Sleep in the bed you're next to: skip the night straight to a fresh morning. */
  sleep() {
    if (this.mode !== 'walk' || !this.getNearbyBed()) return false;
    this.dayTime = 0.26;   // just after dawn
    this.sitting = false;
    return true;
  }

  /** Show the food + treasures stashed in your house as a chest by your door. */
  setPantry(count: number, jewels = 0) {
    this.pantryGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => m.dispose());
    });
    this.pantryGroup.clear();
    if (count < 0) return;   // hidden (e.g. while you're visiting someone else's house)
    const bx = SX / 2 + 4, bz = SZ / 2;
    const by = this.groundY(bx, bz);
    // A wooden storage chest that always stands by your house — your box for food
    // (and, once you're mining, jewels too).
    const wood = new THREE.MeshLambertMaterial({ color: '#8a5a2f' });
    const iron = new THREE.MeshLambertMaterial({ color: '#c9a24a', emissive: '#3a2c08' });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood);
    base.position.set(bx, by + 0.3, bz);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.28, 0.84), wood);
    lid.position.set(bx, by + 0.72, bz);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.08), iron);
    latch.position.set(bx, by + 0.6, bz + 0.42);
    this.pantryGroup.add(base, lid, latch);
    // A few apples heaped on the lid so you can see it's stocked with food.
    const appleGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const appleMat = new THREE.MeshLambertMaterial({ color: '#e0453a', emissive: '#4a1410' });
    const shownA = Math.min(count, 6);
    for (let i = 0; i < shownA; i += 1) {
      const apple = new THREE.Mesh(appleGeo, appleMat);
      const ang = i * 2.399, r = 0.08 + (i % 3) * 0.14;
      apple.position.set(bx - 0.28 + Math.cos(ang) * r, by + 0.92 + Math.floor(i / 4) * 0.16, bz + Math.sin(ang) * r * 0.6);
      this.pantryGroup.add(apple);
    }
    // And a sparkle of jewels tucked in beside them.
    const gemGeo = new THREE.OctahedronGeometry(0.13);
    const gemMat = new THREE.MeshStandardMaterial({ color: '#43b0ff', emissive: '#43b0ff', emissiveIntensity: 0.6, roughness: 0.2 });
    const shownG = Math.min(jewels, 6);
    for (let i = 0; i < shownG; i += 1) {
      const gem = new THREE.Mesh(gemGeo, gemMat);
      const ang = i * 2.1;
      gem.position.set(bx + 0.32 + Math.cos(ang) * 0.14, by + 0.94 + Math.floor(i / 3) * 0.16, bz + Math.sin(ang) * 0.1);
      this.pantryGroup.add(gem);
    }
  }

  /** The closest neighbour whose house you're standing near — for the "ask to
   *  visit" prompt that only appears once you've walked up to someone's place. */
  getNearbyVisit(): { id: string; name: string } | null {
    let best: { id: string; name: string } | null = null;
    let bestD = 15;
    this.neighbours.forEach((n, id) => {
      const d = Math.hypot(this.position.x - (n.dx + SX / 2), this.position.z - (n.dz + SZ / 2));
      if (d < bestD) { bestD = d; best = { id, name: n.name }; }
    });
    return best;
  }

  /**
   * The persistent neighbourhood: draw every other player's SAVED house on the
   * land at their own plot, so you see houses even when nobody's online. A player
   * who's live right now is drawn by setLivePlayers instead (skipped here).
   */
  setNeighbourHouses(list: Array<{ id: string; name: string; house: string }>) {
    const here = new Set(list.map((h) => h.id));
    this.houseOnly.forEach((group, id) => {
      if (here.has(id) && !this.neighbours.has(id)) return;
      this.scene.remove(group); this.freeMaterials(group); this.houseOnly.delete(id);
    });
    list.forEach((h) => {
      if (this.neighbours.has(h.id) || this.houseOnly.has(h.id)) return;   // live wins / already built
      const c = this.plotCentre(h.id);
      const baseY = Math.max(1, terrainHeight(c.x, c.z, this.seed));   // sit on the ground, never underwater
      const group = this.buildHouseMesh(h.house, c.x - SX / 2, c.z - SZ / 2, baseY);
      const sign = this.neighbourName(`🏠 ${h.name}`);
      sign.position.set(c.x, baseY + 5.2, c.z);
      group.add(sign);
      group.visible = !this.inCave;
      group.userData.houseName = h.name;
      this.scene.add(group);
      this.houseOnly.set(h.id, group);
    });
  }

  /**
   * Draw the other real players out at their own plots — you see their house on
   * the land and their character walking near it, wearing their @name. Driven
   * entirely by the network, never AI. Anyone who left is cleared away.
   */
  setLivePlayers(players: Array<{ id: string; name: string; x: number; z: number; yaw: number; house?: string }>) {
    const here = new Set<string>();
    players.forEach((player) => {
      here.add(player.id);
      let n = this.neighbours.get(player.id);
      if (!n) {
        n = this.buildNeighbour(player.id, player.name);
        n.x = player.x; n.z = player.z; n.yaw = player.yaw;
        this.scene.add(n.group);
        this.neighbours.set(player.id, n);
      }
      n.tx = player.x; n.tz = player.z; n.tyaw = player.yaw;
      // Their house was (re)sent — pitch it (afresh) on their plot.
      if (player.house && player.house !== n.houseStr) {
        n.houseStr = player.house;
        if (n.houseGroup) { this.scene.remove(n.houseGroup); this.freeMaterials(n.houseGroup); }
        n.houseGroup = this.buildHouseMesh(player.house, n.dx, n.dz, n.baseY);
        this.scene.add(n.houseGroup);
      }
    });
    this.neighbours.forEach((n, id) => {
      if (here.has(id)) return;
      this.scene.remove(n.group);
      n.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh & { material?: THREE.Material & { map?: THREE.Texture } };
        mesh.geometry?.dispose?.();
        const mat = mesh.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
        if (mat) { mat.map?.dispose?.(); mat.dispose?.(); }
      });
      if (n.houseGroup) { this.scene.remove(n.houseGroup); this.freeMaterials(n.houseGroup); }
      this.neighbours.delete(id);
    });
  }

  /** Glide every neighbour toward where they last said they are, out at their
   *  own plot (dx,dz), legs swinging as they walk. */
  private moveNeighbours(dt: number) {
    if (!this.neighbours.size) return;
    const ease = Math.min(1, dt * 10);
    this.neighbours.forEach((n) => {
      const moving = Math.hypot(n.tx - n.x, n.tz - n.z) > 0.02;
      n.x += (n.tx - n.x) * ease;
      n.z += (n.tz - n.z) * ease;
      let dy = n.tyaw - n.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      n.yaw += dy * ease;
      const wx = n.x + n.dx, wz = n.z + n.dz;
      // Stand them on the ground SURFACE (terrain), not the plot floor at 0 — else
      // they sink into rolling hills up to the waist and look like half a player.
      const foot = this.groundY(wx, wz);
      n.group.position.set(wx, foot, wz);
      n.group.rotation.y = n.yaw;
      n.phase += moving ? dt * 9 : 0;
      const swing = moving ? Math.sin(n.phase) * 0.6 : 0;
      n.legL.rotation.x = swing;
      n.legR.rotation.x = -swing;
    });
  }

  // ---- voxel meshes ------------------------------------------------------

  /** A block is only drawn when at least one face is exposed. */
  private visible(x: number, y: number, z: number) {
    return !isSolid(voxelAt(this.world, x + 1, y, z)) || !isSolid(voxelAt(this.world, x - 1, y, z))
      || !isSolid(voxelAt(this.world, x, y + 1, z)) || !isSolid(voxelAt(this.world, x, y - 1, z))
      || !isSolid(voxelAt(this.world, x, y, z + 1)) || !isSolid(voxelAt(this.world, x, y, z - 1));
  }

  private rebuildBlocks() {
    this.blockGroup.clear();
    this.instanceCells.clear();

    const byType = new Map<string, Array<{ x: number; y: number; z: number }>>();
    for (let y = 0; y < SY; y += 1) {
      for (let z = 0; z < SZ; z += 1) {
        for (let x = 0; x < SX; x += 1) {
          const id = voxelAt(this.world, x, y, z);
          if (id === EMPTY || !blockById(id) || !this.visible(x, y, z)) continue;
          const list = byType.get(id) ?? [];
          list.push({ x, y, z });
          byType.set(id, list);
        }
      }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    byType.forEach((cells, id) => {
      const block = blockById(id);
      if (!block) return;
      const glass = id === 'G';
      const water = id === '~';
      const style = seasonStyles[this.season];
      const colour = id === '#' ? style.grass : id === '~' ? style.water : block.colour;
      const material = new THREE.MeshLambertMaterial({
        color: colour,
        transparent: glass || water,
        opacity: glass ? 0.45 : water ? 0.75 : 1,
        emissive: id === 'A' ? new THREE.Color('#a9821f') : new THREE.Color('#000000'),
      });
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      cells.forEach((cell, index) => {
        matrix.setPosition(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.blockGroup.add(mesh);
      this.instanceCells.set(mesh, cells);
    });
  }

  private rebuildFurniture() {
    this.furnitureGroup.clear();
    this.furniture.forEach((piece) => {
      if (piece.kind) {
        // A solid-colour 3-D piece you bought and coloured yourself.
        const mesh = buildFurnitureMesh(piece.kind, piece.color ?? '#ffffff');
        mesh.position.set(piece.x + 0.5, piece.y, piece.z + 0.5);
        mesh.rotation.y = (piece.rot ?? 0) * Math.PI / 2;
        this.furnitureGroup.add(mesh);
        return;
      }
      const icon = this.options.furnitureIcons[piece.item] ?? '📦';
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon) }));
      sprite.scale.set(0.9, 0.9, 0.9);
      sprite.position.set(piece.x + 0.5, piece.y + 0.45, piece.z + 0.5);
      this.furnitureGroup.add(sprite);
    });
  }

  setFurniture(list: Furniture[]) {
    this.furniture = list;
    this.rebuildFurniture();
  }

  // ---- public API --------------------------------------------------------

  setWorld(world: string) {
    if (world === this.world) return;
    this.world = world;
    this.rebuildBlocks();
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.highlight.visible = false;
    if (mode === 'walk') this.resetPlayer();
    else if (this.pointerLocked) document.exitPointerLock();
  }

  setView(view: View) { this.view = view; }
  setPicked(id: string) { this.picked = id; this.pickedFurniture = ''; }
  setPickedFurniture(item: string) { this.pickedFurniture = item; }

  /** Eraser mode. The hover box turns red so it is obvious what will vanish. */
  setErasing(on: boolean) {
    this.erasing = on;
    (this.highlight.material as THREE.LineBasicMaterial).color.set(on ? '#d0342c' : '#20222a');
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

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    // Stop arrows/space from scrolling the page while you're walking.
    if (this.mode === 'walk' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private onPointerDown = (event: PointerEvent) => {
    if (this.mode === 'walk') {
      if (!this.pointerLocked) this.renderer.domElement.requestPointerLock();
      return;
    }
    if (event.button === 2) { this.dragging = true; return; }
    this.paint(event.shiftKey || event.button === 1);
  };

  private onPointerUp = () => { this.dragging = false; };

  private onPointerMove = (event: PointerEvent) => {
    if (this.mode === 'walk') {
      if (!this.pointerLocked) return;
      this.yaw -= event.movementX * 0.0025;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0025, -1.4, 1.4);
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (this.dragging) {
      this.orbit.theta -= event.movementX * 0.006;
      this.orbit.phi = THREE.MathUtils.clamp(this.orbit.phi - event.movementY * 0.006, 0.15, 1.5);
    }
  };

  private onWheel = (event: WheelEvent) => {
    if (this.mode !== 'build') return;
    event.preventDefault();
    this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius + event.deltaY * 0.02, 8, 120);
  };

  private onContext = (event: Event) => event.preventDefault();
  private onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.renderer.domElement; };

  private bind() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private unbind() {
    const canvas = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContext);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  // ---- building ----------------------------------------------------------

  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.blockGroup.children, false);
    for (const hit of hits) {
      const mesh = hit.object as THREE.InstancedMesh;
      const cells = this.instanceCells.get(mesh);
      if (!cells || hit.instanceId === undefined || !hit.face) continue;
      const cell = cells[hit.instanceId];
      const n = hit.face.normal;
      return { ...cell, nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z) };
    }
    return null;
  }

  private paint(forceRemove: boolean) {
    const hit = this.hovered ?? this.pick();
    if (!hit) return;
    // Shift+click still erases, so the eraser is a convenience, not the only way.
    const remove = this.erasing || forceRemove;
    if (this.pickedFurniture && !remove) {
      this.options.onPlaceFurniture({ x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz });
      return;
    }
    const target = remove
      ? { x: hit.x, y: hit.y, z: hit.z }
      : { x: hit.x + hit.nx, y: hit.y + hit.ny, z: hit.z + hit.nz };
    // Never dig away the last ground layer, or the player falls out of the world.
    if (remove && target.y === 0) return;
    // Building with wood spends the wood you chopped from trees.
    if (!remove && this.picked === 'W') {
      if (this.wood <= 0) { this.options.onNeedWood?.(); return; }
      this.wood -= 1;
      this.options.onUseWood?.();
    }
    this.options.onChangeWorld((previous) => withVoxel(previous, target.x, target.y, target.z, remove ? EMPTY : this.picked));
  }

  // ---- movement ----------------------------------------------------------

  /** Plot blocks come from the saved house; everything else is generated land. */
  private solidAt(x: number, y: number, z: number) {
    if (this.inCave) return this.caveSolidAt(x, y, z);
    // Pet-house walls: solid up to roof height, but the doorway cell is open.
    if (y >= 0.9 && y < 3.5 && this.petHouseWalls.size && this.petHouseWalls.has(`${Math.floor(x)},${Math.floor(z)}`)) return true;
    if (inside(x, y, z)) return blocksMovement(voxelAt(this.world, x, y, z));
    if (x >= 0 && x < SX && z >= 0 && z < SZ) return false; // above the plot = sky
    return isTerrainSolid(x, y, z, this.seed);
  }

  private collides(x: number, y: number, z: number) {
    const minX = Math.floor(x - PLAYER_HALF);
    const maxX = Math.floor(x + PLAYER_HALF);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + PLAYER_HEIGHT);
    const minZ = Math.floor(z - PLAYER_HALF);
    const maxZ = Math.floor(z + PLAYER_HALF);
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        for (let cx = minX; cx <= maxX; cx += 1) {
          if (this.solidAt(cx, cy, cz)) return true;
        }
      }
    }
    return false;
  }

  private walk(dt: number) {
    // Sitting still: bend into the seat and don't move until you stand up.
    if (this.sitting) {
      const e = Math.min(1, dt * 12);
      if (this.legL && this.legR && this.armL && this.armR) {
        this.legL.rotation.x += (-1.4 - this.legL.rotation.x) * e;
        this.legR.rotation.x += (-1.4 - this.legR.rotation.x) * e;
        this.armL.rotation.x += (-0.35 - this.armL.rotation.x) * e;
        this.armR.rotation.x += (-0.35 - this.armR.rotation.x) * e;
      }
      this.velocity.set(0, 0, 0);
      return;
    }
    // Easy controls: ↑↓ walk, ←→ turn — no mouse needed. (W/S walk, A/D strafe too.)
    const forward = ((this.keys.has('ArrowUp') || this.keys.has('KeyW')) ? 1 : 0) - ((this.keys.has('ArrowDown') || this.keys.has('KeyS')) ? 1 : 0);
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (turn) this.yaw += turn * 2.2 * dt;
    const move = new THREE.Vector3(
      Math.sin(this.yaw) * -forward + Math.cos(this.yaw) * strafe,
      0,
      Math.cos(this.yaw) * -forward - Math.sin(this.yaw) * strafe,
    );
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(SPEED * dt);

    // Swing the arms and legs so the character actually walks.
    this.walkPhase += (moving ? dt * 9 : 0);
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    const ease = Math.min(1, dt * 12);
    if (this.legL && this.legR && this.armL && this.armR) {
      this.legL.rotation.x += (swing - this.legL.rotation.x) * ease;
      this.legR.rotation.x += (-swing - this.legR.rotation.x) * ease;
      this.armL.rotation.x += (-swing - this.armL.rotation.x) * ease;
      this.armR.rotation.x += (swing - this.armR.rotation.x) * ease;
    }

    if (this.grounded && this.keys.has('Space')) {
      this.velocity.y = JUMP;
      // Jumping on a ripe crop in the garden harvests it for food.
      for (let i = this.gardenCrops.length - 1; i >= 0; i -= 1) {
        const c = this.gardenCrops[i];
        if (Math.hypot(c.x - this.position.x, c.z - this.position.z) < 1.6) {
          c.sprite.visible = false;
          this.gardenCrops.splice(i, 1);
          this.options.onHarvest?.();
          break;
        }
      }
    }
    this.velocity.y -= GRAVITY * dt;

    // Axis at a time, so sliding along a wall works instead of sticking.
    const next = this.position.clone();
    next.x += move.x;
    if (this.collides(next.x, next.y, next.z)) next.x = this.position.x;
    next.z += move.z;
    if (this.collides(next.x, next.y, next.z)) next.z = this.position.z;

    next.y += this.velocity.y * dt;
    this.grounded = false;
    if (this.collides(next.x, next.y, next.z)) {
      if (this.velocity.y <= 0) this.grounded = true;
      next.y = this.position.y;
      this.velocity.y = 0;
    }
    if (next.y < 0) { next.y = 0; this.velocity.y = 0; this.grounded = true; }
    this.position.copy(next);
  }

  private updateCamera() {
    if (this.mode === 'build') {
      const { radius, theta, phi, target } = this.orbit;
      this.camera.position.set(
        target.x + radius * Math.sin(phi) * Math.cos(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.sin(theta),
      );
      this.camera.lookAt(target);
      this.avatar.visible = false;
      return;
    }
    this.avatar.visible = this.view === 'third';
    this.avatar.position.copy(this.position);
    if (this.sitting) this.avatar.position.y += 0.4;   // perched on the seat
    this.avatar.rotation.y = this.yaw;

    const look = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const eye = this.position.clone().add(new THREE.Vector3(0, EYE, 0));
    if (this.view === 'first') {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      return;
    }
    // Pull the camera in until it is clear of walls, or standing in a small room
    // would leave it stuck inside the geometry looking at a solid face.
    const back = look.clone().normalize();
    const wanted = 4.2;
    let distance = wanted;
    for (let step = 0.2; step <= wanted; step += 0.2) {
      const probe = eye.clone().add(back.clone().multiplyScalar(step));
      if (this.solidAt(Math.floor(probe.x), Math.floor(probe.y), Math.floor(probe.z))) {
        distance = Math.max(0, step - 0.3);
        break;
      }
    }
    if (distance < 0.7) {
      // No room behind the player — sit at the eye so the view stays usable.
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      this.avatar.visible = false;
      return;
    }
    this.camera.position.copy(eye.clone().add(back.multiplyScalar(distance)));
    this.camera.lookAt(eye);
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // ---- underground: just the player, the torch, and jewels to mine ----
    if (this.inCave) {
      this.walk(dt);
      if (this.torch) this.torch.position.set(this.position.x, 2.4, this.position.z);
      for (const gem of this.caveGems) {
        if (gem.taken) continue;
        gem.mesh.rotation.y += dt * 1.6;
        if (Math.hypot(gem.x - this.position.x, gem.z - this.position.z) < 1.4) { gem.taken = true; gem.mesh.visible = false; this.options.onGem?.(); }
      }
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this.loop);
      return;
    }
    if (this.wanderers.length) this.moveAnimals(dt);
    this.moveNeighbours(dt);
    this.updateDayNight(dt);
    if (this.waterfallMat?.map) this.waterfallMat.map.offset.y -= dt * 0.7;   // water flows down
    // The season drifts on its own, from a shared global clock — same for everyone.
    const gs = globalSeason();
    if (gs !== this.season) this.setSeason(gs);
    if (this.mode === 'walk') { this.walk(dt); this.checkForage(dt); this.checkGems(dt); this.moveWild(dt); this.checkChop(dt); }
    this.movePet(dt);
    // Keep the endless ground under you, and stream fresh hills as you roam.
    if (this.ground) this.ground.position.set(this.position.x, 0.99, this.position.z);
    if (Math.abs(this.position.x - this.terrainCenter.x) > LAND_STEP || Math.abs(this.position.z - this.terrainCenter.z) > LAND_STEP) this.streamLand();
    if (this.mode === 'build') {
      this.hovered = this.pick();
      if (this.hovered) {
        this.highlight.visible = true;
        this.highlight.position.set(this.hovered.x + 0.5, this.hovered.y + 0.5, this.hovered.z + 0.5);
      } else this.highlight.visible = false;
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
