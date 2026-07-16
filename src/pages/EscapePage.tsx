import { useEffect, useRef, useState } from 'react';
import { MansionEngine, type MansionSnapshot } from '../game/mansionEngine';
import { KEYS_TO_ESCAPE } from '../game/mansion';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';

interface EscapePageProps {
  character: CharacterId;
  onEscape: (coins: number) => void;
  onBack: () => void;
}

const ESCAPE_PRIZE = 40;

export function EscapePage({ character, onEscape, onBack }: EscapePageProps) {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<MansionSnapshot | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const paid = useRef(false);
  const update = useRef<(s: MansionSnapshot) => void>(() => undefined);
  update.current = (next) => {
    setSnapshot(next);
    if (next.status === 'escaped' && !paid.current) { paid.current = true; onEscape(ESCAPE_PRIZE); }
  };

  useEffect(() => {
    if (!started || !mount.current) return;
    const created = new MansionEngine(mount.current, {
      characterAsset: characterAssets[character],
      onUpdate: (next) => update.current(next),
    });
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); };
  }, [started, round, character]);

  const again = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!started) {
    return <main className="quest-pick escape-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🔦 Can you get out?</span></div>
      <header className="quest-header escape-header">
        <p className="eyebrow">A creepy escape game</p>
        <h1><span>🏚️</span> The Housekeeper <span>🔦</span></h1>
        <p>You are locked in her house. She is already walking the halls.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">How to get out</p>
        <h2>Find {KEYS_TO_ESCAPE} keys. Reach the door. Don't get caught.</h2>
        <div className="escape-rules">
          <div><span>🔑</span><strong>Find the keys</strong><small>{KEYS_TO_ESCAPE} of them are hidden around the house. The front door will not open without all of them.</small></div>
          <div><span>🚪</span><strong>Get to the door</strong><small>It glows faintly. Stand at it and press Space once you have every key.</small></div>
          <div><span>🚪</span><strong>Hide in a wardrobe</strong><small>Press Space at a wardrobe to climb in. She cannot see you in there.</small></div>
          <div><span>🤫</span><strong>Sneak</strong><small>Hold Shift to walk quietly. Running is loud — she can hear it through walls.</small></div>
        </div>
        <p className="quest-hint">She patrols the whole house. If she spots you she will chase, and she keeps searching for a while after she loses you.</p>
        <button className="escape-start" onClick={() => setStarted(true)}>🔦 Go inside</button>
      </section>
    </main>;
  }

  const caught = snapshot?.status === 'caught';
  const escaped = snapshot?.status === 'escaped';

  return <main className="escape-page">
    <div className={`escape-stage ${snapshot?.keeperState === 'chase' ? 'chased' : ''}`}>
      <div className="escape-canvas" ref={mount} />

      <div className="escape-hud">
        <div className="escape-keys">
          {Array.from({ length: KEYS_TO_ESCAPE }, (_, i) => <b className={i < (snapshot?.keys ?? 0) ? 'got' : ''} key={i}>🔑</b>)}
        </div>
        <div className="escape-state">
          <strong>{snapshot?.hidden ? '🤫 Hidden' : snapshot?.keeperState === 'chase' ? '🏃 She sees you!' : snapshot?.keeperState === 'search' ? '👀 She is looking' : '🚶 She is patrolling'}</strong>
          <i className="escape-alarm"><s style={{ width: `${Math.round((snapshot?.alarm ?? 0) * 100)}%` }} /></i>
        </div>
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="escape-message">{snapshot.message}</p>}
      {snapshot?.status === 'playing' && <p className="escape-help">
        <b>↑ ↓</b> walk · <b>← →</b> turn · <b>Shift</b> sneak · <b>Space</b> {snapshot.nearHide ? 'hide in the wardrobe' : snapshot.nearDoor ? 'open the door' : 'hide / open doors'}
      </p>}

      {caught && <div className="quest-over">
        <div className="quest-over-card">
          <h2>🖐️ She caught you!</h2>
          <p>You found {snapshot.keys} of {KEYS_TO_ESCAPE} keys. Next time, hide when you hear her coming.</p>
          <button onClick={again}>Try again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}

      {escaped && <div className="quest-over">
        <div className="quest-over-card win">
          <h2>🚪 You escaped!</h2>
          <p>You found every key and got out of the house. You earned <strong>+{ESCAPE_PRIZE} gold coins</strong>.</p>
          <button onClick={again}>Play again</button>
          <button className="ghost" onClick={onBack}>Spend my coins</button>
        </div>
      </div>}
    </div>
  </main>;
}
