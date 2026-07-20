import * as THREE from 'three';
import { THEMES, type Theme, type Difficulty } from './escapeRoom';

export interface EscapeSnapshot {
  found: number;
  total: number;
  clue: string;
  timeLeft: number;
  status: 'playing' | 'won' | 'lost';
  near: string;    // name of the openable piece you're looking at, if any
}

interface Options { theme: Theme; difficulty: Difficulty; onUpdate: (s: EscapeSnapshot) => void }

const WALL_H = 4;   // room height
const EYE = 1.55, RADIUS = 0.34, SPEED = 4.4, TURN = 2.4, REACH = 2.4;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

// Palettes so no two rooms look alike, even when the theme repeats.
const WALL_PALETTE: Record<string, string[]> = {
  bedroom: ['#b9a7e6', '#e6a7c4', '#a7c4e6', '#cbb189', '#a9d6b0', '#d6b3e0'],
  bathroom: ['#8fd3e0', '#a7e0c4', '#b9c9e6', '#d3e0a7', '#c4b9e0', '#9ad6d0'],
  living: ['#e6c79a', '#d6a98f', '#c9a9c4', '#a9c4b0', '#e0b9a7', '#c7b48c'],
  kitchen: ['#f0a89a', '#f0d29a', '#c4e0a7', '#a7c4e0', '#e6b9d6', '#e0c49a'],
};
const FLOOR_PALETTE = ['#8a6f52', '#7a5a3c', '#a98a63', '#6a5140', '#94714c', '#b0a48c', '#8f7a5c'];
const RUG_PALETTE = ['#c0455a', '#3f7fb0', '#3f8a55', '#c79a3a', '#7a5aa0', '#c96a3a', '#2e9a8a'];
const FRAME_PALETTE = ['#9fb6d6', '#d69f9f', '#a7d6a7', '#d6c79f', '#c9a7d6', '#e0b060'];

// Openable containers can hide a star. Decor is just filler — it never does.
type Shape =
  | 'cabinet' | 'fridge' | 'drawers' | 'chest' | 'oven' | 'bed' | 'sofa' | 'shelf' | 'vanity' | 'mirror'
  | 'plant' | 'lamp' | 'tv' | 'tub' | 'toilet' | 'rack' | 'stool';

function shapeFor(name: string): Shape {
  const n = name.toLowerCase();
  if (/wardrobe|cabinet|cupboard|coffee/.test(n)) return 'cabinet';
  if (/dresser/.test(n)) return 'drawers';
  if (/fridge/.test(n)) return 'fridge';
  if (/oven/.test(n)) return 'oven';
  if (/chest|toy|laundry|basket|bin/.test(n)) return 'chest';
  if (/bed/.test(n)) return 'bed';
  if (/sofa|armchair/.test(n)) return 'sofa';
  if (/stand/.test(n)) return 'cabinet';   // TV stand — has cupboard doors
  if (/bookshelf|shelf|rack.*book/.test(n)) return 'shelf';
  if (/sink/.test(n)) return 'vanity';
  if (/mirror/.test(n)) return 'mirror';
  if (/plant/.test(n)) return 'plant';
  if (/lamp/.test(n)) return 'lamp';
  if (/tv|television|painting|clock|screen/.test(n)) return 'tv';
  if (/bathtub|tub/.test(n)) return 'tub';
  if (/toilet/.test(n)) return 'toilet';
  if (/stool/.test(n)) return 'stool';
  if (/rack/.test(n)) return 'rack';
  return 'cabinet';
}

interface Opener { apply: (t: number) => void; open: number; target: number }

interface Piece {
  group: THREE.Group; name: string; x: number; z: number;
  hasStar: boolean; searched: boolean;
  opener?: Opener;              // only openable pieces have one — and only these hide stars
  starBase?: THREE.Vector3; star?: THREE.Group;
}

