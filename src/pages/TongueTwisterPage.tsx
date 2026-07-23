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
  // Reps can come from two places: the mic auto-detecting a full pass, and the
  // player tapping "I said it!". We take the max of the two so they never double
  // up — and so the check marks ALWAYS work, even where the mic can't listen.
  const speechRepsRef = useRef(0);
  const manualRepsRef = useRef(0);
  const twisterRef = useRef(twister);
  twisterRef.current = twister;

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const endRound = (won?: boolean) => {
    if (finished.current) return;
    finished.current = true;
    listening.current = false;
    stopTimer();
    try { rec.current?.stop(); } catch { /* already stopped */ }
    const success = won || Math.max(speechRepsRef.current, manualRepsRef.current) >= GOAL;
    setPhase(success ? 'won' : 'timeup');
    if (success) {
      setReps(GOAL);
      if (GOAL > best) { setBest(GOAL); storage.set(BEST_KEY, String(GOAL)); }
      onScore(10);
    }
  };

  const applyReps = () => {
    const n = Math.max(speechRepsRef.current, manualRepsRef.current);
    setReps(n);
    if (n >= GOAL) endRound(true);
  };
  // The tap-to-count button — the reliable way that works on every device.
  const manualSaid = () => { if (finished.current) return; manualRepsRef.current += 1; applyReps(); };

  const startListening = () => {
    finished.current = false;
    listening.current = true;
    finalText.current = '';
    speechRepsRef.current = 0;
    manualRepsRef.current = 0;
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
          speechRepsRef.current = countReps(twisterRef.current, full);
          applyReps();
        };
        r.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            // Mic blocked — don't end the round; the player can still tap "I said it!".
            listening.current = false;   // stop the auto-restart loop
            try { r.stop(); } catch { /* ok */ }
            setError('🎙️ Mic is off — no problem, just tap “I said it!” each time.');
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
        <button className="tt-record" onClick={startListening}>{supported ? '🎙️ Start' : '▶️ Start'}</button>
        <p className="tt-note">{supported
          ? 'Say the twister 3 times. The mic listens, and you can also tap “✅ I said it!” each time.'
          : '🔊 Read it aloud and tap “✅ I said it!” each time you finish.'}</p>
      </>}

      {phase === 'listening' && <>
        <button className="tt-record said" onClick={manualSaid}>✅ I said it! <small>{reps}/{GOAL}</small></button>
        {supported
          ? <p className="tt-heard">{heard ? `🎙️ heard: “${heard}”` : '🎙️ Listening… say it out loud, or tap the button each time.'}</p>
          : <p className="tt-note">Say it out loud, then tap the button each time.</p>}
        <button className="tt-stop" onClick={() => endRound()}>⏹ Stop</button>
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
