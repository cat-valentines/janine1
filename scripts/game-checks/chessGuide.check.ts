import { squareName } from '../../src/game/chess';
import { HOW_TO_WIN, PIECE_GUIDE, SPECIAL_RULES, guideBoard, guideMoves } from '../../src/game/chessGuide';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(50)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};
const named = (squares: number[]) => squares.map(squareName).sort();

const by = (type: string) => PIECE_GUIDE.find((g) => g.type === type)!;

// The guide teaches from the engine, so these are the dots a child really sees.
check('all six pieces are explained', PIECE_GUIDE.map((g) => g.type), ['p', 'n', 'b', 'r', 'q', 'k']);

// A pawn on e2 beside two enemies: forward one, forward two, and both captures.
check('pawn shows its pushes and both captures', named(guideMoves(by('p'))), ['d3', 'e3', 'e4', 'f3']);
// A knight in the middle reaches all eight L-squares.
check('knight shows all eight L moves', guideMoves(by('n')).length, 8);
check('  ...and they are the right ones', named(guideMoves(by('n'))), ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5']);
// The long-range pieces on an empty board.
check('bishop shows 13 diagonal squares', guideMoves(by('b')).length, 13);
check('rook shows 14 straight squares', guideMoves(by('r')).length, 14);
check('queen shows all 27 squares', guideMoves(by('q')).length, 27);
check('king shows just his 8 neighbours', guideMoves(by('k')).length, 8);

// A bishop really does stay on one colour — the guide says so, so prove it.
const bishopHome = by('b').from;
const colourOf = (i: number) => ((i % 8) + Math.floor(i / 8)) % 2;
check('bishop never leaves its colour', guideMoves(by('b')).every((i) => colourOf(i) === colourOf(bishopHome)), true);

// Every demo board really has the piece it is demonstrating standing on it.
for (const guide of PIECE_GUIDE) {
  const board = guideBoard(guide);
  if (board.board[guide.from]?.type !== guide.type) { bad += 1; console.log(`FAIL  ${guide.name} is missing from its own diagram`); }
}
check('every piece stands on its own diagram', true, true);

// No piece is left with nothing to show.
check('no diagram is empty', PIECE_GUIDE.every((g) => guideMoves(g).length > 0), true);

// The written notes are all filled in.
check('three ways a game ends are covered', HOW_TO_WIN.map((r) => r.title), ['Check', 'Checkmate', 'Stalemate']);
check('the three surprising rules are covered', SPECIAL_RULES.map((r) => r.title), ['Castling', 'En passant', 'Promotion']);
check('every note has words in it', [...HOW_TO_WIN, ...SPECIAL_RULES].every((r) => r.text.length > 40 && r.icon), true);
check('every piece has a tip and a move line', PIECE_GUIDE.every((g) => g.howItMoves.length > 20 && g.tip.length > 20 && g.worth), true);

process.exit(bad ? 1 : 0);
