import * as THREE from 'three';
import { pixelTexture, shade } from './pixelTexture';
import {
  buildHouse, COLS, ROWS, CELL, WALL_H, PLAYER_EYE, PLAYER_RADIUS, PLAYER_SPEED,
  TURN_SPEED, SEARCH_REACH, TIME_LIMIT, worldOf, colOf, rowOf,
  type House, type Furniture,
} from './scavenger';

export interface ScavSnapshot {
  status: 'playing' | 'won' | 'lost';
  timeLeft: number;
  found: boolean;
  iFoundKey: boolean;
  finder: string;
  searched: number;
  searchable: number;
  message: string;
  nearAction: 'search' | 'searched' | 'exit' | 'none';
}

interface Options { onUpdate: (snapshot: ScavSnapshot) => void }

interface LiveFigure { group: THREE.Group; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; targetYaw: number }

const hueOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
};

export class ScavengerEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private opts: Options;
  private disposables: Array<{ dispose: () => void }> = [];
  private mat: Record<string, THREE.MeshLambertMaterial> = {};

  private house: House = buildHouse();
  private blockedCells = new Set<string>();
  private position = new THREE.Vector3();
  private yaw = 0;
  private keys = new Set<string>();

  private furnitureGroups: THREE.Group[] = [];
  private searched = new Set<number>();
  private keyIndex: number | null = null;
  private found = false;
  private iFoundKey = false;
  private finder = '';
  private status: ScavSnapshot['status'] = 'playing';
  private timeLeft = TIME_LIMIT;
  private message = '';
  private messageUntil = 0;
  private nearAction: ScavSnapshot['nearAction'] = 'none';

  private door!: { mat: THREE.MeshLambertMaterial; glow: THREE.PointLight };
  private lantern: THREE.PointLight;
  private keyMesh: THREE.Group | null = null;
  private keyBaseY = 0;
  private livePlayers = new Map<string, LiveFigure>();

  private running = true;
  private raf = 0;
  private clock = new THREE.Clock();
  private time = 0;
  private lastSig = '';

  constructor(container: HTMLElement, opts: Options) {
    this.container = container;
    this.opts = opts;
    this.house.furniture.forEach((f) => this.blockedCells.add(`${f.col},${f.row}`));

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, (container.clientWidth || 800) / (container.clientHeight || 600), 0.1, 90);
    this.scene.background = new THREE.Color('#2a1d14');
    this.scene.fog = new THREE.Fog('#2a1d14', CELL * 8, CELL * 16);

    // Warm and cozy — a friendly cabin, not a haunted house.
    this.scene.add(new THREE.AmbientLight('#fff3e0', 1.0));
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#4a3a2a', 0.55));
    this.lantern = new THREE.PointLight('#ffd9a0', 1.4, 10, 2);
    this.scene.add(this.lantern);

    this.buildMaterials();
    this.buildHouse();
    this.buildFurniture();
    this.buildDoor();

    const spawn = worldOf(this.house.spawn.col, this.house.spawn.row);
    this.position.set(spawn.x, 0, spawn.z);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.loop();
  }

  // ---- materials & building ----------------------------------------------

  private lambert(color: string, emissive = '#000000') {
    const m = new THREE.MeshLambertMaterial({ color, emissive });
    this.disposables.push(m);
    return m;
  }

  private buildMaterials() {
    this.mat = {
      wood: this.lambert('#8a5a2b'),
      woodDark: this.lambert('#5e3d1e'),
      knob: this.lambert('#2f2f36'),
      white: this.lambert('#e9edee'),
      steel: this.lambert('#aeb7bb'),
      cream: this.lambert('#ece0cc'),
      red: this.lambert('#b5495a'),
      blue: this.lambert('#5b6bb0'),
      blueLight: this.lambert('#7d8ccf'),
      book1: this.lambert('#b5495a'),
      book2: this.lambert('#3f8a55'),
      book3: this.lambert('#3f6bb0'),
      book4: this.lambert('#c79a3a'),
      terracotta: this.lambert('#b5613a'),
      leaf: this.lambert('#3f8a45'),
      leaf2: this.lambert('#57a85a'),
      screen: this.lambert('#14171d', '#0a1a2a'),
      shade: this.lambert('#f4dd94', '#6b5416'),
      gold: this.lambert('#ffcf3a', '#8a6a00'),
    };
  }

  private box(group: THREE.Group, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  private buildHouse() {
    const wallTex = pixelTexture('#b5824e', shade('#b5824e'), 'planks');
    const floorTex = pixelTexture('#c79a5f', shade('#c79a5f'), 'planks', COLS, ROWS);
    const ceilTex = pixelTexture('#6e4a2c', shade('#6e4a2c'), 'planks', COLS, ROWS);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    this.disposables.push(wallMat, floorMat, ceilMat, wallGeo);

    const mats: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (!this.house.walls[row][col]) continue;
        const at = worldOf(col, row);
        mats.push(m.clone().makeTranslation(at.x, WALL_H / 2, at.z));
      }
    }
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, mats.length);
    mats.forEach((mat, i) => wallMesh.setMatrixAt(i, mat));
    wallMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(wallMesh);

    const w = COLS * CELL;
    const d = ROWS * CELL;
    const planeGeo = new THREE.PlaneGeometry(w, d);
    this.disposables.push(planeGeo);
    const floor = new THREE.Mesh(planeGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0, d / 2);
    const ceiling = new THREE.Mesh(planeGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(w / 2, WALL_H, d / 2);
    this.scene.add(floor, ceiling);

    // Cozy hanging lamps over a few rooms.
    [[6, 4], [18, 4], [12, 9], [6, 14], [18, 14]].forEach(([c, r]) => {
      const at = worldOf(c, r);
      const lamp = new THREE.PointLight('#ffcf8f', 0.6, CELL * 5, 2);
      lamp.position.set(at.x, WALL_H - 0.4, at.z);
      this.scene.add(lamp);
    });
  }

  private buildFurniture() {
    this.house.furniture.forEach((f, i) => {
      const group = new THREE.Group();
      this.model(group, f);
      const at = worldOf(f.col, f.row);
      group.position.set(at.x, 0, at.z);
      group.rotation.y = ((f.col * 7 + f.row * 13) % 4) * (Math.PI / 2); // face a random way
      this.scene.add(group);
      this.furnitureGroups[i] = group;
    });
  }

  /** A little blocky, Minecraft-ish model per furniture kind. */
  private model(g: THREE.Group, f: Furniture) {
    const M = this.mat;
    switch (f.kind) {
      case 'cabinet':
        this.box(g, 2.0, 1.9, 1.0, M.wood, 0, 0.95, 0);
        this.box(g, 0.9, 1.7, 0.06, M.woodDark, -0.5, 0.95, 0.53);
        this.box(g, 0.9, 1.7, 0.06, M.woodDark, 0.5, 0.95, 0.53);
        this.box(g, 0.1, 0.1, 0.12, M.knob, -0.1, 0.95, 0.58);
        this.box(g, 0.1, 0.1, 0.12, M.knob, 0.1, 0.95, 0.58);
        break;
      case 'bookshelf': {
        this.box(g, 2.0, 2.1, 0.8, M.woodDark, 0, 1.05, 0);
        const books = [M.book1, M.book2, M.book3, M.book4];
        [0.5, 1.1, 1.7].forEach((y, r) => {
          for (let k = 0; k < 5; k += 1) this.box(g, 0.16, 0.42, 0.5, books[(k + r) % 4], -0.7 + k * 0.35, y, 0.16);
        });
        break;
      }
      case 'chest':
        this.box(g, 1.6, 0.7, 1.0, M.wood, 0, 0.35, 0);
        this.box(g, 1.62, 0.4, 1.02, M.woodDark, 0, 0.9, 0);
        this.box(g, 0.22, 0.34, 0.1, M.knob, 0, 0.7, 0.52);
        break;
      case 'wardrobe':
        this.box(g, 1.8, 2.2, 1.0, M.wood, 0, 1.1, 0);
        this.box(g, 0.8, 2.0, 0.06, M.woodDark, -0.45, 1.1, 0.53);
        this.box(g, 0.8, 2.0, 0.06, M.woodDark, 0.45, 1.1, 0.53);
        this.box(g, 0.1, 0.3, 0.12, M.knob, -0.06, 1.1, 0.58);
        this.box(g, 0.1, 0.3, 0.12, M.knob, 0.06, 1.1, 0.58);
        break;
      case 'fridge':
        this.box(g, 1.4, 1.9, 1.1, M.white, 0, 0.95, 0);
        this.box(g, 1.42, 0.06, 1.12, M.steel, 0, 1.28, 0);
        this.box(g, 0.1, 0.5, 0.1, M.steel, 0.55, 1.6, 0.57);
        this.box(g, 0.1, 0.7, 0.1, M.steel, 0.55, 0.7, 0.57);
        break;
      case 'bed':
        this.box(g, 2.0, 0.35, 2.2, M.wood, 0, 0.18, 0);
        this.box(g, 1.8, 0.32, 2.0, M.cream, 0, 0.5, 0);
        this.box(g, 1.8, 0.14, 1.2, M.red, 0, 0.64, -0.4);
        this.box(g, 1.4, 0.22, 0.5, M.white, 0, 0.66, 0.78);
        break;
      case 'sofa':
        this.box(g, 2.0, 0.5, 1.0, M.blue, 0, 0.25, 0);
        this.box(g, 0.9, 0.22, 0.9, M.blueLight, -0.5, 0.6, 0.02);
        this.box(g, 0.9, 0.22, 0.9, M.blueLight, 0.5, 0.6, 0.02);
        this.box(g, 2.0, 0.7, 0.25, M.blue, 0, 0.85, -0.42);
        this.box(g, 0.25, 0.6, 1.0, M.blue, -0.9, 0.55, 0);
        this.box(g, 0.25, 0.6, 1.0, M.blue, 0.9, 0.55, 0);
        break;
      case 'plant':
        this.box(g, 0.8, 0.6, 0.8, M.terracotta, 0, 0.3, 0);
        this.box(g, 1.1, 0.8, 1.1, M.leaf, 0, 1.05, 0);
        this.box(g, 0.7, 0.7, 0.7, M.leaf2, 0, 1.6, 0);
        break;
      case 'tv':
        this.box(g, 1.4, 0.5, 0.6, M.woodDark, 0, 0.25, 0);
        this.box(g, 1.7, 1.0, 0.14, M.knob, 0, 1.1, 0);
        this.box(g, 1.5, 0.82, 0.04, M.screen, 0, 1.1, 0.09);
        break;
      case 'lamp':
        this.box(g, 0.5, 0.15, 0.5, M.knob, 0, 0.08, 0);
        this.box(g, 0.12, 1.3, 0.12, M.knob, 0, 0.8, 0);
        this.box(g, 0.8, 0.55, 0.8, M.shade, 0, 1.55, 0);
        break;
    }
  }

  private buildDoor() {
    const at = worldOf(this.house.approach.col, this.house.door.row);
    const z = worldOf(0, this.house.door.row).z;
    const g = new THREE.Group();
    const mat = this.lambert('#8a3b3b');
    this.box(g, CELL * 0.8, 2.6, 0.35, mat, 0, 1.3, 0);
    this.box(g, 0.9, 2.1, 0.06, this.lambert('#a85a5a'), 0, 1.4, 0.2); // panel
    this.box(g, 0.16, 0.16, 0.18, this.mat.knob, 0.45, 1.3, 0.22);     // knob
    g.position.set(at.x, 0, z);
    this.scene.add(g);
    const glow = new THREE.PointLight('#ff9a5a', 3, 7, 2);
    glow.position.set(at.x, 1.8, z);
    this.scene.add(glow);
    this.door = { mat, glow };
  }

  // ---- sprites (name tags for real players) ------------------------------

  private nameSprite(text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0810d8'; ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = '#2f6fb0'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 60);
      ctx.font = 'bold 26px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d6ecff'; ctx.fillText(text.slice(0, 16), 128, 34);
    }
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
    this.disposables.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.6, 0.65, 1);
    sprite.position.y = 2.5;
    return sprite;
  }

  private buildFigure(hue: number, name: string) {
    const group = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: `hsl(${hue},62%,56%)`, emissive: '#14385c' });
    const skin = new THREE.MeshLambertMaterial({ color: '#d8bfae' });
    this.disposables.push(body, skin);
    this.box(group, 0.55, 0.95, 0.32, body, 0, 1.05, 0);
    this.box(group, 0.5, 0.5, 0.5, skin, 0, 1.75, 0);
    [[-0.35, 1.05], [0.35, 1.05], [-0.15, 0.3], [0.15, 0.3]].forEach(([x, y]) => this.box(group, 0.15, 0.55, 0.15, body, x, y, 0));
    group.add(this.nameSprite(`@${name}`));
    this.scene.add(group);
    return group;
  }

  private buildKeyModel() {
    const g = new THREE.Group();
    const gold = this.mat.gold;
    // ring (four blocky sides), shaft and two teeth
    this.box(g, 0.5, 0.12, 0.12, gold, 0, 0.5, 0);
    this.box(g, 0.5, 0.12, 0.12, gold, 0, 0.14, 0);
    this.box(g, 0.12, 0.36, 0.12, gold, -0.19, 0.32, 0);
    this.box(g, 0.12, 0.36, 0.12, gold, 0.19, 0.32, 0);
    this.box(g, 0.12, 0.7, 0.12, gold, 0, -0.25, 0);
    this.box(g, 0.24, 0.1, 0.12, gold, 0.12, -0.5, 0);
    this.box(g, 0.18, 0.1, 0.12, gold, 0.09, -0.62, 0);
    return g;
  }

  // ---- public API ---------------------------------------------------------

  getSelfState() { return { x: this.position.x, y: this.position.z, yaw: this.yaw }; }

  setKeyIndex(ordinal: number) {
    if (this.found || this.searched.size) return;
    const list = this.house.searchable;
    this.keyIndex = list[((ordinal % list.length) + list.length) % list.length];
  }

  setTeamFound(finder: string) {
    if (this.found) return;
    this.found = true;
    this.finder = finder;
    this.unlockDoor();
    this.revealKey();
    this.say(`🔑 ${finder} found the key! Get to the door!`, 6);
  }

  setPeers(list: Array<{ id: string; name: string; x: number; y: number; yaw?: number }>) {
    const here = new Set<string>();
    list.forEach((p) => {
      here.add(p.id);
      let live = this.livePlayers.get(p.id);
      if (!live) {
        const group = this.buildFigure(hueOf(p.id), p.name);
        live = { group, pos: new THREE.Vector3(p.x, 0, p.y), target: new THREE.Vector3(p.x, 0, p.y), yaw: p.yaw ?? 0, targetYaw: p.yaw ?? 0 };
        this.livePlayers.set(p.id, live);
      }
      live.target.set(p.x, 0, p.y);
      if (p.yaw !== undefined) live.targetYaw = p.yaw;
    });
    this.livePlayers.forEach((live, id) => {
      if (here.has(id)) return;
      this.scene.remove(live.group);
      this.livePlayers.delete(id);
    });
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((item) => item.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---- input --------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    const c = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) event.preventDefault();
    if (c === 'Space' || c === 'KeyE') { if (!event.repeat) this.act(); return; }
    this.keys.add(c);
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };

  // ---- simulation ---------------------------------------------------------

  private isBlockedCell(col: number, row: number) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
    if (this.house.walls[row][col]) return true;
    return this.blockedCells.has(`${col},${row}`);
  }

  private blocked(x: number, z: number) {
    for (const px of [x - PLAYER_RADIUS, x + PLAYER_RADIUS]) {
      for (const pz of [z - PLAYER_RADIUS, z + PLAYER_RADIUS]) {
        if (this.isBlockedCell(colOf(px), rowOf(pz))) return true;
      }
    }
    return false;
  }

  private movePlayer(dt: number) {
    const held = (a: string, b: string) => (this.keys.has(a) ? 1 : 0) - (this.keys.has(b) ? 1 : 0);
    const turn = held('ArrowLeft', 'ArrowRight') + held('KeyA', 'KeyD');
    if (turn) this.yaw += turn * TURN_SPEED * dt;
    const forward = held('ArrowUp', 'ArrowDown') + held('KeyW', 'KeyS');
    if (!forward) return;
    const dx = Math.sin(this.yaw) * -forward * PLAYER_SPEED * dt;
    const dz = Math.cos(this.yaw) * -forward * PLAYER_SPEED * dt;
    if (!this.blocked(this.position.x + dx, this.position.z)) this.position.x += dx;
    if (!this.blocked(this.position.x, this.position.z + dz)) this.position.z += dz;
  }

  private distTo(col: number, row: number) {
    const at = worldOf(col, row);
    return Math.hypot(this.position.x - at.x, this.position.z - at.z);
  }

  private nearDoor() { return this.distTo(this.house.approach.col, this.house.approach.row) < SEARCH_REACH; }

  private nearestSearchable(): number | null {
    let best: number | null = null;
    let bestD = SEARCH_REACH;
    this.house.searchable.forEach((i) => {
      if (this.searched.has(i)) return;
      const f = this.house.furniture[i];
      const d = this.distTo(f.col, f.row);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  private act() {
    if (this.status !== 'playing') return;
    if (this.found && this.nearDoor()) { this.status = 'won'; this.say('🚪 You got out! 🎉', 8); return; }
    const i = this.nearestSearchable();
    if (i === null) {
      if (this.nearDoor()) this.say('🔒 The door is locked. Find the key first!', 2.5);
      else this.say('Nothing to search here.', 1.6);
      return;
    }
    this.searched.add(i);
    const f = this.house.furniture[i];
    if (i === this.keyIndex) {
      this.found = true;
      this.iFoundKey = true;
      this.finder = 'You';
      this.unlockDoor();
      this.revealKey();
      this.say(`🔑 You found the key in the ${f.label}! Get to the door!`, 6);
    } else {
      const group = this.furnitureGroups[i];
      group?.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        if ((mesh.material as THREE.MeshLambertMaterial)?.color) (mesh.material as THREE.MeshLambertMaterial).color.multiplyScalar(0.78);
      });
      this.say(`Nothing in the ${f.label}…`, 1.6);
    }
  }

  private revealKey() {
    if (this.keyMesh || this.keyIndex === null) return;
    const f = this.house.furniture[this.keyIndex];
    const at = worldOf(f.col, f.row);
    const key = this.buildKeyModel();
    this.keyBaseY = 2.3;
    key.position.set(at.x, this.keyBaseY, at.z);
    this.scene.add(key);
    this.keyMesh = key;
    const glow = new THREE.PointLight('#ffe08a', 3, 6, 2);
    glow.position.set(at.x, this.keyBaseY, at.z);
    this.scene.add(glow);
  }

  private unlockDoor() {
    this.door.mat.color.set('#3f9d5a');
    this.door.mat.emissive.set('#0f3d1f');
    this.door.glow.color.set('#7dff9c');
  }

  private say(text: string, seconds: number) { this.message = text; this.messageUntil = this.time + seconds; }

  private computeNearAction(): ScavSnapshot['nearAction'] {
    if (this.found && this.nearDoor()) return 'exit';
    if (this.nearestSearchable() !== null) return 'search';
    for (const idx of this.house.searchable) {
      const f = this.house.furniture[idx];
      if (this.searched.has(idx) && this.distTo(f.col, f.row) < SEARCH_REACH) return 'searched';
    }
    return 'none';
  }

  // ---- loop ---------------------------------------------------------------

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    if (this.status === 'playing') {
      this.movePlayer(dt);
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.status = 'lost'; this.say('⏰ Time is up!', 8); }
    }

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

    if (this.keyMesh) {
      this.keyMesh.rotation.y += dt * 2.2;
      this.keyMesh.position.y = this.keyBaseY + Math.sin(this.time * 2.5) * 0.18;
    }

    this.nearAction = this.computeNearAction();

    this.camera.position.set(this.position.x, PLAYER_EYE, this.position.z);
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    this.camera.lookAt(this.camera.position.clone().add(look));
    this.lantern.position.set(this.position.x, 1.9, this.position.z);

    this.renderer.render(this.scene, this.camera);
    this.emit();
  };

  private emit() {
    const snapshot: ScavSnapshot = {
      status: this.status,
      timeLeft: this.timeLeft,
      found: this.found,
      iFoundKey: this.iFoundKey,
      finder: this.finder,
      searched: this.searched.size,
      searchable: this.house.searchable.length,
      message: this.time < this.messageUntil ? this.message : '',
      nearAction: this.nearAction,
    };
    const sig = [snapshot.status, Math.ceil(snapshot.timeLeft), snapshot.found, snapshot.iFoundKey,
      snapshot.finder, snapshot.message, snapshot.nearAction, snapshot.searched].join('|');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.opts.onUpdate(snapshot);
  }
}
