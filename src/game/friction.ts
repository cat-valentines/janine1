/**
 * Slip & Grip — a friction physics puzzle.
 *
 * You are a little purple block that can switch its own friction:
 *   🟪 GRIP  — high friction: you speed up fast, stop fast, and steer precisely.
 *   🧊 ICE   — low friction: you can barely push off, but you keep your momentum
 *              and glide for ages. Great for long jumps, terrible for stopping.
 *
 * The world has friction too:
 *   ❄️ ice patches  — so slippery you slide even on GRIP.
 *   🟫 sticky ledges — grippy even on ICE, so you can land and stop.
 *   🟢 bounce pads   — boing you high into the air.
 *   ☁️ moving platforms — ride them across gaps and up to high places.
 */

export const VW = 720, VH = 440;
export const BLOCK = 34;

export interface Rect { x: number; y: number; w: number; h: number }
export type Surface = 'normal' | 'ice' | 'sticky';
export interface Ground extends Rect { surface?: Surface }
export interface Mover { x: number; y: number; w: number; h: number; axis: 'x' | 'y'; amp: number; speed: number; phase: number }

export interface Level {
  title: string;
  hint: string;
  start: { x: number; y: number };
  goal: Rect;
  ground: Ground[];
  spikes: Rect[];
  pads: Rect[];
  movers: Mover[];
}

export const PHYS = {
  g: 1500, jump: 660, bounce: 950,
  gripAccel: 2500, iceAccel: 780,
  gripDamp: 11, iceDamp: 0.5, stickyDamp: 18, airDamp: 0.15,
  gripMax: 220, iceMax: 380,
};
