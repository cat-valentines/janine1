import { useEffect, useRef, useState } from 'react';
import { FrictionEngine, type FrictionSnapshot } from '../game/frictionEngine';
import { KeyPad } from '../components/KeyPad';
import { storage } from '../lib/storage';

const MAX_KEY = 'frictionMax';   // highest level number the player has reached

export function FrictionPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [snap, setSnap] = useState<FrictionSnapshot | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [maxLevel, setMaxLevel] = useState(() => Math.max(1, Number(storage.get(MAX_KEY) || 1)));
  const mount = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FrictionEngine | null>(null);
  const maxRef = useRef(maxLevel);
  const update = useRef<(s: FrictionSnapshot) => void>(() => undefined);
  update.current = (s) => {
    setSnap(s);
    if (s.level > maxRef.current) {         // cleared a new level → unlock + reward
      maxRef.current = s.level;
      setMaxLevel(s.level);
      storage.set(MAX_KEY, String(s.level));
      onScore(1);
    }
  };

  useEffect(() => {
    if (!mount.current) return;
    const created = new FrictionEngine(mount.current, { onUpdate: (s) => update.current(s) });
    created.onComplete((coins) => onScore(coins));
    created.goto(maxRef.current - 1);       // resume at the furthest level reached
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ice = snap?.mode === 'ice';
  const done = snap?.status === 'complete';
  const total = snap?.total ?? 100;

  const jumpTo = (n: number) => { engine.current?.goto(n - 1); setLevelsOpen(false); };

  return <main className="fric-page">
    <header className="fric-top">
      <button onClick={onBack}>← Leave</button>
      <span>🧊 Slip &amp; Grip · Level {snap?.level ?? 1}/{total}</span>
      <button className="fric-levels-btn" onClick={() => setLevelsOpen(true)}>☰ Levels</button>
    </header>

    <p className="fric-hint"><b>{snap?.title}</b> — {snap?.hint}</p>

    <div className="fric-stage">
      <canvas className="fric-canvas" ref={mount} />
    </div>

    <div className="fric-controls">
      <button className={`fric-mode ${ice ? 'ice' : 'grip'}`} onClick={() => engine.current?.toggle()}>
        <b>{ice ? '🧊 ICE' : '🟪 GRIP'}</b>
        <small>{ice ? 'slides & glides — tap for grip' : 'steers & stops — tap for ice'}</small>
      </button>
      <button className="fric-restart" onClick={() => engine.current?.restart()}>↻ Retry</button>
    </div>

    <KeyPad dirs={['left', 'right']} actions={[{ codes: ['Space'], label: '⤴ Jump' }]} />

    {levelsOpen && <div className="quest-over" onClick={() => setLevelsOpen(false)}>
      <div className="fric-levelsel" onClick={(e) => e.stopPropagation()}>
        <h2>Pick a level</h2>
        <p className="fric-levelsel-sub">Unlocked: {maxLevel} / {total}</p>
        <div className="fric-levelgrid">
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const locked = n > maxLevel;
            return <button key={n} className={`fric-lvlbtn ${n === snap?.level ? 'on' : ''} ${locked ? 'locked' : ''}`}
              disabled={locked} onClick={() => jumpTo(n)}>{locked ? '🔒' : n}</button>;
          })}
        </div>
        <button className="fric-close" onClick={() => setLevelsOpen(false)}>Close</button>
      </div>
    </div>}

    {done && <div className="quest-over">
      <div className="quest-over-card win">
        <h2>🏆 Friction master!</h2>
        <p>You cleared all {total} levels of Slip &amp; Grip! You truly learned how <strong>ice slides</strong> and <strong>grip grips</strong>. You earned a big pile of gold coins!</p>
        <button onClick={() => engine.current?.replayAll()}>Play again</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
