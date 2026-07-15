import { useEffect, useRef, useState } from 'react';
import { MedicineEngine, type MedicineSnapshot } from '../game/medicineEngine';
import { HEAL_PRIZE, MISSION_SECONDS, herbById, herbs, rivalHealers } from '../game/medicine';

interface MedicineMissionPageProps {
  islandName: string;
  onWin: (coins: number) => void;
  onBack: () => void;
}

export function MedicineMissionPage({ islandName, onWin, onBack }: MedicineMissionPageProps) {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<MedicineSnapshot | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const paid = useRef(false);
  const update = useRef<(s: MedicineSnapshot) => void>(() => undefined);
  update.current = (next) => {
    setSnapshot(next);
    if (next.status === 'done' && next.won && !paid.current) { paid.current = true; onWin(HEAL_PRIZE); }
  };

  useEffect(() => {
    if (!started || !mount.current) return;
    const created = new MedicineEngine(mount.current, {
      seed: 500 + round * 13,
      onUpdate: (next) => update.current(next),
    });
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); };
  }, [started, round]);

  const playAgain = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!started) {
    return <main className="quest-pick medicine-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>⛑️ {islandName}</span></div>
      <header className="quest-header medicine-header">
        <p className="eyebrow">A healing quest · {islandName}</p>
        <h1><span>🌿</span> Medicine Mission <span>🌿</span></h1>
        <p>Find the herbs. Save lives.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">How it works</p>
        <h2>You are the medicine cat</h2>
        <p>A hurt cat is waiting at the <strong>⛑️ camp</strong>. Each one needs <strong>3 herbs</strong>. Run into the forest, pick the right herbs off your list, then race back to camp to heal them. You have <strong>{MISSION_SECONDS} seconds</strong> — save more lives than every other medicine cat to win <strong>+{HEAL_PRIZE} gold coins</strong>.</p>
        <div className="herb-guide">
          {herbs.map((herb) => <div className="herb-chip" key={herb.id}>
            <span>{herb.icon}</span>
            <strong>{herb.name}</strong>
            <small>{herb.cures}</small>
          </div>)}
        </div>
        <p className="quest-hint">You are racing {rivalHealers.map((r) => `${r.icon} ${r.name}`).join(' and ')}. Watch out — not every herb in the forest is on your list!</p>
        <button className="profile-start" onClick={() => setStarted(true)}>Start healing <span>→</span></button>
      </section>
    </main>;
  }

  const done = snapshot?.status === 'done';
  return <main className="quest-page">
    <div className="quest-stage">
      <div className="quest-canvas" ref={mount} />

      <div className="quest-hud">
        <div className="quest-day"><strong>⏳ {snapshot?.secondsLeft ?? MISSION_SECONDS}s left</strong><small>💚 {snapshot?.saved ?? 0} lives saved</small></div>
        <div className="herb-list">
          <small>{snapshot?.patient.icon} {snapshot?.patient.name} {snapshot?.patient.hurt}</small>
          <div>{(snapshot?.list ?? []).map((item) => <b className={item.got ? 'got' : ''} key={item.id} title={herbById(item.id)?.name}>
            {herbById(item.id)?.icon} {herbById(item.id)?.name} {item.got ? '✓' : ''}
          </b>)}</div>
        </div>
        <div className="quest-alive">
          <strong>🐈 Other healers</strong>
          {(snapshot?.rivals ?? []).map((rival) => <small key={rival.name}>{rival.icon} {rival.name}: {rival.saved}</small>)}
        </div>
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.atCamp && !done && <p className="camp-banner">⛑️ You are at camp</p>}
      {snapshot?.message && <p className="quest-message">{snapshot.message}</p>}
      {!done && <p className="quest-help">Click the forest to look around · <b>W A S D</b> move · <b>Space</b> jump · walk over a herb to pick it · <b>F</b> first person</p>}

      {done && <div className="quest-over">
        <div className={`quest-over-card ${snapshot.won ? 'win' : ''}`}>
          <h2>{snapshot.won ? '🏆 Best medicine cat!' : '⏳ Time is up'}</h2>
          <p>You saved <strong>{snapshot.saved} {snapshot.saved === 1 ? 'life' : 'lives'}</strong>. {snapshot.rivals.map((r) => `${r.name} saved ${r.saved}`).join(', ')}.</p>
          {snapshot.won
            ? <p>You saved the most lives of any medicine cat — you earned <strong>+{HEAL_PRIZE} gold coins</strong>!</p>
            : <p>Save more lives than every other healer to win the +{HEAL_PRIZE} gold prize.</p>}
          <button onClick={playAgain}>Play again</button>
          <button className="ghost" onClick={onBack}>Leave camp</button>
        </div>
      </div>}
    </div>
  </main>;
}
