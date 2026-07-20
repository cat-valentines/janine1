import * as THREE from 'three';
import { THEMES, type Theme, type Difficulty } from './escapeRoom';

export interface EscapeSnapshot {
  found: number;
  total: number;
  clue: string;
  timeLeft: number;
  status: 'playing' | 'won' | 'lost';
  near: string;   // name of the piece you're looking at, if any
}

interface Options { theme: Theme; difficulty: Difficulty; onUpdate: (s: EscapeSnapshot) => void }

const WALL_H = 4;   // room height
const EYE = 1.55, RADIUS = 0.34, SPEED = 4.4, TURN = 2.4;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

// A handful of wall / floor palettes per theme so no two rooms look alike, even
// when the theme repeats.
const WALL_PALETTE: Record<string, string[]> = {
  bedroom: ['#b9a7e6', '#e6a7c4', '#a7c4e6', '#cbb189', '#a9d6b0', '#d6b3e0'],
  bathroom: ['#8fd3e0', '#a7e0c4', '#b9c9e6', '#d3e0a7', '#c4b9e0', '#9ad6d0'],
  living: ['#e6c79a', '#d6a98f', '#c9a9c4', '#a9c4b0', '#e0b9a7', '#c7b48c'],
  kitchen: ['#f0a89a', '#f0d29a', '#c4e0a7', '#a7c4e0', '#e6b9d6', '#e0c49a'],
};
const FLOOR_PALETTE = ['#8a6f52', '#7a5a3c', '#a98a63', '#6a5140', '#94714c', '#b0a48c', '#8f7a5c'];
const RUG_PALETTE = ['#c0455a', '#3f7fb0', '#3f8a55', '#c79a3a', '#7a5aa0', '#c96a3a', '#2e9a8a'];
const REACH = 2.3;

type Shape = 'cabinet' | 'drawers' | 'chest' | 'fridge' | 'bed' | 'sofa' | 'shelf' | 'oven' | 'bath' | 'plant' | 'lamp' | 'wall';
function shapeFor(name: string): Shape {
  const n = name.toLowerCase();
  if (/wardrobe|cabinet|cupboard|coffee/.test(n)) return 'cabinet';
  if (/dresser/.test(n)) return 'drawers';
  if (/chest|laundry|basket|bin|toy/.test(n)) return 'chest';
  if (/fridge/.test(n)) return 'fridge';
  if (/bed/.test(n)) return 'bed';
  if (/sofa|armchair|stool/.test(n)) return 'sofa';
  if (/bookshelf|shelf|rack/.test(n)) return 'shelf';
  if (/oven/.test(n)) return 'oven';
  if (/sink|toilet|bathtub/.test(n)) return 'bath';
  if (/plant/.test(n)) return 'plant';
  if (/lamp/.test(n)) return 'lamp';
  return 'wall';   // mirror / tv / painting / clock / window
}

interface DoorAnim { left: THREE.Object3D; right: THREE.Object3D; max: number; open: number; target: number }

interface Piece {
  group: THREE.Group; name: string; x: number; z: number;
  hasStar: boolean; searched: boolean;
  door?: DoorAnim;
  starAnchor: THREE.Vector3; starBase?: THREE.Vector3; star?: THREE.Group;
}

