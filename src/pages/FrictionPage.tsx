import { useEffect, useRef, useState } from 'react';
import { FrictionEngine, type FrictionSnapshot } from '../game/frictionEngine';
import { TOTAL_LEVELS } from '../game/frictionGen';
import { KeyPad } from '../components/KeyPad';
import { storage } from '../lib/storage';

const MAX_KEY = 'frictionMax';   // highest level number the player has reached

export function FrictionPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [snap, setSnap] = useState<FrictionSnapshot | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [jump, setJump] = useState('');
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
  const total = snap?.total ?? TOTAL_LEVELS;

  const jumpTo = (n: number) => { engine.current?.goto(n - 1); setLevelsOpen(false); };
  const goToTyped = () => { const n = Math.floor(Number(jump)); if (n >= 1 && n <= maxLevel) { jumpTo(n); setJump(''); } };
  // Only render a window of the most recent unlocked levels — 5000 buttons would be far too many.
  const WINDOW = 120;
  const winStart = Math.max(1, maxLevel - WINDOW + 1);

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
        <p className="fric-levelsel-sub">Unlocked: {maxLevel} / {total.toLocaleString()}</p>
        <div className="fric-jump">
          <input type="number" min={1} max={maxLevel} value={jump} placeholder={`Level 1–${maxLevel}`}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') goToTyped(); }} />
          <button onClick={goToTyped}>Go</button>
        </div>
        <div className="fric-levelgrid">
          {winStart > 1 && <><button className="fric-lvlbtn" onClick={() => jumpTo(1)}>1</button><span className="fric-ellipsis">…</span></>}
          {Array.from({ length: maxLevel - winStart + 1 }, (_, i) => {
            const n = winStart + i;
            return <button key={n} className={`fric-lvlbtn ${n === snap?.level ? 'on' : ''}`} onClick={() => jumpTo(n)}>{n}</button>;
          })}
        </div>
        <p className="fric-levelsel-hint">Type any number up to {maxLevel} to jump there. Clear levels to unlock more — all the way to {total.toLocaleString()}!</p>
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
