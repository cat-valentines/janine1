import * as THREE from 'three';

/** An emoji drawn to a texture, for item sprites in the 3D games. */
export function emojiTexture(emoji: string) {
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

/**
 * A character PNG flattened onto a head colour.
 * The art has a transparent background, which renders as a black box if the
 * texture is used raw, so it is composited onto a solid head first.
 */
export function faceTexture(asset: string) {
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

export interface Limbs { armL: THREE.Mesh; armR: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh }

/** A blocky body with swinging arms and legs, the way Minecraft animates. */
export function buildBody(bodyColour: string, headColour: string, scale: number, headTexture?: THREE.Texture, armColour?: string) {
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
  // Pivot at the shoulder, so a rotation swings the arm instead of spinning it.
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
  return { group, limbs: { armL, armR, legL, legR } as Limbs };
}

/** Swings limbs while walking and settles them when standing still. */
export function animateWalk(limbs: Limbs, phase: number, moving: boolean) {
  const swing = moving ? Math.sin(phase) * 0.7 : 0;
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing;
  limbs.armR.rotation.x = swing;
}
