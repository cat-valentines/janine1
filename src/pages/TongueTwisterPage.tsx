import { useEffect, useMemo, useRef, useState } from 'react';
import { TWISTERS, countReps, speechSupported } from '../game/tongueTwisters';
import { storage } from '../lib/storage';

const GOAL = 3;
const SECONDS = 20;
const BEST_KEY = 'tongueBest';

/** The bits of the Web Speech API we touch (it has no bundled TypeScript types). */
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type Phase = 'ready' | 'listening' | 'won' | 'timeup';

export function TongueTwisterPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const supported = useMemo(speechSupported, []);
  const [twister, setTwister] = useState(() => TWISTERS[Math.floor(Math.random() * TWISTERS.length)]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [reps, setReps] = useState(0);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const [best, setBest] = useState(() => Number(storage.get(BEST_KEY) || 0));

  const rec = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalText = useRef('');
  const listening = useRef(false);
  const finished = useRef(false);
  const repsRef = useRef(0);
  const twisterRef = useRef(twister);
  twisterRef.current = twister;

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const endRound = (won?: boolean) => {
    if (finished.current) return;
    finished.current = true;
    listening.current = false;
    stopTimer();
    try { rec.current?.stop(); } catch { /* already stopped */ }
    const success = won || repsRef.current >= GOAL;
    setPhase(success ? 'won' : 'timeup');
    if (success) {
      setReps(GOAL);
      if (GOAL > best) { setBest(GOAL); storage.set(BEST_KEY, String(GOAL)); }
      onScore(10);
    }
  };

  const bump = (n: number) => { repsRef.current = n; setReps(n); if (n >= GOAL) endRound(true); };

  const startListening = () => {
    finished.current = false;
    listening.current = true;
    finalText.current = '';
    repsRef.current = 0;
    setHeard(''); setReps(0); setError(''); setTimeLeft(SECONDS); setPhase('listening');

    if (supported) {
      const SR = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition });
      const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition;
      if (Ctor) {
        const r = new Ctor();
        r.lang = 'en-US';
        r.continuous = true;
        r.interimResults = true;
        r.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) finalText.current += ` ${result[0].transcript}`;
            else interim += ` ${result[0].transcript}`;
          }
          const full = `${finalText.current} ${interim}`.trim();
          setHeard(full);
          bump(countReps(twisterRef.current, full));
        };
        r.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError('Please allow the microphone, then tap Record again.');
            endRound(false);
          }
          // no-speech / aborted / network: onend will restart while time remains
        };
        r.onend = () => { if (listening.current && !finished.current) { try { r.start(); } catch { /* race */ } } };
        rec.current = r;
        try { r.start(); } catch { setError('Could not start the microphone. Tap Record to try again.'); }
      }
    }

    timer.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;
        if (next <= 0) { endRound(); return 0; }
        return next;
      });
    }, 1000);
  };

  const newTwister = () => {
    endRound(false);
    setPhase('ready'); setReps(0); setHeard(''); setError(''); setTimeLeft(SECONDS);
    setTwister((current) => {
      const others = TWISTERS.filter((t) => t !== current);
      return others[Math.floor(Math.random() * others.length)] ?? current;
    });
    finished.current = false;
  };

  const retry = () => { setPhase('ready'); setReps(0); setHeard(''); setError(''); setTimeLeft(SECONDS); finished.current = false; };

  // Clean up the mic and timer if the player leaves mid-round.
  useEffect(() => () => { listening.current = false; stopTimer(); try { rec.current?.stop(); } catch { /* ok */ } }, []);

  const pct = Math.round((timeLeft / SECONDS) * 100);

  return <main className="tt-page">
    <header className="tt-header">
      <button className="tt-back" onClick={onBack}>←</button>
      <h1>👅 Tongue Twister</h1>
      <div className="tt-best"><small>Best</small><b>{best}/{GOAL}</b></div>
    </header>

    <p className="tt-tag">Say it <b>{GOAL} times</b> in <b>{SECONDS} seconds</b> — clearly! Great for speaking clearly and reading fast.</p>

    <section className="tt-card">
      <p className="tt-kicker">Your tongue twister</p>
      <p className="tt-phrase">“{twister}”</p>

      <div className="tt-stats">
        <div className={`tt-timer ${timeLeft <= 5 && phase === 'listening' ? 'low' : ''}`}><b>⏱ {timeLeft}s</b></div>
        <div className="tt-reps" aria-label={`${reps} of ${GOAL} said`}>
          {Array.from({ length: GOAL }, (_, i) => <span key={i} className={i < reps ? 'on' : ''}>{i < reps ? '✅' : '⚪'}</span>)}
        </div>
      </div>
      <div className="tt-bar"><i style={{ width: `${phase === 'listening' ? pct : 100}%` }} /></div>

      {phase === 'ready' && <>
        {supported
          ? <button className="tt-record" onClick={startListening}>🎙️ Record</button>
          : <button className="tt-record practice" onClick={startListening}>▶️ Start (practice)</button>}
        {!supported && <p className="tt-note">🔇 This device can't check your speech, so this is practice mode: read it aloud and tap “Said it!” each time.</p>}
      </>}

      {phase === 'listening' && <>
        {supported
          ? <button className="tt-record live" onClick={() => endRound()}>🔴 Listening… tap to stop</button>
          : <button className="tt-record said" onClick={() => bump(reps + 1)}>✅ Said it!</button>}
        {supported && <p className="tt-heard">{heard ? `“${heard}”` : 'Say the tongue twister out loud…'}</p>}
      </>}

      {error && <p className="tt-error">{error}</p>}
    </section>

    {(phase === 'won' || phase === 'timeup') && <div className="quest-over">
      <div className={`quest-over-card ${phase === 'won' ? 'win' : ''}`}>
        <h2>{phase === 'won' ? '🎉 Tongue master!' : '⏰ Time!'}</h2>
        <p>{phase === 'won'
          ? <>You said it <strong>{GOAL} times</strong> clearly. Nice and fast! You earned <strong>+10 coins</strong>.</>
          : <>You got <strong>{reps} of {GOAL}</strong>. Take a breath and try again — a little slower and clearer!</>}
        </p>
        <button onClick={retry}>Try again</button>
        <button onClick={newTwister}>🔁 New twister</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
