/**
 * "I have never played chess" — the beginner's guide.
 *
 * Each piece gets a little demonstration board, and the dots on it are worked
 * out by the real rules engine rather than drawn by hand: the guide sets a piece
 * on an empty board and asks `movesFrom` where it may go. So the guide can never
 * teach a move the game doesn't actually allow.
 */
import { initialState, movesFrom, type ChessState, type Colour, type PieceType, type Square } from './chess';

export interface PieceGuide {
  type: PieceType;
  name: string;
  /** Roughly what it is worth, in pawns — the usual beginner's rule of thumb. */
  worth: string;
  howItMoves: string;
  tip: string;
  /** Extra pieces to put on the demo board, to show captures and blocking. */
  extras?: Array<{ square: number; type: PieceType; colour: Colour }>;
  /** Where the piece stands in its demonstration. */
  from: number;
}

/** Square index from a name like "d4", so the table below reads like a chessboard. */
const sq = (name: string) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

export const PIECE_GUIDE: PieceGuide[] = [
  {
    type: 'p', name: 'Pawn', worth: '1 point',
    howItMoves: 'Forward one square — or two on its very first move. It can never go backwards.',
    tip: 'A pawn captures diagonally, not straight ahead. Get one all the way to the far end and it turns into any piece you like — usually a queen!',
    from: sq('e2'),
    extras: [{ square: sq('d3'), type: 'p', colour: 'b' }, { square: sq('f3'), type: 'n', colour: 'b' }],
  },
  {
    type: 'n', name: 'Knight', worth: '3 points',
    howItMoves: 'In an L shape: two squares one way, then one square to the side.',
    tip: 'The knight is the only piece that can jump over others, so it is never blocked in. Great for surprising people.',
    from: sq('d4'),
  },
  {
    type: 'b', name: 'Bishop', worth: '3 points',
    howItMoves: 'As far as you like diagonally, until something is in the way.',
    tip: 'A bishop stays on its own colour forever. You start with one on light squares and one on dark.',
    from: sq('d4'),
  },
  {
    type: 'r', name: 'Rook', worth: '5 points',
    howItMoves: 'As far as you like in a straight line — up, down or sideways.',
    tip: 'Rooks are strongest when the board has emptied out and the lines are open.',
    from: sq('d4'),
  },
  {
    type: 'q', name: 'Queen', worth: '9 points',
    howItMoves: 'Any distance in any direction: straight or diagonal. A rook and a bishop rolled into one.',
    tip: 'The most powerful piece — so look after her. Do not send her out on her own too early.',
    from: sq('d4'),
  },
  {
    type: 'k', name: 'King', worth: 'the whole game',
    howItMoves: 'One single square in any direction.',
    tip: 'The king is never actually captured. If he is attacked and cannot escape, that is checkmate and the game is over.',
    from: sq('d4'),
  },
];

/** The demonstration position for one piece: an empty board and that piece. */
export function guideBoard(guide: PieceGuide): ChessState {
  const board: Square[] = Array(64).fill(null);
  board[guide.from] = { type: guide.type, colour: 'w' };
  for (const extra of guide.extras ?? []) board[extra.square] = { type: extra.type, colour: extra.colour };
  return { ...initialState(), board, turn: 'w', castling: '', ep: null, seen: {} };
}

/** Every square that piece may move to — straight from the rules engine. */
export function guideMoves(guide: PieceGuide): number[] {
  const state = guideBoard(guide);
  return [...new Set(movesFrom(state, guide.from).map((move) => move.to))];
}

export interface RuleNote { icon: string; title: string; text: string }

/** The three rules that surprise every new player. */
export const SPECIAL_RULES: RuleNote[] = [
  {
    icon: '🏰', title: 'Castling',
    text: 'Once per game your king can hop two squares sideways and the rook jumps over to his other side — tucking the king somewhere safe. Only if neither has moved yet, nothing is in between, and the king is not in check.',
  },
  {
    icon: '👻', title: 'En passant',
    text: 'If an enemy pawn uses its two-square first move to slip straight past your pawn, you may take it anyway — but only on your very next move.',
  },
  {
    icon: '👑', title: 'Promotion',
    text: 'Walk a pawn all the way to the other end and it becomes a queen, rook, bishop or knight. You choose — and you can have more than one queen!',
  },
];

/** How a game of chess actually ends. */
export const HOW_TO_WIN: RuleNote[] = [
  { icon: '⚠️', title: 'Check', text: 'Your king is under attack. You must get out of it right now — move him, block the attack, or take the attacker.' },
  { icon: '🏆', title: 'Checkmate', text: 'The king is attacked and there is no way out at all. That is it — the game is won.' },
  { icon: '🤝', title: 'Stalemate', text: 'It is your turn but you have no legal move and your king is NOT in check. That is a draw, not a loss.' },
];
