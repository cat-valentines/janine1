import { useEffect, useRef, useState } from 'react';
import { DARES, TRUTHS, WHEEL_COLORS, randomFrom } from '../game/truthOrDare';

const SIZE = 360;               // fixed internal wheel resolution; CSS scales it
const MAX_PLAYERS = 10;

type Phase = 'setup' | 'wheel' | 'card' | 'reveal';

export function TruthOrDarePage({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [current, setCurrent] = useState(0);
  const [kind, setKind] = useState<'truth' | 'dare' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [spinning, setSpinning] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const raf = useRef(0);

  // ---- wheel drawing ----
  const draw = () => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const n = players.length;
    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 6;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!n) return;
    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i += 1) {
      const a0 = rotation.current + i * seg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 2;
      ctx.stroke();
      // name, written along the segment
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3a2b46';
      ctx.font = `bold ${Math.max(13, Math.min(20, 150 / players[i].length))}px Inter, system-ui, sans-serif`;
      ctx.fillText(players[i].slice(0, 12), R - 14, 0);
      ctx.restore();
    }
    // hub
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7a3ff0';
    ctx.stroke();
    ctx.fillStyle = '#7a3ff0';
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌀', cx, cy + 1);
  };

  useEffect(() => { if (phase !== 'setup') draw(); });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ---- actions ----
  const addPlayer = () => {
    const name = nameInput.trim();
    if (!name || players.length >= MAX_PLAYERS) return;
    setPlayers((list) => [...list, name]);
    setNameInput('');
  };
  const removePlayer = (index: number) => setPlayers((list) => list.filter((_, i) => i !== index));

  const start = () => { if (players.length >= 2) setPhase('wheel'); };

  const spin = () => {
    if (spinning || players.length < 2) return;
    setSpinning(true);
    const n = players.length;
    const seg = (Math.PI * 2) / n;
    const winner = Math.floor(Math.random() * n);
    const twoPi = Math.PI * 2;
    const norm = (a: number) => ((a % twoPi) + twoPi) % twoPi;
    // land the winner's slice under the pointer at the top (−90°)
    const desired = -Math.PI / 2 - (winner + 0.5) * seg;
    const from = rotation.current;
    const target = from + 5 * twoPi + norm(desired - from);
    const duration = 3600;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);          // ease-out
      rotation.current = from + (target - from) * eased;
      draw();
      if (t < 1) { raf.current = requestAnimationFrame(step); }
      else { setSpinning(false); setCurrent(winner); setKind(null); setPrompt(''); setPhase('card'); }
    };
    raf.current = requestAnimationFrame(step);
  };

  const pickCard = (which: 'truth' | 'dare') => {
    setKind(which);
    setPrompt(randomFrom(which === 'truth' ? TRUTHS : DARES));
    setPhase('reveal');
  };

  const nextTurn = () => { setKind(null); setPrompt(''); setPhase('wheel'); };
  const endGame = () => { setPhase('setup'); setKind(null); setPrompt(''); rotation.current = 0; };

  // ---- screens ----
  if (phase === 'setup') {
    return <main className="tod-page">
      <div className="tod-top"><button onClick={onBack}>← Back</button><span>🌀 🎲 🔥</span></div>
      <header className="tod-header">
        <p className="eyebrow">A play-together party game</p>
        <h1>🌀 Truth or Dare</h1>
        <p>Sitting together on the bus, in class, or at a sleepover? Add everyone's name, spin the wheel, and pick a mystery card. Pass the phone around!</p>
      </header>
      <section className="tod-setup">
        <p className="card-kicker">Who's playing?</p>
        <div className="tod-add">
          <input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addPlayer()}
            placeholder="Type a name…"
            maxLength={14}
          />
          <button onClick={addPlayer} disabled={!nameInput.trim() || players.length >= MAX_PLAYERS}>+ Add</button>
        </div>
        <div className="tod-players">
          {players.map((name, index) => <span className="tod-chip" key={index} style={{ background: WHEEL_COLORS[index % WHEEL_COLORS.length] }}>
            {name}<button onClick={() => removePlayer(index)} aria-label={`Remove ${name}`}>×</button>
          </span>)}
          {!players.length && <p className="tod-empty">Add at least 2 players to start.</p>}
        </div>
        <button className="tod-start" onClick={start} disabled={players.length < 2}>
          {players.length < 2 ? `Add ${2 - players.length} more player${2 - players.length === 1 ? '' : 's'}` : `🌀 Start with ${players.length} players`}
        </button>
        <p className="tod-note">Everything is kept friendly and kind — no mean or personal questions.</p>
      </section>
    </main>;
  }

  return <main className="tod-page playing">
    <div className="tod-top"><button onClick={endGame}>← End game</button><span>{players.length} players</span></div>

    {phase === 'wheel' && <section className="tod-wheel-stage">
      <h2>Spin the wheel!</h2>
      <div className="tod-wheel-wrap">
        <div className="tod-pointer" />
        <canvas className="tod-wheel" width={SIZE} height={SIZE} ref={canvas} />
      </div>
      <button className="tod-spin" onClick={spin} disabled={spinning}>{spinning ? 'Spinning…' : '🌀 SPIN'}</button>
    </section>}

    {phase === 'card' && <section className="tod-card-stage">
      <p className="tod-turn"><b style={{ color: WHEEL_COLORS[current % WHEEL_COLORS.length] }}>{players[current]}</b>, it's your turn!</p>
      <p className="tod-choose">Pick a mystery card — you won't know what it says until you flip it!</p>
      <div className="tod-cards">
        <button className="tod-mystery truth" onClick={() => pickCard('truth')}>
          <span className="tod-mystery-q">?</span>
          <b>🗣️ Truth</b>
          <small>Answer honestly</small>
        </button>
        <button className="tod-mystery dare" onClick={() => pickCard('dare')}>
          <span className="tod-mystery-q">?</span>
          <b>🔥 Dare</b>
          <small>Do the challenge</small>
        </button>
      </div>
    </section>}

    {phase === 'reveal' && <section className="tod-reveal-stage">
      <div className={`tod-reveal ${kind}`}>
        <p className="tod-reveal-who"><b>{players[current]}</b></p>
        <p className="tod-reveal-kind">{kind === 'truth' ? '🗣️ TRUTH' : '🔥 DARE'}</p>
        <p className="tod-reveal-text">{prompt}</p>
      </div>
      <div className="tod-reveal-actions">
        <button className="tod-next" onClick={nextTurn}>✅ Done — next player!</button>
      </div>
    </section>}
  </main>;
}
