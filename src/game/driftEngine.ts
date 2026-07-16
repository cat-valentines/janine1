import * as THREE from 'three';
import { pixelTexture } from './pixelTexture';
import {
  CAR_HALF, COIN_POINTS, DRAG, DRIFT_GRIP, DRIFT_MIN_SLIP, DRIFT_MIN_SPEED, DRIFT_MULT_MAX,
  DRIFT_MULT_RAMP, ENGINE, GRIP, MAX_SPEED, REVERSE, ROAD_WIDTH, ROLL_FRICTION, SESSION_SECONDS,
  STEER_RATE, TRACK_HALF_X, centerline, coinLayout, type Pt,
} from './drift';

export interface DriftSnapshot {
  score: number;
  best: number;
  coins: number;
  speed: number;
  drifting: boolean;
  multiplier: number;
  timeLeft: number;
  status: 'playing' | 'over';
}

interface EngineOptions {
  best: number;
  onUpdate: (snapshot: DriftSnapshot) => void;
  onCoin: () => void;
}

export class DriftEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private options: EngineOptions;
  private disposables: Array<{ dispose: () => void }> = [];

  private line: Pt[] = centerline();
  private car = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private coinMeshes: Array<{ mesh: THREE.Mesh; pos: Pt; taken: boolean }> = [];
  /** Tyre marks: a ring buffer of little dark quads laid down while drifting. */
  private skids!: THREE.InstancedMesh;
  private skidAt = 0;
  private readonly SKID_CAP = 700;

  // Physics is a flat top-down world: position (x,z), a velocity vector, heading.
  private pos = new THREE.Vector2();
  private vel = new THREE.Vector2();
  private yaw = 0;
  private steerVisual = 0;

  private score = 0;
  private best = 0;
  private collected = 0;
  private multiplier = 1;
  private driftHeld = 0;
  private drifting = false;
  private timeLeft = SESSION_SECONDS;
  private status: 'playing' | 'over' = 'playing';

  private keys = new Set<string>();
  private running = true;
  private clock = new THREE.Clock();
  private time = 0;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.options = options;
    this.best = options.best;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 400);
    // Dusk synthwave sky.
    this.scene.background = new THREE.Color('#241537');
    this.scene.fog = new THREE.Fog('#2a1740', 90, 240);
    this.scene.add(new THREE.HemisphereLight('#c9b3ff', '#3a1f5c', 2.4));
    const sun = new THREE.DirectionalLight('#ff9be6', 1.3);
    sun.position.set(-30, 60, -20);
    this.scene.add(sun);

    this.buildGround();
    this.buildRoad();
    this.buildBarriers();
    this.buildSun();
    this.buildCoins();
    this.buildSkids();
    this.buildCar();

    // Start in the middle of the right straight, pointing up it (+z).
    this.pos.set(TRACK_HALF_X, 0);
    this.yaw = 0;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.loop();
  }

  // ---- world -------------------------------------------------------------

  private buildGround() {
    const grid = pixelTexture('#2a1a44', '#43266f', 'brick', 60, 40);
    grid.repeat.set(60, 40);
    const geo = new THREE.PlaneGeometry(600, 460);
    const mat = new THREE.MeshLambertMaterial({ map: grid });
    this.disposables.push(geo, mat);
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);
  }

  /** The road, as one ribbon following the centre line. */
  private buildRoad() {
    const road: number[] = [];
    const paint: number[] = [];
    const half = ROAD_WIDTH / 2;
    const n = this.line.length;
    const push = (out: number[], ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
      out.push(ax, 0, az, bx, 0, bz, cx, 0, cz);
    for (let i = 0; i < n; i += 1) {
      const p = this.line[i];
      const q = this.line[(i + 1) % n];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      // One normal for the whole segment: a small overlap at each joint hides
      // the seam far better than mismatched per-end normals showed it.
      const nx = -dz / len;
      const nz = dx / len;
      const aL = [p.x + nx * half, p.z + nz * half];
      const aR = [p.x - nx * half, p.z - nz * half];
      const bL = [q.x + nx * half, q.z + nz * half];
      const bR = [q.x - nx * half, q.z - nz * half];
      push(road, aL[0], aL[1], aR[0], aR[1], bR[0], bR[1]);
      push(road, aL[0], aL[1], bR[0], bR[1], bL[0], bL[1]);
      // A dashed centre stripe, every other segment.
      if (i % 2 === 0) {
        const w = 0.35;
        push(paint, p.x + nx * w, p.z + nz * w, p.x - nx * w, p.z - nz * w, q.x - nx * w, q.z - nz * w);
        push(paint, p.x + nx * w, p.z + nz * w, q.x - nx * w, q.z - nz * w, q.x + nx * w, q.z + nz * w);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(road, 3));
    roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshLambertMaterial({ map: pixelTexture('#1c1b26', '#2a2838', 'noise', 40, 40) });
    roadMat.map!.repeat.set(40, 40);
    this.disposables.push(roadGeo, roadMat);
    this.scene.add(new THREE.Mesh(roadGeo, roadMat));

    const paintGeo = new THREE.BufferGeometry();
    paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(paint, 3));
    paintGeo.computeVertexNormals();
    const paintMat = new THREE.MeshBasicMaterial({ color: '#f7e04a' });
    this.disposables.push(paintGeo, paintMat);
    const stripe = new THREE.Mesh(paintGeo, paintMat);
    stripe.position.y = 0.02;
    this.scene.add(stripe);
  }

  /** Neon posts down both edges — cyan outside, magenta inside. */
  private buildBarriers() {
    const geo = new THREE.BoxGeometry(0.7, 1.5, 0.7);
    const outer = new THREE.MeshBasicMaterial({ color: '#38e6ff' });
    const inner = new THREE.MeshBasicMaterial({ color: '#ff3ea5' });
    this.disposables.push(geo, outer, inner);
    const half = ROAD_WIDTH / 2 + 0.8;
    const n = this.line.length;
    const outMesh = new THREE.InstancedMesh(geo, outer, n);
    const inMesh = new THREE.InstancedMesh(geo, inner, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i += 1) {
      const p = this.line[i];
      const q = this.line[(i + 1) % n];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      outMesh.setMatrixAt(i, m.makeTranslation(p.x + nx * half, 0.75, p.z + nz * half));
      inMesh.setMatrixAt(i, m.makeTranslation(p.x - nx * half, 0.75, p.z - nz * half));
    }
    outMesh.instanceMatrix.needsUpdate = true;
    inMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(outMesh, inMesh);
  }

  /** A big pixel sun on the horizon — pure synthwave. */
  private buildSun() {
    const geo = new THREE.CircleGeometry(60, 24);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff7ad5', fog: false });
    this.disposables.push(geo, mat);
    const sun = new THREE.Mesh(geo, mat);
    sun.position.set(0, 26, -230);
    this.scene.add(sun);
  }

  private buildCoins() {
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 0.28, 16);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#7a5600', metalness: 0.5, roughness: 0.3 });
    this.disposables.push(geo, mat);
    coinLayout(this.line).forEach((pos) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, 1.2, pos.z);
      this.scene.add(mesh);
      this.coinMeshes.push({ mesh, pos, taken: false });
    });
  }

  /** One instanced mesh of flat quads, reused round-robin, for the tyre marks. */
  private buildSkids() {
    const geo = new THREE.PlaneGeometry(0.5, 1.1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#0c0714', transparent: true, opacity: 0.72, depthWrite: false });
    this.disposables.push(geo, mat);
    this.skids = new THREE.InstancedMesh(geo, mat, this.SKID_CAP);
    // The marks start at the origin, so the auto bounding sphere is tiny; without
    // this the whole trail is frustum-culled the moment it is laid out on track.
    this.skids.frustumCulled = false;
    // Start every mark hidden (scaled to nothing).
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.SKID_CAP; i += 1) this.skids.setMatrixAt(i, hide);
    this.skids.instanceMatrix.needsUpdate = true;
    this.scene.add(this.skids);
  }

  /** Drop a pair of marks under the rear wheels, angled along the car. */
  private layTyreMarks() {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const scale = new THREE.Vector3(1, 1, 1);
    for (const side of [-1, 1]) {
      // Rear wheel in car space (~1.1 out, 1.3 back), rotated into the world.
      const lx = side * 1.1;
      const lz = -1.3;
      const wx = this.pos.x + lx * cos + lz * sin;
      const wz = this.pos.y - lx * sin + lz * cos;
      m.compose(new THREE.Vector3(wx, 0.04, wz), q, scale);
      this.skids.setMatrixAt(this.skidAt, m);
      this.skidAt = (this.skidAt + 1) % this.SKID_CAP;
    }
    this.skids.instanceMatrix.needsUpdate = true;
  }

  private buildCar() {
    const body = new THREE.MeshLambertMaterial({ color: '#ff4d6d' });
    const trim = new THREE.MeshLambertMaterial({ color: '#2a1030' });
    const glass = new THREE.MeshLambertMaterial({ color: '#8ff0ff' });
    const tyre = new THREE.MeshLambertMaterial({ color: '#16121c' });
    this.disposables.push(body, trim, glass, tyre);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4), body);
    chassis.position.y = 0.7;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.9), body);
    cabin.position.set(0, 1.2, -0.2);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.12), glass);
    windshield.position.set(0, 1.25, 0.75);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), trim);
    spoiler.position.set(0, 1.3, -2);
    this.car.add(chassis, cabin, windshield, spoiler);
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.disposables.push(wheelGeo);
    [[-1.15, 1.3], [1.15, 1.3], [-1.15, -1.3], [1.15, -1.3]].forEach(([x, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, tyre);
      wheel.position.set(x, 0.55, z);
      this.wheels.push(wheel);
      this.car.add(wheel);
    });
    this.scene.add(this.car);
  }

  // ---- input -------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  // ---- physics -----------------------------------------------------------

  /** Nearest point on the centre line, and how far off it the car is. */
  private trackOffset() {
    let bestD = Infinity;
    let nx = 0;
    let nz = 0;
    const n = this.line.length;
    for (let i = 0; i < n; i += 1) {
      const a = this.line[i];
      const b = this.line[(i + 1) % n];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = this.pos.x - a.x;
      const apz = this.pos.y - a.z;
      const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz || 1)));
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const d = Math.hypot(this.pos.x - cx, this.pos.y - cz);
      if (d < bestD) { bestD = d; nx = this.pos.x - cx; nz = this.pos.y - cz; }
    }
    return { distance: bestD, nx, nz };
  }

  private update(dt: number) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.status = 'over';
      this.best = Math.max(this.best, this.score);
      return;
    }

    const throttle = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    const steer = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const handbrake = this.keys.has('Space');

    // Forward and right unit vectors from the heading.
    const fwd = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));

    // Work in scalar forward/side speed. Rebuilding vel from these at the end is
    // what keeps engine force from being thrown away.
    const speed = this.vel.length();
    let fwdSpeed = this.vel.dot(fwd);
    let latSpeed = this.vel.dot(right);

    // Engine.
    if (throttle > 0 && fwdSpeed < MAX_SPEED) fwdSpeed += ENGINE * dt;
    else if (throttle < 0 && fwdSpeed > -REVERSE) fwdSpeed -= ENGINE * dt;
    // Drag on the forward speed, and rolling friction when coasting.
    fwdSpeed *= Math.max(0, 1 - DRAG * dt);
    if (throttle === 0) fwdSpeed *= Math.max(0, 1 - ROLL_FRICTION * dt);

    // Steering — you can only turn when actually moving, and it eases off so the
    // car does not spin on a straight.
    const steerGrip = Math.min(1, speed / 8);
    const dir = fwdSpeed < -0.5 ? -1 : 1;
    this.yaw -= steer * STEER_RATE * steerGrip * dir * dt;
    this.steerVisual += (steer * 0.5 - this.steerVisual) * Math.min(1, dt * 10);

    // Grip: bleed off sideways speed. The handbrake, or hard steering at speed,
    // lets it slide — that is the drift.
    const hardCorner = Math.abs(steer) > 0.5 && speed > DRIFT_MIN_SPEED;
    const gripNow = handbrake ? DRIFT_GRIP : hardCorner ? GRIP * 0.45 : GRIP;
    latSpeed *= Math.max(0, 1 - gripNow * dt);

    // Recombine into a real velocity, now with the engine force kept.
    this.vel.copy(fwd).multiplyScalar(fwdSpeed).addScaledVector(right, latSpeed);
    this.pos.addScaledVector(this.vel, dt);

    // Keep the car on the track: the barriers shove it back and scrub speed.
    const off = this.trackOffset();
    const edge = ROAD_WIDTH / 2 - CAR_HALF;
    if (off.distance > edge) {
      const overlap = off.distance - edge;
      const len = Math.hypot(off.nx, off.nz) || 1;
      this.pos.x -= (off.nx / len) * overlap;
      this.pos.y -= (off.nz / len) * overlap;
      this.vel.multiplyScalar(0.82);
    }

    // Drifting: sliding sideways, at speed. Hold it to grow the multiplier.
    this.drifting = Math.abs(latSpeed) > DRIFT_MIN_SLIP && speed > DRIFT_MIN_SPEED;
    if (this.drifting) {
      this.driftHeld += dt;
      this.multiplier = Math.min(DRIFT_MULT_MAX, 1 + this.driftHeld * DRIFT_MULT_RAMP);
      this.score += Math.abs(latSpeed) * speed * dt * 0.5 * this.multiplier;
    } else {
      this.driftHeld = 0;
      this.multiplier = 1;
    }

    if (this.drifting) this.layTyreMarks();
    this.collectCoins();
    this.best = Math.max(this.best, this.score);
  }

  private collectCoins() {
    this.coinMeshes.forEach((coin) => {
      if (coin.taken) return;
      if (Math.hypot(coin.pos.x - this.pos.x, coin.pos.z - this.pos.y) > 2.4) return;
      coin.taken = true;
      coin.mesh.visible = false;
      this.collected += 1;
      // A coin grabbed mid-drift is worth the multiplier.
      this.score += COIN_POINTS * (this.drifting ? Math.round(this.multiplier) : 1);
      this.options.onCoin();
    });
    // Respawn the lot once they are all gone, so a good driver never runs dry.
    if (this.coinMeshes.every((coin) => coin.taken)) {
      this.coinMeshes.forEach((coin) => { coin.taken = false; coin.mesh.visible = true; });
    }
  }

  // ---- frame -------------------------------------------------------------

  private draw() {
    this.car.position.set(this.pos.x, 0, this.pos.y);
    this.car.rotation.y = this.yaw;
    const roll = this.vel.length() * 0.06;
    this.wheels.forEach((wheel, i) => {
      wheel.rotation.x += roll * 0.3;
      if (i < 2) wheel.rotation.y = this.steerVisual;
    });

    // A high, steep chase camera — closer to a top-down drift game than a racer.
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const want = new THREE.Vector3(this.pos.x, 0, this.pos.y)
      .addScaledVector(fwd, -9).add(new THREE.Vector3(0, 21, 0));
    this.camera.position.lerp(want, 0.12);
    this.camera.lookAt(this.pos.x + fwd.x * 5, 0, this.pos.y + fwd.z * 5);

    this.coinMeshes.forEach((coin, i) => {
      if (coin.mesh.visible) { coin.mesh.rotation.y = this.time * 2.5 + i; coin.mesh.position.y = 1.2 + Math.sin(this.time * 3 + i) * 0.2; }
    });

    this.renderer.render(this.scene, this.camera);
  }

  private snapshot(): DriftSnapshot {
    return {
      score: Math.round(this.score),
      best: Math.round(Math.max(this.best, this.score)),
      coins: this.collected,
      speed: Math.round(this.vel.length() * 3.6),
      drifting: this.drifting,
      multiplier: Math.round(this.multiplier * 10) / 10,
      timeLeft: Math.ceil(this.timeLeft),
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.disposables.forEach((item) => item.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.04);
    this.time += dt;
    if (this.status === 'playing') this.update(dt);
    this.draw();
    this.options.onUpdate(this.snapshot());
    requestAnimationFrame(this.loop);
  };
}
