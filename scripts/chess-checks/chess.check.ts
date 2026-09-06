import {
  initialState, legalMoves, applyMove, outcome, inCheck, moveToText, squareName,
  positionKey, type ChessState, type Square, type Piece, type PieceType, type Colour,
} from '../../src/game/chess';

// A minimal FEN reader, only so the tests can start from the standard positions
// the chess world uses to check move generation.
function fromFen(fen: string): ChessState {
  const [rows, turn, castling, ep, half, full] = fen.split(' ');
  const board: Square[] = Array(64).fill(null);
  let i = 0;
  for (const ch of rows) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { i += Number(ch); continue; }
    const colour: Colour = ch === ch.toUpperCase() ? 'w' : 'b';
    board[i] = { type: ch.toLowerCase() as PieceType, colour } as Piece;
    i += 1;
  }
  const epIndex = ep === '-' ? null : (8 - Number(ep[1])) * 8 + 'abcdefgh'.indexOf(ep[0]);
  const state: ChessState = {
    board, turn: turn as Colour, castling: castling === '-' ? '' : castling,
    ep: epIndex, halfmove: Number(half ?? 0), fullmove: Number(full ?? 1), seen: {},
  };
  state.seen[positionKey(state)] = 1;
  return state;
}

/** Count every legal sequence of `depth` moves — the standard correctness test. */
function perft(state: ChessState, depth: number): number {
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(applyMove(state, move), depth - 1);
  return total;
}

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(46)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

// ---- perft: the published node counts every chess engine is checked against ----
const start = initialState();
check('perft(1) from the start', perft(start, 1), 20);
check('perft(2) from the start', perft(start, 2), 400);
check('perft(3) from the start', perft(start, 3), 8902);
check('perft(4) from the start', perft(start, 4), 197281);

// "Kiwipete" — the position that catches castling and en-passant bugs.
const kiwi = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
check('perft(1) Kiwipete', perft(kiwi, 1), 48);
check('perft(2) Kiwipete', perft(kiwi, 2), 2039);
check('perft(3) Kiwipete', perft(kiwi, 3), 97862);

// Position 3 — pawn races, promotions and tricky en passant.
const p3 = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
check('perft(1) position 3', perft(p3, 1), 14);
check('perft(2) position 3', perft(p3, 2), 191);
check('perft(3) position 3', perft(p3, 3), 2812);
check('perft(4) position 3', perft(p3, 4), 43238);

// Position 4 — promotion into check, pinned pieces.
const p4 = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
check('perft(1) position 4', perft(p4, 1), 6);
check('perft(2) position 4', perft(p4, 2), 264);
check('perft(3) position 4', perft(p4, 3), 9467);

// ---- the endings ----
const fools = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
let game = initialState();
for (const text of fools) {
  const from = (8 - Number(text[1])) * 8 + 'abcdefgh'.indexOf(text[0]);
  const to = (8 - Number(text[3])) * 8 + 'abcdefgh'.indexOf(text[2]);
  game = applyMove(game, { from, to });
}
const mate = outcome(game);
check("fool's mate is checkmate", mate.over && mate.result, 'checkmate');
check('  ...and black won', mate.over && mate.winner, 'b');

const stale = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
check('stalemate is spotted', outcome(stale).over && (outcome(stale) as any).result, 'stalemate');
check('  ...and is not check', inCheck(stale, 'b'), false);

const bare = fromFen('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
check('two lone kings is a draw', (outcome(bare) as any).result, 'material');

const fifty = fromFen('8/8/4k3/8/8/4K3/4P3/8 w - - 100 60');
check('fifty-move rule ends it', (outcome(fifty) as any).result, 'fifty');

// ---- castling ----
const canCastle = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const castleMoves = legalMoves(canCastle).filter((m) => m.from === 60 && Math.abs(m.to - m.from) === 2);
check('both castles are offered', castleMoves.length, 2);
const castled = applyMove(canCastle, { from: 60, to: 62 });
check('castling moves the rook too', [castled.board[61]?.type, castled.board[63]], ['r', null]);
check('  ...and burns the rights', castled.castling, 'kq');

const throughCheck = fromFen('r3k2r/8/8/8/8/8/8/R3K1r1 w KQkq - 0 1');
check('no castling through check', legalMoves(throughCheck).some((m) => m.from === 60 && m.to === 62), false);

// ---- en passant ----
let ep = fromFen('8/8/8/8/4p3/8/3P4/K6k w - - 0 1');
ep = applyMove(ep, { from: 51, to: 35 });                  // d2-d4, right past the black pawn
check('en passant square is offered', ep.ep !== null && squareName(ep.ep), 'd3');
const epTake = legalMoves(ep).find((m) => m.to === ep.ep);
check('  ...and black may take it', !!epTake, true);
const afterEp = applyMove(ep, epTake!);
check('  ...which removes the pawn', afterEp.board[35], null);

// ---- promotion ----
const promo = fromFen('8/4P3/8/8/8/8/8/K6k w - - 0 1');
const promos = legalMoves(promo).filter((m) => m.from === 12);
check('a pawn promotes four ways', promos.map((m) => m.promotion).sort(), ['b', 'n', 'q', 'r']);
check('promoting really makes a queen', applyMove(promo, { from: 12, to: 4, promotion: 'q' }).board[4]?.type, 'q');

// ---- notation ----
check('opening move reads as e4', moveToText(start, { from: 52, to: 36 }), 'e4');
check('a knight move reads as Nf3', moveToText(start, { from: 62, to: 45 }), 'Nf3');
check('castling reads as O-O', moveToText(canCastle, { from: 60, to: 62 }), 'O-O');
// King g6, queen f7, black king h8: Qg7 is the classic queen-and-king mate.
check('checkmate gets its #', moveToText(fromFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'), { from: 13, to: 14 }), 'Qg7#');
check('plain check gets its +', moveToText(fromFen('7k/8/8/8/8/8/8/K4R2 w - - 0 1'), { from: 61, to: 63 }), 'Rh1+');

process.exit(bad ? 1 : 0);
