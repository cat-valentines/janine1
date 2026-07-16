import * as THREE from 'three';
import { pixelTexture, shade } from './pixelTexture';
import {
  CELL, COLS, KEYS_TO_WIN, ROWS, START_LIVES,
  colOf, fishById, generateReef, rowOf, worldOf,
  type Cell, type FishId, type Reef,
} from './reef';

// ---- tuning ------------------------------------------------------------------

const WATER_TOP = 8.5;        // the shimmering surface
const SWIM_LOW = 1.4;         // you cannot sink through the sand
const SWIM_HIGH = 7.6;        // you cannot leap out of the water
const CRUISE = 2.6;           // where a fish naturally floats
const SWIM_SPEED = 7.2;
const TURN_SPEED = 2.3;       // radians / second
const RISE_SPEED = 5.0;
const PLAYER_R = 0.85;        // how close to coral before you bump it

const GRAB_DIST = 2.3;        // reach for coins and keys
const HOLE_DIST = 2.6;        // reach for a key-hole
const HURT_INVULN = 1.6;      // seconds of safety after being caught
const SHIELD_TIME = 20;       // a bubble shield lasts 20 seconds
const SHIELD_COOLDOWN = 8;    // then you must wait before blowing another

interface Predator {
  kind: 'shark' | 'eel' | 'big';
  group: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  path: Cell[];
  repath: number;
  speed: number;
  sight: number;
  reach: number;
  cruise: number;
  home: Cell | null;      // cave lurkers hang around here
  wander: number;
  tail: THREE.Object3D | null;
  segments: THREE.Mesh[]; // for the eel's rippling body
  phase: number;
}

export interface ReefSnapshot {
  keys: number; keysTotal: number;
  coins: number; lives: number;
  status: 'swim' | 'won' | 'over';
  hasAllKeys: boolean; nearHole: boolean;
  hurt: number;           // >0 = flash red
  shield: number;         // seconds of bubble shield left
  shieldReady: boolean;   // can you blow a new bubble?
  message: string;
}

interface Options {
  fish: FishId;
  seed: number;
  onUpdate: (snapshot: ReefSnapshot) => void;
}

const cellKey = (c: Cell) => `${c.col},${c.row}`;

export class ReefEngine {
  private container: HTMLElement;
  private options: Options;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private running = true;
  private time = 0;

  private reef: Reef;

  // the player fish
  private player = new THREE.Group();
  private pos = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private tail: THREE.Object3D | null = null;
  private finL: THREE.Object3D | null = null;
  private finR: THREE.Object3D | null = null;
  private camAt = new THREE.Vector3();

  // pickups & goals
  private coinMeshes: Array<{ mesh: THREE.Object3D; at: Cell; taken: boolean }> = [];
  private keyMeshes: Array<{ mesh: THREE.Object3D; at: Cell; taken: boolean }> = [];
  private holeMeshes: Array<{ mesh: THREE.Object3D; at: Cell; lit: boolean }> = [];
  private predators: Predator[] = [];
  private bubbles: THREE.Points | null = null;
  private kelp: Array<{ mesh: THREE.Mesh; seed: number }> = [];
  private causticLight: THREE.DirectionalLight;

  // state
  private collectedKeys = 0;
  private coins = 0;
  private lives = START_LIVES;
  private status: 'swim' | 'won' | 'over' = 'swim';
  private hurt = 0;
  private invuln = 0;
  private shield = 0;
  private shieldCooldown = 0;
  private bubble: THREE.Mesh | null = null;
  private message = '';
  private messageUntil = 0;

  private pressed = new Set<string>();

  constructor(container: HTMLElement, options: Options) {
    this.container = container;
    this.options = options;
    this.reef = generateReef(options.seed);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 220);

    // deep, sunlit blue with fog so the far coral fades into the haze
    this.scene.background = new THREE.Color('#0b4a74');
    this.scene.fog = new THREE.Fog('#0b4a74', 16, 62);
    this.scene.add(new THREE.AmbientLight('#8fd3ff', 0.85));
    const sun = new THREE.DirectionalLight('#eaffff', 0.9);
    sun.position.set(6, 20, 4);
    this.scene.add(sun);
    this.causticLight = new THREE.DirectionalLight('#bff0ff', 0.5);
    this.causticLight.position.set(-8, 18, -6);
    this.scene.add(this.causticLight);

