import { initialState, legalMoves, applyMove, playMove, outcome, type ChessState, type Colour, type Square, type PieceType, type Piece, positionKey } from '../../src/game/chess';
import { CHESS_BOTS, chooseMove, botById } from '../../src/game/chessBot';

function fromFen(fen: string): ChessState {
  const [rows, turn, castling, ep, half, full] = fen.split(' ');
  const board: Square[] = Array(64).fill(null);
  let i = 0;
  for (const ch of rows) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { i += Number(ch); continue; }
    board[i] = { type: ch.toLowerCase() as PieceType, colour: ch === ch.toUpperCase() ? 'w' : 'b' } as Piece;
    i += 1;
  }
  const epIndex = ep === '-' ? null : (8 - Number(ep[1])) * 8 + 'abcdefgh'.indexOf(ep[0]);
  const s: ChessState = { board, turn: turn as Colour, castling: castling === '-' ? '' : castling, ep: epIndex, halfmove: Number(half ?? 0), fullmove: Number(full ?? 1), seen: {} };
  s.seen[positionKey(s)] = 1;
  return s;
}
const sq = (name: string) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(48)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

// Every bot always returns a move that is actually legal.
const start = initialState();
for (const bot of CHESS_BOTS) {
  const t0 = Date.now();
  const move = chooseMove(start, bot)!;
  const ms = Date.now() - t0;
  const legal = legalMoves(start).some((m) => m.from === move.from && m.to === move.to);
  check(`${bot.name} opens legally (${ms}ms)`, legal, true);
  if (ms > 3000) { bad += 1; console.log(`FAIL  ${bot.name} took ${ms}ms — too slow for a phone`); }
}

// Mate in one must be found even by the silliest animal.
const mateIn1 = fromFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
for (const bot of CHESS_BOTS) {
  const move = chooseMove(mateIn1, bot)!;
  const after = applyMove(mateIn1, move);
  const end = outcome(after);
  check(`${bot.name} takes the mate in one`, end.over && end.result === 'checkmate', true);
}

// A free queen: the serious bots always take it. The deliberately-fallible ones
// take it MOST of the time — missing things now and then is the whole point of
// an easy animal, so assert the rate rather than a single try.
const freeQueen = fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
for (const bot of CHESS_BOTS.filter((b) => b.difficulty >= 3)) {
  const tries = 20;
  let took = 0;
  for (let i = 0; i < tries; i += 1) if (chooseMove(freeQueen, bot, 300)!.to === sq('d5')) took += 1;
  if (bot.blunder === 0) check(`${bot.name} always grabs the hanging queen`, took, tries);
  else check(`${bot.name} grabs the hanging queen ${took}/${tries}`, took >= tries * 0.6, true);
}

// The whole point of difficulty: the strong bot must beat the weak one.
function playOut(whiteId: string, blackId: string): 'w' | 'b' | 'draw' {
  let state = initialState();
  for (let ply = 0; ply < 220; ply += 1) {
    const end = outcome(state);
    if (end.over) return end.result === 'checkmate' ? end.winner : 'draw';
    const bot = botById(state.turn === 'w' ? whiteId : blackId)!;
    const move = chooseMove(state, bot, 900);
    if (!move) break;
    state = playMove(state, move);
  }
  return 'draw';
}
// The bots vary their play on purpose, so judge the matchups over several games:
// the strong animal must never LOSE to the weak one, and should win most of them.
const results = [
  playOut('tiger', 'pip'), playOut('panda', 'pip'),
  playOut('toby', 'frog'), playOut('tiger', 'frog'),
];
console.log(`      (strong-vs-weak results: ${results.join(', ')})`);
check('a strong bot never loses to a weak one', results.some((r) => r === 'b'), false);
check('and wins most of the games', results.filter((r) => r === 'w').length >= 3, true);

// A finished game never asks a bot for another move.
const done = fromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
check('no move offered once it is mate', chooseMove(done, CHESS_BOTS[5]), null);

process.exit(bad ? 1 : 0);
