export interface Gruit {
  tier: number;
  name: string;
  icon: string;
  /** Radius in pixels. Each one is a good step bigger than the last. */
  r: number;
  colour: string;
  dark: string;
}

/**
 * The merge ladder: two of the same become the next one up.
 *
 * Fruit AND veg, alternating colours, so a full cup looks like a garden rather
 * than a bowl of the same red circles.
 */
export const gruits: Gruit[] = [
  { tier: 0, name: 'Blueberry', icon: '🫐', r: 13, colour: '#8fa5e8', dark: '#5f77c4' },
  { tier: 1, name: 'Grapes', icon: '🍇', r: 17, colour: '#bb9ae0', dark: '#8e6cba' },
  { tier: 2, name: 'Strawberry', icon: '🍓', r: 22, colour: '#f6919e', dark: '#cf5f70' },
  { tier: 3, name: 'Carrot', icon: '🥕', r: 28, colour: '#f8b06a', dark: '#d1803a' },
  { tier: 4, name: 'Lemon', icon: '🍋', r: 34, colour: '#f6e58a', dark: '#ccb84f' },
  { tier: 5, name: 'Tomato', icon: '🍅', r: 41, colour: '#f58a76', dark: '#cb5843' },
  { tier: 6, name: 'Broccoli', icon: '🥦', r: 48, colour: '#95c986', dark: '#639a54' },
  { tier: 7, name: 'Apple', icon: '🍎', r: 56, colour: '#ef8383', dark: '#c05252' },
  { tier: 8, name: 'Aubergine', icon: '🍆', r: 64, colour: '#a68ad4', dark: '#7a5daa' },
  { tier: 9, name: 'Pumpkin', icon: '🎃', r: 72, colour: '#f7ad6b', dark: '#cd7c37' },
  { tier: 10, name: 'Watermelon', icon: '🍉', r: 82, colour: '#8ecb92', dark: '#5d9c62' },
];

export const BIGGEST = gruits.length - 1;

/** Only the small ones drop, so the cup is never handed a pumpkin. */
export const DROPPABLE = 4;

/**
 * Points for making each one. Triangular numbers, the way Suika does it: the
 * big merges are worth far more than the little ones, so chasing a watermelon
 * beats farming blueberries.
 */
export const mergeScore = (tier: number) => ((tier + 1) * (tier + 2)) / 2;

export const VIEW_W = 460;
export const VIEW_H = 620;
/** The cup. */
export const CUP_X1 = 30;
export const CUP_X2 = 430;
export const CUP_FLOOR = 582;
export const CUP_RIM = 118;
/**
 * Rest above this line and the cup is overflowing. It sits below the rim so
 * that a piece bouncing up on landing is not an instant, unfair loss.
 */
export const DEAD_LINE = 130;
/** How long a piece may sit above the line before the cup is called full. */
export const OVERFLOW_SECONDS = 2;
export const DROP_Y = 66;

export const GRAVITY = 1500;
/** Fruit barely bounces — it should settle, not ping about. */
export const BOUNCE = 0.12;
export const DROP_COOLDOWN = 0.32;
export const MOVE_SPEED = 380;
