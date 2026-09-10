/**
 * Which address each game lives at.
 *
 * Two things need this and used to guess separately: the menu, which sends you
 * to a game, and "what is my friend playing right now?", which has to turn an
 * address back into a game's name. One table, so they cannot disagree.
 */
import { gameById, type GameId } from './gameList';

/** Games with a fixed address. The few that take an island name are handled
 *  where they are opened, because the name is part of the route. */
export const GAME_ROUTE: Partial<Record<GameId, string>> = {
  hunger: '/play/hunger',
  drive: '/play/truck',
  riddle: '/play/riddles',
  pong: '/play/pong',
  fruit: '/play/fruit',
  escape: '/play/housekeeper',
  connector: '/play/connector',
  underwater: '/play/underwater',
  blockup: '/play/blockup',
  truthdare: '/play/truthdare',
  pi: '/play/pi',
  tongue: '/play/tongue',
  friction: '/play/friction',
  human: '/play/human',
  song: '/play/song',
  singstar: '/play/sing',
  chess: '/play/chess',
  fishing: '/play/fishing',
  tower: '/play/tower',
};

/** The other places a player can be that are not games, but are worth naming. */
const PLACES: Array<{ prefix: string; name: string; icon: string }> = [
  { prefix: '/play/medicine', name: 'Medicine Mission', icon: '🌿' },
  { prefix: '/play/runner', name: 'Runner Up', icon: '🏃' },
  { prefix: '/market', name: 'the Market', icon: '🏪' },
  { prefix: '/house', name: 'their House', icon: '🏡' },
  { prefix: '/insta', name: 'Insta', icon: '📸' },
  { prefix: '/map', name: 'the Island Map', icon: '🗺️' },
  { prefix: '/games', name: 'choosing a game', icon: '⊞' },
  { prefix: '/rewards', name: 'their Rewards', icon: '🏆' },
  { prefix: '/profile', name: 'their Profile', icon: '🙂' },
];

export interface WhereTheyAre { name: string; icon: string }

/**
 * Turn an address into something worth reading: "playing Chess ♟️". Returns null
 * for the front page, where they are simply on the island and not in anything.
 */
export function placeAtPath(path: string): WhereTheyAre | null {
  const clean = path.replace(/\/+$/, '') || '/';
  for (const [id, route] of Object.entries(GAME_ROUTE) as Array<[GameId, string]>) {
    if (clean === route) {
      const game = gameById(id);
      return game ? { name: game.name, icon: game.icon } : null;
    }
  }
  for (const place of PLACES) {
    if (clean === place.prefix || clean.startsWith(`${place.prefix}/`)) return { name: place.name, icon: place.icon };
  }
  return null;
}
