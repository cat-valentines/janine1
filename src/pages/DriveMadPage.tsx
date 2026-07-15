import { useEffect, useRef, useState } from 'react';
import { DriveEngine, type DriveSnapshot } from '../game/driveEngine';
import { driveLevels, truckColours, type TruckColour } from '../game/drive';

interface DriveMadPageProps {
  onCoin: () => void;
  onBack: () => void;
}

export function DriveMadPage({ onCoin, onBack }: DriveMadPageProps) {
  const [truck, setTruck] = useState<TruckColour | null>(null);
  const [level, setLevel] = useState(1);
  const [round, setRound] = useState(1);
  const [beaten, setBeaten] = useState<number[]>([]);
  const [snapshot, setSnapshot] = useState<DriveSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<DriveEngine | null>(null);
  const coin = useRef(onCoin);
  coin.current = onCoin;

  useEffect(() => {
    if (!truck || !canvas.current) return;
    const chosen = driveLevels.find((item) => item.id === level) ?? driveLevels[0];
    const created = new DriveEngine(canvas.current, {
      level: chosen,
      truck: truck.id,
      onUpdate: setSnapshot,
      onCoin: () => coin.current(),
    });
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
  }, [truck, level, round]);

  useEffect(() => {
    if (snapshot?.status === 'won' && !beaten.includes(snapshot.level)) setBeaten((list) => [...list, snapshot.level]);
  }, [snapshot, beaten]);

  const retry = () => { setSnapshot(null); setRound((n) => n + 1); };
  const goLevel = (id: number) => { setSnapshot(null); setLevel(id); setRound((n) => n + 1); };
  const hold = (which: 'gas' | 'brake', on: boolean) => engine.current?.setTouch(which, on);

  if (!truck) {
    return <main className="quest-pick drive-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🚚 4 levels</span></div>
      <header className="quest-header drive-header">
        <p className="eyebrow">A driving challenge</p>
        <h1><span>🚚</span> Truck Trouble <span>🚚</span></h1>
        <p>Drive fast. Drive careful. Don't flip!</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">Step 1 of 1</p>
        <h2>Choose a truck colour</h2>
        <p>Use the <strong>← →</strong> arrow keys (or the buttons on your phone) to drive. In the air the arrows tip your truck — land flat or you crash. Grab the <strong>gold coins</strong> along the way and keep them.</p>
        <div className="truck-grid">
          {truckColours.map((item) => <button className="truck-card" key={item.id} onClick={() => setTruck(item)}>
            <svg viewBox="0 0 90 50" aria-hidden="true">
              <rect x="12" y="20" width="62" height="18" rx="3" fill={item.body} />
              <rect x="12" y="32" width="62" height="6" rx="2" fill={item.dark} />
              <rect x="48" y="8" width="24" height="14" rx="3" fill={item.body} />
              <rect x="53" y="11" width="14" height="8" rx="2" fill={item.trim} />
              <circle cx="26" cy="40" r="9" fill="#2f2a30" />
              <circle cx="26" cy="40" r="4" fill={item.trim} />
              <circle cx="64" cy="40" r="9" fill="#2f2a30" />
              <circle cx="64" cy="40" r="4" fill={item.trim} />
            </svg>
            <strong>{item.name}</strong>
          </button>)}
        </div>
      </section>
    </main>;
  }

  const done = snapshot?.status === 'crashed' || snapshot?.status === 'won';
  const progress = snapshot ? Math.min(100, (snapshot.distance / snapshot.length) * 100) : 0;

  return <main className="drive-page">
    <div className="quest-top-row">
      <button onClick={onBack}>← Back</button>
      <div className="drive-levels">
        {driveLevels.map((item) => <button
          className={`${level === item.id ? 'selected' : ''} ${beaten.includes(item.id) ? 'beaten' : ''}`}
          key={item.id}
          onClick={() => goLevel(item.id)}
          title={item.blurb}
        >{beaten.includes(item.id) ? '🏁' : item.id}</button>)}
      </div>
      <span>{snapshot?.levelName ?? driveLevels[0].name}</span>
    </div>

    <div className="drive-stage">
      <canvas className="drive-canvas" ref={canvas} />
      <div className="drive-hud">
        <b><img src="/assets/pixel-coin.png" alt="" /> {snapshot?.coins ?? 0}/{snapshot?.totalCoins ?? 0}</b>
        <b>💨 {snapshot?.speed ?? 0} km/h</b>
        <i className="drive-progress"><s style={{ width: `${progress}%` }} /></i>
      </div>

      {done && <div className="quest-over">
        <div className={`quest-over-card ${snapshot?.status === 'won' ? 'win' : ''}`}>
          <h2>{snapshot?.message}</h2>
          <p>You drove <strong>{snapshot?.distance}m</strong> of {snapshot?.length}m on {snapshot?.levelName} and collected <strong>{snapshot?.coins} gold {snapshot?.coins === 1 ? 'coin' : 'coins'}</strong>{(snapshot?.coins ?? 0) > 0 ? ' — already in your pocket.' : '.'}</p>
          <button onClick={retry}>Try again</button>
          {snapshot?.status === 'won' && level < driveLevels.length && <button onClick={() => goLevel(level + 1)}>Next level →</button>}
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <div className="drive-controls">
      <button
        onPointerDown={() => hold('brake', true)} onPointerUp={() => hold('brake', false)} onPointerLeave={() => hold('brake', false)}
        aria-label="Lean back / reverse"
      >←</button>
      <p>Hold <b>←</b> or <b>→</b> to drive · in the air they tip the truck</p>
      <button
        onPointerDown={() => hold('gas', true)} onPointerUp={() => hold('gas', false)} onPointerLeave={() => hold('gas', false)}
        aria-label="Drive forward"
      >→</button>
    </div>
  </main>;
}
