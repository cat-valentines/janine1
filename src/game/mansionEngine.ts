import * as THREE from 'three';
import { pixelTexture } from './pixelTexture';
import {
  CELL, COLS, DAYS, HIDE_DISTANCE, KEEPER_CHASE_SPEED, KEEPER_FOV, KEEPER_HEARING,
  KEEPER_PATROL_SPEED, KEEPER_REACH, KEEPER_SEARCH_SECONDS, KEEPER_SIGHT, KEYS_TO_ESCAPE,
  PLAYER_EYE, PLAYER_RADIUS, PLAYER_SPEED, ROWS, SEARCH_HIDE_DISTANCE, SNEAK_SPEED, TURN_SPEED,
  STONES_PER_NIGHT, THROW_DISTANCE, THROW_HEARD, TRAP_SECONDS, WALL_H, cellAt, colOf, creakySpots,
  doorSpot, hideSpots, isWall, keySpots, rowOf, startSpot, stoneSpots, trapSpots, worldOf,
  type HideKind,
} from './mansion';

export interface MansionSnapshot {
  keys: number;
  totalKeys: number;
  day: number;
  totalDays: number;
  hidden: boolean;
  hideKind: HideKind | null;
  /** True when she saw you climb in — she is coming to look.  */
  busted: boolean;
  /** Seconds left in a bear trap, or 0. */
  trapped: number;
  stones: number;
  /** 0 calm, 1 hunting you. Drives the warning bar. */
  alarm: number;
  keeperState: 'patrol' | 'chase' | 'search';
  nearHide: boolean;
  nearDoor: boolean;
  status: 'playing' | 'caught' | 'escaped' | 'lost';
  party: boolean;
  level: number;
  message: string;
}

interface EngineOptions {
  characterAsset: string;
  /** "Play with everybody": a second housekeeper and a house full of bots. */
  party?: boolean;
  onUpdate: (snapshot: MansionSnapshot) => void;
}

/** A real player somewhere else in the world, drawn where they actually are. */
interface LiveFigure {
  group: THREE.Group;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  level: number;
}

/** A second keeper and the bots share this lighter state. */
interface Roamer {
  group: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  path: Cell[];
  repath: number;
  patrolAt: number;
}

interface Cell { col: number; row: number }

/** A stable colour hue for a player id, so each real player has their own tint. */
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * Shortest way through the house, square by square.
 *
 * A housekeeper who walks straight at you gets stuck on the first wall she
 * meets, which is neither scary nor fair, so she actually navigates.
 */
function findPath(from: Cell, to: Cell): Cell[] {
  if (from.col === to.col && from.row === to.row) return [];
  const key = (c: Cell) => c.row * COLS + c.col;
  const came = new Map<number, number>();
  const queue: Cell[] = [from];
  const seen = new Set<number>([key(from)]);
  const steps = [
    { col: 1, row: 0 }, { col: -1, row: 0 },
    { col: 0, row: 1 }, { col: 0, row: -1 },
  ];
  while (queue.length) {
    const at = queue.shift() as Cell;
    if (at.col === to.col && at.row === to.row) {
      const path: Cell[] = [];
      let node = key(at);
      while (node !== key(from)) {
        path.push({ col: node % COLS, row: Math.floor(node / COLS) });
        const previous = came.get(node);
        if (previous === undefined) break;
        node = previous;
      }
      return path.reverse();
    }
    for (const step of steps) {
      const next = { col: at.col + step.col, row: at.row + step.row };
      if (next.col < 0 || next.row < 0 || next.col >= COLS || next.row >= ROWS) continue;
      if (isWall(next.col, next.row)) continue;
      if (seen.has(key(next))) continue;
      seen.add(key(next));
      came.set(key(next), key(at));
      queue.push(next);
    }
  }
  return [];
}

