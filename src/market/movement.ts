export interface MarketPosition { x: number; y: number }
export type MarketDirection = 'left' | 'right' | 'up' | 'down';

const step = 3;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function moveInMarket(position: MarketPosition, direction: MarketDirection): MarketPosition {
  if (direction === 'left') return { ...position, x: clamp(position.x - step, 5, 95) };
  if (direction === 'right') return { ...position, x: clamp(position.x + step, 5, 95) };
  if (direction === 'up') return { ...position, y: clamp(position.y - step, 35, 88) };
  return { ...position, y: clamp(position.y + step, 35, 88) };
}

export function marketDirectionFromKey(key: string): MarketDirection | null {
  const directions: Record<string, MarketDirection> = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
  return directions[key.toLowerCase()] ?? null;
}

export function isNearStand(player: MarketPosition, stand: MarketPosition) {
  return Math.hypot(player.x - stand.x, player.y - stand.y) < 13;
}