export class EscapeRoomEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private opts: Options;
  private disposables: Array<{ dispose: () => void }> = [];

  private rw = rand(13, 17);   // this room's width…
  private rd = rand(10.5, 13); // …and depth — different every game
  private pos = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();
  private pieces: Piece[] = [];
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
    this.clue = `🔎 Search the room — find ${this.total} hidden stars!`;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(72, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 60);

    this.pos.set(this.rw / 2 + rand(-1, 1), 0, this.rd - 2.2);
    this.yaw = rand(-0.35, 0.35);   // start facing roughly into the room
    this.buildRoom();
    this.placeFurniture();

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.loop();
  }

  // ---- build --------------------------------------------------------------
  private lambert(color: string, emissive = '#000000') { const m = new THREE.MeshLambertMaterial({ color, emissive }); this.disposables.push(m); return m; }
  private box(g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const geo = new THREE.BoxGeometry(w, h, d); this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
  }

  private buildRoom() {
    const theme = this.opts.theme;
    const rw = this.rw, rd = this.rd;
    this.scene.background = new THREE.Color('#20182e');
    this.scene.add(new THREE.AmbientLight('#fff4e6', rand(0.82, 1.0)));
    this.scene.add(new THREE.HemisphereLight('#fff', '#6a5a48', 0.5));
    const lampCol = pick(['#fff0d0', '#ffe6c0', '#e6e0ff', '#fff']);
    const lamp = new THREE.PointLight(lampCol, rand(0.7, 1.0), 24, 2); lamp.position.set(rw / 2, WALL_H - 0.5, rd / 2); this.scene.add(lamp);

    const wallMat = this.lambert(pick(WALL_PALETTE[theme.id] ?? ['#c3b2e0']));
    const floorMat = this.lambert(pick(FLOOR_PALETTE));
    const ceilMat = this.lambert('#efe6d6');
    const floorGeo = new THREE.PlaneGeometry(rw, rd); this.disposables.push(floorGeo);
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(rw / 2, 0, rd / 2);
    const ceil = new THREE.Mesh(floorGeo, ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(rw / 2, WALL_H, rd / 2);
    this.scene.add(floor, ceil);
    const wGeo = new THREE.PlaneGeometry(rw, WALL_H); const dGeo = new THREE.PlaneGeometry(rd, WALL_H);
    this.disposables.push(wGeo, dGeo);
    const back = new THREE.Mesh(wGeo, wallMat); back.position.set(rw / 2, WALL_H / 2, 0); this.scene.add(back);
    const front = new THREE.Mesh(wGeo, wallMat); front.position.set(rw / 2, WALL_H / 2, rd); front.rotation.y = Math.PI; this.scene.add(front);
    const left = new THREE.Mesh(dGeo, wallMat); left.position.set(0, WALL_H / 2, rd / 2); left.rotation.y = Math.PI / 2; this.scene.add(left);
    const right = new THREE.Mesh(dGeo, wallMat); right.position.set(rw, WALL_H / 2, rd / 2); right.rotation.y = -Math.PI / 2; this.scene.add(right);

    // a rug — random colour, size and spot, so the floor never looks the same
    if (Math.random() < 0.85) {
      const rugMat = this.lambert(pick(RUG_PALETTE));
      const rgeo = new THREE.PlaneGeometry(rand(2.4, 4), rand(1.8, 3.2)); this.disposables.push(rgeo);
      const rug = new THREE.Mesh(rgeo, rugMat); rug.rotation.x = -Math.PI / 2;
      rug.position.set(rand(rw * 0.35, rw * 0.65), 0.02, rand(rd * 0.4, rd * 0.7)); this.scene.add(rug);
    }
    // a bright window on the back wall, at a random height/position
    const winMat = new THREE.MeshBasicMaterial({ color: '#cfe9ff' }); this.disposables.push(winMat);
    const wgeo = new THREE.PlaneGeometry(rand(1.3, 2.2), rand(1.1, 1.6)); this.disposables.push(wgeo);
    const win = new THREE.Mesh(wgeo, winMat); win.position.set(rand(rw * 0.3, rw * 0.7), rand(1.9, 2.5), 0.05); this.scene.add(win);
  }

  /** Candidate furniture spots around this room, each facing the room centre. */
  private layoutSpots(): Array<{ x: number; z: number; face: number }> {
    const rw = this.rw, rd = this.rd;
    const spots: Array<{ x: number; z: number; face: number }> = [];
    [0.13, 0.31, 0.5, 0.69, 0.87].forEach((f) => spots.push({ x: f * rw, z: 1.0, face: 0 }));            // back wall
    [0.3, 0.5, 0.72].forEach((f) => spots.push({ x: 1.0, z: f * rd, face: Math.PI / 2 }));                // left wall
    [0.3, 0.5, 0.72].forEach((f) => spots.push({ x: rw - 1.0, z: f * rd, face: -Math.PI / 2 }));          // right wall
    [0.15, 0.85].forEach((f) => spots.push({ x: f * rw, z: rd - 1.0, face: Math.PI }));                   // front corners
    spots.push({ x: rw * rand(0.34, 0.44), z: rd * rand(0.42, 0.52), face: pick([0, Math.PI]) });        // free-standing island
    return spots;
  }

  private placeFurniture() {
    const items = shuffle(this.opts.theme.items);   // which piece lands where changes every game
    const spots = shuffle(this.layoutSpots());
    const n = Math.min(items.length, spots.length);
    const starSet = new Set<number>();
    while (starSet.size < this.total) starSet.add(Math.floor(Math.random() * n));

    for (let i = 0; i < n; i += 1) {
      const item = items[i]; const spot = spots[i];
      const x = spot.x + rand(-0.25, 0.25), z = spot.z + rand(-0.25, 0.25);
      const face = spot.face + rand(-0.12, 0.12);
      const group = new THREE.Group();
      const built = this.model(group, shapeFor(item.name));
      group.position.set(x, 0, z);
      group.rotation.y = face;
      this.scene.add(group);
      const a = built.anchor.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(new THREE.Vector3(x, 0, z));
      this.pieces.push({ group, name: item.name, x, z, hasStar: starSet.has(i), searched: false, door: built.door, starAnchor: a });
    }
  }

  /** Build a blocky furniture model; returns an optional openable door + a star anchor. */
  private model(g: THREE.Group, shape: Shape): { door?: Piece['door']; anchor: THREE.Vector3 } {
    const wood = this.lambert('#8a5a2b'); const woodDark = this.lambert('#5e3d1e');
    const doorMat = () => this.lambert('#7a5230');
    const doors = (bodyW: number, h: number, front: number, max: number) => {
      const mk = (side: 1 | -1) => {
        const pivot = new THREE.Group(); pivot.position.set(side * bodyW / 2, h / 2 + 0.15, front);
        const geo = new THREE.BoxGeometry(bodyW / 2 - 0.03, h - 0.2, 0.06); this.disposables.push(geo);
        const panel = new THREE.Mesh(geo, doorMat()); panel.position.x = -side * (bodyW / 2) / 2; pivot.add(panel);
        const kn = this.box(pivot, 0.07, 0.16, 0.07, this.lambert('#d8c08a'), -side * (bodyW / 2 - 0.12), 0, 0.05);
        void kn; g.add(pivot); return pivot;
      };
      const left = mk(-1); const right = mk(1);
      const anim: DoorAnim = { left, right, max, open: 0, target: 0 };
      return anim;
    };
    switch (shape) {
      case 'cabinet': {
        this.box(g, 1.3, 1.9, 0.7, wood, 0, 0.95, 0);
        const d = doors(1.3, 1.9, 0.36, 1.8);
        return { door: d, anchor: new THREE.Vector3(0, 1.0, 0.2) };
      }
      case 'fridge': {
        this.box(g, 1.0, 2.0, 0.9, this.lambert('#e9edee'), 0, 1.0, 0);
        const d = doors(0.94, 1.9, 0.46, 1.5);
        return { door: d, anchor: new THREE.Vector3(0, 1.0, 0.25) };
      }
      default: return this.buildOther(g, shape, wood, woodDark);
    }
  }

  private buildOther(g: THREE.Group, shape: Shape, wood: THREE.Material, woodDark: THREE.Material): { door?: DoorAnim; anchor: THREE.Vector3 } {
    const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => this.box(g, w, h, d, mat, x, y, z);
    switch (shape) {
      case 'drawers':
        B(1.2, 1.1, 0.7, wood, 0, 0.55, 0);
        B(1.0, 0.32, 0.06, woodDark, 0, 0.4, 0.36); B(1.0, 0.32, 0.06, woodDark, 0, 0.78, 0.36);
        return { anchor: new THREE.Vector3(0, 0.6, 0.25) };
      case 'chest':
        B(1.1, 0.6, 0.8, wood, 0, 0.3, 0); B(1.12, 0.28, 0.82, woodDark, 0, 0.72, 0);
        return { anchor: new THREE.Vector3(0, 0.6, 0) };
      case 'fridge':
        B(1.0, 2.0, 0.9, this.lambert('#e9edee'), 0, 1.0, 0);
        B(0.08, 0.5, 0.08, this.lambert('#aeb7bb'), 0.4, 1.3, 0.46);
        return { anchor: new THREE.Vector3(0, 1.0, 0.2) };
      case 'bed':
        B(2.0, 0.35, 2.4, wood, 0, 0.18, 0.6); B(1.8, 0.3, 2.1, this.lambert('#ece0cc'), 0, 0.5, 0.6);
        B(1.7, 0.18, 0.5, this.lambert('#b56b7a'), 0, 0.62, 1.4); B(1.4, 0.2, 0.5, this.lambert('#fff'), 0, 0.64, -0.2);
        return { anchor: new THREE.Vector3(0, 0.75, 0.6) };
      case 'sofa':
        B(1.9, 0.5, 0.9, this.lambert('#6b7bb5'), 0, 0.35, 0); B(1.9, 0.6, 0.22, this.lambert('#6b7bb5'), 0, 0.8, -0.34);
        B(0.24, 0.55, 0.9, this.lambert('#6b7bb5'), -0.9, 0.55, 0); B(0.24, 0.55, 0.9, this.lambert('#6b7bb5'), 0.9, 0.55, 0);
        return { anchor: new THREE.Vector3(0, 0.7, 0.1) };
      case 'shelf': {
        B(1.3, 2.0, 0.5, woodDark, 0, 1.0, 0);
        const books = ['#b5495a', '#3f8a55', '#3f6bb0', '#c79a3a'];
        [0.6, 1.1, 1.6].forEach((y, r) => { for (let k = 0; k < 4; k += 1) B(0.16, 0.42, 0.4, this.lambert(books[(k + r) % 4]), -0.5 + k * 0.32, y, 0.05); });
        return { anchor: new THREE.Vector3(0, 1.1, 0.2) };
      }
      case 'oven':
        B(1.0, 1.1, 0.8, this.lambert('#3a3a42'), 0, 0.55, 0); B(0.8, 0.5, 0.05, this.lambert('#14171d'), 0, 0.5, 0.41);
        return { anchor: new THREE.Vector3(0, 0.6, 0.2) };
      case 'bath':
        B(1.4, 0.7, 0.9, this.lambert('#e9edee'), 0, 0.35, 0); B(1.2, 0.2, 0.7, this.lambert('#cfe6ff'), 0, 0.55, 0);
        return { anchor: new THREE.Vector3(0, 0.7, 0) };
      case 'plant':
        B(0.5, 0.5, 0.5, this.lambert('#b5613a'), 0, 0.25, 0); B(0.8, 0.9, 0.8, this.lambert('#3f8a45'), 0, 0.9, 0);
        return { anchor: new THREE.Vector3(0, 0.9, 0) };
      case 'lamp':
        B(0.4, 0.12, 0.4, this.lambert('#3a3a42'), 0, 0.06, 0); B(0.1, 1.4, 0.1, this.lambert('#5a5a60'), 0, 0.8, 0);
        B(0.6, 0.5, 0.6, this.lambert('#f4dd94', '#6b5416'), 0, 1.6, 0);
        return { anchor: new THREE.Vector3(0, 1.0, 0) };
      default: // 'wall' — a framed thing on a small stand
        B(1.0, 0.7, 0.1, this.lambert('#2a2a30'), 0, 1.4, 0); B(0.9, 0.6, 0.02, this.lambert('#9fb6d6'), 0, 1.4, 0.06);
        B(0.7, 0.7, 0.5, wood, 0, 0.35, 0);
        return { anchor: new THREE.Vector3(0, 0.9, 0.1) };
    }
  }

  // ---- input --------------------------------------------------------------
  private onKey = (e: KeyboardEvent) => {
    const c = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if ((c === 'Space' || c === 'KeyE') && !e.repeat) { this.search(); return; }
    this.keys.add(c);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private held(a: string, b: string) { return (this.keys.has(a) ? 1 : 0) - (this.keys.has(b) ? 1 : 0); }

  // ---- gameplay -----------------------------------------------------------
  private nearest() {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    let best: Piece | null = null; let bestD = REACH;
    for (const p of this.pieces) {
      if (p.searched) continue;
      const to = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
      const d = to.length(); if (d > bestD) continue;
      if (to.normalize().dot(fwd) < 0.3) continue;   // must be roughly in front
      bestD = d; best = p;
    }
    return best;
  }

  private search() {
    if (this.status !== 'playing' || this.time - this.lastAct < 0.15) return;
    const p = this.nearest();
    if (!p) { this.clue = 'Walk up to a piece of furniture and face it to search.'; return; }
    this.lastAct = this.time;
    p.searched = true;
    if (p.door) p.door.target = 1;
    if (p.hasStar) {
      this.found += 1;
      this.revealStar(p);
      this.clue = `⭐ A star! ${this.found} of ${this.total}.`;
      if (this.found >= this.total) { this.status = 'won'; }
    } else {
      let nearest = 999;
      for (const q of this.pieces) if (q.hasStar && !q.searched) nearest = Math.min(nearest, Math.hypot(q.x - p.x, q.z - p.z));
      this.clue = `Nothing in the ${p.name.toLowerCase()}. ${nearest > 90 ? '' : nearest < 3 ? '🔥 Burning hot!' : nearest < 6 ? '♨️ Warm.' : '❄️ Cold.'}`;
    }
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
    // float the found star OUT in front of the furniture (toward the room) so it
    // is always visible — never buried inside a solid body.
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
    for (const p of this.pieces) if (Math.abs(x - p.x) < 0.75 && Math.abs(z - p.z) < 0.75) return false;  // furniture footprint
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
    // animate opening doors + spinning stars
    for (const p of this.pieces) {
      if (p.door) { p.door.open += (p.door.target - p.door.open) * Math.min(1, dt * 8);
        p.door.left.rotation.y = -p.door.open * p.door.max;
        p.door.right.rotation.y = p.door.open * p.door.max; }
      if (p.star && p.starBase) { p.star.rotation.y += dt * 2.2; p.star.position.y = p.starBase.y + Math.sin(this.time * 2.5) * 0.12; }
    }

    this.camera.position.set(this.pos.x, EYE, this.pos.z);
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    this.camera.lookAt(this.camera.position.clone().add(look));
    if (this.w) this.renderer.render(this.scene, this.camera);
    else this.resize();
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
