import * as THREE from 'three';

/** A blocky (Minecraft-style) farm or wild animal, with leg pivots to animate. */
export interface AnimalMesh { group: THREE.Group; legs: THREE.Object3D[] }

const lam = (color: string) => new THREE.MeshLambertMaterial({ color, emissive: '#0a0805' });

interface AnimalConfig { body: string; belly: string; size: number; ears: 'up' | 'long' | 'down' | 'flop' | 'none'; tail: 'tuft' | 'flat' | 'curl' | 'none'; horns?: boolean; snout?: boolean; beak?: boolean; wattle?: boolean; wool?: boolean }

const CONFIG: Record<string, AnimalConfig> = {
  // wild
  deer: { body: '#a5764b', belly: '#e6cba6', size: 1.25, ears: 'up', tail: 'tuft', horns: true },
  rabbit: { body: '#d6cec2', belly: '#faf6ee', size: 0.7, ears: 'long', tail: 'tuft' },
  boar: { body: '#6b5844', belly: '#8a7358', size: 1.12, ears: 'up', tail: 'curl', snout: true },
  turkey: { body: '#7a4a3a', belly: '#a5613f', size: 0.9, ears: 'none', tail: 'flat', beak: true, wattle: true },
  beaver: { body: '#7b5330', belly: '#a5764b', size: 0.82, ears: 'up', tail: 'flat', snout: true },
  // farm
  chicken: { body: '#f4f0e4', belly: '#ffffff', size: 0.62, ears: 'none', tail: 'flat', beak: true, wattle: true },
  sheep: { body: '#f2ede2', belly: '#ffffff', size: 1.02, ears: 'flop', tail: 'none', wool: true },
  cow: { body: '#efe6d6', belly: '#f6efe2', size: 1.34, ears: 'down', tail: 'tuft', horns: true },
  pig: { body: '#f0a6a6', belly: '#f7c4c4', size: 1.0, ears: 'flop', tail: 'curl', snout: true },
};

const WILD_KINDS = ['deer', 'rabbit', 'boar', 'turkey', 'beaver'];
export const wildKindFor = (i: number) => WILD_KINDS[Math.abs(i) % WILD_KINDS.length];

/** Build a blocky animal. Origin is at its feet (y = 0). */
export function buildAnimalMesh(kind: string): AnimalMesh {
  const cfg = CONFIG[kind] ?? CONFIG.rabbit;
  const s = cfg.size;
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const body = lam(cfg.body);
  const belly = lam(cfg.belly);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.34 * s, 0.74 * s), body); torso.position.y = 0.36 * s; group.add(torso);
  const tummy = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.16 * s, 0.62 * s), belly); tummy.position.y = 0.26 * s; group.add(tummy);
  if (cfg.wool) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.44 * s, 0.82 * s), body); w.position.y = 0.4 * s; group.add(w); }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.32 * s, 0.32 * s), body); head.position.set(0, 0.46 * s, 0.5 * s); group.add(head);
  [-1, 1].forEach((d) => { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), lam('#161016')); eye.position.set(d * 0.09 * s, 0.5 * s, 0.65 * s); group.add(eye); });

  const addLeg = (x: number, z: number) => {
    const len = 0.24 * s;
    const pivot = new THREE.Group(); pivot.position.set(x, 0.26 * s, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, len, 0.1 * s), body); m.position.y = -len / 2; pivot.add(m);
    group.add(pivot); legs.push(pivot);
  };
  [[-0.15, 0.24], [0.15, 0.24], [-0.15, -0.24], [0.15, -0.24]].forEach(([x, z]) => addLeg(x * s, z * s));

  // ears
  if (cfg.ears === 'up') [-1, 1].forEach((d) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.16 * s, 0.05 * s), body); e.position.set(d * 0.1 * s, 0.66 * s, 0.5 * s); group.add(e); });
  if (cfg.ears === 'long') [-1, 1].forEach((d) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.34 * s, 0.06 * s), body); e.position.set(d * 0.08 * s, 0.74 * s, 0.48 * s); group.add(e); });
  if (cfg.ears === 'flop') [-1, 1].forEach((d) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.16 * s, 0.06 * s), body); e.position.set(d * 0.17 * s, 0.5 * s, 0.52 * s); e.rotation.z = d * 0.5; group.add(e); });
  if (cfg.ears === 'down') [-1, 1].forEach((d) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.1 * s, 0.06 * s), body); e.position.set(d * 0.19 * s, 0.48 * s, 0.5 * s); group.add(e); });
  // snout / beak
  if (cfg.snout) { const sn = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.12 * s, 0.1 * s), lam('#e0a0a0')); sn.position.set(0, 0.42 * s, 0.68 * s); group.add(sn); }
  if (cfg.beak) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), lam('#f0a030')); bk.position.set(0, 0.46 * s, 0.68 * s); group.add(bk); }
  if (cfg.wattle) { const wt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), lam('#d0322c')); wt.position.set(0, 0.38 * s, 0.66 * s); group.add(wt); }
  // horns / antlers
  if (cfg.horns) [-1, 1].forEach((d) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16 * s, 0.05), lam('#efe6d0')); h.position.set(d * 0.1 * s, 0.66 * s, 0.5 * s); h.rotation.z = d * 0.4; group.add(h); });
  // tail
  if (cfg.tail === 'tuft') { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.1 * s, 0.1 * s), belly); t.position.set(0, 0.42 * s, -0.42 * s); group.add(t); }
  if (cfg.tail === 'flat') { const t = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.28 * s, 0.06), body); t.position.set(0, 0.5 * s, -0.42 * s); group.add(t); }
  if (cfg.tail === 'curl') { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.14 * s, 0.06 * s), body); t.position.set(0, 0.42 * s, -0.42 * s); t.rotation.x = 0.6; group.add(t); }

  return { group, legs };
}
