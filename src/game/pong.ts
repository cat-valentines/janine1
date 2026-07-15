export type PongMode = 'solo' | 'bot' | 'friend';

export interface PongModeInfo {
  id: PongMode; name: string; icon: string; blurb: string; controls: string;
}

export const pongModes: PongModeInfo[] = [
  {
    id: 'solo', name: 'On your own', icon: '🏓',
    blurb: 'Keep the ball up on your racket for as long as you can. How many hits can you get?',
    controls: '← → to move · Space to hit it up',
  },
  {
    id: 'bot', name: 'Against the bot', icon: '🤖',
    blurb: 'A real game of ping pong against the computer. First to 7 points wins!',
    controls: '← → to move · Space to swing',
  },
  {
    id: 'friend', name: 'With a friend', icon: '👫',
    blurb: 'Two players on the same keyboard. One of you on each side of the table!',
    controls: 'P1: A D + Shift · P2: ← → + Space',
  },
];

export const modeById = (id: PongMode) => pongModes.find((m) => m.id === id)!;

export const VIEW_W = 960;
export const VIEW_H = 480;

/** The table top, the floor, and the net. */
export const TABLE_Y = 330;
export const TABLE_X1 = 70;
export const TABLE_X2 = 890;
export const NET_X = VIEW_W / 2;
export const NET_H = 54;
export const FLOOR_Y = 430;

export const GRAVITY = 900;
export const BALL_R = 9;
/** How close the ball must be to the racket for a swing to connect. */
export const REACH = 62;
export const PLAYER_SPEED = 340;
export const WIN_SCORE = 7;
export const SWING_MS = 180;
