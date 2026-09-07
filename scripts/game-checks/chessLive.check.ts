import { CHESS_DRAW_COINS, CHESS_WIN_COINS, GUEST_NAME, chessPrize } from '../../src/lib/guestRules';
import { initialState, legalMoves, playMove, capturedPieces, applyMove, type ChessState, type Move, type PieceType, type Square, type Piece, type Colour, positionKey } from '../../src/game/chess';

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
  const s: ChessState = { board, turn: turn as Colour, castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? null : (8 - Number(ep[1])) * 8 + 'abcdefgh'.indexOf(ep[0]),
    halfmove: Number(half ?? 0), fullmove: Number(full ?? 1), seen: {} };
  s.seen[positionKey(s)] = 1;
  return s;
}

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

/**
 * One side of a live game, using exactly the rule ChessPage applies to an
 * incoming move: take it only if it is the next move AND it is legal.
 */
class Side {
  state = initialState();
  plies = 0;
  play(move: Move) { const ply = this.plies; this.state = playMove(this.state, move); this.plies += 1; return { move, ply }; }
  receive(packet: { move: Move; ply: number }) {
    if (packet.ply !== this.plies) return false;                       // stale, duplicate or out of order
    const legal = legalMoves(this.state).find((m) => m.from === packet.move.from && m.to === packet.move.to && m.promotion === packet.move.promotion);
    if (!legal) return false;                                          // never trust the wire
    this.state = playMove(this.state, legal);
    this.plies += 1;
    return true;
  }
}

// A whole game relayed move by move keeps both boards identical.
const white = new Side(), black = new Side();
let bounced = 0;
for (let i = 0; i < 40; i += 1) {
  const mover = i % 2 === 0 ? white : black;
  const listener = i % 2 === 0 ? black : white;
  const moves = legalMoves(mover.state);
  if (!moves.length) break;
  const packet = mover.play(moves[i % moves.length]);
  listener.receive(packet);
  if (listener.receive(packet)) bounced += 1;          // the same packet delivered twice
}
check('both boards agree after 40 moves', positionKey(white.state), positionKey(black.state));
check('a duplicate packet is always ignored', bounced, 0);

// A packet that arrives late (or out of order) is dropped, not replayed.
const a = new Side(), b = new Side();
const first = a.play(legalMoves(a.state)[0]);
b.receive(first);
const second = a.play(legalMoves(a.state)[0]);
check('an out-of-order packet is refused', b.receive({ ...second, ply: 99 }), false);
check('  ...and the right one still lands', b.receive(second), true);
check('  ...leaving the boards in step', positionKey(a.state), positionKey(b.state));

// An illegal move on the wire cannot corrupt the board.
const c = new Side();
const before = positionKey(c.state);
check('an illegal move is refused', c.receive({ move: { from: 0, to: 63 }, ply: 0 }), false);
check('  ...and the board is untouched', positionKey(c.state), before);

// ---- captured pieces ----
check('nothing captured at the start', capturedPieces(initialState()), { w: [], b: [] });
const traded = fromFen('rnb1kbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1');
check('both queens gone shows one each', [capturedPieces(traded).w, capturedPieces(traded).b], [['q', 'p'], ['q', 'p']]);
// A promoted pawn leaves two white queens on the board — the count must not go negative.
const twoQueens = fromFen('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1');
check('a second queen never breaks the count', capturedPieces(twoQueens).w.includes('q'), false);
check('  ...and the missing pawns still count', capturedPieces(twoQueens).w.filter((p) => p === 'p').length, 8);

// Promotion really does put an extra queen on the board.
const promo = applyMove(fromFen('8/4P3/8/8/8/8/8/K6k w - - 0 1'), { from: 12, to: 4, promotion: 'q' });
check('promotion adds a queen', promo.board.filter((p) => p?.type === 'q' && p.colour === 'w').length, 1);

// ---- what a finished game pays -------------------------------------------
check('winning is worth 10 coins', CHESS_WIN_COINS, 10);
check('a signed-in winner keeps them', chessPrize('win', true), { coins: 10, offerAccount: 0 });
check('a signed-in draw pays less', chessPrize('draw', true), { coins: CHESS_DRAW_COINS, offerAccount: 0 });
check('losing pays nothing', chessPrize('loss', true), { coins: 0, offerAccount: 0 });

// A guest plays and wins the same game — the coins just have nowhere to go, so
// they come back as an offer of an account rather than vanishing silently.
check('a guest who wins gets no coins', chessPrize('win', false).coins, 0);
check('  ...but is shown what an account would keep', chessPrize('win', false).offerAccount, 10);
check('a guest who draws is offered those too', chessPrize('draw', false).offerAccount, CHESS_DRAW_COINS);
check('a guest who loses is offered nothing', chessPrize('loss', false), { coins: 0, offerAccount: 0 });
check('a guest is never paid AND offered', ['win', 'draw', 'loss'].every((r) => {
  const prize = chessPrize(r as 'win', false);
  return prize.coins === 0 || prize.offerAccount === 0;
}), true);

// Everyone without an account is called the same thing, and cannot change it.
check('a player without an account is a Guest', GUEST_NAME, 'Guest');

process.exit(bad ? 1 : 0);
