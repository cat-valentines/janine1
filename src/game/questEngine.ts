import * as THREE from 'three';
import { ARENA, ARENA_TOP, WALL, buildForest, forestGround, isForestSolid, spawnRing } from './forest';
import {
  DAY_SECONDS, FLY_DRAIN, FLY_HEIGHT, FLY_MIN, FLY_SPEED, INVISIBLE_COST, INVISIBLE_SECONDS,
  MAGIC_REGEN, MAX_HEARTS, MAX_MAGIC, RIVAL_COUNT, START_HEARTS, TELEPORT_COOLDOWN, TELEPORT_COST,
  TELEPORT_DIST, challengeForDay, magicWand, mobTypes, pickupTypes, weaponById,
  type MobType, type PickupKind, type Weapon,
} from './hunger';

const EYE = 1.6;
const HALF = 0.3;
const HEIGHT = 1.8;
const GRAVITY = 22;
const JUMP = 7.2;
const SPEED = 4.8;
const TURN = 2.2;          // radians per second, for the arrow keys
const HURT_INVULN = 0.9;   // game seconds
const GRACE = 8;           // game seconds before anyone hunts you

export interface QuestSnapshot {
  hearts: number; maxHearts: number;
  day: number; night: boolean; secondsLeft: number;
  alive: number; weapon: Weapon; backpack: PickupKind[];
  magic: number; flying: boolean; invisibleFor: number;
  message: string; status: 'playing' | 'dead' | 'won';
}

interface Mob {
  type: MobType; hp: number; group: THREE.Group;
  position: THREE.Vector3; velocity: THREE.Vector3;
  nextAttack: number; walk: number; alive: boolean;
  limbs: { armL: THREE.Mesh; armR: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh };
}

interface Pickup { kind: PickupKind; sprite: THREE.Sprite; position: THREE.Vector3; taken: boolean }

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

/** A blocky body with swinging arms and legs, the way Minecraft animates. */
function buildBody(bodyColour: string, headColour: string, scale: number, headTexture?: THREE.Texture, armColour?: string) {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: bodyColour });
  const arms = new THREE.MeshLambertMaterial({ color: armColour ?? headColour });
  const skin = new THREE.MeshLambertMaterial(headTexture ? { map: headTexture } : { color: headColour });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), body);
  torso.position.y = 0.95 * scale;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skin);
  head.position.y = 1.5 * scale;
  const limb = new THREE.BoxGeometry(0.16, 0.58, 0.16);
  const armL = new THREE.Mesh(limb, arms);
  armL.geometry.translate(0, -0.29, 0);
  armL.position.set(-0.34, 1.22 * scale, 0);
  const armR = armL.clone();
  armR.position.x = 0.34;
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
  const legL = new THREE.Mesh(legGeo, body);
  legL.geometry.translate(0, -0.31, 0);
  legL.position.set(-0.13, 0.62 * scale, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  group.add(torso, head, armL, armR, legL, legR);
  group.scale.setScalar(scale);
  return { group, limbs: { armL, armR, legL, legR } };
}

interface EngineOptions {
  seed: number;
  weapon: Weapon;
  characterAsset: string;
  /** Usernames of real signed-up players, to name the rivals after. */
  rivalNames: string[];
  /** Your own username, floating over your head. */
  myName: string;
  onUpdate: (snapshot: QuestSnapshot) => void;
}

