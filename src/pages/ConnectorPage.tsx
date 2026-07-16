import { useEffect, useRef, useState } from 'react';
import { ConnectorEngine, type ConnectorSnapshot } from '../game/connectorEngine';

interface ConnectorPageProps {
  onScore: (points: number) => void;
  onBack: () => void;
}

export function ConnectorPage({ onScore, onBack }: ConnectorPageProps) {
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<ConnectorSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ConnectorEngine | null>(null);
  const score = useRef(onScore);
  score.current = onScore;

  useEffect(() => {
    if (!canvas.current) return;
    const created = new ConnectorEngine(canvas.current, {
      best,
      onUpdate: setSnapshot,
      onScore: (points) => score.current(points),
    });
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (snapshot && snapshot.best > best) setBest(snapshot.best);
  }, [snapshot, best]);

  const over = snapshot?.status === 'over';
  const linking = (snapshot?.chain ?? 0) >= 2;

  return <main className="connector-page">
    <header className="connector-header">
      <button className="connector-back" onClick={onBack}>←</button>
      <h1>Connector</h1>
      <div className="connector-pills">
        <div className="connector-pill"><small>Score</small><b>{snapshot?.score ?? 0}</b></div>
        <div className="connector-pill"><small>Best</small><b>{Math.max(best, snapshot?.best ?? 0)}</b></div>
      </div>
      <button className="connector-new" onClick={() => engine.current?.newGame()}>New Game</button>
    </header>

    <p className={`connector-live ${linking ? 'on' : ''}`}>
      {linking ? <span><b>+{snapshot?.chainSum}</b> makes <b>{snapshot?.chainResult}</b></span> : <span>Swipe across blocks with the same number to connect them</span>}
    </p>

    <div className="connector-stage">
      <canvas className="connector-canvas" ref={canvas} />
      {over && <div className="quest-over">
        <div className="quest-over-card">
          <h2>🔢 No moves left!</h2>
          <p>You scored <strong>{snapshot.score}</strong>. Your best is <strong>{Math.max(best, snapshot.best)}</strong>.</p>
          <button onClick={() => engine.current?.newGame()}>New Game</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <div className="connector-tools">
      <button onClick={() => engine.current?.undo()} disabled={!snapshot?.canUndo} title="Undo the last move">↩ Undo</button>
      <button onClick={() => engine.current?.newGame()} title="Start a fresh board">🔄 New Game</button>
    </div>

    <p className="connector-help">Connect two or more of the <b>same</b> number — up, down, sideways or diagonal. They merge into the next number up, and your score is the sum of every block you connect.</p>
  </main>;
}
