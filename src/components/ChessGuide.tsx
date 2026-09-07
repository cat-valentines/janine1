import { useState } from 'react';
import { fileOf, rankOf, type ChessState, type Colour, type PieceType } from '../game/chess';
import { HOW_TO_WIN, PIECE_GUIDE, SPECIAL_RULES, guideBoard, guideMoves, type PieceGuide } from '../game/chessGuide';

/**
 * "New to chess?" — the beginner's guide that sits under the two play options.
 *
 * Every dot on every little board comes out of the real rules engine, so what a
 * child is taught here is exactly what the game will let them do.
 */

const GLYPH: Record<Colour, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

/** A small board showing one piece and everywhere it may go. */
function MiniBoard({ state, from, targets }: { state: ChessState; from: number; targets: number[] }) {
  return (
    <div className="chess-mini" aria-hidden="true">
      {Array.from({ length: 64 }, (_, i) => {
        const piece = state.board[i];
        const canGo = targets.includes(i);
        const dark = (fileOf(i) + rankOf(i)) % 2 === 1;
        return (
          <span key={i} className={`mini-square ${dark ? 'dark' : 'light'} ${i === from ? 'home' : ''} ${canGo ? (piece ? 'take' : 'go') : ''}`}>
            {piece && <b className={piece.colour === 'w' ? 'white' : 'black'}>{GLYPH[piece.colour][piece.type]}</b>}
            {canGo && !piece && <i />}
          </span>
        );
      })}
    </div>
  );
}

function PieceCard({ guide }: { guide: PieceGuide }) {
  return (
    <article className="chess-guide-card">
      <header>
        <span className="guide-glyph white">{GLYPH.w[guide.type]}</span>
        <div>
          <strong>{guide.name}</strong>
          <em>Worth {guide.worth}</em>
        </div>
      </header>
      <MiniBoard state={guideBoard(guide)} from={guide.from} targets={guideMoves(guide)} />
      <p className="guide-moves">{guide.howItMoves}</p>
      <p className="guide-tip">💡 {guide.tip}</p>
    </article>
  );
}

export function ChessGuide() {
  const [open, setOpen] = useState(false);

  return (
    <section className="chess-guide">
      <button className="chess-guide-open" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>♟️</span>
        <div>
          <strong>New to chess? Start here</strong>
          <small>What every piece does, how to win, and the three rules that catch people out.</small>
        </div>
        <i>{open ? '▲' : '▼'}</i>
      </button>

      {open && <div className="chess-guide-body">
        <p className="chess-guide-goal">
          <b>The idea of the game.</b> You and your opponent take turns, one move each. The whole aim is to trap the other
          player's <b>king</b> so he cannot escape — that is called <b>checkmate</b>, and it wins the game. White always
          goes first. Every square with a dot on the little boards below is somewhere that piece is allowed to go.
        </p>

        <h3>The six pieces</h3>
        <div className="chess-guide-grid">
          {PIECE_GUIDE.map((guide) => <PieceCard key={guide.type} guide={guide} />)}
        </div>

        <h3>How a game ends</h3>
        <div className="chess-rules">
          {HOW_TO_WIN.map((rule) => <div className="chess-rule" key={rule.title}>
            <span>{rule.icon}</span>
            <div><strong>{rule.title}</strong><small>{rule.text}</small></div>
          </div>)}
        </div>

        <h3>Three rules that surprise everybody</h3>
        <div className="chess-rules">
          {SPECIAL_RULES.map((rule) => <div className="chess-rule" key={rule.title}>
            <span>{rule.icon}</span>
            <div><strong>{rule.title}</strong><small>{rule.text}</small></div>
          </div>)}
        </div>

        <p className="chess-guide-end">
          Ready? Play <b>🐣 Pip the Chick</b> first — she only learned the moves last week, so she is a very fair
          first opponent. On the board, tap one of your pieces and every square it can go to lights up.
        </p>
      </div>}
    </section>
  );
}
