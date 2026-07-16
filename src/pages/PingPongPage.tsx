import { useEffect, useRef, useState } from 'react';
import { PongEngine, type PongSnapshot } from '../game/pongEngine';
import { WIN_SCORE, modeById, pongModes, type PongMode } from '../game/pong';
import { characterAssets } from '../game/characters';
import { supabase } from '../lib/supabase';
import type { CharacterId } from '../game/types';

interface PingPongPageProps {
  character: CharacterId;
  onInvite: () => void;
  inviteLink: string;
  onBack: () => void;
}

export function PingPongPage({ character, onInvite, inviteLink, onBack }: PingPongPageProps) {
  const [mode, setMode] = useState<PongMode | null>(null);
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<PongSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [myName, setMyName] = useState('You');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const n = data.user?.user_metadata.display_name as string | undefined; if (n) setMyName(n); }); }, []);

  useEffect(() => {
    if (!mode || !canvas.current) return;
    const created = new PongEngine(canvas.current, {
      mode,
      best,
      characterAsset: characterAssets[character],
      myName,
      onUpdate: setSnapshot,
    });
    return () => created.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, round, character, myName]);

  useEffect(() => {
    if (snapshot && snapshot.best > best) setBest(snapshot.best);
  }, [snapshot, best]);

  if (!mode) {
    return <main className="quest-pick pong-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🏓 Three ways to play</span></div>
      <header className="quest-header pong-header">
        <p className="eyebrow">Bat, ball and a table</p>
        <h1><span>🏓</span> Ping Pong <span>🏓</span></h1>
        <p>Move with the arrow keys. Hit with the space bar.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">Step 1 of 1</p>
        <h2>How do you want to play?</h2>
        <div className="pong-modes">
          {pongModes.map((item) => <button className="pong-mode" key={item.id} onClick={() => setMode(item.id)}>
            <span>{item.icon}</span>
            <strong>{item.name}</strong>
            <small>{item.blurb}</small>
            <i>{item.controls}</i>
          </button>)}
        </div>
      </section>
    </main>;
  }

  const info = modeById(mode);
  const over = snapshot?.status === 'over';

  return <main className="pong-page">
    <div className="quest-top-row">
      <button onClick={() => setMode(null)}>← Modes</button>
      <span>{info.icon} {info.name}</span>
    </div>

    <div className="pong-stage">
      <canvas className="pong-canvas" ref={canvas} />

      <div className="pong-hud">
        {mode === 'solo'
          ? <><b>🏓 {snapshot?.rally ?? 0} in a row</b><b>⭐ best {best}</b></>
          : <><b>{mode === 'friend' ? '🙂 P1' : '🙂 You'} {snapshot?.you ?? 0}</b><b>{mode === 'friend' ? '🙃 P2' : '🤖 Bot'} {snapshot?.them ?? 0}</b><b>first to {WIN_SCORE}</b></>}
      </div>

      {snapshot?.message && <p className="pong-message">{snapshot.message}</p>}

      {over && <div className="quest-over">
        <div className={`quest-over-card ${snapshot.winner === 'you' || mode === 'solo' ? 'win' : ''}`}>
          <h2>{mode === 'solo' ? `🏓 ${snapshot.rally} hits!` : snapshot.winner === 'you' ? '🏆 You win!' : mode === 'friend' ? '🏆 Player 2 wins!' : '🤖 The bot wins!'}</h2>
          {mode === 'solo'
            ? <p>You kept the ball up <strong>{snapshot.rally}</strong> times. Your best is <strong>{best}</strong>.</p>
            : <p>Final score: <strong>{snapshot.you} — {snapshot.them}</strong>.</p>}
          <button onClick={() => setRound((n) => n + 1)}>Play again</button>
          <button className="ghost" onClick={() => setMode(null)}>Change mode</button>
        </div>
      </div>}
    </div>

    <p className="pong-help">{info.controls}</p>

    {mode === 'friend' && <div className="pong-invite">
      <p>Playing together on one keyboard. Want them to have their own copy of the game?</p>
      <button onClick={onInvite}>🔗 Make an invite link</button>
      {inviteLink && <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />}
    </div>}
  </main>;
}
