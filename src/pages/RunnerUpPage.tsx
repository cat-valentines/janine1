import { useEffect, useRef, useState } from 'react';
import { RunnerEngine, type RunnerSnapshot } from '../game/runnerEngine';
import { runnerThemes } from '../game/runner';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';

const names: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit', koala: 'Bridey', teddy: 'Adi', panda: 'Bao', tiger: 'Elena', piggy: 'Piggy' };

interface RunnerUpPageProps {
  character: CharacterId;
  islandName: string;
  onCoin: () => void;
  onBack: () => void;
}

export function RunnerUpPage({ character, islandName, onCoin, onBack }: RunnerUpPageProps) {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(0);
  const [snapshot, setSnapshot] = useState<RunnerSnapshot | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = runnerThemes[character];
  const coin = useRef(onCoin);
  coin.current = onCoin;

  useEffect(() => {
    if (!started || !canvas.current) return;
    const created = new RunnerEngine(canvas.current, {
      character,
      characterAsset: characterAssets[character],
      seed: 77,
      best,
      onUpdate: setSnapshot,
      onCoin: () => coin.current(),
    });
    return () => created.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, round, character]);

  useEffect(() => {
    if (snapshot && snapshot.status !== 'playing' && snapshot.distance > best) setBest(snapshot.distance);
  }, [snapshot, best]);

  const playAgain = () => { setSnapshot(null); setRound((n) => n + 1); };
  const over = snapshot?.status === 'dead' || snapshot?.status === 'finished';

  if (!started) {
    return <main className="quest-pick runner-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🏃 {islandName}</span></div>
      <header className="quest-header runner-header">
        <p className="eyebrow">An obstacle course · {islandName}</p>
        <h1><span>🏃</span> Runner Up <span>🏃</span></h1>
        <p>Slide, jump, and grab every coin.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">How it works</p>
        <h2>Jump the obstacle course</h2>
        <p>{names[character]} slides along and never stops. Tap <strong>Space</strong> to jump the spikes and blocks — hold it down to keep hopping. Grab the <strong>gold coins</strong> along the way and they go straight into your pocket to spend in the shops.</p>
        <div className="runner-theme-card">
          <img src={characterAssets[character]} alt={names[character]} />
          <div>
            <p className="card-kicker">Your course</p>
            <h3>{theme.icon} {theme.name}</h3>
            <p>{names[character]} runs through {theme.name.toLowerCase()}. Pick a different character in your profile to run a different course.</p>
          </div>
        </div>
        <button className="profile-start" onClick={() => setStarted(true)}>Start running <span>→</span></button>
      </section>
    </main>;
  }

  return <main className="runner-page">
    <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>{theme.icon} {theme.name}</span></div>
    <div className="runner-stage">
      <canvas className="runner-canvas" ref={canvas} />
      <div className="runner-hud">
        <b>🏃 {snapshot?.distance ?? 0}m</b>
        <b><img src="/assets/pixel-coin.png" alt="" /> {snapshot?.coins ?? 0}</b>
        {best > 0 && <b>⭐ best {best}m</b>}
      </div>
      {over && <div className="quest-over">
        <div className={`quest-over-card ${snapshot?.status === 'finished' ? 'win' : ''}`}>
          <h2>{snapshot?.status === 'finished' ? '🏁 Course complete!' : '💥 Crashed!'}</h2>
          <p>You ran <strong>{snapshot?.distance}m</strong> through {theme.name.toLowerCase()} and collected <strong>{snapshot?.coins} gold {snapshot?.coins === 1 ? 'coin' : 'coins'}</strong>{(snapshot?.coins ?? 0) > 0 ? ' — already in your pocket.' : '.'}</p>
          {best > 0 && <p>Your best run is <strong>{best}m</strong>.</p>}
          <button onClick={playAgain}>Play again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>
    <p className="runner-help">Press <b>Space</b> (or tap the course) to jump · hold to keep hopping</p>
  </main>;
}
