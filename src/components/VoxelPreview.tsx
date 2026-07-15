import { useEffect, useRef } from 'react';
import { blockById } from '../game/building';
import { SX, SY, SZ, isSolid, voxelAt } from '../game/voxel';

const TILE = 7;
const RISE = 3.5;
const CUBE = 7;

function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * amount);
  const g = Math.round(((value >> 8) & 255) * amount);
  const b = Math.round((value & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

/** Isometric drawing of a 3D house — cheap enough to show many at once. */
export function VoxelPreview({ world, className }: { world: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const cells: Array<{ x: number; y: number; z: number; id: string }> = [];
    for (let y = 0; y < SY; y += 1) {
      for (let z = 0; z < SZ; z += 1) {
        for (let x = 0; x < SX; x += 1) {
          const id = voxelAt(world, x, y, z);
          if (!isSolid(id)) continue;
          // Skip blocks fully buried behind others — they can never be seen.
          if (isSolid(voxelAt(world, x, y + 1, z)) && isSolid(voxelAt(world, x + 1, y, z)) && isSolid(voxelAt(world, x, y, z + 1))) continue;
          cells.push({ x, y, z, id });
        }
      }
    }
    // Painter's order: far to near, low to high.
    cells.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y);

    const originX = width / 2;
    const originY = height - (SX + SZ) * RISE / 2 - 6;
    cells.forEach((cell) => {
      const colour = blockById(cell.id)?.colour ?? '#888888';
      const sx = originX + (cell.x - cell.z) * TILE;
      const sy = originY + (cell.x + cell.z) * RISE - cell.y * CUBE;
      ctx.fillStyle = shade(colour, 1);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + TILE, sy + RISE);
      ctx.lineTo(sx, sy + RISE * 2);
      ctx.lineTo(sx - TILE, sy + RISE);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(colour, 0.72);
      ctx.beginPath();
      ctx.moveTo(sx - TILE, sy + RISE);
      ctx.lineTo(sx, sy + RISE * 2);
      ctx.lineTo(sx, sy + RISE * 2 + CUBE);
      ctx.lineTo(sx - TILE, sy + RISE + CUBE);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(colour, 0.55);
      ctx.beginPath();
      ctx.moveTo(sx + TILE, sy + RISE);
      ctx.lineTo(sx, sy + RISE * 2);
      ctx.lineTo(sx, sy + RISE * 2 + CUBE);
      ctx.lineTo(sx + TILE, sy + RISE + CUBE);
      ctx.closePath();
      ctx.fill();
    });
  }, [world]);

  return <canvas className={className ?? 'voxel-preview'} ref={ref} width={340} height={200} />;
}
