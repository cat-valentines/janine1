/**
 * Real chess — the whole rulebook, with no shortcuts.
 *
 * Castling, en passant, promotion, check, checkmate, stalemate, the fifty-move
 * rule, threefold repetition and dead positions are all here, because a chess
 * game that quietly gets a rule wrong is worse than no chess game at all.
 *
 * The board is 64 squares, index 0 = a8 (black's corner) through 63 = h1, which
 * is the order you read a board from the top-left, so `board[i]` lines up with
 * the squares the UI draws in the same order.
 *
 * Everything here is pure: `applyMove` returns a brand-new state and never edits
 * the one you passed in, so the bot can look ahead without disturbing the game
 * on screen.
 */

export type Colour = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece { type: PieceType; colour: Colour }
export type Square = Piece | null;

export interface Move {
  from: number;
  to: number;
  /** Set when a pawn reaches the far rank. */
  promotion?: PieceType;
}

export interface ChessState {
  board: Square[];
  turn: Colour;
  /** Castling still available, as the usual "KQkq" (uppercase = white). */
  castling: string;
  /** The square a pawn may capture onto en passant, or null. */
  ep: number | null;
  /** Half-moves since the last capture or pawn move — the fifty-move rule. */
  halfmove: number;
  fullmove: number;
  /** How often each position has been seen, for threefold repetition. */
  seen: Record<string, number>;
}

export const FILES = 'abcdefgh';
export const other = (colour: Colour): Colour => (colour === 'w' ? 'b' : 'w');
export const fileOf = (i: number) => i % 8;
export const rankOf = (i: number) => Math.floor(i / 8);
/** "e4" for the square at that index. */
export const squareName = (i: number) => `${FILES[fileOf(i)]}${8 - rankOf(i)}`;

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export function initialState(): ChessState {
  const board: Square[] = Array(64).fill(null);
  for (let f = 0; f < 8; f += 1) {
    board[f] = { type: BACK_RANK[f], colour: 'b' };
    board[8 + f] = { type: 'p', colour: 'b' };
    board[48 + f] = { type: 'p', colour: 'w' };
    board[56 + f] = { type: BACK_RANK[f], colour: 'w' };
  }
  const state: ChessState = { board, turn: 'w', castling: 'KQkq', ep: null, halfmove: 0, fullmove: 1, seen: {} };
  state.seen[positionKey(state)] = 1;
  return state;
}

/** Everything that makes two positions "the same" for repetition: not the clocks. */
export function positionKey(state: ChessState): string {
  const squares = state.board.map((p) => (p ? (p.colour === 'w' ? p.type.toUpperCase() : p.type) : '.')).join('');
  return `${squares}|${state.turn}|${state.castling || '-'}|${state.ep ?? '-'}`;
}

// ---- how each piece moves -------------------------------------------------

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_RAYS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** The index at (file, rank-from-top), or -1 if that walks off the board. */
const at = (f: number, r: number) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);

/**
 * Every move the piece on `from` could make ignoring whether it leaves its own
 * king in check — the raw geometry. `legalMoves` filters those out afterwards.
 */
