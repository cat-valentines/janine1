export const FLOOR_COUNT = 10;
export const PLAYER_STEP = 4;
export const CAT_HIT_DISTANCE = 5;
export const ITEM_DISTANCE = 4;
export const HIT_INVINCIBILITY_MS = 1800;
export const POWER_INVINCIBILITY_MS = 6000;
export const COIN_SCORE = 100;
export const POWER_SCORE = 250;
export const SAFE_POSITION = { floor: 0, x: 8 };
export const SECRET_PORTAL = { floor: 2, x: 88, destinationFloor: 3 };

/** Lasers, in seconds. Off, then a warning flash, then the beam fires. */
export const LASER_PERIOD = 5.4;
export const LASER_WARN = 1.2;
export const LASER_ON = 1.3;
/** How close to a brick wall you must be for it to shield you. */
export const HIDE_DISTANCE = 7;
/** Floors below this have no cats and no lasers, so there is somewhere safe. */
export const SAFE_FLOORS = 3;

/** Secret powers. */
export const MAX_LIVES = 5;
/** How long the invisibility power hides you from cats and lasers. */
export const INVISIBLE_MS = 8000;
