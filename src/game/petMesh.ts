import * as THREE from 'three';
import type { PetSpecies } from '../lib/pets';

/** A little blocky (Minecraft-style) pet, with leg/wing pivots to animate. */
export interface PetMesh {
  group: THREE.Group;
  legs: THREE.Object3D[];   // swing when walking
  wings: THREE.Object3D[];  // flap (parakeet)
  flyer: boolean;           // hovers + flaps instead of walking
}

const lam = (color: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color, emissive });

/** Build the pet for a species. The group's origin is at its feet (y = 0). */
export function buildPetMesh(species: PetSpecies): PetMesh {
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
    const body = lam('#3fbf6a', '#123');
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
  const body = lam(spec.color, '#0a0805');
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