function pseudoMoves(state: ChessState, from: number, out: Move[]) {
  const piece = state.board[from];
  if (!piece) return;
  const f = fileOf(from), r = rankOf(from);
  const mine = piece.colour;
  const empty = (i: number) => i >= 0 && !state.board[i];
  const enemy = (i: number) => i >= 0 && !!state.board[i] && state.board[i]!.colour !== mine;

  const slide = (rays: number[][]) => {
    for (const [df, dr] of rays) {
      for (let step = 1; step < 8; step += 1) {
        const i = at(f + df * step, r + dr * step);
        if (i < 0 || (state.board[i] && state.board[i]!.colour === mine)) break;
        out.push({ from, to: i });
        if (state.board[i]) break;   // captured something: the ray stops here
      }
    }
  };

  if (piece.type === 'p') {
    // White climbs toward rank 0 (the top of the array), black goes the other way.
    const dir = mine === 'w' ? -1 : 1;
    const startRank = mine === 'w' ? 6 : 1;
    const lastRank = mine === 'w' ? 0 : 7;
    const one = at(f, r + dir);
    if (empty(one)) {
      pushPawn(out, from, one, r + dir === lastRank);
      const two = at(f, r + dir * 2);
      if (r === startRank && empty(two)) out.push({ from, to: two });
    }
    for (const df of [-1, 1]) {
      const i = at(f + df, r + dir);
      if (i < 0) continue;
      if (enemy(i)) pushPawn(out, from, i, r + dir === lastRank);
      else if (i === state.ep && !state.board[i]) out.push({ from, to: i });   // en passant
    }
    return;
  }
  if (piece.type === 'n') {
    for (const [df, dr] of KNIGHT_STEPS) {
      const i = at(f + df, r + dr);
      if (i >= 0 && (!state.board[i] || state.board[i]!.colour !== mine)) out.push({ from, to: i });
    }
    return;
  }
  if (piece.type === 'b') { slide(BISHOP_RAYS); return; }
  if (piece.type === 'r') { slide(ROOK_RAYS); return; }
  if (piece.type === 'q') { slide(BISHOP_RAYS); slide(ROOK_RAYS); return; }

  // King: one step anywhere, plus castling.
  for (const [df, dr] of KING_STEPS) {
    const i = at(f + df, r + dr);
    if (i >= 0 && (!state.board[i] || state.board[i]!.colour !== mine)) out.push({ from, to: i });
  }
  castleMoves(state, mine, out);
}

function pushPawn(out: Move[], from: number, to: number, promoting: boolean) {
  if (!promoting) { out.push({ from, to }); return; }
  for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) out.push({ from, to, promotion });
}

/**
 * Castling, with all three of its conditions: the right is still there, the
 * squares between are empty, and the king neither starts in check nor passes
 * through (or lands on) a square the enemy attacks.
 */
function castleMoves(state: ChessState, colour: Colour, out: Move[]) {
  const home = colour === 'w' ? 60 : 4;
  if (state.board[home]?.type !== 'k' || state.board[home]?.colour !== colour) return;
  if (attacked(state, home, other(colour))) return;
  const rights = colour === 'w' ? ['K', 'Q'] : ['k', 'q'];
  // King's side: squares f1,g1 clear; queen's side: d1,c1,b1 clear (b1 may be
  // attacked, it is only the king's path that must be safe).
  const plans = [
    { right: rights[0], empty: [home + 1, home + 2], safe: [home + 1, home + 2], to: home + 2, rook: home + 3 },
    { right: rights[1], empty: [home - 1, home - 2, home - 3], safe: [home - 1, home - 2], to: home - 2, rook: home - 4 },
  ];
  for (const plan of plans) {
    if (!state.castling.includes(plan.right)) continue;
    const rook = state.board[plan.rook];
    if (!rook || rook.type !== 'r' || rook.colour !== colour) continue;
    if (plan.empty.some((i) => state.board[i])) continue;
    if (plan.safe.some((i) => attacked(state, i, other(colour)))) continue;
    out.push({ from: home, to: plan.to });
  }
}

/** True if `colour` attacks that square — the test behind check and castling. */
export function attacked(state: ChessState, target: number, colour: Colour): boolean {
  const f = fileOf(target), r = rankOf(target);
  // Pawns: a pawn on the square diagonally "in front" of the target attacks it.
  const pawnDir = colour === 'w' ? 1 : -1;   // where that pawn would have to stand
  for (const df of [-1, 1]) {
    const i = at(f + df, r + pawnDir);
    const p = i >= 0 ? state.board[i] : null;
    if (p && p.colour === colour && p.type === 'p') return true;
  }
  for (const [df, dr] of KNIGHT_STEPS) {
    const i = at(f + df, r + dr);
    const p = i >= 0 ? state.board[i] : null;
    if (p && p.colour === colour && p.type === 'n') return true;
  }
  for (const [df, dr] of KING_STEPS) {
    const i = at(f + df, r + dr);
    const p = i >= 0 ? state.board[i] : null;
    if (p && p.colour === colour && p.type === 'k') return true;
  }
  const ray = (rays: number[][], types: PieceType[]) => {
    for (const [df, dr] of rays) {
      for (let step = 1; step < 8; step += 1) {
        const i = at(f + df * step, r + dr * step);
        if (i < 0) break;
        const p = state.board[i];
        if (!p) continue;
        if (p.colour === colour && types.includes(p.type)) return true;
        break;   // any piece blocks the rest of this ray
      }
    }
    return false;
  };
  if (ray(BISHOP_RAYS, ['b', 'q'])) return true;
  if (ray(ROOK_RAYS, ['r', 'q'])) return true;
  return false;
}

