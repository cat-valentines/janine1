import { useEffect, useRef, useState } from 'react';
import { SINGS, noteTimes, melodySeconds, beatSeconds, midiRange, rateHold, starsFor, playTone, playVoice, HOLD_TOLERANCE, type Sing, type TimedNote } from '../game/singGame';
import { detectPitch, freqToMidi, semitonesOff, noteName } from '../game/pitch';

const PX_PER_SEC = 130;
const PLAYHEAD = 0.26;    // playhead sits this far from the left
const COUNT_IN = 2;       // beats of ticks before you sing

interface Result { pct: number; stars: number; message: string }

export function SingStarPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [sing, setSing] = useState<Sing | null>(null);
  const [phase, setPhase] = useState<'idle' | 'listen' | 'sing' | 'done'>('idle');
  const [liveNote, setLiveNote] = useState('');
  const [micError, setMicError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [countdown, setCountdown] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const startAtRef = useRef(0);              // ctx time the melody starts
  const notesRef = useRef<TimedNote[]>([]);
  const holdRef = useRef<number[]>([]);      // seconds you held ON-pitch per note
  const lastTRef = useRef(0);                // previous frame time, for measuring how long you hold
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const paidRef = useRef(false);

  const ensureCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  const stopAll = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  };
  useEffect(() => () => { stopAll(); ctxRef.current?.close(); }, []);

  // ---- pitch → screen helpers ----
  const foldNear = (userMidi: number, targetMidi: number) => {
    let best = userMidi, bestD = Infinity;
    for (let k = -2; k <= 2; k += 1) { const m = userMidi + 12 * k; const d = Math.abs(m - targetMidi); if (d < bestD) { bestD = d; best = m; } }
    return best;
  };

  const draw = (t: number, userMidi: number | null, activeIdx: number) => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !sing) return;
    const W = canvas.width, H = canvas.height;
    const { lo, hi } = midiRange(sing);
    const pitchY = (m: number) => H * 0.9 - ((m - lo) / (hi - lo)) * H * 0.8;
    const headX = W * PLAYHEAD;
    ctx.clearRect(0, 0, W, H);

    // faint lane lines every 2 semitones
    ctx.strokeStyle = '#ffffff14';
    for (let m = Math.ceil(lo); m <= hi; m += 2) { const y = pitchY(m); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // target notes — the green fill shows HOW LONG you've held each note steady
    notesRef.current.forEach((n, i) => {
      const x = headX + (n.start - t) * PX_PER_SEC;
      const w = n.dur * PX_PER_SEC;
      if (x + w < -20 || x > W + 20) return;
      const y = pitchY(n.midi);
      const active = i === activeIdx;
      const bw = Math.max(w, 8);
      const held = Math.min(1, (holdRef.current[i] ?? 0) / n.dur);
      const round = () => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y - 7, bw, 14, 7); else ctx.rect(x, y - 7, bw, 14); };
      round();
      ctx.fillStyle = active ? '#ffe45e' : '#8a7fd0';
      ctx.fill();
      if (held > 0.02) {   // how much of the note you sustained on-pitch, filled in green
        ctx.save(); round(); ctx.clip();
        ctx.fillStyle = '#4bd07b';
        ctx.fillRect(x, y - 7, bw * held, 14);
        ctx.restore();
      }
    });

    // playhead
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(headX, 0); ctx.lineTo(headX, H); ctx.stroke();

    // your live pitch
    if (userMidi != null) {
      const target = activeIdx >= 0 ? notesRef.current[activeIdx].midi : (lo + hi) / 2;
      const shown = foldNear(userMidi, target);
      const y = pitchY(Math.max(lo, Math.min(hi, shown)));
      const on = activeIdx >= 0 && semitonesOff(userMidi, target) <= 1.3;
      ctx.fillStyle = on ? '#4bd07b' : '#ff8fb0';
      ctx.shadowColor = on ? '#4bd07b' : '#ff8fb0'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(headX, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  const finish = () => {
    const notes = notesRef.current;
    let pts = 0;
    notes.forEach((n, i) => { pts += rateHold(Math.min(1, (holdRef.current[i] ?? 0) / n.dur)).points; });
    const pct = notes.length ? Math.round((pts / (notes.length * 100)) * 100) : 0;
    const s = starsFor(pct);
    setResult({ pct, ...s });
    setPhase('done');
    stopAll();
    if (!paidRef.current) { paidRef.current = true; onScore(s.stars * 8); }
  };

  const loop = () => {
    const ctx = ctxRef.current;
    if (!ctx || !sing) return;
    const t = ctx.currentTime - startAtRef.current;
    setCountdown(t < 0 ? Math.ceil(-t / beatSeconds(sing)) : 0);

    let userMidi: number | null = null;
    if (phaseRef.current === 'sing' && analyserRef.current && t >= 0) {
      const buf = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buf);
      const f = detectPitch(buf, ctx.sampleRate);
      if (f > 0) userMidi = freqToMidi(f);
    }
    const active = notesRef.current.findIndex((n) => t >= n.start && t < n.start + n.dur);
    const dt = Math.max(0, Math.min(0.1, t - lastTRef.current));
    lastTRef.current = t;
    // Credit the note only while you hold your voice STEADY on it — that's the
    // breath-control skill. Off-pitch or silent time doesn't count.
    if (phaseRef.current === 'sing' && active >= 0 && userMidi != null
      && semitonesOff(userMidi, notesRef.current[active].midi) <= HOLD_TOLERANCE) {
      holdRef.current[active] = (holdRef.current[active] ?? 0) + dt;
    }
    if (userMidi != null && ctx.currentTime * 8 % 1 < 0.14) setLiveNote(noteName(userMidi));

    draw(Math.max(0, t), userMidi, active);

    if (t > melodySeconds(sing) + 0.4) { if (phaseRef.current === 'sing') finish(); else setPhase('idle'); return; }
    rafRef.current = requestAnimationFrame(loop);
  };

  const startListen = () => {
    if (!sing) return;
    const ctx = ensureCtx();
    const notes = noteTimes(sing);
    notesRef.current = notes;
    const t0 = ctx.currentTime + 0.2;
    notes.forEach((n) => playVoice(ctx, ctx.destination, n.midi, t0 + n.start, n.dur));
    startAtRef.current = t0;
    setPhase('listen');
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const startSing = async () => {
    if (!sing) return;
    const ctx = ensureCtx();
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      setMicError('We need the microphone to hear you sing. Allow it in your browser, then tap 🎤 Sing again — or tap 🔊 Listen to just hear the tune.');
      return;
    }
    const notes = noteTimes(sing);
    notesRef.current = notes;
    holdRef.current = [];
    lastTRef.current = 0;
    setResult(null);
    // count-in ticks, then the melody
    const t0 = ctx.currentTime + 0.25 + COUNT_IN * beatSeconds(sing);
    for (let b = 0; b < COUNT_IN; b += 1) playTone(ctx, ctx.destination, 84, ctx.currentTime + 0.25 + b * beatSeconds(sing), 0.08, 0.18, 'square');
    startAtRef.current = t0;
    setPhase('sing');
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopPlay = () => { cancelAnimationFrame(rafRef.current); stopAll(); setPhase('idle'); setCountdown(0); };

  // Size the canvas to its box.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [sing]);

  // ---- song picker ----
  if (!sing) {
    return <main className="sing-page">
      <header className="sing-top"><button onClick={onBack}>← Back</button><span>🎤 Sing Star</span></header>
      <div className="sing-intro">
        <h1>🎤 Sing Star</h1>
        <p>Pick a tune, tap <b>🔊 Listen</b>, then <b>🎤 Sing</b> it back. The game scores how long you <b>hold each note steady</b> — real breath control, the way a great singer sustains a note. The <b>long notes</b> are where the points are: take a big breath and hold ONE steady pitch as the bar fills green! 🎧 Headphones help.</p>
        <div className="sing-list">
          {SINGS.map((s) => <button key={s.id} className="sing-card" onClick={() => { setSing(s); setPhase('idle'); setResult(null); }}>
            <span className="sing-emoji">{s.emoji}</span>
            <strong>{s.title}<small>{s.style}</small></strong>
            <i>{s.notes.length} notes</i>
          </button>)}
        </div>
        <p className="sing-note">🎶 These are all original tunes made for the game — inspired by pop but not any real song, so it's totally safe to sing and share.</p>
      </div>
    </main>;
  }

  const playing = phase === 'listen' || phase === 'sing';

  return <main className="sing-page playing">
    <header className="sing-top">
      <button onClick={() => { stopPlay(); setSing(null); }}>← Songs</button>
      <span>{sing.emoji} {sing.title} · {sing.style}</span>
    </header>

    <div className="sing-stage">
      <canvas ref={canvasRef} className="sing-canvas" />
      {phase === 'sing' && countdown > 0 && <div className="sing-count">{countdown}</div>}
      {phase === 'sing' && countdown === 0 && <div className="sing-live">🎤 Hold it steady! {liveNote && <b>{liveNote}</b>}</div>}
      {phase === 'listen' && <div className="sing-live">🎙️ Listen — a voice sings the tune to match</div>}
      {phase === 'idle' && !result && <div className="sing-hint">🔊 Listen first, then 🎤 Sing it back</div>}
    </div>

    {micError && <p className="sing-error">{micError}</p>}

    {result && phase === 'done' && <div className="sing-result">
      <div className="sing-stars">{'⭐'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</div>
      <strong>{result.pct}% in tune</strong>
      <p>{result.message}</p>
    </div>}

    <div className="sing-controls">
      {!playing
        ? <>
          <button className="sing-btn listen" onClick={startListen}>🔊 Listen</button>
          <button className="sing-btn sing" onClick={startSing}>🎤 {result ? 'Sing again' : 'Sing'}</button>
        </>
        : <button className="sing-btn stop" onClick={stopPlay}>■ Stop</button>}
    </div>
  </main>;
}
