import { useEffect, useRef, useState } from 'react';
import { BlockUpEngine, type BlockUpSnapshot } from '../game/blockUpEngine';

interface BlockUpPageProps {
  onScore: (points: number) => void;
  onBack: () => void;
}

export function BlockUpPage({ onScore, onBack }: BlockUpPageProps) {
  const [snapshot, setSnapshot] = useState<BlockUpSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<BlockUpEngine | null>(null);
  const score = useRef(onScore);
  score.current = onScore;

  useEffect(() => {
    if (!canvas.current) return;
    const created = new BlockUpEngine(canvas.current, {
      onUpdate: setSnapshot,
      onScore: (points) => score.current(points),
    });
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
  }, []);

  const over = snapshot?.status === 'over';
  const lines = snapshot?.lines ?? 0;
  const combo = snapshot?.combo ?? 0;

  return <main className="blockup-page">
    <header className="blockup-header">
      <button className="blockup-back" onClick={onBack}>←</button>
      <h1>Block Up</h1>
      <div className="blockup-pills">
        <div className="blockup-pill"><small>Score</small><b>{snapshot?.score ?? 0}</b></div>
        <div className="blockup-pill"><small>Best</small><b>{snapshot?.best ?? 0}</b></div>
      </div>
      <button className="blockup-new" onClick={() => engine.current?.newGame()}>New Game</button>
    </header>

    <p className={`blockup-live ${lines > 0 ? 'on' : ''}`}>
      {lines > 0
        ? <span>✨ <b>{lines}</b> {lines === 1 ? 'line' : 'lines'} cleared!{combo > 1 && <> <b>Combo ×{combo}</b></>}</span>
        : <span>Drag the blocks onto the board. Fill a whole row or column to clear it!</span>}
    </p>

    <div className="blockup-stage">
      <canvas className="blockup-canvas" ref={canvas} />
      {over && <div className="quest-over">
        <div className="quest-over-card">
          <h2>🧱 No room left!</h2>
          <p>You scored <strong>{snapshot.score}</strong>. Your best is <strong>{snapshot.best}</strong>.</p>
          <button onClick={() => engine.current?.newGame()}>New Game</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <p className="blockup-help">Clear rows and columns to score. Clear <b>two or more at once</b> for a big combo bonus. The game ends when none of your three blocks can fit.</p>
  </main>;
}
