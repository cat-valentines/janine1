import { useEffect, useState } from 'react';
import { chessAlertOn, notifyOutsideApp, watchChessLobby } from '../lib/chessAlert';
import { chessPlayer } from '../lib/chessPlayer';
import { navigate, useRoute } from '../lib/router';
import { sfx } from '../lib/sfx';

/**
 * The chess bell, mounted once at the app root.
 *
 * If a player asked to be told when someone wants a live game, this keeps an ear
 * on the lobby wherever they are in the app — and pops up a banner (plus a real
 * browser notification, if they allowed one) so they can go and play.
 *
 * It stays quiet while they are already at the chess board: they can see the
 * lobby for themselves there.
 */
export function ChessCallCenter() {
  const path = useRoute();
  const [caller, setCaller] = useState<string | null>(null);
  const atChess = path === '/play/chess';

  useEffect(() => {
    if (atChess || !chessAlertOn()) { setCaller(null); return; }
    let stop: (() => void) | null = null;
    let dead = false;
    chessPlayer().then((me) => {
      if (dead) return;
      stop = watchChessLobby(me.id, (name) => {
        setCaller(name);
        sfx('follow');
        notifyOutsideApp('♟️ Someone wants to play chess!', `${name} is waiting at the chess board. Tap to play them.`);
      });
    });
    return () => { dead = true; stop?.(); };
  }, [atChess, path]);

  if (!caller || atChess) return null;

  return (
    <div className="chess-call">
      <span className="chess-call-icon">♟️</span>
      <div>
        <strong>{caller} wants to play chess!</strong>
        <small>They're waiting at the board right now.</small>
      </div>
      <button className="go" onClick={() => { setCaller(null); navigate('/play/chess'); }}>Play them</button>
      <button className="shut" aria-label="Dismiss" onClick={() => setCaller(null)}>✕</button>
    </div>
  );
}
