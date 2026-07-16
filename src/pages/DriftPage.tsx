import { useEffect, useRef, useState } from 'react';
import { DriftEngine, type DriftSnapshot } from '../game/driftEngine';
import { SESSION_SECONDS } from '../game/drift';

interface DriftPageProps {
  onCoin: () => void;
  onBack: () => void;
}

export function DriftPage({ onCoin, onBack }: DriftPageProps) {
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<DriftSnapshot | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const coin = useRef(onCoin);
  coin.current = onCoin;

  useEffect(() => {
    if (!mount.current) return;
    const created = new DriftEngine(mount.current, {
      best,
      onUpdate: setSnapshot,
      onCoin: () => coin.current(),
    });
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    if (snapshot && snapshot.best > best) setBest(snapshot.best);
  }, [snapshot, best]);

  const over = snapshot?.status === 'over';
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  return <main className="drift-page">
    <div className="drift-stage">
      <div className="drift-canvas" ref={mount} />

      <div className="drift-hud">
        <div className="drift-score"><small>Score</small><b>{snapshot?.score ?? 0}</b></div>
        <div className="drift-chip"><small>Coins</small><b>🪙 {snapshot?.coins ?? 0}</b></div>
        <div className="drift-chip"><small>Time</small><b>{snapshot?.timeLeft ?? SESSION_SECONDS}s</b></div>
        <div className={`drift-chip speed ${(snapshot?.speed ?? 0) > 90 ? 'fast' : ''}`}><small>Speed</small><b>{snapshot?.speed ?? 0}</b></div>
      </div>

      {snapshot?.drifting && <div className="drift-flash">DRIFT <span>×{snapshot.multiplier.toFixed(1)}</span></div>}

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      <p className="drift-help"><b>↑</b> go · <b>↓</b> brake / reverse · <b>← →</b> steer · <b>Space</b> handbrake to drift</p>

      {over && <div className="quest-over">
        <div className="quest-over-card win">
          <h2>🏁 Time's up!</h2>
          <p>You scored <strong>{snapshot.score}</strong> and grabbed <strong>🪙 {snapshot.coins} coins</strong>. Your best is <strong>{Math.max(best, snapshot.best)}</strong>.</p>
          <button onClick={() => { setSnapshot(null); setRound((n) => n + 1); }}>Drive again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>
  </main>;
}
