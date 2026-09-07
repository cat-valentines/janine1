/**
 * What a guest can and cannot keep.
 *
 * Anyone can play everything here without an account — that matters, because
 * schools block the sign-in and guest play is how a lot of players get in. But
 * coins, medals and cups belong to an account, so a guest plays the whole game,
 * wins it just the same, and is then shown exactly what an account would have
 * kept for them.
 *
 * Deliberately free of any Supabase import, so the rules can be checked on their
 * own without dragging the whole client in.
 */

/** What a player without an account is called, everywhere. */
export const GUEST_NAME = 'Guest';

/** What a finished chess game is worth. */
export const CHESS_WIN_COINS = 10;
export const CHESS_DRAW_COINS = 4;

export type ChessResult = 'win' | 'draw' | 'loss';

/**
 * What a finished game pays out. A guest is never paid AND offered — the coins
 * either go into an account, or they become the reason to make one.
 */
export function chessPrize(result: ChessResult, signedIn: boolean): { coins: number; offerAccount: number } {
  const worth = result === 'win' ? CHESS_WIN_COINS : result === 'draw' ? CHESS_DRAW_COINS : 0;
  if (worth <= 0) return { coins: 0, offerAccount: 0 };
  return signedIn ? { coins: worth, offerAccount: 0 } : { coins: 0, offerAccount: worth };
}