export function kingSquare(state: ChessState, colour: Colour): number {
  return state.board.findIndex((p) => p?.type === 'k' && p.colour === colour);
}

export function inCheck(state: ChessState, colour: Colour): boolean {
  const king = kingSquare(state, colour);
  return king >= 0 && attacked(state, king, other(colour));
}

// ---- making moves ---------------------------------------------------------

/** Play a move and hand back the new position. The original is untouched. */
export function applyMove(state: ChessState, move: Move): ChessState {
  const board = state.board.slice();
  const piece = board[move.from];
  if (!piece) return state;
  const captured = board[move.to];
  const isPawn = piece.type === 'p';
  const dir = piece.colour === 'w' ? -1 : 1;

  board[move.from] = null;
  board[move.to] = move.promotion ? { type: move.promotion, colour: piece.colour } : piece;

  // En passant: the pawn you take is beside you, not on the square you land on.
  let epCapture = false;
  if (isPawn && move.to === state.ep && !captured) {
    board[move.to - dir * 8] = null;
    epCapture = true;
  }
  // Castling: the king moved two squares, so the rook jumps over it.
  if (piece.type === 'k' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
    const kingSide = fileOf(move.to) > fileOf(move.from);
    const rookFrom = kingSide ? move.from + 3 : move.from - 4;
    const rookTo = kingSide ? move.from + 1 : move.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  // Castling rights die when the king or a rook leaves home, or a rook is taken.
  let castling = state.castling;
  const drop = (chars: string) => { for (const c of chars) castling = castling.replace(c, ''); };
  if (piece.type === 'k') drop(piece.colour === 'w' ? 'KQ' : 'kq');
  if (move.from === 63 || move.to === 63) drop('K');
  if (move.from === 56 || move.to === 56) drop('Q');
  if (move.from === 7 || move.to === 7) drop('k');
  if (move.from === 0 || move.to === 0) drop('q');

  const next: ChessState = {
    board,
    turn: other(state.turn),
    castling,
    // Only a two-square pawn push offers en passant, and only for one move.
    ep: isPawn && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2 ? move.from + dir * 8 : null,
    halfmove: isPawn || captured || epCapture ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
    // Repetition history is NOT updated here: `applyMove` runs tens of thousands
    // of times inside the bot's search, and copying the history each time was
    // the single most expensive thing it did. Real moves go through `playMove`.
    seen: state.seen,
  };
  return next;
}

/** Add a position to the repetition history. Only for moves actually played. */
export function remember(state: ChessState): ChessState {
  const key = positionKey(state);
  return { ...state, seen: { ...state.seen, [key]: (state.seen[key] ?? 0) + 1 } };
}

/**
 * Play a move for real: the same as `applyMove`, but it also remembers the
 * position so threefold repetition can be spotted. Use this everywhere a move
 * is genuinely made; use `applyMove` when only looking ahead.
 */
export function playMove(state: ChessState, move: Move): ChessState {
  return remember(applyMove(state, move));
}

/** Every move the side to play is actually allowed to make. */
export function legalMoves(state: ChessState): Move[] {
  const pseudo: Move[] = [];
  for (let i = 0; i < 64; i += 1) {
    if (state.board[i]?.colour === state.turn) pseudoMoves(state, i, pseudo);
  }
  const mine = state.turn;
  return pseudo.filter((move) => !inCheck(applyMove(state, move), mine));
}

/** The legal moves for one piece — what the board highlights when you tap it. */
export function movesFrom(state: ChessState, from: number): Move[] {
  if (state.board[from]?.colour !== state.turn) return [];
  const pseudo: Move[] = [];
  pseudoMoves(state, from, pseudo);
  const mine = state.turn;
  return pseudo.filter((move) => !inCheck(applyMove(state, move), mine));
}

// ---- how a game ends ------------------------------------------------------

export type Outcome =
  | { over: false }
  | { over: true; result: 'checkmate'; winner: Colour; reason: string }
  | { over: true; result: 'stalemate' | 'fifty' | 'repetition' | 'material'; winner: null; reason: string };

/**
 * Two lone kings — or a king and one knight or bishop — can never mate, so the
 * game is a draw the moment it happens rather than shuffling about forever.
 */
function deadPosition(state: ChessState): boolean {
  const pieces = state.board.filter(Boolean) as Piece[];
  if (pieces.length > 4) return false;
  const rest = pieces.filter((p) => p.type !== 'k');
  if (rest.length === 0) return true;                                  // K v K
  if (rest.length === 1) return rest[0].type === 'n' || rest[0].type === 'b';   // K+N or K+B v K
  if (rest.length === 2) return rest.every((p) => p.type === 'b');     // K+B v K+B
  return false;
}

export function outcome(state: ChessState): Outcome {
  if (legalMoves(state).length === 0) {
    if (inCheck(state, state.turn)) {
      const winner = other(state.turn);
      return { over: true, result: 'checkmate', winner, reason: `Checkmate — ${winner === 'w' ? 'White' : 'Black'} wins!` };
    }
    return { over: true, result: 'stalemate', winner: null, reason: 'Stalemate — nobody can move, so it is a draw.' };
  }
  if (state.halfmove >= 100) return { over: true, result: 'fifty', winner: null, reason: 'Draw — fifty moves with no capture and no pawn moved.' };
  if ((state.seen[positionKey(state)] ?? 0) >= 3) return { over: true, result: 'repetition', winner: null, reason: 'Draw — the same position happened three times.' };
  if (deadPosition(state)) return { over: true, result: 'material', winner: null, reason: 'Draw — not enough pieces left to checkmate.' };
  return { over: false };
}

/**
 * What each side has had captured, worked out from what is missing off the
 * board. A promoted pawn can leave more queens on the board than the set
 * started with, so a count is never allowed to go negative.
 */
export function capturedPieces(state: ChessState): Record<Colour, PieceType[]> {
  const full: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const left: Record<Colour, Record<PieceType, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const piece of state.board) if (piece) left[piece.colour][piece.type] += 1;
  const out: Record<Colour, PieceType[]> = { w: [], b: [] };
  for (const colour of ['w', 'b'] as Colour[]) {
    for (const type of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
      const gone = Math.max(0, full[type] - left[colour][type]);
      for (let i = 0; i < gone; i += 1) out[colour].push(type);
    }
  }
  return out;
}

