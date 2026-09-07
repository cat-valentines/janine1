import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessBoard, PromotionPicker, TakenPieces } from '../components/ChessBoard';
import { ChessGuide } from '../components/ChessGuide';
import {
  capturedPieces, initialState, inCheck, kingSquare, legalMoves, moveToText, movesFrom, outcome, other, playMove,
  type ChessState, type Colour, type Move, type PieceType,
} from '../game/chess';
import { CHESS_BOTS, botChat, chooseMove, type ChessBot } from '../game/chessBot';
import { joinChessLobby, joinChessMatch, type ChessLobby, type ChessMatch, type Seeker } from '../lib/chessLive';
import { chessPlayer, guestName, setGuestName, type ChessPlayer } from '../lib/chessPlayer';
import { chessAlertOn, setChessAlertOn } from '../lib/chessAlert';
import { heartbeat, leaveGame } from '../lib/presence';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';

interface ChessPageProps {
  /** Coins for winning — the same reward every other game hands out. */
  onScore: (coins: number) => void;
  onBack: () => void;
}

type Screen = 'menu' | 'bots' | 'lobby' | 'game';

/** Who you are playing: one of the animals, or a real person. */
type Opponent =
  | { kind: 'bot'; bot: ChessBot }
  | { kind: 'live'; name: string; matchId: string };

/** Every move played, so the game can show a move list. */
interface PlayedMove { text: string; colour: Colour }

const WIN_COINS = 12;
const DRAW_COINS = 4;