    this.buildSeabed();
    this.buildWaterSurface();
    this.buildReefWalls();
    this.buildCaves();
    this.buildCoins();
    this.buildKeys();
    this.buildKeyholes();
    this.buildKelpAndBubbles();
    this.buildPlayerFish(options.fish);
    this.buildPredators();

    const start = worldOf(this.reef.start.col, this.reef.start.row);
    this.pos.set(start.x, CRUISE, start.z);
    this.yaw = 0;
    this.camAt.copy(this.pos);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.say('Find 10 keys, then reach a shell lock. Watch for sharks!', 4.5);
    if (import.meta.env.DEV) (window as unknown as { __REEF: ReefEngine }).__REEF = this;
    this.loop();
  }

  // ---- world building --------------------------------------------------------

  private isWall(col: number, row: number) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
    return this.reef.grid[row][col] === '#';
  }

  private buildSeabed() {
    const tex = pixelTexture('#ecdcae', '#cdb782', 'noise', COLS, ROWS);
    const geo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
    const sand = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0;
    this.scene.add(sand);
  }

  private buildWaterSurface() {
    const geo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL, 20, 20);
    const mat = new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const surface = new THREE.Mesh(geo, mat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = WATER_TOP;
    this.scene.add(surface);
  }

  /**
   * The maze barriers are living CORAL, not stone walls: a warm limestone base
   * almost completely buried under a thicket of bright coral — brain coral,
   * staghorn branches, pillar coral and fans — so every wall reads as reef.
   */
  private buildReefWalls() {
    const baseTex = pixelTexture('#c98a72', '#9c6252', 'noise');
    const baseMat = new THREE.MeshLambertMaterial({ map: baseTex });
    const wallGeo = new THREE.BoxGeometry(CELL, 4.6, CELL);
    const coralColours = ['#ff6f91', '#ff9f45', '#c77dff', '#4ecdc4', '#ffd23f', '#ff5d73', '#7ee8b0', '#ff8fb1'];
    const coralMats = coralColours.map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: shade(c, 0.3) }));
    // shared coral shapes, reused across every wall so the mesh count stays sane
    const coralGeos = [
      new THREE.SphereGeometry(0.85, 7, 6),          // brain coral
      new THREE.ConeGeometry(0.5, 1.8, 6),           // staghorn
      new THREE.CylinderGeometry(0.3, 0.42, 1.9, 7), // pillar coral
      new THREE.BoxGeometry(1.2, 1.1, 0.2),          // fan coral
    ];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (this.reef.grid[row][col] !== '#') continue;
        // which faces look onto open water — those are the ones you see
        const openSides = dirs.filter(([dx, dy]) => !this.isWall(col + dx, row + dy));
        if (!openSides.length) continue;
        const w = worldOf(col, row);
        const base = new THREE.Mesh(wallGeo, baseMat);
        base.position.set(w.x, 2.3, w.z);
        this.scene.add(base);

        // a deterministic per-cell RNG, so the reef looks the same on replay
        let s = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
        const drop = (x: number, y: number, z: number) => {
          const coral = new THREE.Mesh(coralGeos[Math.floor(rnd() * coralGeos.length)], coralMats[Math.floor(rnd() * coralMats.length)]);
          coral.position.set(x, y, z);
          coral.rotation.set(rnd() * 0.5, rnd() * Math.PI, rnd() * 0.5);
          coral.scale.setScalar(0.75 + rnd() * 0.7);
          this.scene.add(coral);
        };
        // clothe every open face in coral, up and down its whole height
        for (const [dx, dy] of openSides) {
          for (const h of [1.0, 2.5, 4.0, 5.1]) {
            const t = (rnd() * 2 - 1) * 1.5;                 // slide along the face
            const ox = dx !== 0 ? dx * 1.8 : t;
            const oz = dy !== 0 ? dy * 1.8 : t;
            drop(w.x + ox, h + (rnd() - 0.5) * 0.5, w.z + oz);
          }
        }
        // and a couple of heads crowning the top
        for (let i = 0; i < 2; i += 1) drop(w.x + (rnd() * 2 - 1) * 1.3, 4.9, w.z + (rnd() * 2 - 1) * 1.3);
      }
    }
  }

  /** Cave pockets: a dark rock mouth and a dim glow, so they read as risky. */
  private buildCaves() {
    const rockMat = new THREE.MeshLambertMaterial({ color: '#3a4750' });
    for (const key of this.reef.caves) {
      const [col, row] = key.split(',').map(Number);
      const w = worldOf(col, row);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.5, 6, 10, Math.PI), rockMat);
      arch.position.set(w.x, 1.4, w.z);
      arch.rotation.x = Math.PI;
      this.scene.add(arch);
      const glow = new THREE.PointLight('#6affc0', 0.7, CELL * 1.6);
      glow.position.set(w.x, 1.6, w.z);
      this.scene.add(glow);
    }
  }

  private buildCoins() {
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#8a6a00' });
    for (const at of this.reef.coins) {
      const w = worldOf(at.col, at.row);
      const coin = new THREE.Mesh(geo, mat);
      coin.position.set(w.x, 1.8, w.z);
      coin.rotation.x = Math.PI / 2;
      this.scene.add(coin);
      this.coinMeshes.push({ mesh: coin, at, taken: false });
    }
  }

  private buildKeys() {
    for (const at of this.reef.keys) {
      const w = worldOf(at.col, at.row);
      const group = new THREE.Group();
      const gold = new THREE.MeshLambertMaterial({ color: '#ffe25a', emissive: '#7a5a00' });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 8, 14), gold);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), gold);
      shaft.position.y = -0.5;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.13), gold);
      tooth.position.set(0.16, -0.72, 0);
      group.add(ring, shaft, tooth);
      group.position.set(w.x, 2.1, w.z);
      this.scene.add(group);
      const glow = new THREE.PointLight('#ffe25a', 0.6, 5);
      glow.position.set(w.x, 2.1, w.z);
      this.scene.add(glow);
      this.keyMeshes.push({ mesh: group, at, taken: false });
    }
  }

  private buildKeyholes() {
    for (const at of this.reef.keyholes) {
      const w = worldOf(at.col, at.row);
      const group = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: '#ff9ec4' }));
      shell.scale.set(1, 0.8, 1);
      const keyhole = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 8, 16),
        new THREE.MeshLambertMaterial({ color: '#4a2a55', emissive: '#301133' }));
      keyhole.position.set(0, 1.0, 0.9);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.12),
        new THREE.MeshLambertMaterial({ color: '#4a2a55' }));
      stem.position.set(0, 0.6, 0.95);
      group.add(shell, keyhole, stem);
      group.position.set(w.x, 0.4, w.z);
      this.scene.add(group);
      this.holeMeshes.push({ mesh: group, at, lit: false });
    }
  }

  private buildKelpAndBubbles() {
    // swaying kelp in open cells
    const kelpMat = new THREE.MeshLambertMaterial({ color: '#2f8f5a' });
    let placed = 0;
    for (let row = 0; row < ROWS && placed < 40; row += 1) {
      for (let col = 0; col < COLS && placed < 40; col += 1) {
        if (this.reef.grid[row][col] !== '.' || (col + row) % 5 !== 0) continue;
        const w = worldOf(col, row);
        const h = 2 + ((col * 3 + row) % 3);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.22), kelpMat);
        blade.geometry.translate(0, h / 2, 0);
        blade.position.set(w.x + (col % 3 - 1) * 1.1, 0, w.z + (row % 3 - 1) * 1.1);
        this.scene.add(blade);
        this.kelp.push({ mesh: blade, seed: col * 5 + row });
        placed += 1;
      }
    }

    // rising bubbles
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * COLS * CELL;
      positions[i * 3 + 1] = Math.random() * WATER_TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ROWS * CELL;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dffbff', size: 0.18, transparent: true, opacity: 0.55 }));
    this.scene.add(this.bubbles);
  }

  // ---- fish models -----------------------------------------------------------

  private buildPlayerFish(id: FishId) {
    const kind = fishById(id);
    const { group, tail, finL, finR } = this.buildFish(kind.body, kind.belly, kind.stripe, kind.fin, id, 1);
    this.player = group;
    this.tail = tail; this.finL = finL; this.finR = finR;
    this.scene.add(group);

    // the protective bubble — hidden until you blow one with Space
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#a6ecff', transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
    );
    this.bubble.visible = false;
    this.scene.add(this.bubble);
  }

  /** A blocky pixel fish with a wagging tail and flapping side fins. */
  private buildFish(body: string, belly: string, stripe: string, fin: string, id: FishId, scale: number) {
    const group = new THREE.Group();
    // a little emissive so the fish stays bright and readable even from behind
    const bodyMat = new THREE.MeshLambertMaterial({ color: body, emissive: shade(body, 0.3) });
    const bellyMat = new THREE.MeshLambertMaterial({ color: belly, emissive: shade(belly, 0.3) });
    const stripeMat = new THREE.MeshLambertMaterial({ color: stripe, emissive: shade(stripe, 0.35) });
    const finMat = new THREE.MeshLambertMaterial({ color: fin, emissive: shade(fin, 0.4) });
    const softFin = new THREE.MeshLambertMaterial({ color: body, emissive: shade(body, 0.35) });

    // body: a rounded box, nose toward +Z, tapering to a slim tail
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.98, 1.5), bodyMat);
    torso.position.y = 0;
    group.add(torso);
    const peduncle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.6), bodyMat);
    peduncle.position.set(0, 0.04, -0.75);
    group.add(peduncle);
    const bellyBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 1.35), bellyMat);
    bellyBox.position.y = -0.34;
    group.add(bellyBox);
    // nose / snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.35), bodyMat);
    snout.position.set(0, 0, 0.85);
    group.add(snout);

    // markings — clownfish stripes, or a tang's dark flash
    if (id === 'clown') {
      [0.45, -0.05, -0.55].forEach((z) => {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.02, 0.18), stripeMat);
        band.position.set(0, 0, z);
        group.add(band);
      });
    } else {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.7, 0.9), stripeMat);
      patch.position.set(0, 0.12, -0.1);
      group.add(patch);
    }

    // eyes on both sides
    [-1, 1].forEach((s) => {
      const white = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.24), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
      white.position.set(s * 0.42, 0.16, 0.62);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: '#101018' }));
      pupil.position.set(s * 0.46, 0.16, 0.68);
      group.add(white, pupil);
    });

    // dorsal fin on top
    const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.9), finMat);
    dorsal.position.set(0, 0.62, -0.05);
    group.add(dorsal);

    // tail on a pivot at the back so it can wag
    const tail = new THREE.Group();
    tail.position.set(0, 0, -0.75);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.6), finMat);
    tailFin.position.set(0, 0, -0.35);
    tail.add(tailFin);
    group.add(tail);

    // pectoral fins — body-coloured and swept back so they read as fins, not arms
    const finL = new THREE.Group();
    finL.position.set(-0.4, -0.12, 0.15);
    finL.rotation.y = 0.7;
    const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.3), softFin);
    bladeL.position.x = -0.2;
    finL.add(bladeL);
    const finR = new THREE.Group();
    finR.position.set(0.4, -0.12, 0.15);
    finR.rotation.y = -0.7;
    const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.3), softFin);
    bladeR.position.x = 0.2;
    finR.add(bladeR);
    group.add(finL, finR);

    group.scale.setScalar(scale);
    return { group, tail, finL, finR };
  }

  private buildPredators() {
    const caveCells = [...this.reef.caves].map((k) => { const [col, row] = k.split(',').map(Number); return { col, row }; });
    const spec: Array<Predator['kind']> = ['shark', 'shark', 'eel', 'eel', 'big', 'big'];
    spec.forEach((kind, i) => {
      // half of them lurk in caves, the rest roam the open maze
      const home = i % 2 === 0 && caveCells[i % caveCells.length] ? caveCells[i % caveCells.length] : null;
      const spawn = home ?? this.farFloorFromStart();
      const w = worldOf(spawn.col, spawn.row);
      const built = kind === 'shark' ? this.buildShark() : kind === 'eel' ? this.buildEel() : this.buildBigFish();
      built.group.position.set(w.x, kind === 'shark' ? 3.4 : 2.6, w.z);
      this.scene.add(built.group);
      this.predators.push({
        kind, group: built.group, pos: built.group.position.clone(), yaw: Math.random() * Math.PI * 2,
        path: [], repath: 0,
        speed: kind === 'shark' ? 5.2 : kind === 'big' ? 3.8 : 4.4,
        sight: kind === 'shark' ? 15 : kind === 'big' ? 9 : 11,
        reach: kind === 'shark' ? 1.9 : kind === 'big' ? 1.7 : 1.4,
        cruise: kind === 'shark' ? 3.4 : 2.6,
        home, wander: 0, tail: built.tail, segments: built.segments ?? [], phase: Math.random() * 6,
      });
    });
  }

  private buildShark() {
    const group = new THREE.Group();
    const grey = new THREE.MeshLambertMaterial({ color: '#7d8b98' });
    const white = new THREE.MeshLambertMaterial({ color: '#e8eef2' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 3.0), grey);
    group.add(body);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 2.6), white);
    belly.position.y = -0.5;
    group.add(belly);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), grey);
    snout.position.z = 1.7;
    group.add(snout);
    // teeth
    for (let i = 0; i < 5; i += 1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), white);
      tooth.position.set(-0.3 + i * 0.15, -0.35, 1.95);
      group.add(tooth);
    }
    // eyes
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: '#101018' }));
      eye.position.set(s * 0.5, 0.2, 1.5);
      group.add(eye);
    });
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 4), grey);
    dorsal.position.set(0, 1.0, 0);
    group.add(dorsal);
    const tail = new THREE.Group();
    tail.position.z = -1.5;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.7), grey);
    fin.position.z = -0.4;
    tail.add(fin);
    group.add(tail);
    return { group, tail, segments: undefined as THREE.Mesh[] | undefined };
  }

  private buildEel() {
    const group = new THREE.Group();
    const green = new THREE.MeshLambertMaterial({ color: '#4f9e3a' });
    const dark = new THREE.MeshLambertMaterial({ color: '#2f6a24' });
    const segments: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i += 1) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.55 - i * 0.03, 0.55 - i * 0.03, 0.5), i % 2 ? dark : green);
      seg.position.z = -i * 0.45;
      group.add(seg);
      segments.push(seg);
    }
    // head bits on the front segment
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.2), dark);
    mouth.position.set(0, -0.18, 0.3);
    group.add(mouth);
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: '#ffe25a' }));
      eye.position.set(s * 0.22, 0.16, 0.28);
      group.add(eye);
    });
    return { group, tail: null as THREE.Object3D | null, segments };
  }

  private buildBigFish() {
    const group = new THREE.Group();
    const purple = new THREE.MeshLambertMaterial({ color: '#8b5cc0' });
    const light = new THREE.MeshLambertMaterial({ color: '#c39be8' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 2.0), purple);
    group.add(body);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.7), light);
    belly.position.y = -0.6;
    group.add(belly);
    const lips = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.3), new THREE.MeshLambertMaterial({ color: '#e77db0' }));
    lips.position.set(0, -0.2, 1.05);
    group.add(lips);
    [-1, 1].forEach((s) => {
      const white = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.16), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
      white.position.set(s * 0.55, 0.35, 0.9);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: '#101018' }));
      pupil.position.set(s * 0.6, 0.35, 0.98);
      group.add(white, pupil);
    });
    const tail = new THREE.Group();
    tail.position.z = -1.0;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.8), purple);
    fin.position.z = -0.4;
    tail.add(fin);
    group.add(tail);
    return { group, tail, segments: undefined as THREE.Mesh[] | undefined };
  }

  private farFloorFromStart(): Cell {
    const floor: Cell[] = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (this.reef.grid[row][col] === '.') floor.push({ col, row });
      }
    }
    floor.sort((a, b) =>
      Math.hypot(b.col - this.reef.start.col, b.row - this.reef.start.row)
      - Math.hypot(a.col - this.reef.start.col, a.row - this.reef.start.row));
    return floor[Math.floor(Math.random() * Math.min(10, floor.length))];
  }

  // ---- input -----------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ControlLeft'].includes(event.code)) event.preventDefault();
    // Space blows a protective bubble (a press, not a hold)
    if (event.code === 'Space' && !event.repeat) this.blowBubble();
    this.pressed.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.pressed.delete(event.code);

  /** Touch / on-screen buttons drive the same set the keys do. */
  setTouch(dir: 'up' | 'down' | 'left' | 'right' | 'rise' | 'dive', on: boolean) {
    const code = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', rise: 'ShiftLeft', dive: 'ControlLeft' }[dir];
    if (on) this.pressed.add(code); else this.pressed.delete(code);
  }

  /** Blow a 20-second protective bubble (from Space or the on-screen button). */
  blowBubble() {
    if (this.status !== 'swim') return;
    if (this.shield > 0) { this.say('🫧 Your bubble is already up!', 1.4); return; }
    if (this.shieldCooldown > 0) { this.say(`🫧 Bubble recharging — ${Math.ceil(this.shieldCooldown)}s.`, 1.4); return; }
    this.shield = SHIELD_TIME;
    this.say('🫧 Bubble shield! You are safe for 20 seconds.', 2.6);
  }

  private say(text: string, seconds = 2.4) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  // ---- movement --------------------------------------------------------------

  private blocked(x: number, z: number) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (this.isWall(colOf(x + dx * PLAYER_R), rowOf(z + dz * PLAYER_R))) return true;
      }
    }
    return false;
  }

  private has(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }

  private movePlayer(dt: number) {
    const turn = (this.has('ArrowLeft', 'KeyA') ? 1 : 0) - (this.has('ArrowRight', 'KeyD') ? 1 : 0);
    this.yaw += turn * TURN_SPEED * dt;
    const forward = (this.has('ArrowUp', 'KeyW') ? 1 : 0) - (this.has('ArrowDown', 'KeyS') ? 1 : 0);
    const vertical = (this.has('ShiftLeft', 'ShiftRight') ? 1 : 0) - (this.has('ControlLeft', 'ControlRight', 'KeyC') ? 1 : 0);

    const dx = Math.sin(this.yaw) * forward * SWIM_SPEED * dt;
    const dz = Math.cos(this.yaw) * forward * SWIM_SPEED * dt;
    if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;

    this.pos.y += vertical * RISE_SPEED * dt;
    this.pos.y = Math.max(SWIM_LOW, Math.min(SWIM_HIGH, this.pos.y));

    // gentle body pitch when rising or diving
    this.pitch += ((vertical * -0.4) - this.pitch) * Math.min(1, dt * 6);
  }

  private collect() {
    for (const coin of this.coinMeshes) {
      if (coin.taken) continue;
      if (this.pos.distanceTo(coin.mesh.position) < GRAB_DIST) {
        coin.taken = true; coin.mesh.visible = false; this.coins += 1;
      }
    }
    for (const key of this.keyMeshes) {
      if (key.taken) continue;
      if (this.pos.distanceTo(key.mesh.position) < GRAB_DIST) {
        key.taken = true; key.mesh.visible = false; this.collectedKeys += 1;
        if (this.collectedKeys >= KEYS_TO_WIN) this.say(`🔑 All ${KEYS_TO_WIN} keys! Now find a shell lock!`, 4);
        else this.say(`🔑 Key ${this.collectedKeys} of ${KEYS_TO_WIN}!`, 1.8);
      }
    }
  }

  private checkHoles() {
    const hasAll = this.collectedKeys >= KEYS_TO_WIN;
    let near = false;
    for (const hole of this.holeMeshes) {
      const d = this.pos.distanceTo(hole.mesh.position);
      hole.lit = hasAll;
      if (d < HOLE_DIST) {
        near = true;
        if (hasAll && this.status === 'swim') {
          this.status = 'won';
          this.say('🐚 You opened the lock and escaped the reef!', 8);
        } else if (!hasAll) {
          this.say(`🔒 This lock needs all ${KEYS_TO_WIN} keys — you have ${this.collectedKeys}.`, 2);
        }
      }
    }
    return near;
  }

  // ---- predators -------------------------------------------------------------

  private lineClear(from: THREE.Vector3, to: THREE.Vector3) {
    const steps = Math.ceil(from.distanceTo(to) / 0.7);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      if (this.isWall(colOf(x), rowOf(z))) return false;
    }
    return true;
  }

  private findPath(from: Cell, to: Cell): Cell[] {
    if (from.col === to.col && from.row === to.row) return [];
    const queue: Cell[] = [from];
    const came = new Map<string, Cell | null>([[cellKey(from), null]]);
    while (queue.length) {
      const cur = queue.shift() as Cell;
      if (cur.col === to.col && cur.row === to.row) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = { col: cur.col + dx, row: cur.row + dy };
        if (this.isWall(nc.col, nc.row) || came.has(cellKey(nc))) continue;
        came.set(cellKey(nc), cur);
        queue.push(nc);
      }
    }
    if (!came.has(cellKey(to))) return [];
    const path: Cell[] = [];
    let node: Cell | null = to;
    while (node) { path.unshift(node); node = came.get(cellKey(node)) ?? null; }
    return path.slice(1);
  }

  private randomFloor(): Cell {
    let c: Cell;
    do {
      c = { col: 1 + Math.floor(Math.random() * (COLS - 2)), row: 1 + Math.floor(Math.random() * (ROWS - 2)) };
    } while (this.isWall(c.col, c.row));
    return c;
  }

  private movePredators(dt: number) {
    const playerCell = { col: colOf(this.pos.x), row: rowOf(this.pos.z) };
    for (const p of this.predators) {
      const flat = Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      const canSee = flat < p.sight && this.lineClear(p.pos, this.pos);
      const chasing = canSee || flat < p.reach * 2.4;

      p.repath -= dt;
      if (p.repath <= 0 || !p.path.length) {
        p.repath = chasing ? 0.35 : 1.1;
        const me = { col: colOf(p.pos.x), row: rowOf(p.pos.z) };
        const goal = chasing ? playerCell : (p.home && Math.random() < 0.4 ? p.home : this.randomFloor());
        p.path = this.findPath(me, goal);
      }

      // steer toward the next square on the path
      if (p.path.length) {
        const next = p.path[0];
        const w = worldOf(next.col, next.row);
        const dx = w.x - p.pos.x, dz = w.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) { p.path.shift(); }
        else {
          p.yaw = Math.atan2(dx, dz);
          const speed = p.speed * (chasing ? 1.15 : 1);
          p.pos.x += (dx / d) * speed * dt;
          p.pos.z += (dz / d) * speed * dt;
        }
      }
      // depth: chase the fish's depth, otherwise cruise with a gentle bob
      const targetY = chasing ? this.pos.y : p.cruise + Math.sin(this.time * 0.8 + p.phase) * 0.5;
      p.pos.y += (targetY - p.pos.y) * Math.min(1, dt * 1.6);

      // a predator reaches you
      if (this.status === 'swim' && flat < p.reach && Math.abs(this.pos.y - p.pos.y) < 2.2) {
        if (this.shield > 0) {
          // the bubble protects you — bump the attacker away and send it fleeing
          const away = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          p.pos.x = this.pos.x + Math.sin(away) * (p.reach + 1.4);
          p.pos.z = this.pos.z + Math.cos(away) * (p.reach + 1.4);
          p.path = this.findPath({ col: colOf(p.pos.x), row: rowOf(p.pos.z) }, this.randomFloor());
        } else if (this.invuln <= 0) {
          this.caught(p.kind);
        }
      }
    }
  }

  private caught(kind: Predator['kind']) {
    this.lives -= 1;
    this.hurt = 1;
    this.invuln = HURT_INVULN;
    const who = kind === 'shark' ? 'A shark' : kind === 'eel' ? 'An eel' : 'A big fish';
    if (this.lives <= 0) {
      this.status = 'over';
      this.say(`💀 ${who} caught you! No lives left.`, 8);
    } else {
      // whisked back to the safe start clearing
      const start = worldOf(this.reef.start.col, this.reef.start.row);
      this.pos.set(start.x, CRUISE, start.z);
      this.say(`😱 ${who} caught you! ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left.`, 2.6);
    }
  }

  // ---- snapshot & loop -------------------------------------------------------

  private snapshot(): ReefSnapshot {
    return {
      keys: this.collectedKeys, keysTotal: KEYS_TO_WIN,
      coins: this.coins, lives: this.lives,
      status: this.status,
      hasAllKeys: this.collectedKeys >= KEYS_TO_WIN,
      nearHole: false, // set by loop
      hurt: this.hurt,
      shield: this.shield,
      shieldReady: this.shield <= 0 && this.shieldCooldown <= 0,
      message: this.time < this.messageUntil ? this.message : '',
    };
  }

  restart() {
    // simplest safe reset: rebuild from a fresh seed by reloading the page-level engine
    this.collectedKeys = 0; this.coins = 0; this.lives = START_LIVES;
    this.status = 'swim'; this.hurt = 0; this.invuln = 0; this.shield = 0; this.shieldCooldown = 0;
    this.coinMeshes.forEach((c) => { c.taken = false; c.mesh.visible = true; });
    this.keyMeshes.forEach((k) => { k.taken = false; k.mesh.visible = true; });
    const start = worldOf(this.reef.start.col, this.reef.start.row);
    this.pos.set(start.x, CRUISE, start.z);
    this.yaw = 0;
    this.say('Find 10 keys, then reach a shell lock. Watch for sharks!', 4);
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
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 1.5);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - dt);
      if (this.shield === 0) { this.shieldCooldown = SHIELD_COOLDOWN; this.say('🫧 Your bubble popped!', 2); }
    } else if (this.shieldCooldown > 0) {
      this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    }

    let nearHole = false;
    if (this.status === 'swim') {
      this.movePlayer(dt);
      this.collect();
      nearHole = this.checkHoles();
      this.movePredators(dt);
    }

    // place & animate the player fish
    this.player.position.copy(this.pos);
    this.player.rotation.set(this.pitch, this.yaw, 0);
    if (this.bubble) {
      this.bubble.visible = this.shield > 0;
      this.bubble.position.copy(this.pos);
      const flicker = this.shield > 0 && this.shield < 4 ? (Math.sin(this.time * 14) > 0 ? 1 : 0.4) : 1;
      this.bubble.scale.setScalar((1 + Math.sin(this.time * 3) * 0.05) * flicker);
    }
    const wag = Math.sin(this.time * 9) * 0.5;
    if (this.tail) this.tail.rotation.y = wag;
    if (this.finL) this.finL.rotation.z = Math.sin(this.time * 7) * 0.4 - 0.2;
    if (this.finR) this.finR.rotation.z = -Math.sin(this.time * 7) * 0.4 + 0.2;

    // animate predators
    for (const p of this.predators) {
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.yaw;
      if (p.tail) p.tail.rotation.y = Math.sin(this.time * 6 + p.phase) * 0.6;
      p.segments.forEach((seg, i) => { seg.position.x = Math.sin(this.time * 5 + p.phase - i * 0.6) * 0.28; });
    }

    // spin the coins and bob the keys
    this.coinMeshes.forEach((coin) => { if (coin.mesh.visible) coin.mesh.rotation.z = this.time * 3; });
    this.keyMeshes.forEach((key) => { if (key.mesh.visible) { key.mesh.rotation.y = this.time * 2; key.mesh.position.y = 2.1 + Math.sin(this.time * 2 + key.at.col) * 0.15; } });
    this.holeMeshes.forEach((hole) => { hole.mesh.rotation.y = Math.sin(this.time + hole.at.row) * 0.2; });
    this.kelp.forEach((k) => { k.mesh.rotation.z = Math.sin(this.time * 1.4 + k.seed) * 0.18; });

    // drift the bubbles upward
    if (this.bubbles) {
      const arr = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < arr.count; i += 1) {
        let y = arr.getY(i) + dt * (0.5 + (i % 5) * 0.15);
        if (y > WATER_TOP) y = 0.2;
        arr.setY(i, y);
      }
      arr.needsUpdate = true;
    }
    this.causticLight.intensity = 0.4 + Math.sin(this.time * 1.5) * 0.15;

    // third-person camera that trails behind and above the fish, tilted down so
    // you see the whole fish and the path ahead of it
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let dist = 6.2;
    const want = new THREE.Vector3(this.pos.x - back.x * dist, this.pos.y + 3.4, this.pos.z - back.z * dist);
    // don't let the camera bury itself in coral behind you
    while (dist > 2.5 && this.isWall(colOf(want.x), rowOf(want.z))) {
      dist -= 0.6;
      want.set(this.pos.x - back.x * dist, this.pos.y + 3.4, this.pos.z - back.z * dist);
    }
    want.y = Math.min(want.y, WATER_TOP - 0.3);
    this.camAt.lerp(want, Math.min(1, dt * 6));
    this.camera.position.copy(this.camAt);
    this.camera.lookAt(this.pos.x + back.x * 3, this.pos.y - 0.7, this.pos.z + back.z * 3);

    this.renderer.render(this.scene, this.camera);
    const snap = this.snapshot(); snap.nearHole = nearHole;
    this.options.onUpdate(snap);
    requestAnimationFrame(this.loop);
  };
}
