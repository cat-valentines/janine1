import { useEffect, useRef, useState } from 'react';
import { PI_DIGITS, formatPi } from '../game/pi';

const BEST_KEY = 'piBestDigits';
const START_LIVES = 3;
const MILESTONES = [5, 10, 15, 20, 30, 40, 50];

// how long each digit lights up while the calculator shows you the pattern
const litMs = (round: number) => Math.max(280, 600 - round * 14);
const gapMs = (round: number) => Math.max(120, 260 - round * 8);

type Phase = 'showing' | 'input' | 'pause' | 'over';

export function PiPage({ onScore, onBack }: { onScore: (points: number) => void; onBack: () => void }) {
  const [round, setRound] = useState(1);          // how many digits are in the current pattern
  const [phase, setPhase] = useState<Phase>('showing');
  const [shownCount, setShownCount] = useState(0); // digits revealed so far while showing
  const [inputPos, setInputPos] = useState(0);     // digits the player has copied this round
  const [lives, setLives] = useState(START_LIVES);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0));
  const [lit, setLit] = useState<string | null>(null);   // key the calculator is flashing
  const [pressed, setPressed] = useState<string | null>(null); // key the player just tapped
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'watch'; text: string } | null>(null);
  const [shake, setShake] = useState(false);
  const [milestone, setMilestone] = useState('');
  const lcd = useRef<HTMLDivElement>(null);
  const paid = useRef(false);

  const seq = PI_DIGITS.slice(0, round);
  const revealed = phase === 'showing' ? shownCount : phase === 'input' ? inputPos : round;
  const display = formatPi(revealed);

  // keep the newest digit in view
  useEffect(() => { if (lcd.current) lcd.current.scrollLeft = lcd.current.scrollWidth; }, [display]);
  useEffect(() => {
    if (!milestone) return;
    const timer = setTimeout(() => setMilestone(''), 1600);
    return () => clearTimeout(timer);
  });

  // The calculator plays the pattern: flash each digit in turn, then hand over to the player.
  useEffect(() => {
    if (phase !== 'showing') return;
    let i = 0;
    let cancelled = false;
    let lightT: ReturnType<typeof setTimeout>;
    let gapT: ReturnType<typeof setTimeout>;
    setShownCount(0);
    setLit(null);
    setFeedback({ kind: 'watch', text: '👀 Watch the pattern…' });

    const step = () => {
      if (cancelled) return;
      if (i >= seq.length) {
        setLit(null);
        setInputPos(0);
        setPhase('input');
        setFeedback({ kind: 'watch', text: '⌨️ Your turn — copy it!' });
        return;
      }
      setLit(seq[i]);
      setShownCount(i + 1);
      i++;
      lightT = setTimeout(() => {
        if (cancelled) return;
        setLit(null);
        gapT = setTimeout(step, gapMs(round));
      }, litMs(round));
    };

    const startT = setTimeout(step, 550);
    return () => { cancelled = true; clearTimeout(startT); clearTimeout(lightT); clearTimeout(gapT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  const finish = () => {
    setPhase('over');
    if (!paid.current) { paid.current = true; onScore(best); }
  };

  const flashPress = (d: string) => { setPressed(d); setTimeout(() => setPressed(null), 150); };

  const press = (d: string) => {
    if (phase !== 'input') return;
    flashPress(d);

    if (d === seq[inputPos]) {
      const nextPos = inputPos + 1;
      setInputPos(nextPos);
      if (nextPos >= seq.length) {
        // whole pattern copied — this round is cleared
        const reached = round;
        if (reached > best) { setBest(reached); localStorage.setItem(BEST_KEY, String(reached)); }
        if (MILESTONES.includes(reached)) setMilestone(`🎉 ${reached} digits of π!`);
        setFeedback({ kind: 'ok', text: `✓ ${reached} digit${reached === 1 ? '' : 's'}!` });
        setPhase('pause');
        if (reached >= PI_DIGITS.length) { setTimeout(finish, 900); return; }
        setTimeout(() => { setRound((r) => r + 1); setPhase('showing'); }, 950);
      } else {
        setFeedback({ kind: 'ok', text: '✓' });
      }
    } else {
      setShake(true); setTimeout(() => setShake(false), 420);
      const remaining = lives - 1;
      setLives(remaining);
      setPhase('pause');
      if (remaining <= 0) {
        setFeedback({ kind: 'bad', text: `✗ It was ${seq[inputPos]}` });
        setTimeout(finish, 700);
        return;
      }
      setFeedback({ kind: 'bad', text: `✗ It was ${seq[inputPos]} — watch again` });
      setTimeout(() => setPhase('showing'), 1100); // replay the same pattern so you can learn it
    }
  };

  const newGame = () => {
    setRound(1); setPhase('showing'); setShownCount(0); setInputPos(0);
    setLives(START_LIVES); setFeedback(null); setMilestone(''); setLit(null); paid.current = false;
  };

  // let a real keyboard play too (nice on a laptop)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (/^[0-9]$/.test(event.key)) press(event.key); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return <main className={`pi-page ${shake ? 'shake' : ''}`}>
    <header className="pi-header">
      <button className="pi-back" onClick={onBack}>←</button>
      <h1><span className="pi-sym">π</span> Pi</h1>
      <div className="pi-best"><small>Best</small><b>{best}</b></div>
    </header>

    <p className="pi-tagline">The calculator flashes the digits of π — <b>watch, then copy the pattern!</b></p>

    <div className="pi-stats">
      <div className="pi-lives" aria-label={`${lives} lives`}>{Array.from({ length: START_LIVES }, (_, i) => <i key={i}>{i < lives ? '❤️' : '🖤'}</i>)}</div>
      <div className="pi-count"><b>{round}</b><small>digit pattern</small></div>
    </div>

    <div className="pi-calc">
      <div className={`pi-lcd ${phase === 'showing' ? 'watching' : ''}`} ref={lcd}>
        <span className="pi-typed">{display}</span>
        <span className="pi-cursor" />
      </div>
      <p className={`pi-feedback ${feedback?.kind ?? ''}`}>{feedback?.text ?? ' '}</p>

      <div className="pi-keypad">
        {keys.map((key) => <button
          key={key}
          className={`pi-key ${lit === key ? 'lit' : ''} ${pressed === key ? 'hit' : ''}`}
          onClick={() => press(key)}
          disabled={phase !== 'input'}
        >{key}</button>)}
      </div>
    </div>

    <div className="pi-tools">
      <button onClick={newGame}>🔄 Restart</button>
    </div>

    {milestone && <div className="pi-milestone">{milestone}</div>}

    {phase === 'over' && <div className="quest-over">
      <div className="quest-over-card">
        <h2>{best >= PI_DIGITS.length ? '🏆 Pi Master!' : '🥧 Nice memory!'}</h2>
        <p>{best >= PI_DIGITS.length
          ? <>You copied all <strong>{PI_DIGITS.length} digits</strong> of π! Incredible.</>
          : <>You copied a <strong>{best}</strong>-digit pattern of π. {best > 0 ? 'Can you beat it?' : 'Give it another go!'}</>}
        </p>
        <button onClick={newGame}>Try again</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