// ---- writing moves down ---------------------------------------------------

const LETTER: Record<PieceType, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/**
 * A move in normal chess notation ("Nf3", "exd5", "O-O", "Qh5#"), worked out
 * against the position it is played in so the move list reads like a real one.
 */
export function moveToText(state: ChessState, move: Move): string {
  const piece = state.board[move.from];
  if (!piece) return '';
  if (piece.type === 'k' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
    return fileOf(move.to) > fileOf(move.from) ? 'O-O' : 'O-O-O';
  }
  const captures = !!state.board[move.to] || (piece.type === 'p' && move.to === state.ep);
  let text = LETTER[piece.type];
  if (piece.type === 'p') {
    if (captures) text += FILES[fileOf(move.from)];
  } else {
    // Say which piece when two of the same kind could both go there.
    const rivals = legalMoves(state).filter((m) =>
      m.to === move.to && m.from !== move.from && state.board[m.from]?.type === piece.type && state.board[m.from]?.colour === piece.colour);
    if (rivals.length) {
      text += rivals.every((m) => fileOf(m.from) !== fileOf(move.from))
        ? FILES[fileOf(move.from)]
        : `${8 - rankOf(move.from)}`;
    }
  }
  if (captures) text += 'x';
  text += squareName(move.to);
  if (move.promotion) text += `=${LETTER[move.promotion]}`;
  const after = applyMove(state, move);
  const end = outcome(after);
  if (end.over && end.result === 'checkmate') text += '#';
  else if (inCheck(after, after.turn)) text += '+';
  return text;
}
