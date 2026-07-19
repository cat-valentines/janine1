import { useEffect, useRef, useState } from 'react';
import { FrictionEngine, type FrictionSnapshot } from '../game/frictionEngine';
import { KeyPad } from '../components/KeyPad';

export function FrictionPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [snap, setSnap] = useState<FrictionSnapshot | null>(null);
  const mount = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FrictionEngine | null>(null);
  const update = useRef<(s: FrictionSnapshot) => void>(() => undefined);
  update.current = (s) => setSnap(s);

  useEffect(() => {
    if (!mount.current) return;
    const created = new FrictionEngine(mount.current, { onUpdate: (s) => update.current(s) });
    created.onComplete((coins) => onScore(coins));
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ice = snap?.mode === 'ice';
  const done = snap?.status === 'complete';

  return <main className="fric-page">
    <header className="fric-top">
      <button onClick={onBack}>← Leave</button>
      <span>🧊 Slip &amp; Grip · Level {snap?.level ?? 1}/{snap?.total ?? 4}</span>
      <b>{snap?.title ?? ''}</b>
    </header>

    <p className="fric-hint">{snap?.hint}</p>

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

    {done && <div className="quest-over">
      <div className="quest-over-card win">
        <h2>🏆 Friction master!</h2>
        <p>You cleared all {snap?.total} levels{typeof snap?.deaths === 'number' ? <> with <strong>{snap.deaths}</strong> {snap.deaths === 1 ? 'wipeout' : 'wipeouts'}</> : ''}. You learned how <strong>ice slides</strong> and <strong>grip grips</strong>! You earned some gold coins.</p>
        <button onClick={() => { engine.current?.replayAll(); }}>Play again</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
