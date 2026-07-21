import * as THREE from 'three';
import { EMPTY, animalById, blockById, cropById, cropReady, type Animal, type Plot } from './building';
import { SX, SY, SZ, blocksMovement, inside, isSolid, spawnHeight, voxelAt, withVoxel, type Furniture } from './voxel';
import { buildTerrain, isTerrainSolid, seasonStyles, terrainHeight, type Season } from './terrain';

export type Mode = 'build' | 'walk';
export type View = 'first' | 'third';

const EYE = 1.6;
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;
const GRAVITY = 22;
const JUMP = 7.4;
const SPEED = 4.6;

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
}

interface Wanderer { sprite: THREE.Sprite; x: number; z: number; dir: number; speed: number; phase: number }

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
  private furnitureGroup = new THREE.Group();
  private livestockGroup = new THREE.Group();
  private wanderers: Wanderer[] = [];
  private avatar = new THREE.Group();
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
    this.season = options.season;
    this.seed = options.seed;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 260);
    this.applySky();

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6f8f5f', 2.1));
    const sun = new THREE.DirectionalLight('#fff4d8', 1.5);
    sun.position.set(18, 30, 12);
    this.scene.add(sun);

    this.scene.add(this.blockGroup, this.terrainGroup, this.furnitureGroup, this.livestockGroup, this.avatar);

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

    this.bind();
    this.loop();
  }

  // ---- world -------------------------------------------------------------

  private applySky() {
    const style = seasonStyles[this.season];
    this.scene.background = new THREE.Color(style.sky);
    this.scene.fog = new THREE.Fog(style.fog, 46, 118);
  }

  /** One InstancedMesh per colour keeps the whole landscape to a few draw calls. */
  private rebuildTerrain() {
    this.terrainGroup.clear();
    // Endless land: a huge flat grass plane just under the ground, filling the
    // world out to the fog so there's no visible edge — your land goes on forever.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshLambertMaterial({ color: seasonStyles[this.season].grass }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(SX / 2, 0.99, SZ / 2);
    this.terrainGroup.add(ground);
    const byColour = new Map<string, Array<{ x: number; y: number; z: number }>>();
    buildTerrain(this.season, this.seed).forEach((block) => {
      const list = byColour.get(block.colour) ?? [];
      list.push({ x: block.x, y: block.y, z: block.z });
      byColour.set(block.colour, list);
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    const water = seasonStyles[this.season].water;
    byColour.forEach((cells, colour) => {
      const material = new THREE.MeshLambertMaterial({
        color: colour,
        transparent: colour === water,
        opacity: colour === water ? 0.8 : 1,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      cells.forEach((cell, index) => {
        matrix.setPosition(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.terrainGroup.add(mesh);
    });
  }

  setSeason(season: Season) {
    if (season === this.season) return;
    this.season = season;
    this.applySky();
    this.rebuildTerrain();
    this.rebuildBlocks();
  }

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
    });
    // Animals: roam the pasture behind the garden.
    this.options.animals.slice(0, 24).forEach((animal, i) => {
      const type = animalById(animal.type);
      if (!type) return;
      const x = -1 + Math.random() * (SX + 2), z = SZ + 5 + Math.random() * 8;
      const sprite = this.emojiSprite(type.icon, 1.35);
      sprite.position.set(x, this.groundY(x, z) + 0.6, z);
      this.livestockGroup.add(sprite);
      this.wanderers.push({ sprite, x, z, dir: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.6, phase: i * 1.7 });
    });
  }

  /** Amble the animals gently around their pasture. */
  private moveAnimals(dt: number) {
    const XMIN = -1, XMAX = SX + 1, ZMIN = SZ + 4, ZMAX = SZ + 14;
    for (const w of this.wanderers) {
      w.phase += dt;
      w.dir += Math.sin(w.phase * 0.6) * dt * 0.9;
      w.x += Math.cos(w.dir) * w.speed * dt;
      w.z += Math.sin(w.dir) * w.speed * dt;
      if (w.x < XMIN) { w.x = XMIN; w.dir = Math.PI - w.dir; }
      if (w.x > XMAX) { w.x = XMAX; w.dir = Math.PI - w.dir; }
      if (w.z < ZMIN) { w.z = ZMIN; w.dir = -w.dir; }
      if (w.z > ZMAX) { w.z = ZMAX; w.dir = -w.dir; }
      const bob = Math.abs(Math.sin(w.phase * 5)) * 0.06;
      w.sprite.position.set(w.x, this.groundY(w.x, w.z) + 0.6 + bob, w.z);
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
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), skin);
    armL.position.set(-0.34, 0.95, 0);
    const armR = armL.clone();
    armR.position.x = 0.34;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.18), legs);
    legL.position.set(-0.13, 0.32, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;

    this.avatar.add(head, body, armL, armR, legL, legR);
  }

  private resetPlayer() {
    const x = Math.floor(SX / 2);
    const z = Math.floor(SZ / 2);
    this.position.set(x + 0.5, spawnHeight(this.world, x, z), z + 0.5);
    this.velocity.set(0, 0, 0);
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
    if (event.code === 'Space' && this.mode === 'walk') event.preventDefault();
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
    this.orbit.radius = THREE.MathUtils.clamp(this.orbit.radius + event.deltaY * 0.02, 8, 48);
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
    this.options.onChangeWorld((previous) => withVoxel(previous, target.x, target.y, target.z, remove ? EMPTY : this.picked));
  }

  // ---- movement ----------------------------------------------------------

  /** Plot blocks come from the saved house; everything else is generated land. */
  private solidAt(x: number, y: number, z: number) {
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
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const move = new THREE.Vector3(
      Math.sin(this.yaw) * -forward + Math.cos(this.yaw) * strafe,
      0,
      Math.cos(this.yaw) * -forward - Math.sin(this.yaw) * strafe,
    );
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED * dt);

    if (this.grounded && this.keys.has('Space')) this.velocity.y = JUMP;
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
    if (this.wanderers.length) this.moveAnimals(dt);
    if (this.mode === 'walk') this.walk(dt);
    else {
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
