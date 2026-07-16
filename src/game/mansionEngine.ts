import * as THREE from 'three';
import {
  CELL, COLS, HIDE_DISTANCE, KEEPER_CHASE_SPEED, KEEPER_FOV, KEEPER_HEARING, KEEPER_PATROL_SPEED,
  KEEPER_REACH, KEEPER_SEARCH_SECONDS, KEEPER_SIGHT, KEYS_TO_ESCAPE, PLAYER_EYE, PLAYER_RADIUS,
  PLAYER_SPEED, ROWS, SNEAK_SPEED, TURN_SPEED, WALL_H, colOf, doorSpot, hideSpots, isWall,
  keySpots, rowOf, startSpot, worldOf,
} from './mansion';

export interface MansionSnapshot {
  keys: number;
  totalKeys: number;
  hidden: boolean;
  /** 0 calm, 1 hunting you. Drives the warning bar. */
  alarm: number;
  keeperState: 'patrol' | 'chase' | 'search';
  nearHide: boolean;
  nearDoor: boolean;
  status: 'playing' | 'caught' | 'escaped';
  message: string;
}

interface EngineOptions {
  characterAsset: string;
  onUpdate: (snapshot: MansionSnapshot) => void;
}

interface Cell { col: number; row: number }

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

  private keyMeshes: Array<{ mesh: THREE.Object3D; taken: boolean; at: Cell }> = [];
  private hideMeshes: Array<{ mesh: THREE.Object3D; at: Cell }> = [];
  private collected = 0;
  private hidden = false;
  private alarm = 0;
  private status: MansionSnapshot['status'] = 'playing';
  private message = '';
  private messageUntil = 0;

  private torch: THREE.PointLight;
  private running = true;
  private clock = new THREE.Clock();
  private time = 0;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 90);
    this.scene.background = new THREE.Color('#05060a');
    this.scene.fog = new THREE.Fog('#05060a', 4, 22);

    // Almost pitch dark. Your torch is nearly all the light there is.
    this.scene.add(new THREE.AmbientLight('#3a4064', 0.5));
    this.torch = new THREE.PointLight('#ffdba8', 26, 17, 1.6);
    this.scene.add(this.torch);

    this.buildHouse();
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

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.loop();
  }

  // ---- building ----------------------------------------------------------

  private buildHouse() {
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const wallMat = new THREE.MeshLambertMaterial({ color: '#4a3f52' });
    const floorMat = new THREE.MeshLambertMaterial({ color: '#2e2733' });
    const ceilMat = new THREE.MeshLambertMaterial({ color: '#221c28' });
    const doorMat = new THREE.MeshLambertMaterial({ color: '#7a4a22', emissive: '#2a1607' });
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

    // The way out, glowing faintly so you can find it in the dark.
    const doorGeo = new THREE.BoxGeometry(CELL * 0.8, 2.6, 0.3);
    this.disposables.push(doorGeo);
    const door = new THREE.Mesh(doorGeo, doorMat);
    const at = worldOf(doorSpot.col, doorSpot.row);
    door.position.set(at.x, 1.3, at.z);
    this.scene.add(door);
    const glow = new THREE.PointLight('#ffb457', 6, 7, 2);
    glow.position.set(at.x, 1.8, at.z);
    this.scene.add(glow);
  }

  private buildKeys() {
    const geo = new THREE.TorusGeometry(0.18, 0.06, 8, 14);
    const stem = new THREE.BoxGeometry(0.09, 0.42, 0.09);
    const mat = new THREE.MeshLambertMaterial({ color: '#f2c94c', emissive: '#6a5410' });
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
      this.keyMeshes.push({ mesh: group, taken: false, at });
      const shine = new THREE.PointLight('#ffdf7a', 2.4, 4.5, 2);
      shine.position.set(world.x, 1.2, world.z);
      this.scene.add(shine);
    });
  }

  private buildHideSpots() {
    const geo = new THREE.BoxGeometry(CELL * 0.7, 2.3, CELL * 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: '#5b3a24' });
    const handleGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    const handleMat = new THREE.MeshLambertMaterial({ color: '#d8c08a' });
    this.disposables.push(geo, mat, handleGeo, handleMat);
    hideSpots.forEach((at) => {
      const world = worldOf(at.col, at.row);
      const wardrobe = new THREE.Mesh(geo, mat);
      wardrobe.position.set(world.x, 1.15, world.z);
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(world.x + 0.1, 1.15, world.z + CELL * 0.26);
      this.scene.add(wardrobe, handle);
      this.hideMeshes.push({ mesh: wardrobe, at });
    });
  }

  private buildKeeper(asset: string) {
    const body = new THREE.MeshLambertMaterial({ color: '#6d2b3a' });
    const skin = new THREE.MeshLambertMaterial({ map: this.faceTexture(asset) });
    const torsoGeo = new THREE.BoxGeometry(0.62, 1.0, 0.34);
    const headGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    this.disposables.push(body, skin, torsoGeo, headGeo);
    const torso = new THREE.Mesh(torsoGeo, body);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.78;
    this.keeper.add(torso, head);
    // Her lamp — if you can see it coming, you still have time.
    const lamp = new THREE.PointLight('#ff9f6e', 7, 9, 2);
    lamp.position.set(0, 1.5, 0.4);
    this.keeper.add(lamp);
    this.scene.add(this.keeper);
  }

  /** Flatten the character PNG onto a colour; raw alpha renders black. */
  private faceTexture(asset: string) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    const image = new Image();
    image.onload = () => {
      if (!ctx) return;
      ctx.fillStyle = '#d8bfae';
      ctx.fillRect(0, 0, 128, 128);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 6, 6, 116, 116);
      texture.needsUpdate = true;
    };
    image.src = asset;
    return texture;
  }

  /** A round of the house that actually visits every room. */
  private planPatrol() {
    this.patrolPoints = [...keySpots, ...hideSpots, { col: doorSpot.col, row: doorSpot.row - 1 }]
      .filter((at) => !isWall(at.col, at.row));
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft'].includes(event.code)) event.preventDefault();
    if (this.keys.has(event.code)) return;
    this.keys.add(event.code);
    if (event.code === 'Space') this.useSpace();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private say(text: string, seconds = 2.2) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  private nearestHide() {
    let best: { at: Cell; distance: number } | null = null;
    this.hideMeshes.forEach((spot) => {
      const world = worldOf(spot.at.col, spot.at.row);
      const distance = Math.hypot(world.x - this.position.x, world.z - this.position.z);
      if (!best || distance < best.distance) best = { at: spot.at, distance };
    });
    return best as { at: Cell; distance: number } | null;
  }

  private atDoor() {
    const world = worldOf(doorSpot.col, doorSpot.row);
    return Math.hypot(world.x - this.position.x, world.z - this.position.z) < 2.2;
  }

  /** Space does the obvious thing: hide, come out, or open the door. */
  private useSpace() {
    if (this.status !== 'playing') return;
    if (this.hidden) { this.hidden = false; this.say('You slip back out.', 1.4); return; }
    const hide = this.nearestHide();
    if (hide && hide.distance < HIDE_DISTANCE) {
      this.hidden = true;
      this.say('🤫 Hidden. Stay still…', 2);
      return;
    }
    if (this.atDoor()) {
      if (this.collected >= KEYS_TO_ESCAPE) {
        this.status = 'escaped';
        this.say('🚪 You got out!', 6);
      } else {
        this.say(`🔒 Locked. You need ${KEYS_TO_ESCAPE - this.collected} more keys.`, 2.4);
      }
    }
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
  }

  /** Can she see you from where she is standing? */
  private canSee() {
    if (this.hidden || this.status !== 'playing') return false;
    const to = new THREE.Vector3().subVectors(this.position, this.keeperPos);
    const distance = to.length();
    if (distance > KEEPER_SIGHT) return false;
    const facing = new THREE.Vector3(Math.sin(this.keeperYaw), 0, Math.cos(this.keeperYaw)).negate();
    if (to.clone().normalize().dot(facing) < Math.cos(KEEPER_FOV)) return false;
    // Walk the line between us: any wall in the way and she sees nothing.
    const steps = Math.ceil(distance / 0.4);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = this.keeperPos.x + to.x * t;
      const z = this.keeperPos.z + to.z * t;
      if (isWall(colOf(x), rowOf(z))) return false;
    }
    return true;
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
    const heard = this.canHear();

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

    if (!this.hidden && this.keeperPos.distanceTo(this.position) < KEEPER_REACH) {
      this.status = 'caught';
      this.say('🖐️ She caught you!', 6);
    }
  }

  private collectKeys() {
    this.keyMeshes.forEach((key) => {
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
      hidden: this.hidden, alarm: this.alarm, keeperState: this.keeperState,
      nearHide: !!hide && hide.distance < HIDE_DISTANCE,
      nearDoor: this.atDoor(),
      status: this.status,
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
      this.collectKeys();
    }

    this.keeper.position.copy(this.keeperPos);
    this.keeper.rotation.y = this.keeperYaw;
    this.keyMeshes.forEach((key) => { key.mesh.rotation.y = this.time * 1.6; });

    // Hiding drops you down inside the wardrobe and kills your torch.
    const eye = this.hidden ? 1.05 : PLAYER_EYE;
    this.camera.position.set(this.position.x, eye, this.position.z);
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    this.camera.lookAt(this.camera.position.clone().add(look));
    this.torch.position.set(this.position.x, 1.9, this.position.z);
    this.torch.intensity = this.hidden ? 1.5 : 26;

    this.renderer.render(this.scene, this.camera);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
