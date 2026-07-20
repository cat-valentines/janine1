import { useEffect, useRef, useState } from 'react';
import { THEMES, SLOTS, DIFFICULTIES, clueFor, type Theme, type Difficulty } from '../game/escapeRoom';
import { storage } from '../lib/storage';

const LAST_KEY = 'escapeRoomLastTheme';

interface Placed { icon: string; name: string; x: number; y: number; hasStar: boolean; searched: boolean }

const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export function EscapeRoomPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<'choose' | 'playing' | 'won' | 'lost'>('choose');
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [furniture, setFurniture] = useState<Placed[]>([]);
  const [found, setFound] = useState(0);
  const [clue, setClue] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const paid = useRef(false);

  const startRoom = (diff: Difficulty) => {
    // pick a theme that isn't the one we just played
    const last = storage.get(LAST_KEY);
    const choices = THEMES.filter((t) => t.id !== last);
    const pick = choices[Math.floor(Math.random() * choices.length)] ?? THEMES[0];
    storage.set(LAST_KEY, pick.id);
    const slots = shuffle(SLOTS).slice(0, pick.items.length);
    const items = shuffle(pick.items);
    const starIndexes = new Set(shuffle(items.map((_, i) => i)).slice(0, diff.stars));
    const placed: Placed[] = items.map((it, i) => ({ icon: it.icon, name: it.name, x: slots[i].x, y: slots[i].y, hasStar: starIndexes.has(i), searched: false }));
    setTheme(pick); setDifficulty(diff); setFurniture(placed); setFound(0); setClue(`🔎 Search the room — find ${diff.stars} hidden stars!`);
    setTimeLeft(diff.seconds); setPhase('playing'); paid.current = false;
  };

  // timer for medium/hard
  useEffect(() => {
    if (phase !== 'playing' || difficulty.seconds === 0) return;
    if (timeLeft <= 0) { setPhase('lost'); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timeLeft, difficulty.seconds]);

  const search = (index: number) => {
    if (phase !== 'playing') return;
    const piece = furniture[index];
    if (piece.searched) return;
    const next = furniture.map((f, i) => (i === index ? { ...f, searched: true } : f));
    setFurniture(next);
    if (piece.hasStar) {
      const now = found + 1;
      setFound(now);
      setClue(`⭐ Found a star! ${now} of ${difficulty.stars}.`);
      if (now >= difficulty.stars) {
        setPhase('won');
        if (!paid.current) { paid.current = true; onScore(difficulty.coins); }
      }
    } else {
      // hot/cold clue toward the nearest un-found star
      let nearest = 999;
      next.forEach((f) => { if (f.hasStar && !f.searched) nearest = Math.min(nearest, Math.hypot(f.x - piece.x, f.y - piece.y)); });
      setClue(`Nothing in the ${piece.name.toLowerCase()}. ${nearest === 999 ? '' : clueFor(nearest)}`);
    }
  };

  if (phase === 'choose') {
    return <main className="eroom-page">
      <header className="eroom-top"><button onClick={onBack}>← Leave</button><span>🔍 Escape Room</span></header>
      <div className="eroom-choose">
        <h1>🔍 Escape Room</h1>
        <p>A room full of furniture — some pieces hide a ⭐. Open them to find every star. Empty pieces give you a <b>hot / cold</b> clue!</p>
        <p className="eroom-sub">Pick a difficulty — harder rooms hide more stars, add a timer, and pay more coins.</p>
        <div className="eroom-diffs">
          {DIFFICULTIES.map((d) => <button key={d.id} className={`eroom-diff ${d.id}`} onClick={() => startRoom(d)}>
            <b>{d.name}</b>
            <small>{d.stars} stars{d.seconds ? ` · ${d.seconds}s` : ' · no timer'}</small>
            <i>🪙 {d.coins} coins</i>
          </button>)}
        </div>
      </div>
    </main>;
  }

  return <main className="eroom-page">
    <header className="eroom-top">
      <button onClick={onBack}>← Leave</button>
      <span>{theme.emoji} {theme.name}</span>
      <div className="eroom-hud">
        <b>⭐ {found}/{difficulty.stars}</b>
        {difficulty.seconds > 0 && <b className={timeLeft <= 10 ? 'low' : ''}>⏱ {timeLeft}s</b>}
      </div>
    </header>

    <p className="eroom-clue">{clue}</p>

    <div className="eroom-stage" style={{ background: theme.wall }}>
      <div className="eroom-floor" style={{ background: theme.floor }} />
      {furniture.map((f, i) => <button
        key={i}
        className={`eroom-item ${f.searched ? (f.hasStar ? 'star' : 'empty') : ''}`}
        style={{ left: `${f.x}%`, top: `${f.y}%` }}
        onClick={() => search(i)}
        disabled={f.searched}
      >
        <span className="eroom-icon">{f.searched && f.hasStar ? '⭐' : f.icon}</span>
        <span className="eroom-name">{f.name}</span>
        {f.searched && !f.hasStar && <span className="eroom-check">✓</span>}
      </button>)}
    </div>

    {(phase === 'won' || phase === 'lost') && <div className="quest-over">
      <div className={`quest-over-card ${phase === 'won' ? 'win' : ''}`}>
        <h2>{phase === 'won' ? '🎉 Escaped!' : '⏰ Out of time!'}</h2>
        <p>{phase === 'won'
          ? <>You found all <strong>{difficulty.stars}</strong> stars in the {theme.name.toLowerCase()}! You earned <strong>🪙 {difficulty.coins} coins</strong>.</>
          : <>You found <strong>{found}</strong> of {difficulty.stars} stars. Try again — the stars hide somewhere new each time!</>}
        </p>
        <button onClick={() => startRoom(difficulty)}>🔄 New room</button>
        <button onClick={() => setPhase('choose')}>Change difficulty</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
