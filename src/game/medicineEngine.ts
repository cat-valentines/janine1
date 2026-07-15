import * as THREE from 'three';
import { ARENA, ARENA_TOP, buildForest, isForestSolid, spawnPoint } from './forest';
import { animateWalk, buildBody, emojiTexture, faceTexture, type Limbs } from './blockBody';
import {
  HERBS_IN_WORLD, MISSION_SECONDS, herbById, herbList, patientFor, rivalHealers,
  type Patient,
} from './medicine';

const EYE = 1.6;
const HALF = 0.3;
const HEIGHT = 1.8;
const GRAVITY = 22;
const JUMP = 7.2;
const SPEED = 5.2;
const CAMP_RANGE = 3.2;
const PICK_RANGE = 1.5;

export interface MedicineSnapshot {
  secondsLeft: number;
  saved: number;
  patient: Patient;
  list: Array<{ id: string; got: boolean }>;
  atCamp: boolean;
  rivals: Array<{ name: string; icon: string; saved: number }>;
  message: string;
  status: 'playing' | 'done';
  won: boolean;
}

interface WorldHerb { id: string; sprite: THREE.Sprite; position: THREE.Vector3; taken: boolean }

interface EngineOptions {
  seed: number;
  onUpdate: (snapshot: MedicineSnapshot) => void;
}

