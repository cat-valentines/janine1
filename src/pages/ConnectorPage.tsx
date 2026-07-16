import { useEffect, useRef, useState } from 'react';
import { ConnectorEngine, type ConnectorSnapshot } from '../game/connectorEngine';

interface ConnectorPageProps {
  onScore: (points: number) => void;
  onBack: () => void;
}

export function ConnectorPage({ onScore, onBack }: ConnectorPageProps) {
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<ConnectorSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const score = useRef(onScore);
  score.current = onScore;

  useEffect(() => {
    if (!canvas.current) return;
    const created = new ConnectorEngine(canvas.current, {
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
  const linking = (snapshot?.chain ?? 0) >= 2;

  return <main className="connector-page">
    <div className="quest-top-row">
      <button onClick={onBack}>← Back</button>
      <span>🔢 Connector</span>
    </div>

    <div className="connector-hud">
      <div className="connector-score"><small>Score</small><b>{snapshot?.score ?? 0}</b></div>
      <div className="connector-chip"><small>Best</small><b>{Math.max(best, snapshot?.best ?? 0)}</b></div>
      <div className={`connector-live ${linking ? 'on' : ''}`}>
        {linking ? <><b>+{snapshot?.chainSum}</b><span>makes {snapshot?.chainResult}</span></> : <span>Swipe to connect →</span>}
      </div>
    </div>

    <div className="connector-stage">
      <canvas className="connector-canvas" ref={canvas} />
      {over && <div className="quest-over">
        <div className="quest-over-card">
          <h2>🔢 No moves left!</h2>
          <p>You scored <strong>{snapshot.score}</strong>. Your best is <strong>{Math.max(best, snapshot.best)}</strong>.</p>
          <button onClick={() => { setSnapshot(null); setRound((n) => n + 1); }}>Play again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <p className="connector-help">Swipe across blocks in any direction — up, down, sideways or diagonal — to connect two or more with the <b>same</b> number. They merge into the next number up.</p>
  </main>;
}
