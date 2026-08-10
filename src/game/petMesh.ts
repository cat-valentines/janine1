import * as THREE from 'three';
import type { PetSpecies } from '../lib/pets';

/** A little blocky (Minecraft-style) pet, with leg/wing pivots to animate. */
export interface PetMesh {
  group: THREE.Group;
  legs: THREE.Object3D[];   // swing when walking
  wings: THREE.Object3D[];  // flap (parakeet)
  flyer: boolean;           // hovers + flaps instead of walking
}

/** A pet that's alive in a scene — its world position and little wander brain. */
export interface LivePet extends PetMesh { x: number; z: number; yaw: number; phase: number; wanderT: number; tx: number; tz: number; resting: boolean; restX: number; restZ: number }

export function makeLivePet(mesh: PetMesh, x: number, z: number): LivePet {
  return Object.assign(mesh, { x, z, yaw: 0, phase: 0, wanderT: 0, tx: x, tz: z, resting: false, restX: x, restZ: z });
}

/**
 * Move a pet like a real Minecraft animal: when its owner walks off it trots
 * after them; when they're close it mills about, picking little spots to explore
 * and glancing back at you, with a bouncy trot and idle bob. Call each frame.
 */
export function stepPet(p: LivePet, px: number, pz: number, pyaw: number, dt: number, groundY: (x: number, z: number) => number, time: number) {
  // Resting: pad over to its pet house and curl up for a nap.
  if (p.resting) {
    const dx = p.restX - p.x, dz = p.restZ - p.z, d = Math.hypot(dx, dz);
    const moving = d > 0.15;
    if (moving) {
      const step = Math.min(d, (p.flyer ? 4 : 3.4) * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step; p.yaw = Math.atan2(dx, dz);
    }
    p.phase += moving ? dt * 10 : dt * 1.4;
    const settle = moving ? 0 : -0.12;               // sink down to lie once it arrives
    const breathe = moving ? 0 : Math.sin(time * 2) * 0.02;
    p.group.position.set(p.x, groundY(p.x, p.z) + (p.flyer ? 0.4 : 0) + settle + breathe, p.z);
    p.group.rotation.y = p.yaw;
    if (p.flyer) { const f = Math.sin(p.phase * 2) * (moving ? 0.9 : 0.25); p.wings.forEach((w, i) => { w.rotation.z = i === 0 ? f : -f; }); }
    else { const a = moving ? Math.sin(p.phase) * 0.6 : 1.35; p.legs.forEach((leg, i) => { leg.rotation.x = moving ? ((i % 2) === (Math.floor(i / 2) % 2) ? a : -a) : a; }); }
    return;
  }
  const toOwner = Math.hypot(px - p.x, pz - p.z);
  let tx: number, tz: number, speed: number;
  if (toOwner > 3.4) {
    // Owner is getting away — trot to a spot just behind them.
    tx = px + Math.sin(pyaw) * 1.2; tz = pz + Math.cos(pyaw) * 1.2;
    speed = (p.flyer ? 6 : 5) * dt;
  } else {
    // Close by — wander to little random spots, pausing between, staying near you.
    p.wanderT -= dt;
    if (p.wanderT <= 0) {
      p.wanderT = 1.6 + Math.random() * 2.8;
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.6;
      p.tx = p.x + Math.cos(a) * r; p.tz = p.z + Math.sin(a) * r;
      if (Math.hypot(p.tx - px, p.tz - pz) > 3) { p.tx = px + (Math.random() - 0.5) * 2; p.tz = pz + (Math.random() - 0.5) * 2; }
    }
    tx = p.tx; tz = p.tz;
    speed = (p.flyer ? 2.2 : 1.9) * dt;
  }
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  const moving = d > 0.12;
  if (moving) {
    const step = Math.min(d, speed);
    p.x += (dx / d) * step; p.z += (dz / d) * step;
    p.yaw = Math.atan2(dx, dz);
  } else if (toOwner <= 3.4) {
    // Idle — glance toward the owner now and then.
    let dy = Math.atan2(px - p.x, pz - p.z) - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, dt * 2);
  }
  p.phase += moving ? dt * 10 : dt * 2.4;
  const hop = p.flyer ? 0.6 + Math.sin(time * 4) * 0.08 : (moving ? Math.abs(Math.sin(p.phase)) * 0.12 : Math.sin(time * 2 + p.x) * 0.025);
  p.group.position.set(p.x, groundY(p.x, p.z) + hop, p.z);
  p.group.rotation.y = p.yaw;
  if (p.flyer) { const f = Math.sin(p.phase * 2) * 0.9; p.wings.forEach((w, i) => { w.rotation.z = i === 0 ? f : -f; }); }
  else { const sw = moving ? Math.sin(p.phase) * 0.6 : 0; p.legs.forEach((leg, i) => { leg.rotation.x = ((i % 2) === (Math.floor(i / 2) % 2) ? sw : -sw); }); }
}

