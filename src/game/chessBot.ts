/**
 * The animal chess bots.
 *
 * Six pixel animals, each a real opponent rather than a label: they all search
 * ahead with the same alpha-beta engine, and what makes an easy bot easy is that
 * it looks less far ahead AND sometimes plays a worse move on purpose. A bot
 * that just plays randomly feels broken; a bot that plays a decent move and then
 * hangs a knight feels like a beginner, which is what a young player wants.
 *
 * The search is deliberately capped so it always answers within a moment on a
 * phone — nobody wants to wait for a chess engine on an iPad.
 */
import { applyMove, inCheck, legalMoves, other, outcome, type ChessState, type Colour, type Move, type PieceType } from './chess';

export interface ChessBot {
  id: string;
  name: string;
  /** One of the game's own pixel animals, so the bots match everything else. */
  asset: string;
  emoji: string;
  /** 1–6, drawn as pawns in the picker. */
  difficulty: number;
  level: string;
  blurb: string;
  /** What it says while it thinks. */
  chat: string[];
  /** How many half-moves it looks ahead. */
  depth: number;
  /** Chance per move of picking something other than its best idea. */
  blunder: number;
}

export const CHESS_BOTS: ChessBot[] = [
  {
    id: 'pip', name: 'Pip the Chick', asset: '/assets/pixel-pip.png', emoji: '🐣',
    difficulty: 1, level: 'Just learning',
    blurb: 'Pip only learned the moves last week. Perfect for your very first game.',
    chat: ['Is this one a horse?', 'I think I go here!', 'Chess is hard!'],
    depth: 1, blunder: 0.6,
  },
  {
    id: 'frog', name: 'Ribbit the Frog', asset: '/assets/pixel-frog.png', emoji: '🐸',
    difficulty: 2, level: 'Easy',
    blurb: 'Hops about happily and grabs any piece you leave lying around.',
    chat: ['Ribbit!', 'Ooh, a free pawn?', 'Hop hop hop.'],
    depth: 2, blunder: 0.35,
  },
  {
    id: 'momo', name: 'Momo the Penguin', asset: '/assets/pixel-penguin.png', emoji: '🐧',
    difficulty: 3, level: 'Medium',
    blurb: 'Cool, calm and tidy. Momo defends properly and waits for your mistake.',
    chat: ['Take your time.', 'Hmm, interesting.', 'I am watching that knight.'],
    depth: 3, blunder: 0.15,
  },
  {
    id: 'toby', name: 'Toby the Fox', asset: '/assets/pixel-fox.png', emoji: '🦊',
    difficulty: 4, level: 'Tricky',
    blurb: 'Sneaky. Toby sets little traps and pounces the moment you look away.',
    chat: ['Are you sure about that?', 'Clever… but so am I.', 'I saw that coming.'],
    depth: 3, blunder: 0.04,
  },
  {
    id: 'panda', name: 'Bao the Panda', asset: '/assets/pixel-panda.png', emoji: '🐼',
    difficulty: 5, level: 'Hard',
    blurb: 'Slow, thoughtful and very strong. Bao plans several moves ahead.',
    chat: ['Let me think…', 'A patient move.', 'Bamboo helps me concentrate.'],
    depth: 4, blunder: 0,
  },
  {
    id: 'tiger', name: 'Raja the Tiger', asset: '/assets/pixel-tiger.png', emoji: '🐯',
    difficulty: 6, level: 'Grandmaster',
    blurb: 'The champion of the jungle. Raja punishes every single slip.',
    chat: ['Show me what you have.', 'Roar. Your move.', 'That was not your best.'],
    depth: 5, blunder: 0,
  },
];

export const botById = (id: string) => CHESS_BOTS.find((b) => b.id === id);

// ---- judging a position ---------------------------------------------------

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/**
 * How good each square is for each piece — the reason the bots develop knights
 * and push central pawns instead of shuffling rooks. Written from white's point
 * of view, read backwards for black.
 */
const TABLES: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 20, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const MATE = 100_000;

/** How far a square is from the middle of the board — 0 in the centre, 3 at the edge. */
const fromCentre = (i: number) => {
  const f = i % 8, r = Math.floor(i / 8);
  return Math.max(Math.abs(f - 3.5) - 0.5, Math.abs(r - 3.5) - 0.5);
};