export class EscapeRoomEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private opts: Options;
  private disposables: Array<{ dispose: () => void }> = [];

  private rw = rand(14, 18);   // this room's width…
  private rd = rand(11, 14);   // …and depth — different every game
  private pos = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();
  private pieces: Piece[] = [];
  private solids: Array<{ x: number; z: number; r: number }> = [];   // decor collision
  private found = 0;
  private total: number;
  private clue = '';
  private status: EscapeSnapshot['status'] = 'playing';
  private timeLeft: number;
  private lastAct = 0;

  private w = 0;
  private running = true; private raf = 0;
  private clock = new THREE.Clock(); private time = 0;
  private lastSig = '';

  constructor(container: HTMLElement, opts: Options) {
    this.container = container;
    this.opts = opts;
    this.total = opts.difficulty.stars;
    this.timeLeft = opts.difficulty.seconds;
    this.clue = `🔎 Open the furniture — ${this.total} stars are hidden behind doors, drawers and lids!`;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(72, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 60);

    this.pos.set(this.rw / 2 + rand(-1, 1), 0, this.rd - 2.2);
    this.yaw = rand(-0.35, 0.35);
    this.buildRoom();
    this.placeFurniture();
    this.addClutter();

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.loop();
  }

  // ---- build helpers ------------------------------------------------------
  private lambert(color: string, emissive = '#000000') { const m = new THREE.MeshLambertMaterial({ color, emissive }); this.disposables.push(m); return m; }
  private box(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const geo = new THREE.BoxGeometry(w, h, d); this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
  }
  private plane(w: number, h: number, mat: THREE.Material) { const g = new THREE.PlaneGeometry(w, h); this.disposables.push(g); return new THREE.Mesh(g, mat); }

  private buildRoom() {
    const theme = this.opts.theme;
    const rw = this.rw, rd = this.rd;
    this.scene.background = new THREE.Color('#20182e');
    this.scene.add(new THREE.AmbientLight('#fff4e6', rand(0.82, 1.0)));
    this.scene.add(new THREE.HemisphereLight('#fff', '#6a5a48', 0.5));
    const lamp = new THREE.PointLight(pick(['#fff0d0', '#ffe6c0', '#e6e0ff', '#fff']), rand(0.7, 1.0), 26, 2);
    lamp.position.set(rw / 2, WALL_H - 0.5, rd / 2); this.scene.add(lamp);
    // ceiling light fixture
    this.box(this.scene, 0.7, 0.15, 0.7, this.lambert('#f4e4b0', '#6b5416'), rw / 2, WALL_H - 0.12, rd / 2);

    const wallMat = this.lambert(pick(WALL_PALETTE[theme.id] ?? ['#c3b2e0']));
    const floorMat = this.lambert(pick(FLOOR_PALETTE));
    const ceilMat = this.lambert('#efe6d6');
    const floor = this.plane(rw, rd, floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(rw / 2, 0, rd / 2);
    const ceil = this.plane(rw, rd, ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(rw / 2, WALL_H, rd / 2);
    this.scene.add(floor, ceil);
    const back = this.plane(rw, WALL_H, wallMat); back.position.set(rw / 2, WALL_H / 2, 0); this.scene.add(back);
    const front = this.plane(rw, WALL_H, wallMat); front.position.set(rw / 2, WALL_H / 2, rd); front.rotation.y = Math.PI; this.scene.add(front);
    const left = this.plane(rd, WALL_H, wallMat); left.position.set(0, WALL_H / 2, rd / 2); left.rotation.y = Math.PI / 2; this.scene.add(left);
    const right = this.plane(rd, WALL_H, wallMat); right.position.set(rw, WALL_H / 2, rd / 2); right.rotation.y = -Math.PI / 2; this.scene.add(right);

    // a rug or two
    for (let i = 0; i < (Math.random() < 0.6 ? 2 : 1); i += 1) {
      const rug = this.plane(rand(2.2, 3.6), rand(1.6, 2.8), this.lambert(pick(RUG_PALETTE)));
      rug.rotation.x = -Math.PI / 2; rug.position.set(rand(rw * 0.3, rw * 0.7), 0.02, rand(rd * 0.35, rd * 0.72)); this.scene.add(rug);
    }
    // bright windows on the back wall
    for (let i = 0; i < (Math.random() < 0.5 ? 2 : 1); i += 1) {
      const winMat = new THREE.MeshBasicMaterial({ color: '#cfe9ff' }); this.disposables.push(winMat);
      const win = this.plane(rand(1.3, 2.0), rand(1.1, 1.5), winMat);
      win.position.set(rand(rw * 0.2, rw * 0.8), rand(1.9, 2.5), 0.05); this.scene.add(win);
    }
  }

  /** Framed pictures on the walls + potted plants in the corners + a little floor clutter. */
  private addClutter() {
    const rw = this.rw, rd = this.rd;
    // wall frames
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i += 1) {
      const frame = new THREE.Group();
      this.box(frame, rand(0.6, 1.1), rand(0.5, 0.8), 0.06, this.lambert('#3a2a20'), 0, 0, 0);
      this.box(frame, rand(0.4, 0.9), rand(0.35, 0.6), 0.02, this.lambert(pick(FRAME_PALETTE)), 0, 0, 0.05);
      const wall = Math.floor(Math.random() * 4);
      if (wall === 0) frame.position.set(rand(1.5, rw - 1.5), rand(1.9, 2.6), 0.08);
      else if (wall === 1) { frame.position.set(rw - 0.08, rand(1.9, 2.6), rand(1.5, rd - 1.5)); frame.rotation.y = -Math.PI / 2; }
      else if (wall === 2) { frame.position.set(0.08, rand(1.9, 2.6), rand(1.5, rd - 1.5)); frame.rotation.y = Math.PI / 2; }
      else { frame.position.set(rand(1.5, rw - 1.5), rand(1.9, 2.6), rd - 0.08); frame.rotation.y = Math.PI; }
      this.scene.add(frame);
    }
    // corner plants (2 of the 4 corners)
    const corners = shuffle([[1, 1], [rw - 1, 1], [1, rd - 1], [rw - 1, rd - 1]]).slice(0, 2);
    for (const [cx, cz] of corners) {
      const g = new THREE.Group(); this.buildPlant(g, 1.15); g.position.set(cx, 0, cz); this.scene.add(g);
      this.solids.push({ x: cx, z: cz, r: 0.5 });
    }
    // small floor clutter (a ball, a box, a stack of books)
    for (let i = 0; i < 3; i += 1) {
      const g = new THREE.Group();
      const k = i % 3;
      if (k === 0) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), this.lambert(pick(RUG_PALETTE))); this.disposables.push(s.geometry); g.add(s); s.position.y = 0.22; }
      else if (k === 1) this.box(g, 0.4, 0.4, 0.4, this.lambert('#b08050'), 0, 0.2, 0);
      else { [0, 1, 2].forEach((n) => this.box(g, 0.5, 0.12, 0.36, this.lambert(pick(FRAME_PALETTE)), 0, 0.06 + n * 0.13, 0)); }
      const x = rand(2, rw - 2), z = rand(2.5, rd - 2.5);
      g.position.set(x, 0, z); this.scene.add(g); this.solids.push({ x, z, r: 0.4 });
    }
  }

  private buildPlant(g: THREE.Object3D, scale = 1) {
    this.box(g, 0.5 * scale, 0.5 * scale, 0.5 * scale, this.lambert('#b5613a'), 0, 0.25 * scale, 0);
    this.box(g, 0.8 * scale, 0.9 * scale, 0.8 * scale, this.lambert(pick(['#3f8a45', '#4fa055', '#377a3f'])), 0, 0.9 * scale, 0);
  }

  /** Candidate furniture spots around this room, each facing the room centre. */
  private layoutSpots(): Array<{ x: number; z: number; face: number }> {
    const rw = this.rw, rd = this.rd;
    const spots: Array<{ x: number; z: number; face: number }> = [];
    [0.13, 0.31, 0.5, 0.69, 0.87].forEach((f) => spots.push({ x: f * rw, z: 1.0, face: 0 }));
    [0.3, 0.5, 0.72].forEach((f) => spots.push({ x: 1.0, z: f * rd, face: Math.PI / 2 }));
    [0.3, 0.5, 0.72].forEach((f) => spots.push({ x: rw - 1.0, z: f * rd, face: -Math.PI / 2 }));
    [0.16, 0.84].forEach((f) => spots.push({ x: f * rw, z: rd - 1.1, face: Math.PI }));
    spots.push({ x: rw * rand(0.34, 0.44), z: rd * rand(0.42, 0.52), face: pick([0, Math.PI]) });
    return spots;
  }

  private placeFurniture() {
    const items = shuffle(this.opts.theme.items);
    const spots = shuffle(this.layoutSpots());
    const n = Math.min(items.length, spots.length);
    const placed: Piece[] = [];

    for (let i = 0; i < n; i += 1) {
      const item = items[i]; const spot = spots[i];
      const x = spot.x + rand(-0.25, 0.25), z = spot.z + rand(-0.25, 0.25);
      const face = spot.face + rand(-0.12, 0.12);
      const group = new THREE.Group();
      const shape = shapeFor(item.name);
      const opener = this.model(group, shape);
      group.position.set(x, 0, z); group.rotation.y = face; this.scene.add(group);
      placed.push({ group, name: item.name, x, z, hasStar: false, searched: false, opener });
    }
    this.pieces = placed;

    // Stars ONLY go inside openable pieces — you must open a door/drawer/lid.
    const openable = placed.filter((p) => p.opener);
    shuffle(openable).slice(0, Math.min(this.total, openable.length)).forEach((p) => { p.hasStar = true; });
    this.total = Math.min(this.total, openable.length);
  }

  /** Build a blocky furniture model; returns an Opener when the piece can be opened. */
  private model(g: THREE.Group, shape: Shape): Opener | undefined {
    const wood = this.lambert('#8a5a2b');
    const drawerMat = this.lambert('#6b4423');
    const doorMat = () => this.lambert('#7a5230');
    const handleMat = this.lambert('#d8c08a');
    const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => this.box(g, w, h, d, mat, x, y, z);

    // two doors that swing outward on the +z face
    const twoDoors = (bodyW: number, h: number, y: number, frontZ: number, max: number): Opener => {
      const mk = (side: 1 | -1) => {
        const pivot = new THREE.Group(); pivot.position.set(side * bodyW / 2, y, frontZ);
        this.box(pivot, bodyW / 2 - 0.04, h, 0.06, doorMat(), -side * (bodyW / 4), 0, 0);
        this.box(pivot, 0.07, 0.18, 0.07, handleMat, -side * (bodyW / 2 - 0.16), 0, 0.06);
        g.add(pivot); return pivot;
      };
      const L = mk(-1), R = mk(1);
      return { apply: (t) => { L.rotation.y = -t * max; R.rotation.y = t * max; }, open: 0, target: 0 };
    };
    // one door hinged on its right edge
    const oneDoor = (bodyW: number, h: number, y: number, frontZ: number, max: number, mat?: THREE.Material): Opener => {
      const pivot = new THREE.Group(); pivot.position.set(bodyW / 2, y, frontZ);
      this.box(pivot, bodyW - 0.04, h, 0.05, mat ?? doorMat(), -(bodyW - 0.04) / 2, 0, 0);
      this.box(pivot, 0.07, 0.18, 0.07, handleMat, -(bodyW - 0.18), 0, 0.06);
      g.add(pivot);
      return { apply: (t) => { pivot.rotation.y = -t * max; }, open: 0, target: 0 };
    };
    // drawers that slide straight out
    const slideDrawers = (bodyW: number, ys: number[]): Opener => {
      const drs = ys.map((y) => {
        const dg = new THREE.Group();
        this.box(dg, bodyW - 0.18, 0.3, 0.55, drawerMat, 0, 0, 0);
        this.box(dg, 0.24, 0.05, 0.06, handleMat, 0, 0, 0.3);
        dg.position.set(0, y, 0.3); g.add(dg); return dg;
      });
      return { apply: (t) => drs.forEach((d) => { d.position.z = 0.3 + t * 0.44; }), open: 0, target: 0 };
    };
    // a lid that lifts up on a hinge at the back
    const lid = (w: number, d: number, y: number, max: number): Opener => {
      const pivot = new THREE.Group(); pivot.position.set(0, y, -d / 2);
      this.box(pivot, w, 0.12, d, drawerMat, 0, 0, d / 2);
      g.add(pivot);
      return { apply: (t) => { pivot.rotation.x = -t * max; }, open: 0, target: 0 };
    };
    // a front drawer that slides out (under a bed etc.)
    const frontDrawer = (w: number, y: number, z: number, max: number): Opener => {
      const dg = new THREE.Group();
      this.box(dg, w, 0.26, 0.5, drawerMat, 0, 0, 0);
      this.box(dg, 0.28, 0.05, 0.06, handleMat, 0, 0, 0.28);
      dg.position.set(0, y, z); g.add(dg);
      return { apply: (t) => { dg.position.z = z + t * max; }, open: 0, target: 0 };
    };

    switch (shape) {
      case 'cabinet':
        B(1.3, 1.9, 0.7, wood, 0, 0.95, 0);
        return twoDoors(1.26, 1.7, 1.0, 0.36, 1.8);
      case 'fridge':
        B(1.0, 2.0, 0.9, this.lambert('#e9edee'), 0, 1.0, 0);
        return oneDoor(0.94, 1.9, 1.0, 0.46, 1.6, this.lambert('#dfe4e6'));
      case 'drawers':
        B(1.2, 1.15, 0.7, wood, 0, 0.58, 0);
        return slideDrawers(1.2, [0.42, 0.82]);
      case 'chest':
        B(1.1, 0.55, 0.8, wood, 0, 0.28, 0);
        return lid(1.12, 0.82, 0.56, 1.25);
      case 'oven': {
        B(1.0, 1.1, 0.8, this.lambert('#3a3a42'), 0, 0.55, 0);
        B(0.7, 0.16, 0.05, this.lambert('#14171d'), 0, 1.0, 0.4);   // control strip
        const pivot = new THREE.Group(); pivot.position.set(0, 0.14, 0.41);
        this.box(pivot, 0.86, 0.7, 0.05, this.lambert('#20242c'), 0, 0.36, 0);
        this.box(pivot, 0.5, 0.34, 0.02, this.lambert('#4a5566'), 0, 0.4, 0.03);   // window
        g.add(pivot);
        return { apply: (t) => { pivot.rotation.x = t * 1.35; }, open: 0, target: 0 };
      }
      case 'bed':
        B(1.9, 0.35, 2.3, wood, 0, 0.18, 0.55);
        B(1.72, 0.3, 2.0, this.lambert('#ece0cc'), 0, 0.5, 0.55);
        B(1.6, 0.18, 0.5, this.lambert(pick(['#b56b7a', '#6b8ab5', '#8ab56b'])), 0, 0.62, 1.35);
        B(1.3, 0.2, 0.5, this.lambert('#fff'), 0, 0.64, -0.35);
        return frontDrawer(1.5, 0.2, 1.5, 0.5);
      case 'sofa': {
        const col = this.lambert(pick(['#6b7bb5', '#b56b6b', '#6bb58a', '#b59a6b']));
        B(1.9, 0.4, 0.95, col, 0, 0.3, 0);
        B(1.9, 0.6, 0.22, col, 0, 0.8, -0.36);
        B(0.24, 0.55, 0.95, col, -0.9, 0.55, 0); B(0.24, 0.55, 0.95, col, 0.9, 0.55, 0);
        const seat = new THREE.Group(); seat.position.set(0, 0.5, -0.36);   // hinge at back
        this.box(seat, 1.5, 0.16, 0.8, this.lambert('#8090c4'), 0, 0, 0.42);
        g.add(seat);
        return { apply: (t) => { seat.rotation.x = -t * 1.0; }, open: 0, target: 0 };
      }
      case 'shelf': {
        B(1.3, 2.0, 0.5, this.lambert('#5e3d1e'), 0, 1.0, 0);
        const books = ['#b5495a', '#3f8a55', '#3f6bb0', '#c79a3a'];
        [1.15, 1.6].forEach((y, r) => { for (let k = 0; k < 4; k += 1) B(0.16, 0.4, 0.4, this.lambert(books[(k + r) % 4]), -0.5 + k * 0.32, y, 0.05); });
        return twoDoors(1.2, 0.66, 0.4, 0.26, 1.4);   // lower cupboard
      }
      case 'vanity':
        B(1.4, 0.9, 0.6, this.lambert('#e9edee'), 0, 0.45, 0);
        B(0.6, 0.14, 0.36, this.lambert('#cfe6ff'), 0, 0.55, 0);   // basin
        B(0.06, 0.22, 0.06, this.lambert('#aeb7bb'), 0, 0.7, -0.1); // tap
        return twoDoors(1.3, 0.66, 0.4, 0.31, 1.5);
      case 'mirror':
        B(0.72, 0.92, 0.22, wood, 0, 1.35, 0);
        return oneDoor(0.66, 0.86, 1.35, 0.12, 1.5, this.lambert('#bcd4e6', '#20303a'));
      // ---- decor (never hides a star) ----
      case 'plant': this.buildPlant(g); return undefined;
      case 'lamp':
        B(0.4, 0.12, 0.4, this.lambert('#3a3a42'), 0, 0.06, 0);
        B(0.1, 1.4, 0.1, this.lambert('#5a5a60'), 0, 0.8, 0);
        B(0.6, 0.5, 0.6, this.lambert('#f4dd94', '#6b5416'), 0, 1.6, 0);
        return undefined;
      case 'tv':
        B(1.1, 0.5, 0.4, wood, 0, 0.25, 0);
        B(1.2, 0.72, 0.08, this.lambert('#14171d'), 0, 0.95, 0);
        B(1.06, 0.6, 0.02, this.lambert('#4a6a8a'), 0, 0.95, 0.06);
        return undefined;
      case 'tub':
        B(1.7, 0.6, 0.85, this.lambert('#e9edee'), 0, 0.35, 0);
        B(1.5, 0.16, 0.65, this.lambert('#bfe3ff'), 0, 0.55, 0);
        return undefined;
      case 'toilet':
        B(0.55, 0.4, 0.65, this.lambert('#eef2f3'), 0, 0.22, 0.05);
        B(0.5, 0.12, 0.55, this.lambert('#fff'), 0, 0.46, 0.05);
        B(0.5, 0.55, 0.22, this.lambert('#eef2f3'), 0, 0.5, -0.28);
        return undefined;
      case 'stool':
        B(0.5, 0.12, 0.5, this.lambert('#a9814f'), 0, 0.62, 0);
        [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => B(0.07, 0.62, 0.07, this.lambert('#7a5a34'), lx, 0.31, lz));
        return undefined;
      default: // 'rack'
        B(0.1, 1.4, 0.1, this.lambert('#8a8a90'), -0.4, 0.7, 0); B(0.1, 1.4, 0.1, this.lambert('#8a8a90'), 0.4, 0.7, 0);
        B(0.9, 0.08, 0.08, this.lambert('#aeaeb4'), 0, 1.1, 0);
        B(0.7, 0.5, 0.04, this.lambert(pick(['#e8d6a0', '#d6a0a0', '#a0c4d6'])), 0, 0.8, 0.03);   // towel
        return undefined;
    }
  }

  // ---- input --------------------------------------------------------------
  private onKey = (e: KeyboardEvent) => {
    const c = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if ((c === 'Space' || c === 'KeyE') && !e.repeat) { this.open(); return; }
    this.keys.add(c);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private held(a: string, b: string) { return (this.keys.has(a) ? 1 : 0) - (this.keys.has(b) ? 1 : 0); }

  // ---- gameplay -----------------------------------------------------------
  private forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate(); }

  /** The nearest OPENABLE, un-opened piece you're facing — decor is ignored. */
  private nearest() {
    const fwd = this.forward();
    let best: Piece | null = null; let bestD = REACH;
    for (const p of this.pieces) {
      if (p.searched || !p.opener) continue;
      const to = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
      const d = to.length(); if (d > bestD) continue;
      if (to.normalize().dot(fwd) < 0.25) continue;
      bestD = d; best = p;
    }
    return best;
  }

  private open() {
    if (this.status !== 'playing' || this.time - this.lastAct < 0.15) return;
    const p = this.nearest();
    if (!p) { this.clue = '🚪 Stand close to a piece of furniture and face it, then press to open it.'; return; }
    this.lastAct = this.time;
    p.searched = true;
    if (p.opener) p.opener.target = 1;
    if (p.hasStar) {
      this.found += 1;
      this.revealStar(p);
      this.clue = `⭐ A star was inside the ${p.name.toLowerCase()}! ${this.found} of ${this.total} found.`;
      if (this.found >= this.total) this.status = 'won';
    } else {
      this.clue = `Empty ${p.name.toLowerCase()}. ${this.hint()}`;
    }
  }

  /** Directional hot/cold clue toward the nearest star still hidden. */
  private hint(): string {
    let target: Piece | null = null; let bestD = Infinity;
    for (const p of this.pieces) {
      if (!p.hasStar || p.searched) continue;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < bestD) { bestD = d; target = p; }
    }
    if (!target) return 'That was the last empty one!';
    const temp = bestD < 3 ? '🔥 Burning hot' : bestD < 6 ? '♨️ Warm' : bestD < 9 ? '🌤️ Cool' : '❄️ Cold';
    const to = new THREE.Vector3(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
    const fwd = this.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const f = to.dot(fwd), r = to.dot(right);
    const dir = Math.abs(f) > Math.abs(r) ? (f > 0 ? 'straight ahead' : 'behind you') : (r > 0 ? 'to your right' : 'to your left');
    return `${temp} — a star is ${dir}.`;
  }

  private revealStar(p: Piece) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? 0.24 : 0.1; const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * r, y = Math.sin(a) * r; i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
    const mat = new THREE.MeshLambertMaterial({ color: '#ffd84a', emissive: '#8a6a00' });
    this.disposables.push(geo, mat);
    const star = new THREE.Group(); star.add(new THREE.Mesh(geo, mat));
    const toCentre = new THREE.Vector3(this.rw / 2 - p.x, 0, this.rd / 2 - p.z);
    if (toCentre.lengthSq() < 0.01) toCentre.set(0, 0, 1);
    toCentre.normalize().multiplyScalar(0.7);
    p.starBase = new THREE.Vector3(p.x + toCentre.x, 1.65, p.z + toCentre.z);
    star.position.copy(p.starBase);
    this.scene.add(star);
    const glow = new THREE.PointLight('#ffe08a', 2.4, 4.5, 2); glow.position.copy(p.starBase); this.scene.add(glow);
    p.star = star;
  }

  private canStand(x: number, z: number) {
    if (x < RADIUS || x > this.rw - RADIUS || z < RADIUS || z > this.rd - RADIUS) return false;
    for (const p of this.pieces) if (Math.abs(x - p.x) < 0.68 && Math.abs(z - p.z) < 0.68) return false;
    for (const s of this.solids) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return false;
    return true;
  }

  private move(dt: number) {
    const turn = this.held('ArrowLeft', 'ArrowRight') + this.held('KeyA', 'KeyD');
    if (turn) this.yaw += turn * TURN * dt;
    const fwd = this.held('ArrowUp', 'ArrowDown') + this.held('KeyW', 'KeyS');
    if (!fwd) return;
    const dx = Math.sin(this.yaw) * -fwd * SPEED * dt;
    const dz = Math.cos(this.yaw) * -fwd * SPEED * dt;
    if (this.canStand(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (this.canStand(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
  }

  // ---- loop ---------------------------------------------------------------
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    this.w = w;
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey); window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((d) => d.dispose()); this.renderer.dispose(); this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05); this.time += dt;

    if (this.status === 'playing') {
      this.move(dt);
      if (this.opts.difficulty.seconds > 0) { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.status = 'lost'; } }
    }
    for (const p of this.pieces) {
      if (p.opener) { p.opener.open += (p.opener.target - p.opener.open) * Math.min(1, dt * 8); p.opener.apply(p.opener.open); }
      if (p.star && p.starBase) { p.star.rotation.y += dt * 2.2; p.star.position.y = p.starBase.y + Math.sin(this.time * 2.5) * 0.12; }
    }

    this.camera.position.set(this.pos.x, EYE, this.pos.z);
    this.camera.lookAt(this.camera.position.clone().add(this.forward()));
    if (this.w) this.renderer.render(this.scene, this.camera); else this.resize();
    this.emit();
  };

  private emit() {
    const near = this.status === 'playing' ? (this.nearest()?.name ?? '') : '';
    const snap: EscapeSnapshot = { found: this.found, total: this.total, clue: this.clue, timeLeft: this.timeLeft, status: this.status, near };
    const sig = [snap.found, snap.status, Math.ceil(snap.timeLeft), snap.clue, snap.near].join('|');
    if (sig === this.lastSig) return; this.lastSig = sig; this.opts.onUpdate(snap);
  }
}

export { THEMES };