export class MansionEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;
  private disposables: Array<{ dispose: () => void }> = [];

  private position = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();

  private keeper = new THREE.Group();
  private keeperPos = new THREE.Vector3();
  private keeperYaw = 0;
  private keeperState: 'patrol' | 'chase' | 'search' = 'patrol';
  private patrolPoints: Cell[] = [];
  private patrolAt = 0;
  private path: Cell[] = [];
  private repath = 0;
  private searchLeft = 0;
  private lastSeen = new THREE.Vector3();
  private hideAt = new THREE.Vector3();
  /** Where a stone just landed, for one frame. */
  private clatterAt: THREE.Vector3 | null = null;
  /** Party mode: a second keeper, roaming bot players, and unlockable levels. */
  private party = false;
  private level = 1;
  private speedMul = 1;
  private keeper2: Roamer | null = null;
  private bots: Array<Roamer & { flash: number }> = [];
  /** Real players in the match right now, keyed by their user id. */
  private livePlayers = new Map<string, LiveFigure>();
  private floorCells: Cell[] = [];

  private keyMeshes: Array<{ mesh: THREE.Object3D; taken: boolean; at: Cell; cooldown: number }> = [];
  private hideMeshes: Array<{ mesh: THREE.Object3D; at: Cell; kind: HideKind }> = [];
  private collected = 0;
  private day = 1;
  private hidden = false;
  private hideKind: HideKind | null = null;
  /** She watched you get in, so hiding will not save you this time. */
  private busted = false;
  /** Creaky boards already trodden on this trip across them. */
  private creakedAt = '';
  /** Set for one frame when a board groans, so she comes looking. */
  private creaked = false;
  /** Seconds still held by a bear trap. */
  private trapped = 0;
  private trapMeshes: Array<{ mesh: THREE.Object3D; at: Cell; sprung: boolean }> = [];
  private stones = STONES_PER_NIGHT;
  private thrown: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }> = [];
  private stoneGeo = new THREE.DodecahedronGeometry(0.14);
  private stoneMat = new THREE.MeshLambertMaterial({ color: '#8a8a92' });
  /** Loose stones lying on the floor, for flavour — you always carry three. */
  private stonePiles: THREE.Object3D[] = [];
  private alarm = 0;
  private status: MansionSnapshot['status'] = 'playing';
  private message = '';
  private messageUntil = 0;

  private torch: THREE.PointLight;
  private torches: Array<{ light: THREE.PointLight; flame: THREE.Mesh; seed: number }> = [];
  private running = true;
  private clock = new THREE.Clock();
  private time = 0;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // Without this, standing close to a wall clips the torchlight straight past
    // white and the whole screen goes blank. This rolls the highlights off.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 90);
    this.scene.background = new THREE.Color('#05060a');
    this.scene.fog = new THREE.Fog('#05060a', 4, 22);

    // Almost pitch dark. Your torch is nearly all the light there is.
    this.scene.add(new THREE.AmbientLight('#4a5175', 0.8));
    // A soft glow, not a floodlight. Any point light this close to a wall blows
    // the view out, so the wall torches do the real lighting and this only keeps
    // your own patch of floor readable.
    this.torch = new THREE.PointLight('#ffdba8', 3.6, 13, 1);
    this.scene.add(this.torch);

    this.buildHouse();
    this.buildCreaks();
    this.buildTraps();
    this.buildStones();
    this.buildTorches();
    this.buildKeys();
    this.buildHideSpots();
    this.buildKeeper(options.characterAsset);

    const start = worldOf(startSpot.col, startSpot.row);
    this.position.set(start.x, 0, start.z);
    this.yaw = Math.PI;

    this.planPatrol();
    const first = this.patrolPoints[0];
    const keeperStart = worldOf(first.col, first.row);
    this.keeperPos.set(keeperStart.x, 0, keeperStart.z);

    // Every walkable square, for random bot targets.
    for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) {
      if (!isWall(col, row)) this.floorCells.push({ col, row });
    }
    if (options.party) {
      this.party = true;
      this.buildParty();
    }

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // Dev-only: lets the headless test look straight at the housekeeper.
    if (import.meta.env.DEV) (window as unknown as { __MANSION: MansionEngine }).__MANSION = this;
    this.loop();
  }

  // ---- building ----------------------------------------------------------

  private buildHouse() {
    // Castle stone, flagstones underfoot and a timber ceiling.
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const wallMat = new THREE.MeshLambertMaterial({ map: pixelTexture('#7a7885', '#4e4c59', 'brick') });
    const floorMat = new THREE.MeshLambertMaterial({ map: pixelTexture('#5c5a66', '#3c3a46', 'cobble', COLS * 2, ROWS * 2) });
    const ceilMat = new THREE.MeshLambertMaterial({ map: pixelTexture('#3e2f24', '#2a1f18', 'planks', COLS, ROWS) });
    const doorMat = new THREE.MeshLambertMaterial({ map: pixelTexture('#7a4a22', '#4e2c11', 'planks'), emissive: '#3a1e08' });
    this.disposables.push(wallGeo, wallMat, floorMat, ceilMat, doorMat);

    const walls: THREE.Matrix4[] = [];
    const matrix = new THREE.Matrix4();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!isWall(col, row)) continue;
        const at = worldOf(col, row);
        walls.push(matrix.clone().makeTranslation(at.x, WALL_H / 2, at.z));
      }
    }
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
    walls.forEach((m, i) => wallMesh.setMatrixAt(i, m));
    wallMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(wallMesh);

    const w = COLS * CELL;
    const d = ROWS * CELL;
    const floorGeo = new THREE.PlaneGeometry(w, d);
    this.disposables.push(floorGeo);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0, d / 2);
    const ceiling = new THREE.Mesh(floorGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(w / 2, WALL_H, d / 2);
    this.scene.add(floor, ceiling);

    // Timber beams across the ceiling, the way a great hall is built.
    const beamGeo = new THREE.BoxGeometry(COLS * CELL, 0.26, 0.34);
    const beamMat = new THREE.MeshLambertMaterial({ color: '#33261d' });
    this.disposables.push(beamGeo, beamMat);
    for (let row = 1; row < ROWS; row += 2) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set((COLS * CELL) / 2, WALL_H - 0.16, (row + 0.5) * CELL);
      this.scene.add(beam);
    }

    // The way out: a studded oak door, glowing faintly so you can find it.
    const doorGeo = new THREE.BoxGeometry(CELL * 0.8, 2.6, 0.3);
    const bandGeo = new THREE.BoxGeometry(CELL * 0.84, 0.16, 0.36);
    const ironMat = new THREE.MeshLambertMaterial({ color: '#3a3a42' });
    this.disposables.push(doorGeo, bandGeo, ironMat);
    const door = new THREE.Mesh(doorGeo, doorMat);
    const at = worldOf(doorSpot.col, doorSpot.row);
    door.position.set(at.x, 1.3, at.z);
    this.scene.add(door);
    [0.55, 1.95].forEach((y) => {
      const band = new THREE.Mesh(bandGeo, ironMat);
      band.position.set(at.x, y, at.z);
      this.scene.add(band);
    });
    const glow = new THREE.PointLight('#ffb457', 6, 7, 2);
    glow.position.set(at.x, 1.8, at.z);
    this.scene.add(glow);
  }

  /** Bear traps, open and waiting. Drawn plainly — you are meant to see them. */
  private buildTraps() {
    const jawGeo = new THREE.TorusGeometry(0.42, 0.07, 6, 12);
    const plateGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10);
    const iron = new THREE.MeshLambertMaterial({ color: '#8b8b95', emissive: '#1a1a20' });
    this.disposables.push(jawGeo, plateGeo, iron);
    trapSpots.forEach((at) => {
      const world = worldOf(at.col, at.row);
      const group = new THREE.Group();
      const jaws = new THREE.Mesh(jawGeo, iron);
      jaws.rotation.x = Math.PI / 2;
      const plate = new THREE.Mesh(plateGeo, iron);
      plate.position.y = -0.02;
      group.add(jaws, plate);
      group.position.set(world.x, 0.09, world.z);
      this.scene.add(group);
      this.trapMeshes.push({ mesh: group, at, sprung: false });
    });
  }

  /** A little pile of stones, so the idea of throwing one is discoverable. */
  private buildStones() {
    this.disposables.push(this.stoneGeo, this.stoneMat);
    stoneSpots.forEach((at) => {
      const world = worldOf(at.col, at.row);
      [[-0.2, -0.15], [0.18, 0.1], [0, 0.28]].forEach(([dx, dz], i) => {
        const stone = new THREE.Mesh(this.stoneGeo, this.stoneMat);
        stone.position.set(world.x + dx, 0.12, world.z + dz);
        stone.rotation.set(i, i * 2, i * 3);
        this.scene.add(stone);
        this.stonePiles.push(stone);
      });
    });
  }

  /** Worn, split boards. Visible on purpose — a trap you cannot see is unfair. */
  private buildCreaks() {
    const geo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92);
    const mat = new THREE.MeshLambertMaterial({ map: pixelTexture('#6b4a2e', '#3d2716', 'planks') });
    this.disposables.push(geo, mat);
    creakySpots.forEach((at) => {
      const world = worldOf(at.col, at.row);
      const board = new THREE.Mesh(geo, mat);
      board.rotation.x = -Math.PI / 2;
      board.position.set(world.x, 0.02, world.z);
      this.scene.add(board);
    });
  }

  /**
   * Torches in iron brackets on the walls.
   *
   * Point lights are not free, so only a handful are placed and they are spread
   * around the house rather than clustered in one room.
   */
  private buildTorches() {
    const bracketGeo = new THREE.BoxGeometry(0.11, 0.52, 0.11);
    const flameGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const bracketMat = new THREE.MeshLambertMaterial({ color: '#2f2620' });
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
    this.disposables.push(bracketGeo, flameGeo, bracketMat, flameMat);

    const steps = [{ c: 1, r: 0 }, { c: -1, r: 0 }, { c: 0, r: 1 }, { c: 0, r: -1 }];
    const spots: Array<{ col: number; row: number; c: number; r: number }> = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (isWall(col, row)) continue;
        const against = steps.find((step) => isWall(col + step.c, row + step.r));
        if (against) spots.push({ col, row, c: against.c, r: against.r });
      }
    }
    // Spread the handful we can afford evenly around the house.
    const want = 7;
    const stride = Math.max(1, Math.floor(spots.length / want));
    for (let i = 0; i < want; i += 1) {
      const spot = spots[(i * stride) % spots.length];
      if (!spot) continue;
      const at = worldOf(spot.col, spot.row);
      const x = at.x + spot.c * CELL * 0.4;
      const z = at.z + spot.r * CELL * 0.4;
      const bracket = new THREE.Mesh(bracketGeo, bracketMat);
      bracket.position.set(x, 2.05, z);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 2.36, z);
      const light = new THREE.PointLight('#ff9b3d', 5.4, 11, 1.25);
      light.position.set(x, 2.4, z);
      this.scene.add(bracket, flame, light);
      this.torches.push({ light, flame, seed: i * 1.7 });
    }
  }

  private buildKeys() {
    const geo = new THREE.TorusGeometry(0.18, 0.06, 8, 14);
    const stem = new THREE.BoxGeometry(0.09, 0.42, 0.09);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffd94a', emissive: '#d0a01e' }); // strongly self-lit so the keys glow gold in the dark and are easy to find
    this.disposables.push(geo, stem, mat);
    keySpots.forEach((at) => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geo, mat));
      const bar = new THREE.Mesh(stem, mat);
      bar.position.y = -0.3;
      group.add(bar);
      const world = worldOf(at.col, at.row);
      group.position.set(world.x, 1.1, world.z);
      this.scene.add(group);
      this.keyMeshes.push({ mesh: group, taken: false, at, cooldown: 0 });
    });
  }

  private buildHideSpots() {
    const wardrobeGeo = new THREE.BoxGeometry(CELL * 0.7, 2.3, CELL * 0.5);
    const handleGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    const bedGeo = new THREE.BoxGeometry(CELL * 0.62, 0.34, CELL * 0.92);
    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
    const sheetGeo = new THREE.BoxGeometry(CELL * 0.58, 0.14, CELL * 0.5);
    const wood = new THREE.MeshLambertMaterial({ map: pixelTexture('#5b3a24', '#3a2415', 'planks') });
    const handleMat = new THREE.MeshLambertMaterial({ color: '#d8c08a' });
    const sheetMat = new THREE.MeshLambertMaterial({ color: '#9a8f9e' });
    const seamGeo = new THREE.BoxGeometry(0.05, 2.0, 0.05);   // the split between the two doors
    const seamMat = new THREE.MeshLambertMaterial({ color: '#241408' });
    this.disposables.push(wardrobeGeo, handleGeo, bedGeo, legGeo, sheetGeo, wood, handleMat, sheetMat, seamGeo, seamMat);

    hideSpots.forEach((at) => {
      const world = worldOf(at.col, at.row);
      if (at.kind === 'wardrobe') {
        const wardrobe = new THREE.Mesh(wardrobeGeo, wood);
        wardrobe.position.set(world.x, 1.15, world.z);
        const front = world.z + CELL * 0.25;
        // a centre seam + a handle on each door, so it reads as a wardrobe to hide in
        const seam = new THREE.Mesh(seamGeo, seamMat);
        seam.position.set(world.x, 1.15, front + 0.01);
        const h1 = new THREE.Mesh(handleGeo, handleMat); h1.position.set(world.x - 0.13, 1.15, front + 0.02);
        const h2 = new THREE.Mesh(handleGeo, handleMat); h2.position.set(world.x + 0.13, 1.15, front + 0.02);
        this.scene.add(wardrobe, seam, h1, h2);
        this.hideMeshes.push({ mesh: wardrobe, at, kind: 'wardrobe' });
        return;
      }
      // A bed on legs, with a gap underneath to slide into.
      const frame = new THREE.Mesh(bedGeo, wood);
      frame.position.set(world.x, 0.62, world.z);
      const sheet = new THREE.Mesh(sheetGeo, sheetMat);
      sheet.position.set(world.x, 0.85, world.z);
      this.scene.add(frame, sheet);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const leg = new THREE.Mesh(legGeo, wood);
        leg.position.set(world.x + sx * CELL * 0.26, 0.2, world.z + sz * CELL * 0.4);
        this.scene.add(leg);
      });
      this.hideMeshes.push({ mesh: frame, at, kind: 'bed' });
    });
  }

  private buildKeeper(asset: string) {
    void asset; // she no longer wears the player's face — she is her own dread now
    const body = new THREE.MeshLambertMaterial({ color: '#2f1019', emissive: '#140508' }); // blood-dark robe
    // pale, faintly self-lit skin so her face floats out of the dark even with no light on it
    const skin = new THREE.MeshLambertMaterial({ color: '#e9e0cf', emissive: '#5a5344' });
    const torsoGeo = new THREE.BoxGeometry(0.64, 1.08, 0.34);
    const headGeo = new THREE.BoxGeometry(0.5, 0.56, 0.48);
    this.disposables.push(body, skin, torsoGeo, headGeo);
    const torso = new THREE.Mesh(torsoGeo, body);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.8;
    this.keeper.add(torso, head);

    // stringy dark hair framing a hollow face
    const hairMat = new THREE.MeshLambertMaterial({ color: '#0f070c' });
    const hairGeo = new THREE.BoxGeometry(0.58, 0.42, 0.54);
    const fringeGeo = new THREE.BoxGeometry(0.54, 0.16, 0.06);
    this.disposables.push(hairMat, hairGeo, fringeGeo);
    const hair = new THREE.Mesh(hairGeo, hairMat); hair.position.set(0, 2.02, -0.03);
    const fringe = new THREE.Mesh(fringeGeo, hairMat); fringe.position.set(0, 1.96, 0.25);
    this.keeper.add(hair, fringe);

    // sunken dark eye sockets, then big glowing red eyes that clearly stick out
    const socketMat = new THREE.MeshBasicMaterial({ color: '#160305' });
    const socketGeo = new THREE.BoxGeometry(0.19, 0.15, 0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff2323' });   // unlit → always burns red, even in pitch dark
    const eyeGeo = new THREE.BoxGeometry(0.13, 0.1, 0.07);
    const mouthMat = new THREE.MeshBasicMaterial({ color: '#1a0206' });
    const mouthGeo = new THREE.BoxGeometry(0.28, 0.09, 0.05);
    const toothGeo = new THREE.BoxGeometry(0.035, 0.06, 0.05);
    const toothMat = new THREE.MeshLambertMaterial({ color: '#efe6d4', emissive: '#4a4438' });
    this.disposables.push(socketMat, socketGeo, eyeMat, eyeGeo, mouthMat, mouthGeo, toothGeo, toothMat);
    [-0.12, 0.12].forEach((x) => {
      const socket = new THREE.Mesh(socketGeo, socketMat); socket.position.set(x, 1.86, 0.235);
      const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.set(x, 1.86, 0.28);
      this.keeper.add(socket, eye);
    });
    const eyeGlow = new THREE.PointLight('#ff2323', 2.4, 4.2, 2); eyeGlow.position.set(0, 1.86, 0.42); this.keeper.add(eyeGlow);
    // a grim, gap-toothed grimace
    const mouth = new THREE.Mesh(mouthGeo, mouthMat); mouth.position.set(0, 1.64, 0.25); this.keeper.add(mouth);
    [-0.09, -0.03, 0.03, 0.09].forEach((x) => { const t = new THREE.Mesh(toothGeo, toothMat); t.position.set(x, 1.64, 0.27); this.keeper.add(t); });

    // a long, gaunt arm holding the axe out in front
    const armGeo = new THREE.BoxGeometry(0.16, 0.16, 0.72);
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(0.34, 1.15, 0.3);
    this.keeper.add(arm);

    // The axe: a wooden haft and a metal head, held out in front of her.
    const axe = new THREE.Group();
    const haftGeo = new THREE.BoxGeometry(0.07, 0.07, 1.0);
    const haftMat = new THREE.MeshLambertMaterial({ color: '#5b3a22' });
    const bladeGeo = new THREE.BoxGeometry(0.09, 0.46, 0.34);
    const bladeMat = new THREE.MeshLambertMaterial({ color: '#c7ccd4', emissive: '#20242b' });
    this.disposables.push(armGeo, haftGeo, haftMat, bladeGeo, bladeMat);
    const haft = new THREE.Mesh(haftGeo, haftMat);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0.05, 0.5);
    axe.add(haft, blade);
    axe.position.set(0.4, 1.05, 0.55);
    this.keeper.add(axe);

    // No name tag on the keepers — a label that reads through walls gave her
    // away. Her lamp is the only warning you get.
    // Her lamp — if you can see it coming, you still have time.
    const lamp = new THREE.PointLight('#ff9f6e', 7, 9, 2);
    lamp.position.set(0, 1.5, 0.4);
    this.keeper.add(lamp);
    this.scene.add(this.keeper);
  }

  /** A floating name tag sprite that reads through the dark. */
  private nameSprite(text: string, colour: string, border: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0810d8';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = border;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.font = 'bold 24px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.fillText(text.slice(0, 16), 128, 34);
    }
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true });
    this.disposables.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.65, 1);
    sprite.position.y = 2.4;
    return sprite;
  }

  /** A blocky person: another keeper, or a bot player. */
  private buildFigure(bodyColour: string, tag: string, tagColour: string, border: string, withAxe: boolean) {
    const group = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: bodyColour });
    const skin = new THREE.MeshLambertMaterial({ color: '#d8bfae' });
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.95, 0.32);
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.disposables.push(body, skin, torsoGeo, headGeo);
    const torso = new THREE.Mesh(torsoGeo, body);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.75;
    group.add(torso, head);
    // Arms and legs, so a bot reads as a whole person, not a floating torso.
    const limbGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
    this.disposables.push(limbGeo);
    [[-0.35, 1.05], [0.35, 1.05]].forEach(([x, y]) => {
      const arm = new THREE.Mesh(limbGeo, body);
      arm.position.set(x, y, 0);
      group.add(arm);
    });
    [[-0.15, 0.3], [0.15, 0.3]].forEach(([x, y]) => {
      const leg = new THREE.Mesh(limbGeo, body);
      leg.position.set(x, y, 0);
      group.add(leg);
    });
    if (withAxe) {
      const haftGeo = new THREE.BoxGeometry(0.07, 0.07, 0.9);
      const bladeGeo = new THREE.BoxGeometry(0.09, 0.42, 0.32);
      const haftMat = new THREE.MeshLambertMaterial({ color: '#5b3a22' });
      const bladeMat = new THREE.MeshLambertMaterial({ color: '#c7ccd4', emissive: '#20242b' });
      this.disposables.push(haftGeo, bladeGeo, haftMat, bladeMat);
      const axe = new THREE.Group();
      axe.add(new THREE.Mesh(haftGeo, haftMat));
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0, 0.05, 0.45);
      axe.add(blade);
      axe.position.set(0.38, 1.05, 0.5);
      group.add(axe);
    }
    if (tag) group.add(this.nameSprite(tag, tagColour, border));
    // Keep the body material to hand so real players can be given a soft glow
    // (see setLivePlayers).
    group.userData.bodyMat = body;
    this.scene.add(group);
    return group;
  }

  /** Build the second keeper and the roaming bot players. */
  private buildParty() {
    const mid = Math.floor(this.patrolPoints.length / 2);
    const spot = this.patrolPoints[mid];
    const w = worldOf(spot.col, spot.row);
    const group = this.buildFigure('#33244a', '', '#ffb0c0', '#c0455a', true);
    const lamp = new THREE.PointLight('#9fc6ff', 6, 8, 2);
    lamp.position.set(0, 1.5, 0.4);
    group.add(lamp);
    this.keeper2 = { group, pos: new THREE.Vector3(w.x, 0, w.z), yaw: 0, path: [], repath: 0, patrolAt: mid };

    const colours = ['#c9782e', '#2e8bc9', '#3fa34d', '#b0407a', '#7a5cc0'];
    // Everyone starts in the same place — the bedroom you wake up in — so you
    // see the whole crowd at the drop, then they scatter to hunt keys.
    const spots = this.cellsNearStart(8);
    for (let i = 0; i < 5; i += 1) {
      const cell = spots[(i + 1) % spots.length];
      const world = worldOf(cell.col, cell.row);
      const ox = (Math.random() - 0.5) * 1.2;
      const oz = (Math.random() - 0.5) * 1.2;
      // Filler bots: AI-driven and nameless, forever. They are never dressed up
      // as real players — the real ones come in over the network (setLivePlayers).
      const figure = this.buildFigure(colours[i % colours.length], '', '#f2c94c', '#c9a02e', false);
      this.bots.push({ group: figure, pos: new THREE.Vector3(world.x + ox, 0, world.z + oz), yaw: 0, path: [], repath: 0, patrolAt: 0, flash: 0 });
    }
  }

  /** My position, for broadcasting to the other real players in the match. */
  getSelfState() {
    return { x: this.position.x, z: this.position.z, yaw: this.yaw, level: this.level };
  }

  /**
   * Draw the *real* players at the positions they just sent us. Only players on
   * my level show (a deeper level is its own separate house). Each wears their
   * @name and a soft blue glow, and is driven entirely by the network — never
   * AI — so what you see is genuinely where they are. Anyone who left is removed.
   */
  setLivePlayers(players: Array<{ id: string; name: string; x: number; z: number; yaw: number; level: number }>) {
    const here = new Set<string>();
    players.forEach((player) => {
      if (player.level !== this.level) return;
      here.add(player.id);
      let live = this.livePlayers.get(player.id);
      if (!live) {
        const hue = hashHue(player.id);
        const group = this.buildFigure(`hsl(${hue}, 62%, 56%)`, `@${player.name}`, '#d6ecff', '#2f6fb0', false);
        const bodyMat = group.userData.bodyMat as THREE.MeshLambertMaterial | undefined;
        bodyMat?.emissive.set('#14385c'); // a friendly glow so you spot them in the dark
        live = {
          group,
          pos: new THREE.Vector3(player.x, 0, player.z),
          target: new THREE.Vector3(player.x, 0, player.z),
          yaw: player.yaw, targetYaw: player.yaw, level: player.level,
        };
        this.livePlayers.set(player.id, live);
      }
      live.target.set(player.x, 0, player.z);
      live.targetYaw = player.yaw;
    });
    this.livePlayers.forEach((live, id) => {
      if (here.has(id)) return;
      this.scene.remove(live.group);
      this.livePlayers.delete(id);
    });
  }

  private randomCell(): Cell {
    return this.floorCells[Math.floor(Math.random() * this.floorCells.length)];
  }

  /** Floor squares nearest the starting bedroom, so everyone starts together. */
  private cellsNearStart(n: number): Cell[] {
    return [...this.floorCells]
      .sort((a, b) => Math.hypot(a.col - startSpot.col, a.row - startSpot.row)
        - Math.hypot(b.col - startSpot.col, b.row - startSpot.row))
      .slice(0, n);
  }

  /** A round of the house that actually visits every room. */
  private planPatrol() {
    this.patrolPoints = [...keySpots, ...hideSpots, { col: doorSpot.col, row: doorSpot.row - 1 }]
      .filter((at) => !isWall(at.col, at.row));
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'KeyE'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Space') this.useSpace();
    if (event.code === 'KeyE') this.throwStone();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private say(text: string, seconds = 2.2) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  private nearestHide() {
    let best: { at: Cell; distance: number; kind: HideKind; world: { x: number; z: number } } | null = null;
    this.hideMeshes.forEach((spot) => {
      const world = worldOf(spot.at.col, spot.at.row);
      const distance = Math.hypot(world.x - this.position.x, world.z - this.position.z);
      if (!best || distance < best.distance) best = { at: spot.at, distance, kind: spot.kind, world };
    });
    return best as { at: Cell; distance: number; kind: HideKind; world: { x: number; z: number } } | null;
  }

  private atDoor() {
    const world = worldOf(doorSpot.col, doorSpot.row);
    return Math.hypot(world.x - this.position.x, world.z - this.position.z) < 2.2;
  }

  /** Space does the obvious thing: hide, come out, or open the door. */
  private useSpace() {
    if (this.status !== 'playing') return;
    if (this.hidden) { this.hidden = false; this.hideKind = null; this.busted = false; this.say('You slip back out.', 1.4); return; }
    const hide = this.nearestHide();
    if (hide && hide.distance < HIDE_DISTANCE) {
      // If she watched you climb in, hiding will not save you — she comes to look.
      this.busted = this.canSee();
      this.hidden = true;
      this.hideKind = hide.kind;
      this.hideAt.set(hide.world.x, 0, hide.world.z);
      if (this.busted) this.say('😱 She saw you get in!', 2.4);
      else this.say(hide.kind === 'bed' ? '🛏️ Under the bed. Stay still…' : '🚪 In the wardrobe. Stay still…', 2);
      return;
    }
    if (this.atDoor()) {
      if (this.collected >= KEYS_TO_ESCAPE) {
        if (this.party) this.nextLevel();
        else { this.status = 'escaped'; this.say('🚪 You got out!', 6); }
      } else {
        this.say(`🔒 Locked. You need ${KEYS_TO_ESCAPE - this.collected} more keys.`, 2.4);
      }
    }
  }

  /**
   * Lob a stone. It clatters where it lands, and she goes to look there —
   * which is the whole point: it buys you the room she is standing in.
   */
  private throwStone() {
    if (this.status !== 'playing' || this.hidden || this.stones <= 0) return;
    this.stones -= 1;
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    const to = this.position.clone().add(look.multiplyScalar(THROW_DISTANCE));
    // Do not let it sail through a wall — stop it at the first one.
    const steps = Math.ceil(THROW_DISTANCE / 0.5);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = this.position.x + (to.x - this.position.x) * t;
      const z = this.position.z + (to.z - this.position.z) * t;
      if (isWall(colOf(x), rowOf(z))) {
        to.set(this.position.x + (to.x - this.position.x) * ((i - 1) / steps), 0,
          this.position.z + (to.z - this.position.z) * ((i - 1) / steps));
        break;
      }
    }
    const mesh = new THREE.Mesh(this.stoneGeo, this.stoneMat);
    this.scene.add(mesh);
    this.thrown.push({ mesh, from: this.position.clone().setY(1.2), to: to.setY(0.12), t: 0 });
    this.say('🪨 You lob a stone…', 1.2);
  }

  // ---- movement ----------------------------------------------------------

  private blocked(x: number, z: number) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const col = colOf(x + dx * PLAYER_RADIUS);
        const row = rowOf(z + dz * PLAYER_RADIUS);
        if (isWall(col, row)) return true;
      }
    }
    return false;
  }

  private movePlayer(dt: number) {
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    if (turn) this.yaw += turn * TURN_SPEED * dt;
    // Held in a trap: you can look around, and that is all.
    if (this.trapped > 0) {
      this.trapped = Math.max(0, this.trapped - dt);
      if (this.trapped === 0) this.say('You prise it open and pull free.', 1.6);
      return;
    }
    const forward = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    if (this.hidden || !forward) return;

    // Shift sneaks: slower, but she cannot hear you.
    const sneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sneaking ? SNEAK_SPEED : PLAYER_SPEED;
    const dx = Math.sin(this.yaw) * -forward * speed * dt;
    const dz = Math.cos(this.yaw) * -forward * speed * dt;
    // Slide along walls rather than sticking to them.
    if (!this.blocked(this.position.x + dx, this.position.z)) this.position.x += dx;
    if (!this.blocked(this.position.x, this.position.z + dz)) this.position.z += dz;

    // Bear traps. They do not care how quietly you were walking.
    const trap = this.trapMeshes.find((item) => !item.sprung
      && item.at.col === colOf(this.position.x) && item.at.row === rowOf(this.position.z));
    if (trap) {
      trap.sprung = true;
      trap.mesh.scale.set(1, 0.35, 1);
      this.trapped = TRAP_SECONDS;
      this.creaked = true;
      this.say('🪤 A bear trap! You cannot move — and she heard you!', 2.6);
      return;
    }

    // Creaky floorboards. Sneaking over one is fine; running over it is not.
    const here = `${colOf(this.position.x)},${rowOf(this.position.z)}`;
    if (cellAt(colOf(this.position.x), rowOf(this.position.z)) === 'C') {
      if (!sneaking && this.creakedAt !== here) {
        this.creakedAt = here;
        this.creaked = true;
        this.say('🪵 CREAK! The floorboard groans…', 1.8);
      }
    } else if (this.creakedAt === here) {
      this.creakedAt = '';
    }
  }

  /** Can a keeper at this spot, facing this way, see you? */
  private canSeeFrom(pos: THREE.Vector3, yaw: number) {
    if (this.hidden || this.status !== 'playing') return false;
    const to = new THREE.Vector3().subVectors(this.position, pos);
    const distance = to.length();
    if (distance > KEEPER_SIGHT) return false;
    const facing = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).negate();
    if (to.clone().normalize().dot(facing) < Math.cos(KEEPER_FOV)) return false;
    // Walk the line between us: any wall in the way and she sees nothing.
    const steps = Math.ceil(distance / 0.4);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = pos.x + to.x * t;
      const z = pos.z + to.z * t;
      if (isWall(colOf(x), rowOf(z))) return false;
    }
    return true;
  }

  private canSee() { return this.canSeeFrom(this.keeperPos, this.keeperYaw); }

  /** Generic pathfollowing for the second keeper and the bots. */
  private advance(m: Roamer, dt: number, speed: number) {
    if (!m.path.length) return;
    const next = m.path[0];
    const world = worldOf(next.col, next.row);
    const dx = world.x - m.pos.x;
    const dz = world.z - m.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.25) { m.path.shift(); return; }
    m.pos.x += (dx / distance) * speed * dt;
    m.pos.z += (dz / distance) * speed * dt;
    m.yaw = Math.atan2(-dx, -dz);
  }

  /** The second keeper: a simpler patroller that chases the moment it sees you. */
  private moveKeeper2(dt: number) {
    const k = this.keeper2;
    if (!k) return;
    const here = { col: colOf(k.pos.x), row: rowOf(k.pos.z) };
    const seen = this.canSeeFrom(k.pos, k.yaw);
    k.repath -= dt;
    if (seen) {
      if (k.repath <= 0 || !k.path.length) { k.path = findPath(here, { col: colOf(this.position.x), row: rowOf(this.position.z) }); k.repath = 0.4; }
      this.advance(k, dt, KEEPER_CHASE_SPEED * this.speedMul);
      this.alarm = 1;
    } else {
      if (!k.path.length) { k.patrolAt = (k.patrolAt + 1) % this.patrolPoints.length; k.path = findPath(here, this.patrolPoints[k.patrolAt]); }
      this.advance(k, dt, KEEPER_PATROL_SPEED * this.speedMul);
    }
    if (!this.hidden && k.pos.distanceTo(this.position) < KEEPER_REACH) this.caught('🪓 The second housekeeper caught you!');
  }

  /**
   * Bot players racing to find the keys, each on their own — fleeing whichever
   * keeper gets close, then getting back to the hunt.
   */
  private moveBots(dt: number) {
    const keepers = [this.keeperPos];
    if (this.keeper2) keepers.push(this.keeper2.pos);
    const keys = this.keyMeshes.filter((key) => !key.taken);
    this.bots.forEach((bot, i) => {
      if (bot.flash > 0) bot.flash -= dt;
      const here = { col: colOf(bot.pos.x), row: rowOf(bot.pos.z) };
      let nearest = Infinity;
      keepers.forEach((kp) => { const d = kp.distanceTo(bot.pos); if (d < nearest) nearest = d; });
      bot.repath -= dt;

      if (nearest < 6) {
        // A keeper is close — run somewhere random to get away.
        if (bot.repath <= 0 || !bot.path.length) { bot.path = findPath(here, this.randomCell()); bot.repath = 0.7; }
        this.advance(bot, dt, KEEPER_PATROL_SPEED * 1.35);
      } else if (keys.length) {
        // Race for a key — bots spread across the different keys.
        const key = keys[i % keys.length];
        const target = key.at;
        if (bot.repath <= 0 || !bot.path.length) { bot.path = findPath(here, target); bot.repath = 1.4; }
        this.advance(bot, dt, KEEPER_PATROL_SPEED * 1.05);
        // First come, first served: a bot that gets there first snatches it. To
        // keep the game winnable it does not vanish — the bot grabs it and drops
        // it somewhere new as it runs, so you have to find it again.
        if (bot.pos.distanceTo(key.mesh.position) < 1.4 && key.cooldown <= 0) {
          const playerFar = this.position.distanceTo(key.mesh.position) > 3.5;
          if (playerFar) {
            const cell = this.randomCell();
            const w = worldOf(cell.col, cell.row);
            key.at = cell;
            key.mesh.position.set(w.x, 1.1, w.z);
            key.cooldown = 6;
            bot.path = [];
            bot.repath = 1.6;
            this.say('🏃 A player grabbed a key — it is somewhere else now!', 2.2);
          }
        }
      } else {
        // All keys found — just roam.
        if (!bot.path.length) bot.path = findPath(here, this.randomCell());
        this.advance(bot, dt, KEEPER_PATROL_SPEED);
      }

      // Caught: dragged off, reappears elsewhere — so the house stays busy.
      if (nearest < KEEPER_REACH) {
        const cell = this.randomCell();
        const w = worldOf(cell.col, cell.row);
        bot.pos.set(w.x, 0, w.z);
        bot.path = [];
        bot.flash = 0.6;
      }
    });
  }

  /** Escaping in party mode opens a deeper, harder level instead of winning. */
  private nextLevel() {
    this.level += 1;
    this.speedMul += 0.12;
    this.collected = 0;
    this.keyMeshes.forEach((key) => { key.taken = false; key.mesh.visible = true; });
    const start = worldOf(startSpot.col, startSpot.row);
    this.position.set(start.x, 0, start.z);
    this.yaw = Math.PI;
    this.hidden = false; this.hideKind = null; this.busted = false;
    // The others follow you into the new level — back at the start with you.
    const spots = this.cellsNearStart(8);
    this.bots.forEach((bot, i) => {
      const cell = spots[(i + 1) % spots.length];
      const world = worldOf(cell.col, cell.row);
      bot.pos.set(world.x + (Math.random() - 0.5) * 1.2, 0, world.z + (Math.random() - 0.5) * 1.2);
      bot.path = [];
    });
    this.say(`🔒 Level ${this.level} unlocked! Find the keys again — the house is more dangerous now.`, 4.5);
  }

  /** Running is loud. Sneaking is not. */
  private canHear() {
    if (this.hidden || this.status !== 'playing') return false;
    const running = (this.keys.has('ArrowUp') || this.keys.has('ArrowDown'))
      && !(this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    if (!running) return false;
    return this.keeperPos.distanceTo(this.position) < KEEPER_HEARING;
  }

  private stepAlongPath(dt: number, speed: number) {
    if (!this.path.length) return;
    const next = this.path[0];
    const world = worldOf(next.col, next.row);
    const dx = world.x - this.keeperPos.x;
    const dz = world.z - this.keeperPos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.25) { this.path.shift(); return; }
    this.keeperPos.x += (dx / distance) * speed * dt;
    this.keeperPos.z += (dz / distance) * speed * dt;
    this.keeperYaw = Math.atan2(-dx, -dz);
  }

  private moveKeeper(dt: number) {
    const here = { col: colOf(this.keeperPos.x), row: rowOf(this.keeperPos.z) };
    const seen = this.canSee();
    const heard = this.canHear() || this.creaked;
    this.creaked = false;

    // A stone that has just landed pulls her away from wherever she was.
    if (this.clatterAt && this.keeperPos.distanceTo(this.clatterAt) < THROW_HEARD) {
      this.lastSeen.copy(this.clatterAt);
      this.keeperState = 'search';
      this.searchLeft = KEEPER_SEARCH_SECONDS;
      this.path = [];
      this.repath = 0;
      this.clatterAt = null;
    } else {
      this.clatterAt = null;
    }

    if (seen || heard) {
      if (this.keeperState !== 'chase') this.say(seen ? '👀 She has seen you — run!' : '👂 She heard you!', 1.8);
      this.keeperState = 'chase';
      this.searchLeft = KEEPER_SEARCH_SECONDS;
      this.lastSeen.copy(this.position);
    } else if (this.keeperState === 'chase') {
      this.keeperState = 'search';
    }

    this.repath -= dt;
    if (this.keeperState === 'chase') {
      if (this.repath <= 0 || !this.path.length) {
        this.path = findPath(here, { col: colOf(this.lastSeen.x), row: rowOf(this.lastSeen.z) });
        this.repath = 0.35;
      }
      this.stepAlongPath(dt, KEEPER_CHASE_SPEED);
      this.alarm = Math.min(1, this.alarm + dt * 2);
    } else if (this.keeperState === 'search') {
      this.searchLeft -= dt;
      if (this.repath <= 0 || !this.path.length) {
        this.path = findPath(here, { col: colOf(this.lastSeen.x), row: rowOf(this.lastSeen.z) });
        this.repath = 0.6;
      }
      this.stepAlongPath(dt, KEEPER_PATROL_SPEED * 1.3);
      this.alarm = Math.max(0.35, this.alarm - dt * 0.1);
      if (this.searchLeft <= 0) {
        this.keeperState = 'patrol';
        this.path = [];
        this.say('She gave up looking.', 1.8);
      }
    } else {
      this.alarm = Math.max(0, this.alarm - dt * 0.5);
      if (!this.path.length) {
        this.patrolAt = (this.patrolAt + 1) % this.patrolPoints.length;
        this.path = findPath(here, this.patrolPoints[this.patrolAt]);
      }
      this.stepAlongPath(dt, KEEPER_PATROL_SPEED);
    }

    // Hiding only works if she did not watch you do it. If she did, she comes
    // straight to the wardrobe and opens it.
    if (this.hidden && this.busted) {
      if (this.repath <= 0 || !this.path.length) {
        this.path = findPath(here, { col: colOf(this.hideAt.x), row: rowOf(this.hideAt.z) });
        this.repath = 0.5;
      }
      this.stepAlongPath(dt, KEEPER_CHASE_SPEED * 0.8);
      this.keeperState = 'search';
      this.alarm = 1;
      if (this.keeperPos.distanceTo(this.hideAt) < SEARCH_HIDE_DISTANCE) {
        this.caught('🚪 She opened it. She knew you were in there.');
        return;
      }
    }

    if (!this.hidden && this.keeperPos.distanceTo(this.position) < KEEPER_REACH) {
      this.caught('🖐️ She caught you!');
    }
  }

  /**
   * Being caught costs you a night, not the whole game — the way Granny does
   * it. Keys you already found stay found.
   */
  private caught(why: string) {
    this.day += 1;
    this.hidden = false;
    this.hideKind = null;
    this.busted = false;
    if (this.day > DAYS) {
      this.status = 'lost';
      this.say(why, 6);
      return;
    }
    this.status = 'caught';
    this.say(why, 6);
  }

  /** A new night: back to your bedroom, she goes back to her rounds. */
  wakeUp() {
    if (this.status !== 'caught') return;
    const start = worldOf(startSpot.col, startSpot.row);
    this.position.set(start.x, 0, start.z);
    this.yaw = Math.PI;
    const first = this.patrolPoints[0];
    const at = worldOf(first.col, first.row);
    this.keeperPos.set(at.x, 0, at.z);
    this.keeperState = 'patrol';
    this.path = [];
    this.alarm = 0;
    this.trapped = 0;
    this.stones = STONES_PER_NIGHT;
    this.trapMeshes.forEach((trap) => { trap.sprung = false; trap.mesh.scale.set(1, 1, 1); });
    this.status = 'playing';
    this.say(`🌙 Night ${this.day}. She is walking again…`, 3);
  }

  private collectKeys() {
    this.keyMeshes.forEach((key) => {
      if (key.cooldown > 0) key.cooldown -= 1 / 60;
      if (key.taken) return;
      if (key.mesh.position.distanceTo(this.position) > 1.5) return;
      key.taken = true;
      key.mesh.visible = false;
      this.collected += 1;
      this.say(`🔑 Key ${this.collected} of ${KEYS_TO_ESCAPE}!`, 2);
    });
  }

  private snapshot(): MansionSnapshot {
    const hide = this.nearestHide();
    return {
      keys: this.collected, totalKeys: KEYS_TO_ESCAPE,
      day: this.day, totalDays: DAYS,
      hidden: this.hidden, hideKind: this.hideKind, busted: this.busted,
      trapped: Math.ceil(this.trapped), stones: this.stones,
      alarm: this.alarm, keeperState: this.keeperState,
      nearHide: !!hide && hide.distance < HIDE_DISTANCE,
      nearDoor: this.atDoor(),
      status: this.status,
      party: this.party, level: this.level,
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((item) => item.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.status === 'playing') {
      this.movePlayer(dt);
      this.moveKeeper(dt);
      if (this.party) { this.moveKeeper2(dt); this.moveBots(dt); }
      this.collectKeys();
    }

    this.keeper.position.copy(this.keeperPos);
    this.keeper.rotation.y = this.keeperYaw;
    if (this.keeper2) { this.keeper2.group.position.copy(this.keeper2.pos); this.keeper2.group.rotation.y = this.keeper2.yaw; }
    this.bots.forEach((bot) => { bot.group.position.copy(bot.pos); bot.group.rotation.y = bot.yaw; });
    // Real players glide smoothly toward the latest position they sent us.
    if (this.livePlayers.size) {
      const ease = Math.min(1, dt * 10);
      this.livePlayers.forEach((live) => {
        live.pos.lerp(live.target, ease);
        live.group.position.copy(live.pos);
        let dy = live.targetYaw - live.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        live.yaw += dy * ease;
        live.group.rotation.y = live.yaw;
      });
    }
    this.keyMeshes.forEach((key) => { key.mesh.rotation.y = this.time * 1.6; });

    this.thrown = this.thrown.filter((stone) => {
      stone.t += dt * 1.8;
      if (stone.t >= 1) {
        this.scene.remove(stone.mesh);
        this.clatterAt = stone.to.clone();
        return false;
      }
      // A lobbed arc, rather than a laser beam.
      stone.mesh.position.lerpVectors(stone.from, stone.to, stone.t);
      stone.mesh.position.y += Math.sin(stone.t * Math.PI) * 1.1;
      stone.mesh.rotation.set(stone.t * 9, stone.t * 7, 0);
      return true;
    });
    this.torches.forEach((torch) => {
      const flicker = 0.78 + Math.sin(this.time * 8.5 + torch.seed) * 0.13 + Math.sin(this.time * 21 + torch.seed * 3) * 0.09;
      torch.light.intensity = 5.4 * flicker;
      torch.flame.scale.setScalar(0.82 + flicker * 0.3);
    });

    // Hiding drops you down inside the wardrobe and kills your torch.
    const eye = !this.hidden ? PLAYER_EYE : this.hideKind === 'bed' ? 0.45 : 1.05;
    this.camera.position.set(this.position.x, eye, this.position.z);
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    this.camera.lookAt(this.camera.position.clone().add(look));
    this.torch.position.set(this.position.x, 1.9, this.position.z);
    this.torch.intensity = this.hidden ? 0.7 : 3.6;

    this.renderer.render(this.scene, this.camera);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
