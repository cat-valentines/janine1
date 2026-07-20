import { useEffect, useRef, useState } from 'react';
import { EscapeRoomEngine, type EscapeSnapshot } from '../game/escapeRoomEngine';
import { THEMES, DIFFICULTIES, type Theme, type Difficulty } from '../game/escapeRoom';
import { KeyPad } from '../components/KeyPad';
import { addStars, getStars, STAR_GOAL } from '../lib/escapeStars';
import { storage } from '../lib/storage';

const LAST_KEY = 'escapeRoomLastTheme';

/** Pick a themed room that isn't the one we just played. */
function nextTheme(): Theme {
  const last = storage.get(LAST_KEY);
  const choices = THEMES.filter((t) => t.id !== last);
  const pick = choices[Math.floor(Math.random() * choices.length)] ?? THEMES[0];
  storage.set(LAST_KEY, pick.id);
  return pick;
}

export function EscapeRoomPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [config, setConfig] = useState<{ theme: Theme; difficulty: Difficulty } | null>(null);
  const [snapshot, setSnapshot] = useState<EscapeSnapshot | null>(null);
  const [collected, setCollected] = useState(() => getStars());
  const mount = useRef<HTMLDivElement>(null);
  const paid = useRef(false);
  const prevFound = useRef(0);
  const update = useRef<(s: EscapeSnapshot) => void>(() => undefined);

  update.current = (next) => {
    setSnapshot(next);
    // Bank every new star into the collection as soon as it's found — you keep
    // them even if the timer runs out before you escape.
    if (next.found > prevFound.current) {
      setCollected(addStars(next.found - prevFound.current));
      prevFound.current = next.found;
    }
    if (next.status === 'won' && !paid.current && config) { paid.current = true; onScore(config.difficulty.coins); }
  };

  useEffect(() => {
    if (!config || !mount.current) return;
    const engine = new EscapeRoomEngine(mount.current, {
      theme: config.theme,
      difficulty: config.difficulty,
      onUpdate: (next) => update.current(next),
    });
    const resize = () => engine.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); engine.dispose(); };
  }, [config]);

  const start = (difficulty: Difficulty) => { paid.current = false; prevFound.current = 0; setSnapshot(null); setConfig({ theme: nextTheme(), difficulty }); };
  const playAgain = () => { if (config) start(config.difficulty); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen(); else node.requestFullscreen?.();
  };

  if (!config) {
    return <main className="eroom-page">
      <header className="eroom-top"><button onClick={onBack}>← Leave</button><span>🔍 Escape Room</span></header>
      <div className="eroom-choose">
        <h1>🔍 Escape Room</h1>
        <p>You're locked in a 3-D room full of furniture. <b>Walk around</b> and <b>open the doors, drawers and lids</b> — stars are hidden <b>inside</b> them (plants, lamps and pictures are just for show). Open an empty one and it gives you a <b>hot / cold clue</b> pointing toward the next star. Find them all to escape!</p>
        <p className="eroom-sub">Pick a difficulty — harder rooms hide more stars, add a timer, and pay more coins.</p>
        <div className="eroom-collection">⭐ Your collection: <b>{collected.toLocaleString()}</b> / {STAR_GOAL.toLocaleString()} stars
          <i style={{ width: `${Math.min(100, (collected / STAR_GOAL) * 100)}%` }} /></div>
        <div className="eroom-diffs">
          {DIFFICULTIES.map((d) => <button key={d.id} className={`eroom-diff ${d.id}`} onClick={() => start(d)}>
            <b>{d.name}</b>
            <small>{d.stars} stars{d.seconds ? ` · ${d.seconds}s` : ' · no timer'}</small>
            <i>🪙 {d.coins} coins</i>
          </button>)}
        </div>
        <p className="eroom-controls">🎮 <b>↑ ↓</b> walk · <b>← →</b> turn · <b>Space</b> open furniture</p>
      </div>
    </main>;
  }

  const found = snapshot?.found ?? 0;
  const total = snapshot?.total ?? config.difficulty.stars;
  const status = snapshot?.status ?? 'playing';
  const near = snapshot?.near ?? '';

  return <main className="eroom-page playing">
    <div className="eroom-stage3d">
      <div className="eroom-canvas" ref={mount} />

      <header className="eroom-top over">
        <button onClick={onBack}>← Leave</button>
        <span>{config.theme.emoji} {config.theme.name}</span>
        <div className="eroom-hud">
          <b>⭐ {found}/{total}</b>
          <b title="Your star collection">🏆 {collected.toLocaleString()}</b>
          {config.difficulty.seconds > 0 && <b className={(snapshot?.timeLeft ?? 0) <= 10 ? 'low' : ''}>⏱ {Math.ceil(snapshot?.timeLeft ?? config.difficulty.seconds)}s</b>}
        </div>
      </header>

      {status === 'playing' && <p className="eroom-clue over">{snapshot?.clue}</p>}
      {status === 'playing' && near && <div className="eroom-prompt">🔍 Press <b>Space</b> to open the {near.toLowerCase()}</div>}

      <button className="eroom-full" onClick={goFullscreen}>⛶</button>

      {status === 'playing' && <KeyPad actions={[{ codes: ['Space'], label: '🔍', wide: true }]} />}

      {(status === 'won' || status === 'lost') && <div className="quest-over">
        <div className={`quest-over-card ${status === 'won' ? 'win' : ''}`}>
          <h2>{status === 'won' ? '🎉 Escaped!' : '⏰ Out of time!'}</h2>
          <p>{status === 'won'
            ? <>You found all <strong>{total}</strong> stars in the {config.theme.name.toLowerCase()}! You earned <strong>🪙 {config.difficulty.coins} coins</strong>.</>
            : <>You found <strong>{found}</strong> of {total} stars. Try again — the stars hide somewhere new each time!</>}
          </p>
          <p className="eroom-tally">🏆 Star collection: <strong>{collected.toLocaleString()}</strong> / {STAR_GOAL.toLocaleString()}</p>
          <button onClick={playAgain}>🔄 New room</button>
          <button onClick={() => { setConfig(null); setSnapshot(null); }}>Change difficulty</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>
  </main>;
}
