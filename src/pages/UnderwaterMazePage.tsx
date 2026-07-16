import { useEffect, useRef, useState } from 'react';
import { ReefEngine, type ReefSnapshot } from '../game/reefEngine';
import { coralFacts, fishKinds, KEYS_TO_WIN, START_LIVES, type FishId } from '../game/reef';

interface UnderwaterMazePageProps {
  onCoins: (coins: number) => void;
  onBack: () => void;
}

export function UnderwaterMazePage({ onCoins, onBack }: UnderwaterMazePageProps) {
  const [fish, setFish] = useState<FishId | null>(null);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<ReefSnapshot | null>(null);
  const [factIndex, setFactIndex] = useState(0);
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<ReefEngine | null>(null);
  const paid = useRef(false);
  const coins = useRef(onCoins);
  coins.current = onCoins;

  // the coral fact at the bottom quietly rotates
  useEffect(() => {
    const id = setInterval(() => setFactIndex((n) => (n + 1) % coralFacts.length), 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!started || !fish || !mount.current) return;
    const created = new ReefEngine(mount.current, {
      fish,
      seed: 1234 + round * 17,
      onUpdate: setSnapshot,
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [started, fish, round]);

  // hand out the coins you gathered when the dive ends
  useEffect(() => {
    if (!snapshot || paid.current) return;
    if (snapshot.status === 'won') { paid.current = true; coins.current(snapshot.coins + 30); }
    else if (snapshot.status === 'over') { paid.current = true; coins.current(snapshot.coins); }
  }, [snapshot]);

  const playAgain = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  const touch = (dir: 'up' | 'down' | 'left' | 'right' | 'rise' | 'dive', on: boolean) => (event: React.PointerEvent) => {
    event.preventDefault();
    engine.current?.setTouch(dir, on);
  };

  // ---- start screen: choose your fish ----
  if (!started) {
    return <main className="reef-pick">
      <div className="reef-pick-top"><button onClick={onBack}>← Back</button><span>🫧🐠🫧</span></div>
      <header className="reef-header">
        <p className="eyebrow">A 3-D coral-reef adventure</p>
        <h1><span>🐠</span> Underwater Maze <span>🐟</span></h1>
        <p>Swim the coral maze. Gather {KEYS_TO_WIN} keys and reach a shell lock — without being eaten.</p>
      </header>

      <section className="reef-pick-card">
        <p className="card-kicker">Choose your fish</p>
        <div className="reef-fish-grid">
          {fishKinds.map((kind) => <button
            key={kind.id}
            className={`reef-fish-card ${fish === kind.id ? 'chosen' : ''}`}
            onClick={() => setFish(kind.id)}
          >
            <span className="reef-fish-emoji" style={{ background: `radial-gradient(circle at 40% 35%, ${kind.belly}, ${kind.body})` }}>{kind.emoji}</span>
            <strong>{kind.name}</strong>
            <small>{kind.blurb}</small>
          </button>)}
        </div>

        <div className="reef-rules">
          <div><b>🔑 {KEYS_TO_WIN} keys</b><span>hidden across the reef and inside caves</span></div>
          <div><b>🐚 5 shell locks</b><span>reach one with every key to win</span></div>
          <div><b>🦈 Predators</b><span>sharks, eels and big fish hunt and hide</span></div>
          <div><b>🕳️ Caves</b><span>coins wait inside — but so do hungry surprises</span></div>
        </div>

        <button className="reef-start" disabled={!fish} onClick={() => { paid.current = false; setStarted(true); }}>
          {fish ? '🤿 Dive in!' : 'Pick a fish first'}
        </button>
      </section>

      <section className="reef-fact-card">
        <p className="card-kicker">🐡 True coral fact</p>
        <p className="reef-fact-text">{coralFacts[factIndex].text}</p>
        <small>Source: {coralFacts[factIndex].source}</small>
      </section>
    </main>;
  }

  // ---- the dive ----
  const keys = snapshot?.keys ?? 0;
  const lives = snapshot?.lives ?? START_LIVES;
  const won = snapshot?.status === 'won';
  const over = snapshot?.status === 'over';
  const shield = snapshot?.shield ?? 0;
  const shieldReady = snapshot?.shieldReady ?? true;
  const shieldLabel = shield > 0 ? `🫧 ${Math.ceil(shield)}s` : shieldReady ? '🫧 Bubble' : '🫧 …';

  return <main className="reef-page">
    <div className="reef-stage">
      <div className="reef-canvas" ref={mount} />
      {(snapshot?.hurt ?? 0) > 0 && <div className="reef-hurt" style={{ opacity: Math.min(0.6, (snapshot?.hurt ?? 0) * 0.6) }} />}

      <div className="reef-hud">
        <div className="reef-keys"><b>🔑 {keys}<small>/{KEYS_TO_WIN}</small></b><span>keys</span></div>
        <div className="reef-coins"><b>🪙 {snapshot?.coins ?? 0}</b><span>coins</span></div>
        <div className="reef-lives" aria-label={`${lives} lives left`}>
          {Array.from({ length: START_LIVES }, (_, i) => <i key={i}>{i < lives ? '❤️' : '🖤'}</i>)}
        </div>
        <div className={`reef-shield-chip ${shield > 0 ? 'on' : ''}`}><b>{shield > 0 ? `${Math.ceil(shield)}s` : shieldReady ? '🫧' : '⏳'}</b><span>bubble</span></div>
        {snapshot?.hasAllKeys && <div className="reef-goal">🐚 Find a shell lock!</div>}
      </div>

      <button className="reef-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="reef-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="reef-message">{snapshot.message}</p>}

      {/* on-screen controls for touch */}
      <div className="reef-controls">
        <div className="reef-dpad">
          <button className="up" onPointerDown={touch('up', true)} onPointerUp={touch('up', false)} onPointerLeave={touch('up', false)}>▲</button>
          <button className="left" onPointerDown={touch('left', true)} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)}>◀</button>
          <button className="right" onPointerDown={touch('right', true)} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)}>▶</button>
          <button className="down" onPointerDown={touch('down', true)} onPointerUp={touch('down', false)} onPointerLeave={touch('down', false)}>▼</button>
        </div>
        <div className="reef-vert">
          <button className={`reef-bubble-btn ${shield > 0 ? 'active' : ''}`} disabled={!shieldReady && shield <= 0} onPointerDown={(event) => { event.preventDefault(); engine.current?.blowBubble(); }}>{shieldLabel}</button>
          <button onPointerDown={touch('rise', true)} onPointerUp={touch('rise', false)} onPointerLeave={touch('rise', false)}>🔼 Up</button>
          <button onPointerDown={touch('dive', true)} onPointerUp={touch('dive', false)} onPointerLeave={touch('dive', false)}>🔽 Dive</button>
        </div>
      </div>

      {snapshot?.status === 'swim' && <p className="reef-help"><b>↑↓</b> swim · <b>←→</b> turn · <b>Space</b> 🫧 bubble · <b>Shift</b> up · <b>Ctrl</b> dive</p>}

      {(won || over) && <div className="quest-over">
        <div className={`quest-over-card ${won ? 'win' : ''}`}>
          <h2>{won ? '🐚 You escaped the reef!' : '💀 Caught!'}</h2>
          <p>{won
            ? <>You found all {KEYS_TO_WIN} keys and opened a shell lock. You gathered <strong>{snapshot?.coins ?? 0} coins</strong> (+30 bonus) for the shops!</>
            : <>The predators got you. You still keep the <strong>{snapshot?.coins ?? 0} coins</strong> you collected. Try a new reef!</>}
          </p>
          <button onClick={playAgain}>{won ? 'Swim a new reef' : 'Try again'}</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <div className="reef-fact-strip">
      <b>🐡 Coral fact:</b> {coralFacts[factIndex].text} <em>({coralFacts[factIndex].source})</em>
    </div>
  </main>;
}