export class MedicineEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;
  private seed: number;

  private avatar: THREE.Group;
  private limbs: Limbs;
  private patientGroup: THREE.Group;
  private campMarker: THREE.Sprite;

  private position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.1;
  private grounded = false;
  private walkPhase = 0;
  private keys = new Set<string>();
  private pointerLocked = false;
  private view: 'first' | 'third' = 'third';

  private camp = new THREE.Vector3();
  private worldHerbs: WorldHerb[] = [];
  private saved = 0;
  private list: string[] = [];
  private got = new Set<string>();
  private time = 0;
  private message = '';
  private messageUntil = 0;
  private status: 'playing' | 'done' = 'playing';
  private won = false;

  private running = true;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.seed = options.seed;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 240);
    this.scene.background = new THREE.Color('#bfe3c8');
    this.scene.fog = new THREE.Fog('#cfeacf', 34, 96);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#4d6b3f', 2.2));
    const sun = new THREE.DirectionalLight('#fff6dd', 1.5);
    sun.position.set(24, 46, 18);
    this.scene.add(sun);

    this.buildTerrain();

    // You play the medicine cat, so the avatar wears the cat's face.
    const built = buildBody('#7c9b57', '#f2d0b4', 1, faceTexture('/assets/calico-cat.png'), '#f2d0b4');
    this.avatar = built.group;
    this.limbs = built.limbs;
    this.scene.add(this.avatar);

    const centre = ARENA / 2;
    this.camp.set(centre, this.standHeight(centre, centre, HEIGHT), centre);

    const patient = buildBody('#b56b6b', '#e8cfa8', 0.9);
    this.patientGroup = patient.group;
    this.patientGroup.position.copy(this.camp);
    // Laid out flat: this cat is hurt, not standing around.
    this.patientGroup.rotation.z = Math.PI / 2;
    this.patientGroup.position.y += 0.3;
    this.scene.add(this.patientGroup);

    this.campMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('⛑️') }));
    this.campMarker.scale.setScalar(1.6);
    this.campMarker.position.copy(this.camp).add(new THREE.Vector3(0, 2.4, 0));
    this.scene.add(this.campMarker);

    const start = spawnPoint(0, this.seed);
    this.position.set(start.x, this.standHeight(start.x, start.z, HEIGHT), start.z);

    this.list = herbList(0);
    this.scatterHerbs();
    this.bind();
    this.loop();
  }

  private buildTerrain() {
    const byColour = new Map<string, Array<{ x: number; y: number; z: number }>>();
    buildForest(this.seed).forEach((block) => {
      const list = byColour.get(block.colour) ?? [];
      list.push(block);
      byColour.set(block.colour, list);
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    byColour.forEach((cells, colour) => {
      const material = new THREE.MeshLambertMaterial({ color: colour });
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      cells.forEach((cell, index) => {
        matrix.setPosition(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    });
  }

  /** Lowest height at this column where a body fits — see QuestEngine for why. */
  private standHeight(x: number, z: number, height: number) {
    for (let y = 0; y <= ARENA_TOP + 2; y += 1) {
      if (!this.blocked(x, y, z, height)) return y;
    }
    return ARENA_TOP + 2;
  }

  /** Fresh herbs for the current patient, plus decoys so the list matters. */
  private scatterHerbs() {
    this.worldHerbs.forEach((herb) => this.scene.remove(herb.sprite));
    this.worldHerbs = [];
    for (let i = 0; i < HERBS_IN_WORLD; i += 1) {
      // Every herb on the list appears at least once, then fill with decoys.
      const id = i < this.list.length
        ? this.list[i]
        : herbList(this.saved + i)[i % 3];
      const angle = (i / HERBS_IN_WORLD) * Math.PI * 2 + this.saved * 0.7 + i * 0.31;
      const radius = 7 + ((i * 5 + this.saved * 3) % 16);
      const x = THREE.MathUtils.clamp(ARENA / 2 + Math.cos(angle) * radius, 5, ARENA - 5);
      const z = THREE.MathUtils.clamp(ARENA / 2 + Math.sin(angle) * radius, 5, ARENA - 5);
      const y = this.standHeight(x, z, 1);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(herbById(id)?.icon ?? '🌿') }));
      sprite.scale.setScalar(0.9);
      sprite.position.set(x, y + 0.6, z);
      this.scene.add(sprite);
      this.worldHerbs.push({ id, sprite, position: sprite.position.clone(), taken: false });
    }
  }

  private say(text: string, seconds = 2.4) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
    if (event.code === 'KeyF') this.view = this.view === 'third' ? 'first' : 'third';
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onPointerDown = () => { if (!this.pointerLocked) this.renderer.domElement.requestPointerLock(); };
  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointerLocked) return;
    this.yaw -= event.movementX * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0024, -1.3, 1.3);
  };
  private onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.renderer.domElement; };

  private bind() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private unbind() {
    const canvas = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }

  // ---- movement ----------------------------------------------------------

  private solid(x: number, y: number, z: number) {
    return isForestSolid(Math.floor(x), Math.floor(y), Math.floor(z), this.seed);
  }

  private blocked(x: number, y: number, z: number, height: number) {
    for (let cy = Math.floor(y); cy <= Math.floor(y + height); cy += 1) {
      for (let cz = Math.floor(z - HALF); cz <= Math.floor(z + HALF); cz += 1) {
        for (let cx = Math.floor(x - HALF); cx <= Math.floor(x + HALF); cx += 1) {
          if (this.solid(cx, cy, cz)) return true;
        }
      }
    }
    return false;
  }

  private movePlayer(dt: number) {
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const move = new THREE.Vector3(
      Math.sin(this.yaw) * -forward + Math.cos(this.yaw) * strafe,
      0,
      Math.cos(this.yaw) * -forward - Math.sin(this.yaw) * strafe,
    );
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(SPEED * dt);
    if (this.grounded && this.keys.has('Space')) this.velocity.y = JUMP;

    const next = this.position.clone();
    // Auto step-up, so uneven forest floor never stops you mid-run.
    if (move.x) {
      if (!this.blocked(next.x + move.x, next.y, next.z, HEIGHT)) next.x += move.x;
      else if (!this.blocked(next.x + move.x, next.y + 1, next.z, HEIGHT)) { next.x += move.x; next.y += 1; }
    }
    if (move.z) {
      if (!this.blocked(next.x, next.y, next.z + move.z, HEIGHT)) next.z += move.z;
      else if (!this.blocked(next.x, next.y + 1, next.z + move.z, HEIGHT)) { next.z += move.z; next.y += 1; }
    }
    this.velocity.y -= GRAVITY * dt;
    const fall = next.y + this.velocity.y * dt;
    this.grounded = false;
    if (this.blocked(next.x, fall, next.z, HEIGHT)) {
      if (this.velocity.y <= 0) this.grounded = true;
      this.velocity.y = 0;
    } else next.y = fall;
    if (next.y < 0) { next.y = 0; this.velocity.y = 0; this.grounded = true; }
    this.position.copy(next);

    this.walkPhase = moving ? this.walkPhase + dt * 9 : 0;
    animateWalk(this.limbs, this.walkPhase, moving);
  }

  // ---- healing -----------------------------------------------------------

  private gather() {
    this.worldHerbs.forEach((herb) => {
      if (herb.taken || herb.position.distanceTo(this.position) > PICK_RANGE) return;
      const needed = this.list.includes(herb.id) && !this.got.has(herb.id);
      const info = herbById(herb.id);
      if (!needed) {
        this.say(`${info?.icon ?? '🌿'} ${info?.name} — not on the list.`, 1.4);
        return;
      }
      herb.taken = true;
      this.scene.remove(herb.sprite);
      this.got.add(herb.id);
      const left = this.list.length - this.got.size;
      this.say(left > 0
        ? `${info?.icon} Picked ${info?.name} — ${left} herb${left === 1 ? '' : 's'} to go!`
        : `${info?.icon} That's every herb! Run back to ⛑️ camp.`, 2.2);
    });
  }

  private tryHeal() {
    if (this.got.size < this.list.length) return;
    if (this.position.distanceTo(this.camp) > CAMP_RANGE) return;
    const patient = patientFor(this.saved);
    this.saved += 1;
    this.got.clear();
    this.list = herbList(this.saved);
    this.scatterHerbs();
    this.say(`💚 You saved ${patient.name}! ${this.saved} live${this.saved === 1 ? '' : 's'} saved.`, 3);
  }

  private rivalSaves() {
    return rivalHealers.map((rival) => ({
      name: rival.name, icon: rival.icon,
      saved: Math.floor(this.time / rival.secondsPerLife),
    }));
  }

  private updateCamera() {
    const eye = this.position.clone().add(new THREE.Vector3(0, EYE, 0));
    const look = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.avatar.position.copy(this.position);
    this.avatar.rotation.y = this.yaw;
    this.avatar.visible = this.view === 'third';
    if (this.view === 'first') {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      return;
    }
    const back = look.clone().normalize();
    let distance = 4.4;
    for (let s = 0.2; s <= 4.4; s += 0.2) {
      const probe = eye.clone().add(back.clone().multiplyScalar(s));
      if (this.solid(probe.x, probe.y, probe.z)) { distance = Math.max(0, s - 0.3); break; }
    }
    if (distance < 0.7) {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().sub(look));
      this.avatar.visible = false;
      return;
    }
    this.camera.position.copy(eye.clone().add(back.multiplyScalar(distance)));
    this.camera.lookAt(eye);
  }

  private snapshot(): MedicineSnapshot {
    return {
      secondsLeft: Math.max(0, Math.ceil(MISSION_SECONDS - this.time)),
      saved: this.saved,
      patient: patientFor(this.saved),
      list: this.list.map((id) => ({ id, got: this.got.has(id) })),
      atCamp: this.position.distanceTo(this.camp) <= CAMP_RANGE,
      rivals: this.rivalSaves(),
      message: this.time < this.messageUntil ? this.message : '',
      status: this.status,
      won: this.won,
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
    this.unbind();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.status === 'playing') {
      this.time += dt;
      this.movePlayer(dt);
      this.gather();
      this.tryHeal();
      this.campMarker.position.y = this.camp.y + 2.4 + Math.sin(this.time * 2) * 0.15;
      if (this.time >= MISSION_SECONDS) {
        this.status = 'done';
        this.won = this.rivalSaves().every((rival) => this.saved > rival.saved);
        if (this.pointerLocked) document.exitPointerLock();
      }
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