export function ChessPage({ onScore, onBack }: ChessPageProps) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [me, setMe] = useState<ChessPlayer | null>(null);

  // ---- the game on the board ----
  const [state, setState] = useState<ChessState>(initialState);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [myColour, setMyColour] = useState<Colour>('w');
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [history, setHistory] = useState<PlayedMove[]>([]);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [bubble, setBubble] = useState('');
  /** Set when the game ended some way the rules can't see: a resignation. */
  const [ended, setEnded] = useState<{ text: string; won: boolean | null } | null>(null);
  const [rewarded, setRewarded] = useState(false);

  // ---- the live lobby ----
  const [seekers, setSeekers] = useState<Seeker[]>([]);
  const [invite, setInvite] = useState<{ id: string; name: string; matchId: string } | null>(null);
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  const [lobbyNote, setLobbyNote] = useState('');
  const [alertOn, setAlertOn] = useState(chessAlertOn);
  const [nickname, setNickname] = useState(guestName);
  const [drawOffer, setDrawOffer] = useState(false);

  const lobby = useRef<ChessLobby | null>(null);
  const match = useRef<ChessMatch | null>(null);
  // The live handlers are registered once, so they read the game through refs
  // rather than a stale copy of it.
  const stateRef = useRef(state);
  stateRef.current = state;
  const historyRef = useRef(history);
  historyRef.current = history;
  const myColourRef = useRef(myColour);
  myColourRef.current = myColour;

  useEffect(() => { chessPlayer().then(setMe); }, []);
  // Closing the page mid-game says goodbye, so a live opponent isn't left
  // staring at a board waiting for a move that will never come.
  useEffect(() => () => { match.current?.leave(); match.current = null; }, []);

  const end = useMemo(() => outcome(state), [state]);
  const gameOver = !!ended || end.over;
  const myTurn = !gameOver && state.turn === myColour;

  // ---- playing a move -------------------------------------------------------

  const record = useCallback((from: ChessState, move: Move) => {
    setHistory((list) => [...list, { text: moveToText(from, move), colour: from.turn }]);
    setState(playMove(from, move));
    setLastMove(move);
    setSelected(null);
  }, []);

  /** Make a move that has already been checked as legal. */
  const play = useCallback((move: Move) => {
    record(stateRef.current, move);
  }, [record]);

  // The bot's turn: show it thinking first (so the board paints), then search.
  useEffect(() => {
    if (screen !== 'game' || !opponent || opponent.kind !== 'bot') return;
    if (gameOver || state.turn === myColour) return;
    setThinking(true);
    const bot = opponent.bot;
    // A beat of "thinking" makes the animal feel alive, and lets the browser
    // paint the player's move before the search blocks the thread.
    const timer = setTimeout(() => {
      const move = chooseMove(stateRef.current, bot);
      setThinking(false);
      if (!move) return;
      record(stateRef.current, move);
      setBubble(botChat(playMove(stateRef.current, move), bot, other(myColourRef.current)));
    }, 420);
    return () => { clearTimeout(timer); setThinking(false); };
  }, [screen, opponent, state, myColour, gameOver, record]);

  // Coins, once, when a game finishes.
  useEffect(() => {
    if (screen !== 'game' || rewarded) return;
    if (ended) {
      if (ended.won === true) { onScore(WIN_COINS); setRewarded(true); }
      else if (ended.won === null) { onScore(DRAW_COINS); setRewarded(true); }
      return;
    }
    if (!end.over) return;
    if (end.result === 'checkmate') { if (end.winner === myColour) onScore(WIN_COINS); }
    else onScore(DRAW_COINS);
    setRewarded(true);
  }, [screen, end, ended, myColour, onScore, rewarded]);

  // Tell the server you're at the chess board, so other players can find you.
  useEffect(() => {
    if (screen !== 'lobby' && screen !== 'game') return;
    heartbeat('chess');
    const beat = setInterval(() => heartbeat('chess'), 5000);
    return () => { clearInterval(beat); leaveGame(); };
  }, [screen]);

  const pick = (square: number) => {
    if (!myTurn || promoting) return;
    const piece = state.board[square];
    if (selected !== null) {
      const move = movesFrom(state, selected).find((m) => m.to === square);
      if (move) {
        // A pawn reaching the far rank has to become something first.
        if (move.promotion) { setPromoting({ from: selected, to: square }); return; }
        play(move);
        match.current?.sendMove(move, historyRef.current.length);
        return;
      }
    }
    setSelected(piece && piece.colour === state.turn ? square : null);
  };

  const finishPromotion = (type: PieceType) => {
    if (!promoting) return;
    const move: Move = { from: promoting.from, to: promoting.to, promotion: type };
    setPromoting(null);
    play(move);
    match.current?.sendMove(move, historyRef.current.length);
  };

  // ---- starting and stopping games -----------------------------------------

  const resetBoard = (colour: Colour) => {
    setState(initialState());
    setHistory([]);
    setLastMove(null);
    setSelected(null);
    setPromoting(null);
    setEnded(null);
    setRewarded(false);
    setDrawOffer(false);
    setBubble('');
    setMyColour(colour);
  };

  const startBotGame = (bot: ChessBot, colour: Colour) => {
    resetBoard(colour);
    setOpponent({ kind: 'bot', bot });
    setBubble(bot.chat[0]);
    setScreen('game');
  };

  const quitGame = () => {
    match.current?.leave();
    match.current = null;
    setOpponent(null);
    setScreen('menu');
  };

  // ---- the live lobby -------------------------------------------------------

  const startMatch = useCallback((matchId: string, opponentName: string, colour: Colour) => {
    resetBoard(colour);
    setOpponent({ kind: 'live', name: opponentName, matchId });
    setScreen('game');
    setWaitingOn(null);
    setInvite(null);
    match.current?.leave();
    match.current = joinChessMatch(matchId, { id: me!.id, name: me!.name }, {
      onMove: (move, ply) => {
        // Only accept the move that comes next, and only if it is legal — a
        // repeat or a stray message can never corrupt the board.
        if (ply !== historyRef.current.length) return;
        const now = stateRef.current;
        const legal = legalMoves(now).find((m) => m.from === move.from && m.to === move.to && m.promotion === move.promotion);
        if (!legal) return;
        record(now, legal);
      },
      onResign: () => setEnded({ text: `${opponentName} resigned — you win! 🏆`, won: true }),
      onDrawOffer: () => setDrawOffer(true),
      onDrawAccepted: () => setEnded({ text: 'You both agreed a draw. 🤝', won: null }),
      onHello: () => setLobbyNote(''),
      onLeft: () => setEnded({ text: `${opponentName} left the game.`, won: null }),
    });
    match.current.hello();
  }, [me, record]);

  const startMatchRef = useRef(startMatch);
  startMatchRef.current = startMatch;

  useEffect(() => {
    if (screen !== 'lobby' || !me) return;
    const joined = joinChessLobby(me, {
      onSeekers: setSeekers,
      onInvite: (from) => setInvite(from),
      onAccepted: (matchId, opp) => startMatchRef.current(matchId, opp.name, 'w'),   // you asked, so you are white
      onDeclined: (name) => { setWaitingOn(null); setLobbyNote(`${name} can't play right now.`); },
    });
    lobby.current = joined;
    return () => { joined.leave(); lobby.current = null; setSeekers([]); };
  }, [screen, me]);

  const askToPlay = (seeker: Seeker) => {
    if (!lobby.current) return;
    lobby.current.invite(seeker.id);
    setWaitingOn(seeker.name);
    setLobbyNote('');
  };

  const acceptInvite = () => {
    if (!invite || !lobby.current) return;
    lobby.current.accept(invite.matchId, invite.id);
    startMatch(invite.matchId, invite.name, 'b');   // they asked, so they are white
  };

  const resign = () => {
    match.current?.resign();
    setEnded({ text: 'You resigned. Better luck next game!', won: false });
  };

  // ---- what to show ---------------------------------------------------------

  const moves = selected === null ? [] : movesFrom(state, selected);
  const checkSquare = !gameOver && inCheck(state, state.turn) ? kingSquare(state, state.turn) : null;
  const taken = useMemo(() => capturedPieces(state), [state]);

  const statusLine = () => {
    if (ended) return ended.text;
    if (end.over) return end.reason;
    if (thinking) return `${opponent?.kind === 'bot' ? opponent.bot.name : 'They are'} thinking…`;
    if (checkSquare !== null) return myTurn ? '⚠️ You are in check!' : 'Check!';
    return myTurn ? 'Your move.' : 'Waiting for their move…';
  };

  if (screen === 'menu') {
    return <main className="quest-pick chess-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>♟️ Chess</span></div>
      <header className="quest-header chess-header">
        <p className="eyebrow">The real game, all the real rules</p>
        <h1><span>♟️</span> Chess <span>♟️</span></h1>
        <p>Castling, en passant, promotion, checkmate — everything is here.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">Step 1 of 1</p>
        <h2>How do you want to play?</h2>
        <div className="chess-modes">
          <button className="chess-mode bots" onClick={() => setScreen('bots')}>
            <span className="chess-mode-icon">🐼</span>
            <strong>Play with bots</strong>
            <small>Six animal friends, from a chick who just learned the moves to a grandmaster tiger. Pick your difficulty.</small>
            <i>Play on your own →</i>
          </button>
          <button className="chess-mode live" onClick={() => setScreen('lobby')}>
            <span className="chess-mode-icon">🌍</span>
            <strong>Play live with players</strong>
            <small>Get matched with a real player who is online right now and play a proper game, move for move.</small>
            <i>Find someone →</i>
          </button>
        </div>
      </section>

      {/* Everything a brand-new player needs, right under the two choices. */}
      <ChessGuide />
    </main>;
  }

  if (screen === 'bots') {
    return <main className="quest-pick chess-pick">
      <div className="quest-top-row"><button onClick={() => setScreen('menu')}>← Back</button><span>🤖 Choose your opponent</span></div>
      <header className="quest-header chess-header">
        <h1>Pick an animal to play</h1>
        <p>Each one plays properly — the easy ones just don't look as far ahead.</p>
      </header>
      <div className="chess-bots">
        {CHESS_BOTS.map((bot) => <div className="chess-bot-card" key={bot.id}>
          <div className="chess-bot-face">
            <img src={bot.asset} alt="" className="chess-bot-pixel" />
            <span className="chess-bot-emoji">{bot.emoji}</span>
          </div>
          <strong>{bot.name}</strong>
          <div className="chess-difficulty" aria-label={`Difficulty ${bot.difficulty} of 6`}>
            {Array.from({ length: 6 }, (_, i) => <i key={i} className={i < bot.difficulty ? 'on' : ''}>♟</i>)}
          </div>
          <em>{bot.level}</em>
          <small>{bot.blurb}</small>
          <div className="chess-bot-play">
            <button onClick={() => startBotGame(bot, 'w')}>Play as ⚪ White</button>
            <button className="as-black" onClick={() => startBotGame(bot, 'b')}>Play as ⚫ Black</button>
          </div>
        </div>)}
      </div>
    </main>;
  }

  if (screen === 'lobby') {
    return <main className="quest-pick chess-pick">
      <div className="quest-top-row"><button onClick={() => setScreen('menu')}>← Back</button><span>🌍 Live players</span></div>
      <header className="quest-header chess-header">
        <h1>Play someone live</h1>
        <p>You are in the lobby as <b>{me?.name ?? '…'}</b>. Anyone else waiting shows up here.</p>
      </header>

      <section className="quest-pick-card chess-lobby">
        {me?.guest && <label className="chess-nickname">
          <span>Your name in the lobby</span>
          <input value={nickname} maxLength={16} onChange={(e) => setNickname(e.target.value)}
            onBlur={() => { setGuestName(nickname); chessPlayer().then(setMe); }} />
        </label>}

        {seekers.length > 0 ? <>
          <h2>{seekers.length} player{seekers.length === 1 ? '' : 's'} waiting</h2>
          <div className="chess-seekers">
            {seekers.map((seeker) => <div className="chess-seeker" key={seeker.id}>
              <img src={characterAssets[seeker.character as CharacterId] ?? '/assets/pixel-fox.png'} alt="" />
              <strong>{seeker.name}</strong>
              <button disabled={!!waitingOn} onClick={() => askToPlay(seeker)}>
                {waitingOn === seeker.name ? 'Asking…' : '♟️ Play'}
              </button>
            </div>)}
          </div>
        </> : <div className="chess-nobody">
          <span>🪹</span>
          <h2>No live players yet</h2>
          <p>Nobody else is at the chess board this minute. Turn on the bell and we'll tell you the moment someone turns up looking for a game — then you can come and play.</p>
          <button
            className={`chess-alert-toggle ${alertOn ? 'on' : ''}`}
            onClick={async () => {
              const next = !alertOn;
              setAlertOn(next);
              await setChessAlertOn(next);
            }}
          >{alertOn ? '🔔 We\'ll tell you — bell is on' : '🔕 Tell me when someone wants to play'}</button>
          <small>Meanwhile, the animals are always up for a game.</small>
          <button className="chess-play-bots" onClick={() => setScreen('bots')}>🐼 Play an animal instead</button>
        </div>}

        {waitingOn && <p className="chess-waiting">⏳ Asked <b>{waitingOn}</b> for a game — waiting for them to say yes…</p>}
        {lobbyNote && <p className="chess-note">{lobbyNote}</p>}
      </section>

      {invite && <div className="chess-invite">
        <p>♟️ <strong>{invite.name}</strong> wants to play chess with you!</p>
        <div>
          <button className="yes" onClick={acceptInvite}>Play!</button>
          <button className="no" onClick={() => { lobby.current?.decline(invite.id); setInvite(null); }}>Not now</button>
        </div>
      </div>}
    </main>;
  }

  // ---- the game ----
  const botOpponent = opponent?.kind === 'bot' ? opponent.bot : null;
  return <main className="chess-page">
    <div className="quest-top-row">
      <button onClick={quitGame}>← Leave</button>
      <span>You are {myColour === 'w' ? '⚪ White' : '⚫ Black'}</span>
    </div>

    <div className="chess-table">
      <aside className="chess-player-card them">
        {botOpponent ? <>
          <div className={`chess-bot-face ${thinking ? 'thinking' : ''}`}>
            <img src={botOpponent.asset} alt="" className="chess-bot-pixel" />
            <span className="chess-bot-emoji">{botOpponent.emoji}</span>
          </div>
          <strong>{botOpponent.name}</strong>
          <em>{botOpponent.level}</em>
          {bubble && <p className="chess-bubble">{bubble}</p>}
        </> : <>
          <div className="chess-bot-face"><span className="chess-bot-emoji">🌍</span></div>
          <strong>{opponent?.kind === 'live' ? opponent.name : 'Your opponent'}</strong>
          <em>Live player</em>
        </>}
        <TakenPieces pieces={taken[myColour]} colour={myColour} />
      </aside>

      <div className="chess-board-wrap">
        <ChessBoard
          state={state}
          flipped={myColour === 'b'}
          selected={selected}
          moves={moves}
          lastMove={lastMove}
          checkSquare={checkSquare}
          onPick={pick}
          frozen={!myTurn}
        />
        <p className={`chess-status ${gameOver ? 'over' : ''}`}>{statusLine()}</p>
        {promoting && <PromotionPicker colour={myColour} onPick={finishPromotion} />}
      </div>

      <aside className="chess-side">
        <div className="chess-moves">
          <strong>Moves</strong>
          <ol>
            {history.map((entry, i) => <li key={i} className={entry.colour === 'w' ? 'white-move' : 'black-move'}>{entry.text}</li>)}
          </ol>
        </div>
        <TakenPieces pieces={taken[other(myColour)]} colour={other(myColour)} />
        {!gameOver && <div className="chess-actions">
          <button onClick={resign}>🏳️ Resign</button>
          {opponent?.kind === 'live' && <button onClick={() => match.current?.offerDraw()}>🤝 Offer a draw</button>}
        </div>}
        {gameOver && <div className="chess-actions">
          {botOpponent && <button className="again" onClick={() => startBotGame(botOpponent, myColour)}>↻ Play again</button>}
          <button onClick={quitGame}>Choose another opponent</button>
        </div>}
      </aside>
    </div>

    {drawOffer && <div className="chess-invite">
      <p>🤝 They are offering a draw.</p>
      <div>
        <button className="yes" onClick={() => { match.current?.acceptDraw(); setDrawOffer(false); setEnded({ text: 'You both agreed a draw. 🤝', won: null }); }}>Accept</button>
        <button className="no" onClick={() => setDrawOffer(false)}>Play on</button>
      </div>
    </div>}
  </main>;
}
