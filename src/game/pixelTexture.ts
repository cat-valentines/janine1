import * as THREE from 'three';

export type PixelPattern = 'planks' | 'cobble' | 'grass' | 'brick' | 'shingle' | 'path' | 'noise';

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * A 16x16 hand-drawn tile, scaled up with nearest-neighbour.
 *
 * Flat-coloured boxes read as "low poly"; this is what makes the same boxes
 * read as pixel art instead.
 */
export function pixelTexture(base: string, dark: string, pattern: PixelPattern, rx = 1, ry = 1) {
  const key = `${base}|${dark}|${pattern}|${rx}|${ry}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = dark;

  const speck = (x: number, y: number) => ctx.fillRect(x, y, 1, 1);

  if (pattern === 'planks') {
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillRect(5, 0, 1, 4);
    ctx.fillRect(11, 4, 1, 4);
    ctx.fillRect(3, 8, 1, 4);
    ctx.fillRect(9, 12, 1, 4);
  } else if (pattern === 'cobble') {
    for (let y = 0; y < 16; y += 4) {
      ctx.fillRect(0, y, 16, 1);
      for (let x = (y / 4) % 2 ? 2 : 6; x < 16; x += 8) ctx.fillRect(x, y, 1, 4);
    }
  } else if (pattern === 'brick') {
    for (let y = 0; y < 16; y += 4) {
      ctx.fillRect(0, y, 16, 1);
      for (let x = (y / 4) % 2 ? 0 : 4; x < 16; x += 8) ctx.fillRect(x, y, 1, 4);
    }
  } else if (pattern === 'shingle') {
    for (let y = 0; y < 16; y += 4) {
      ctx.fillRect(0, y, 16, 1);
      for (let x = (y / 4) % 2 ? 3 : 7; x < 16; x += 6) ctx.fillRect(x, y, 1, 4);
    }
  } else if (pattern === 'grass') {
    [[2, 3], [7, 1], [12, 5], [4, 9], [10, 11], [14, 13], [1, 14], [8, 6]].forEach(([x, y]) => speck(x, y));
  } else if (pattern === 'path') {
    [[3, 2], [9, 4], [13, 9], [5, 12], [1, 7], [11, 14]].forEach(([x, y]) => speck(x, y));
  } else {
    for (let i = 0; i < 18; i += 1) speck((i * 7) % 16, (i * 11) % 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(rx, ry);
  cache.set(key, texture);
  return texture;
}

/** Darkens a hex colour, for the shadow pixels in a tile. */
export function shade(hex: string, amount = 0.72) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * amount);
  const g = Math.round(((value >> 8) & 255) * amount);
  const b = Math.round((value & 255) * amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
