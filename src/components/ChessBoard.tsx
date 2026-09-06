import { FILES, fileOf, rankOf, squareName, type ChessState, type Colour, type Move, type PieceType } from '../game/chess';

/**
 * The board you actually play on: tap a piece, tap where it goes.
 *
 * Deliberately tap-to-move rather than drag-and-drop — it works the same with a
 * mouse and with a finger on an iPad, and a child never loses a piece halfway
 * through a drag.
 */

/** Unicode chess pieces: they scale, they print, and they need no images. */
const GLYPH: Record<Colour, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const NAMES: Record<PieceType, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

interface ChessBoardProps {
  state: ChessState;
  /** Which way up to draw it — your own pieces always sit nearest to you. */
  flipped?: boolean;
  /** The square you've picked up, and where it may go. */
  selected: number | null;
  moves: Move[];
  /** The move just played, so both squares glow. */
  lastMove: Move | null;
  /** The king in check, to flash red. */
  checkSquare: number | null;
  onPick: (square: number) => void;
  /** True when it isn't your turn (or the game is over) — the board goes quiet. */
  frozen?: boolean;
}

export function ChessBoard({ state, flipped, selected, moves, lastMove, checkSquare, onPick, frozen }: ChessBoardProps) {
  // Drawing order: normally a8 first (top-left); flipped, h1 first.
  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const targets = new Map(moves.map((m) => [m.to, m]));

  return (
    <div className={`chess-board ${frozen ? 'frozen' : ''}`} role="grid" aria-label="Chess board">
      {order.map((i) => {
        const piece = state.board[i];
        const dark = (fileOf(i) + rankOf(i)) % 2 === 1;
        const move = targets.get(i);
        const classes = [
          'chess-square',
          dark ? 'dark' : 'light',
          selected === i ? 'selected' : '',
          move ? (piece ? 'can-take' : 'can-go') : '',
          lastMove && (lastMove.from === i || lastMove.to === i) ? 'last' : '',
          checkSquare === i ? 'in-check' : '',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={i}
            className={classes}
            role="gridcell"
            aria-label={`${squareName(i)}${piece ? `, ${piece.colour === 'w' ? 'white' : 'black'} ${NAMES[piece.type]}` : ', empty'}`}
            onClick={() => onPick(i)}
          >
            {/* File letters and rank numbers along the two outside edges. */}
            {fileOf(i) === (flipped ? 7 : 0) && <i className="rank-mark">{8 - rankOf(i)}</i>}
            {rankOf(i) === (flipped ? 0 : 7) && <i className="file-mark">{FILES[fileOf(i)]}</i>}
            {piece && <span className={`chess-piece ${piece.colour === 'w' ? 'white' : 'black'}`}>{GLYPH[piece.colour][piece.type]}</span>}
            {move && !piece && <i className="move-dot" />}
          </button>
        );
      })}
    </div>
  );
}

interface PromotionPickerProps { colour: Colour; onPick: (type: PieceType) => void }

/** A pawn reached the end — choose what it becomes. */
export function PromotionPicker({ colour, onPick }: PromotionPickerProps) {
  return (
    <div className="chess-promo">
      <strong>Your pawn made it! Pick a piece:</strong>
      <div>
        {(['q', 'r', 'b', 'n'] as PieceType[]).map((type) => (
          <button key={type} onClick={() => onPick(type)} aria-label={NAMES[type]}>
            <span className={colour === 'w' ? 'white' : 'black'}>{GLYPH[colour][type]}</span>
            <small>{NAMES[type]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The pieces you've captured, lined up beside the board. */
export function TakenPieces({ pieces, colour }: { pieces: PieceType[]; colour: Colour }) {
  if (!pieces.length) return null;
  return (
    <div className="chess-taken">
      {pieces.map((type, i) => <span key={i} className={colour === 'w' ? 'white' : 'black'}>{GLYPH[colour][type]}</span>)}
    </div>
  );
}
