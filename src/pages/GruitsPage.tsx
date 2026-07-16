import { useEffect, useRef, useState } from 'react';
import { GruitsEngine, type GruitsSnapshot } from '../game/gruitsEngine';
import { BIGGEST, gruits } from '../game/gruits';

interface GruitsPageProps {
  onScore: (points: number) => void;
  onBack: () => void;
}

export function GruitsPage({ onScore, onBack }: GruitsPageProps) {
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<GruitsSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const score = useRef(onScore);
  score.current = onScore;

  useEffect(() => {
    if (!canvas.current) return;
    const created = new GruitsEngine(canvas.current, {
      best,
      onUpdate: setSnapshot,
      onScore: (points) => score.current(points),
    });
    return () => created.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    if (snapshot && snapshot.best > best) setBest(snapshot.best);
  }, [snapshot, best]);

  const over = snapshot?.status === 'over';
  const next = gruits[snapshot?.next ?? 0];
  const biggest = gruits[snapshot?.biggest ?? 0];

  return <main className="gruits-page">
    <div className="quest-top-row">
      <button onClick={onBack}>← Back</button>
      <span>🍓 Fruit</span>
    </div>

    <div className="gruits-layout">
      <aside className="gruits-side">
        <div className="gruits-score">
          <small>Score</small>
          <b>{snapshot?.score ?? 0}</b>
          <i>best {Math.max(best, snapshot?.best ?? 0)}</i>
        </div>
        <div className="gruits-next">
          <small>Next</small>
          <span>{next.icon}</span>
          <i>{next.name}</i>
        </div>
        <div className="gruits-next">
          <small>Biggest</small>
          <span>{biggest.icon}</span>
          <i>{biggest.name}</i>
        </div>
        <div className="gruits-danger" aria-label="How full the cup is">
          <small>Cup</small>
          <div><i style={{ height: `${Math.round((snapshot?.danger ?? 0) * 100)}%` }} /></div>
        </div>
      </aside>

      <div className="gruits-stage">
        <canvas className="gruits-canvas" ref={canvas} />
        {snapshot?.message && <p className="gruits-message">{snapshot.message}</p>}
        {over && <div className="quest-over">
          <div className="quest-over-card">
            <h2>🥣 Cup overflowed!</h2>
            <p>You scored <strong>{snapshot.score}</strong> and grew a <strong>{biggest.icon} {biggest.name}</strong>. Your best is <strong>{Math.max(best, snapshot.best)}</strong>.</p>
            <button onClick={() => { setSnapshot(null); setRound((n) => n + 1); }}>Play again</button>
            <button className="ghost" onClick={onBack}>Leave</button>
          </div>
        </div>}
      </div>
    </div>

    <p className="gruits-help"><b>← →</b> or move your mouse to aim · <b>Space</b> or click to drop · match two the same to merge them</p>

    <section className="gruits-ladder">
      <p className="card-kicker">The merge ladder — two of the same make the next one</p>
      <div className="ladder-strip">
        {gruits.map((gruit, index) => <span key={gruit.tier} className={(snapshot?.biggest ?? 0) >= gruit.tier ? 'got' : ''} title={gruit.name}>
          {gruit.icon}{index < BIGGEST && <i>›</i>}
        </span>)}
      </div>
    </section>
  </main>;
}