/** Score the position in pawns×100, always from `me`'s point of view. */
export function evaluate(state: ChessState, me: Colour): number {
  let score = 0;
  let material = 0;
  let myKing = -1, theirKing = -1;
  for (let i = 0; i < 64; i += 1) {
    const piece = state.board[i];
    if (!piece) continue;
    // White reads the table as written; black reads it flipped top to bottom.
    const square = piece.colour === 'w' ? i : 56 - 8 * Math.floor(i / 8) + (i % 8);
    const worth = VALUE[piece.type] + TABLES[piece.type][square];
    score += piece.colour === me ? worth : -worth;
    if (piece.type === 'k') { if (piece.colour === me) myKing = i; else theirKing = i; }
    else material += VALUE[piece.type];
  }
  // Endgame: with the board nearly empty, a bot that is clearly winning has to
  // be told to drive the enemy king to the edge and walk its own king up.
  // Without this it can hold an extra queen and still shuffle to a draw.
  if (material < 1600 && score > 400 && myKing >= 0 && theirKing >= 0) {
    const apart = Math.abs((myKing % 8) - (theirKing % 8)) + Math.abs(Math.floor(myKing / 8) - Math.floor(theirKing / 8));
    score += fromCentre(theirKing) * 22;   // corner them
    score += (14 - apart) * 8;             // and close in
  }
  return score;
}

/** Try captures first — it makes alpha-beta cut off far sooner. */
function ordered(state: ChessState, moves: Move[]): Move[] {
  return moves
    .map((move) => {
      const taken = state.board[move.to];
      const mover = state.board[move.from];
      const gain = taken ? VALUE[taken.type] - VALUE[mover!.type] / 10 : 0;
      return { move, gain: gain + (move.promotion ? VALUE[move.promotion] : 0) };
    })
    .sort((a, b) => b.gain - a.gain)
    .map((entry) => entry.move);
}

/** Raised when the clock runs out, so a half-finished depth is thrown away
 *  rather than acted on — a truncated score is not a real score. */
class OutOfTime extends Error {}

function search(state: ChessState, depth: number, alpha: number, beta: number, me: Colour, deadline: number): number {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    // Mated positions are worth less the longer they take, so the bot goes for
    // the quickest mate rather than dithering with one available.
    if (inCheck(state, state.turn)) return state.turn === me ? -MATE - depth : MATE + depth;
    return 0;   // stalemate
  }
  if (depth <= 0) return evaluate(state, me);
  if (Date.now() > deadline) throw new OutOfTime();

  let best = -Infinity;
  for (const move of ordered(state, moves)) {
    const score = -search(applyMove(state, move), depth - 1, -beta, -alpha, other(me), deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;   // the other side would never allow this line
  }
  return best;
}

/**
 * The move a bot plays. Returns null only if the game is already over.
 *
 * `blunder` is what makes the easy animals beatable: rather than always taking
 * the best line, they sometimes take a middling one — so they still make sense,
 * they just miss things, exactly like a real beginner.
 */
export function chooseMove(state: ChessState, bot: ChessBot, thinkMs = 1500): Move | null {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  const me = state.turn;
  const deadline = Date.now() + thinkMs;
  // Deepen one level at a time and keep the last depth that FINISHED. On a slow
  // phone the bot then plays a good shallow move instead of a half-searched one,
  // and each pass orders the next, which makes the deeper search much faster.
  let scored = ordered(state, moves).map((move) => ({ move, score: 0 }));
  for (let depth = 1; depth <= bot.depth; depth += 1) {
    try {
      const pass = scored.map(({ move }) => ({
        move,
        score: -search(applyMove(state, move), depth - 1, -Infinity, Infinity, other(me), deadline),
      }));
      pass.sort((a, b) => b.score - a.score);
      scored = pass;
    } catch (error) {
      if (error instanceof OutOfTime) break;   // keep the last complete depth
      throw error;
    }
  }

  // Never throw away a forced mate, however silly the animal is meant to be.
  if (scored[0].score >= MATE) return scored[0].move;

  if (bot.blunder > 0 && Math.random() < bot.blunder) {
    // Pick from the middle of the pack — a plausible move, just not the best one.
    const from = Math.min(1, scored.length - 1);
    const to = Math.min(scored.length - 1, from + 3);
    return scored[from + Math.floor(Math.random() * (to - from + 1))].move;
  }
  // Among equally good moves, vary it so the bots don't replay the same game.
  const best = scored[0].score;
  const ties = scored.filter((entry) => entry.score === best);
  return ties[Math.floor(Math.random() * ties.length)].move;
}

/** A line for the bot's speech bubble — cheerful when it is winning, and so on. */
export function botChat(state: ChessState, bot: ChessBot, botColour: Colour): string {
  const end = outcome(state);
  if (end.over && end.result === 'checkmate') return end.winner === botColour ? 'Good game! I win this one 🏆' : 'You got me! Well played 👏';
  if (end.over) return "It's a draw — good game!";
  if (inCheck(state, state.turn)) return state.turn === botColour ? 'Eek, check!' : 'Check! Watch your king 👑';
  const lead = evaluate(state, botColour);
  if (lead > 400) return 'I am rather enjoying this…';
  if (lead < -400) return 'Oh no, you are good at this!';
  return bot.chat[Math.floor(Math.random() * bot.chat.length)];
}