export class QuestEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;
  private seed: number;

  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private avatar: THREE.Group;
  private limbs: { armL: THREE.Mesh; armR: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh };

  private position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = false;
  private walkPhase = 0;
  private keys = new Set<string>();
  private pointerLocked = false;

  private hearts = START_HEARTS;
  private maxHearts = START_HEARTS;
  private weapon: Weapon;
  private backpack: PickupKind[] = [];
  private mobs: Mob[] = [];
  private pickups: Pickup[] = [];
  private day = 1;
  private clockSeconds = 0;
  /** Game seconds since the drop; every cooldown is measured against this. */
  private time = 0;
  private nextSwing = 0;
  private hurtUntil = 0;
  private magic = MAX_MAGIC;
  private flying = false;
  private invisibleUntil = 0;
  private nextTeleport = 0;
  /** Tracks the last applied see-through state, so we only touch materials on a change. */
  private fadedOut = false;
  private message = '';
  private messageUntil = 0;
  private status: 'playing' | 'dead' | 'won' = 'playing';
  private lastChallengeDay = 0;

  private running = true;
  private clock = new THREE.Clock();
  private view: 'first' | 'third' = 'third';

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.seed = options.seed;
    this.weapon = options.weapon;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 240);
    this.scene.fog = new THREE.Fog('#9ed3e8', 30, 92);

    this.ambient = new THREE.HemisphereLight('#ffffff', '#3d5a34', 2);
    this.sun = new THREE.DirectionalLight('#fff2d0', 1.4);
    this.sun.position.set(30, 50, 20);
    this.scene.add(this.ambient, this.sun);

    this.buildTerrain();

    const built = buildBody('#4a7fb5', '#f2d0b4', 1, this.faceTexture(options.characterAsset), '#f2d0b4');
    this.avatar = built.group;
    this.limbs = built.limbs;
    // Your own username floats over your head, in green, so you stand out.
    const myTag = this.nameTag(options.myName || 'You', '#7dffbe');
    myTag.position.y = 2.5;
    this.avatar.add(myTag);
    this.scene.add(this.avatar);

    const start = spawnRing(0, RIVAL_COUNT + 1, this.seed);
    this.position.set(start.x, this.standHeight(start.x, start.z, HEIGHT), start.z);

    this.spawnRivals();
    this.spawnPickups();
    this.bind();
    this.loop();
  }

  /** Flatten the character PNG onto a head colour; raw alpha renders black. */
  private faceTexture(asset: string) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    const image = new Image();
    image.onload = () => {
      if (!ctx) return;
      ctx.fillStyle = '#f6e7d4';
      ctx.fillRect(0, 0, 128, 128);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 4, 4, 120, 120);
      texture.needsUpdate = true;
    };
    image.src = asset;
    return texture;
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

  private addMob(type: MobType, at: { x: number; y: number; z: number }) {
    const scale = type.height / 1.8;
    const built = buildBody(type.body, type.head, scale);
    at = { ...at, y: this.standHeight(at.x, at.z, type.height) };
    built.group.position.set(at.x, at.y, at.z);
    this.scene.add(built.group);
    const mob: Mob = {
      type, hp: type.hp, group: built.group, limbs: built.limbs,
      position: new THREE.Vector3(at.x, at.y, at.z), velocity: new THREE.Vector3(),
      nextAttack: 0, walk: Math.random() * 6, alive: true,
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * A floating name tag. depthTest off so it reads through the trees — you are
   * meant to see who is still out there.
   */
  private nameTag(text: string, colour = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0810d0';
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.font = 'bold 30px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.fillText(text.slice(0, 14), 128, 34);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
    }));
    sprite.scale.set(2.4, 0.6, 1);
    return sprite;
  }

  private spawnRivals() {
    for (let i = 0; i < RIVAL_COUNT; i += 1) {
      const mob = this.addMob(mobTypes.rival, spawnRing(i + 1, RIVAL_COUNT + 1, this.seed));
      // Real players if any have signed up; otherwise plain numbered rivals.
      const real = this.options.rivalNames[i];
      const tag = this.nameTag(real ?? `Player ${i + 1}`, real ? '#f2c94c' : '#b9c6d8');
      tag.position.y = mobTypes.rival.height + 0.75;
      if (mob) mob.group.add(tag);
    }
  }

  private spawnPickups() {
    const kinds: PickupKind[] = ['water', 'tent', 'blanket', 'heart', 'weapon', 'wand', 'heart', 'water'];
    kinds.forEach((kind, index) => {
      const angle = (index / kinds.length) * Math.PI * 2 + 0.7;
      const radius = ARENA * (0.16 + (index % 3) * 0.09);
      const x = ARENA / 2 + Math.cos(angle) * radius;
      const z = ARENA / 2 + Math.sin(angle) * radius;
      const y = forestGround(x, z, this.seed);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(pickupTypes[kind].icon) }));
      sprite.scale.setScalar(0.9);
      sprite.position.set(x, y + 0.6, z);
      this.scene.add(sprite);
      this.pickups.push({ kind, sprite, position: sprite.position.clone(), taken: false });
    });
  }

  /** Drops the night's monsters in a ring around the player. */
  private startChallenge() {
    const challenge = challengeForDay(this.day);
    const type = mobTypes[challenge.spawn] ?? mobTypes.zombie;
    for (let i = 0; i < challenge.count; i += 1) {
      const angle = (i / challenge.count) * Math.PI * 2;
      const x = THREE.MathUtils.clamp(this.position.x + Math.cos(angle) * 12, 5, ARENA - 5);
      const z = THREE.MathUtils.clamp(this.position.z + Math.sin(angle) * 12, 5, ARENA - 5);
      this.addMob(type, { x, y: forestGround(x, z, this.seed) + 1, z });
    }
    if (challenge.spawn === 'spider') {
      for (let i = 0; i < 2; i += 1) {
        const x = THREE.MathUtils.clamp(this.position.x + (i ? 9 : -9), 5, ARENA - 5);
        const z = THREE.MathUtils.clamp(this.position.z + 7, 5, ARENA - 5);
        this.addMob(mobTypes.zombie, { x, y: forestGround(x, z, this.seed) + 1, z });
      }
    }
    this.say(`🌙 Night ${this.day}: ${challenge.title} — ${challenge.blurb}`, 5000);
  }

  private say(text: string, ms = 2600) {
    this.message = text;
    this.messageUntil = this.time + ms / 1000;
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    // The arrows would scroll the page and space would page-down, so hold them here.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.code === 'Space') this.swing();
    if (event.code === 'KeyF') this.view = this.view === 'third' ? 'first' : 'third';
    if (event.code === 'Digit1') this.toggleFly();
    if (event.code === 'Digit2') this.teleport();
    if (event.code === 'Digit3') this.turnInvisible();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onPointerDown = () => {
    if (!this.pointerLocked) { this.renderer.domElement.requestPointerLock(); return; }
    this.swing();
  };
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

  // ---- powers ------------------------------------------------------------

  private isInvisible() { return this.time < this.invisibleUntil; }

  private toggleFly() {
    if (this.status !== 'playing') return;
    if (this.flying) { this.flying = false; this.say('🕊️ You float back down.', 1400); return; }
    if (this.magic < FLY_MIN) { this.say('✨ Not enough magic to fly yet!', 1600); return; }
    this.flying = true;
    this.say('🕊️ Up you go — you are flying!', 1800);
  }

  private teleport() {
    if (this.status !== 'playing') return;
    if (this.time < this.nextTeleport) return;
    if (this.magic < TELEPORT_COST) { this.say('✨ Not enough magic to teleport!', 1600); return; }
    this.magic -= TELEPORT_COST;
    this.nextTeleport = this.time + TELEPORT_COOLDOWN;
    const ahead = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate().multiplyScalar(TELEPORT_DIST);
    const to = this.position.clone().add(ahead);
    to.x = THREE.MathUtils.clamp(to.x, WALL + 1, ARENA - WALL - 2);
    to.z = THREE.MathUtils.clamp(to.z, WALL + 1, ARENA - WALL - 2);
    // Land on solid ground rather than inside a hill.
    to.y = this.flying ? this.position.y : this.standHeight(to.x, to.z, HEIGHT);
    this.position.copy(to);
    this.velocity.set(0, 0, 0);
    this.say('✨ Teleported!', 1200);
  }

  private turnInvisible() {
    if (this.status !== 'playing' || this.isInvisible()) return;
    if (this.magic < INVISIBLE_COST) { this.say('✨ Not enough magic to vanish!', 1600); return; }
    this.magic -= INVISIBLE_COST;
    this.invisibleUntil = this.time + INVISIBLE_SECONDS;
    this.say('👻 Invisible! Nobody can see you.', 1800);
  }

  private updateMagic(dt: number) {
    if (this.flying) {
      this.magic -= FLY_DRAIN * dt;
      if (this.magic <= 0) {
        this.magic = 0;
        this.flying = false;
        this.say('✨ Your magic ran out — you float down!', 2400);
      }
      return;
    }
    // Staying invisible costs magic too, otherwise you could hide forever.
    if (this.isInvisible()) return;
    this.magic = Math.min(MAX_MAGIC, this.magic + MAGIC_REGEN * dt);
  }

  /** Fade the avatar in and out instead of popping it, and only on a change. */
  private applyInvisibility() {
    const hidden = this.isInvisible();
    if (hidden === this.fadedOut) return;
    this.fadedOut = hidden;
    this.avatar.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        material.transparent = hidden;
        material.opacity = hidden ? 0.25 : 1;
        material.needsUpdate = true;
      });
    });
  }

  // ---- combat ------------------------------------------------------------

  swing() {
    if (this.status !== 'playing' || this.time < this.nextSwing) return;
    this.nextSwing = this.time + this.weapon.cooldown / 1000;
    this.limbs.armR.rotation.x = -1.9;
    const look = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    const eye = this.position.clone().add(new THREE.Vector3(0, EYE, 0));
    let best: Mob | null = null;
    let bestScore = -1;
    this.mobs.forEach((mob) => {
      if (!mob.alive) return;
      const to = mob.position.clone().add(new THREE.Vector3(0, mob.type.height / 2, 0)).sub(eye);
      const distance = to.length();
      if (distance > this.weapon.reach) return;
      const aim = to.normalize().dot(look);
      if (aim < 0.55) return; // must be roughly in front
      if (aim > bestScore) { bestScore = aim; best = mob; }
    });
    if (!best) return;
    const hit = best as Mob;
    hit.hp -= this.weapon.damage;
    if (hit.hp > 0) { this.say(`${hit.type.icon} Hit the ${hit.type.name.toLowerCase()}!`, 900); return; }
    hit.alive = false;
    this.scene.remove(hit.group);
    this.say(`${hit.type.icon} You defeated a ${hit.type.name.toLowerCase()}!`, 1500);
    if (this.rivalsLeft() === 0) {
      this.status = 'won';
      this.say('🏆 You are the last one standing!', 6000);
    }
  }

  private rivalsLeft() {
    return this.mobs.filter((mob) => mob.alive && mob.type.id === 'rival').length;
  }

  private hurt(amount: number) {
    if (this.time < this.hurtUntil || this.status !== 'playing') return;
    this.hurtUntil = this.time + HURT_INVULN;
    this.hearts -= amount;
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.status = 'dead';
      this.say('💀 You ran out of hearts!', 6000);
      if (this.pointerLocked) document.exitPointerLock();
      return;
    }
    this.say('💔 You lost a heart!', 1200);
  }

  // ---- movement ----------------------------------------------------------

  private solid(x: number, y: number, z: number) {
    return isForestSolid(Math.floor(x), Math.floor(y), Math.floor(z), this.seed);
  }

  private blocked(x: number, y: number, z: number, height = HEIGHT) {
    for (let cy = Math.floor(y); cy <= Math.floor(y + height); cy += 1) {
      for (let cz = Math.floor(z - HALF); cz <= Math.floor(z + HALF); cz += 1) {
        for (let cx = Math.floor(x - HALF); cx <= Math.floor(x + HALF); cx += 1) {
          if (this.solid(cx, cy, cz)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Lowest height at this column where a body actually fits.
   *
   * A body is 0.6 wide, so it overlaps up to two columns; standing at its own
   * column's height can still leave it wedged inside a taller neighbour, and a
   * wedged entity has every move reverted and never walks again.
   */
  private standHeight(x: number, z: number, height: number) {
    for (let y = 0; y <= ARENA_TOP + 2; y += 1) {
      if (!this.blocked(x, y, z, height)) return y;
    }
    return ARENA_TOP + 2;
  }

  private step(entity: { position: THREE.Vector3; velocity: THREE.Vector3 }, move: THREE.Vector3, dt: number, height: number) {
    const next = entity.position.clone();
    // Try each axis flat first, then one block up — that auto-step is what lets
    // anyone walk up the forest's uneven ground instead of sticking on a ledge.
    if (move.x) {
      if (!this.blocked(next.x + move.x, next.y, next.z, height)) next.x += move.x;
      else if (!this.blocked(next.x + move.x, next.y + 1, next.z, height)) { next.x += move.x; next.y += 1; }
    }
    if (move.z) {
      if (!this.blocked(next.x, next.y, next.z + move.z, height)) next.z += move.z;
      else if (!this.blocked(next.x, next.y + 1, next.z + move.z, height)) { next.z += move.z; next.y += 1; }
    }
    entity.velocity.y -= GRAVITY * dt;
    const fall = next.y + entity.velocity.y * dt;
    let grounded = false;
    if (this.blocked(next.x, fall, next.z, height)) {
      if (entity.velocity.y <= 0) grounded = true;
      entity.velocity.y = 0;
    } else next.y = fall;
    if (next.y < 0) { next.y = 0; entity.velocity.y = 0; grounded = true; }
    entity.position.copy(next);
    return grounded;
  }

  /** Flying ignores gravity and hovers a fixed way above whatever is below you. */
  private flyStep(move: THREE.Vector3, dt: number) {
    const next = this.position.clone();
    if (move.x && !this.blocked(next.x + move.x, next.y, next.z)) next.x += move.x;
    if (move.z && !this.blocked(next.x, next.y, next.z + move.z)) next.z += move.z;
    // The cliffs pen walkers in, so they have to pen fliers in too.
    next.x = THREE.MathUtils.clamp(next.x, WALL + 1, ARENA - WALL - 2);
    next.z = THREE.MathUtils.clamp(next.z, WALL + 1, ARENA - WALL - 2);
    const target = forestGround(next.x, next.z, this.seed) + FLY_HEIGHT;
    next.y = THREE.MathUtils.lerp(next.y, target, Math.min(1, dt * 3));
    this.velocity.set(0, 0, 0);
    this.position.copy(next);
    this.grounded = false;
  }

  private movePlayer(dt: number) {
    // Left and right turn you, so the whole game is playable without a mouse.
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    if (turn) this.yaw += turn * TURN * dt;

    const forward = (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0)
      - (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const move = new THREE.Vector3(
      Math.sin(this.yaw) * -forward + Math.cos(this.yaw) * strafe,
      0,
      Math.cos(this.yaw) * -forward - Math.sin(this.yaw) * strafe,
    );
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar((this.flying ? FLY_SPEED : SPEED) * dt);

    if (this.flying) {
      this.flyStep(move, dt);
    } else {
      if (this.grounded && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))) this.velocity.y = JUMP;
      this.grounded = this.step({ position: this.position, velocity: this.velocity }, move, dt, HEIGHT);
    }

    // Swing arms and legs while walking, and settle them when still.
    this.walkPhase = moving ? this.walkPhase + dt * 9 : 0;
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.limbs.legL.rotation.x = swing;
    this.limbs.legR.rotation.x = -swing;
    this.limbs.armL.rotation.x = -swing;
    if (this.limbs.armR.rotation.x < -0.1) this.limbs.armR.rotation.x += dt * 7;
    else this.limbs.armR.rotation.x = swing;
  }

  private moveMobs(dt: number) {
    const now = this.time;
    // Nobody hunts during the first few seconds, so the drop is survivable,
    // and nobody hunts you at all while you are invisible.
    const hunting = this.time > GRACE && !this.isInvisible();
    this.mobs.forEach((mob) => {
      if (!mob.alive) return;
      const to = this.position.clone().sub(mob.position);
      const distance = to.length();
      let moving = false;
      if (hunting && distance < mob.type.aggro && this.status === 'playing') {
        if (distance > mob.type.reach) {
          const move = to.clone().setY(0).normalize().multiplyScalar(mob.type.speed * dt);
          const before = mob.position.clone();
          this.step(mob, move, dt, mob.type.height);
          moving = mob.position.distanceToSquared(before) > 1e-6;
          // Hop over a one-block ledge instead of grinding into it.
          if (!moving && Math.abs(mob.velocity.y) < 0.01) mob.velocity.y = JUMP * 0.8;
        } else if (now >= mob.nextAttack) {
          mob.nextAttack = now + mob.type.cooldown / 1000;
          this.hurt(mob.type.damage);
        }
        mob.group.rotation.y = Math.atan2(to.x, to.z);
      } else {
        this.step(mob, new THREE.Vector3(), dt, mob.type.height);
      }
      mob.walk = moving ? mob.walk + dt * 8 : 0;
      const swing = moving ? Math.sin(mob.walk) * 0.7 : 0;
      mob.limbs.legL.rotation.x = swing;
      mob.limbs.legR.rotation.x = -swing;
      mob.limbs.armL.rotation.x = -swing;
      mob.limbs.armR.rotation.x = swing;
      mob.group.position.copy(mob.position);
    });
  }

  private collectPickups() {
    this.pickups.forEach((pickup) => {
      if (pickup.taken) return;
      if (pickup.position.distanceTo(this.position) > 1.4) return;
      pickup.taken = true;
      this.scene.remove(pickup.sprite);
      const type = pickupTypes[pickup.kind];
      if (pickup.kind === 'heart') {
        this.maxHearts = Math.min(MAX_HEARTS, this.maxHearts + 1);
        this.hearts = Math.min(this.maxHearts, this.hearts + 1);
      } else if (pickup.kind === 'wand') {
        this.weapon = magicWand;
      } else if (pickup.kind === 'weapon') {
        const stronger = weaponById('axe');
        if (stronger && stronger.damage > this.weapon.damage) this.weapon = stronger;
      } else if (!this.backpack.includes(pickup.kind)) {
        this.backpack.push(pickup.kind);
      }
      this.say(`${type.icon} ${type.blurb}`, 1800);
    });
  }

  private updateSky(dt: number) {
    this.clockSeconds += dt;
    const full = DAY_SECONDS * 2;
    const phase = this.clockSeconds % full;
    const night = phase >= DAY_SECONDS;
    const day = Math.floor(this.clockSeconds / full) + 1;
    if (day !== this.day) { this.day = day; this.say(`☀️ Day ${day} — you survived the night!`, 3500); }
    if (night && this.lastChallengeDay !== this.day) {
      this.lastChallengeDay = this.day;
      this.startChallenge();
    }
    // Light and sky ease between day and night rather than snapping.
    const t = night ? (phase - DAY_SECONDS) / DAY_SECONDS : phase / DAY_SECONDS;
    const darkness = night ? Math.sin(t * Math.PI) : 0;
    this.sun.intensity = 1.4 - darkness * 1.15;
    this.ambient.intensity = 2 - darkness * 1.55;
    const sky = new THREE.Color('#9ed3e8').lerp(new THREE.Color('#131a33'), darkness);
    this.scene.background = sky;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color = sky;
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

  private snapshot(): QuestSnapshot {
    const phase = this.clockSeconds % (DAY_SECONDS * 2);
    const night = phase >= DAY_SECONDS;
    return {
      hearts: this.hearts, maxHearts: this.maxHearts,
      day: this.day, night,
      secondsLeft: Math.ceil(night ? DAY_SECONDS * 2 - phase : DAY_SECONDS - phase),
      alive: this.rivalsLeft() + (this.status === 'dead' ? 0 : 1),
      weapon: this.weapon, backpack: [...this.backpack],
      magic: Math.round(this.magic), flying: this.flying,
      invisibleFor: Math.max(0, Math.ceil(this.invisibleUntil - this.time)),
      message: this.time < this.messageUntil ? this.message : '',
      status: this.status,
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
      this.updateSky(dt);
      this.updateMagic(dt);
      this.movePlayer(dt);
      this.moveMobs(dt);
      this.collectPickups();
      this.applyInvisibility();
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