const lam = (color: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color, emissive });

/** Build the pet for a species, optionally dyed a colour. Origin at its feet. */
export function buildPetMesh(species: PetSpecies, dye?: string | null): PetMesh {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];
  let flyer = false;

  const addLeg = (mat: THREE.Material, x: number, z: number, len: number, top: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, top, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, len, 0.09), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    group.add(pivot);
    legs.push(pivot);
  };

  if (species === 'parakeet') {
    // A little bird: bright body, wings that flap, tiny legs, hops/hovers.
    flyer = true;
    const body = lam(dye ?? '#3fbf6a', '#123');
    const belly = lam('#ffe27a');
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.32), body); torso.position.y = 0.5; group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), body); head.position.set(0, 0.78, 0.12); group.add(head);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), belly); chest.position.set(0, 0.46, 0.18); group.add(chest);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), lam('#f0a030')); beak.position.set(0, 0.76, 0.28); group.add(beak);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.28), lam('#2f9f55')); tail.position.set(0, 0.5, -0.24); group.add(tail);
    [-1, 1].forEach((s) => {
      const wing = new THREE.Group(); wing.position.set(s * 0.14, 0.56, 0);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.3), body); blade.position.x = s * 0.12; wing.add(blade);
      group.add(wing); wings.push(wing);
    });
    [-0.07, 0.07].forEach((x) => addLeg(lam('#f0a030'), x, 0, 0.16, 0.34));
    return { group, legs, wings, flyer };
  }

  // Four-legged pets (cat / dog / turtle / hamster).
  const spec = {
    cat: { color: '#e0954a', belly: '#f6d8b4', s: 1, ears: 'pointed', tail: true },
    dog: { color: '#a5764b', belly: '#e6cba6', s: 1.08, ears: 'floppy', tail: true },
    turtle: { color: '#5a9e55', belly: '#cdeacb', s: 0.95, ears: 'none', tail: false },
    hamster: { color: '#d8a860', belly: '#f4e0c0', s: 0.82, ears: 'round', tail: false },
  }[species];
  const body = lam(dye ?? spec.color, '#0a0805');
  const belly = lam(spec.belly);
  const s = spec.s;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.32 * s, 0.72 * s), body); torso.position.y = 0.34 * s; group.add(torso);
  const tummy = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.16 * s, 0.6 * s), belly); tummy.position.y = 0.24 * s; group.add(tummy);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.32 * s, 0.32 * s), body); head.position.set(0, 0.44 * s, 0.5 * s); group.add(head);
  // eyes
  [-1, 1].forEach((d) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), lam('#161016')); eye.position.set(d * 0.09 * s, 0.48 * s, 0.66 * s); group.add(eye);
  });
  // legs
  [[-0.15, 0.24], [0.15, 0.24], [-0.15, -0.24], [0.15, -0.24]].forEach(([x, z]) => addLeg(body, x * s, z * s, 0.22 * s, 0.24 * s));
  // features
  if (spec.ears === 'pointed') [-1, 1].forEach((d) => { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.16 * s, 4), body); ear.position.set(d * 0.11 * s, 0.62 * s, 0.5 * s); group.add(ear); });
  if (spec.ears === 'round') [-1, 1].forEach((d) => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 6, 5), body); ear.position.set(d * 0.12 * s, 0.6 * s, 0.5 * s); group.add(ear); });
  if (spec.ears === 'floppy') [-1, 1].forEach((d) => { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.22 * s, 0.1 * s), body); ear.position.set(d * 0.18 * s, 0.5 * s, 0.5 * s); group.add(ear); });
  if (spec.tail) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.08 * s, 0.34 * s), body); tail.position.set(0, 0.4 * s, -0.46 * s); tail.rotation.x = -0.5; group.add(tail); }
  if (species === 'turtle') { const shell = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam('#3f6f37')); shell.position.y = 0.4 * s; shell.scale.set(1, 0.7, 1.1); group.add(shell); }
  return { group, legs, wings, flyer };
}
