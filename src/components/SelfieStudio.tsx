import { useEffect, useRef, useState } from 'react';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { FriendRow } from '../lib/players';
import { sendMediaTo } from '../lib/media';
import { sendGroupMedia } from '../lib/groups';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥' };

// ---- Filters --------------------------------------------------------------
// Two kinds: colour filters (a CSS filter string baked into the frame) and fun
// face filters (stickers drawn over the frame, positioned for a centred selfie).
// The preview is a live canvas, so a filter is drawn the exact same way whether
// it's a still preview, a captured photo, or a recorded video frame.
type Filt = { id: string; label: string; css?: string; icon?: string; draw?: (ctx: CanvasRenderingContext2D, S: number) => void };

const TAU = Math.PI * 2;
function emoji(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number) {
  ctx.save(); ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y); ctx.restore();
}
function whiskers(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2; ctx.strokeStyle = '#00000077'; ctx.lineWidth = S * 0.006; ctx.lineCap = 'round';
  for (const s of [-1, 1]) for (const dy of [-0.022, 0, 0.022]) { ctx.beginPath(); ctx.moveTo(cx + s * S * 0.05, S * 0.56); ctx.lineTo(cx + s * S * 0.28, S * 0.56 + dy * S); ctx.stroke(); }
}

function drawDog(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(cx + s * S * 0.34, S * 0.17); ctx.rotate(s * 0.35);
    ctx.fillStyle = '#6b4326'; ctx.beginPath(); ctx.ellipse(0, 0, S * 0.11, S * 0.21, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#95643c'; ctx.beginPath(); ctx.ellipse(0, S * 0.03, S * 0.06, S * 0.14, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#241a16'; ctx.beginPath(); ctx.ellipse(cx, S * 0.52, S * 0.055, S * 0.042, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff88'; ctx.beginPath(); ctx.ellipse(cx - S * 0.016, S * 0.505, S * 0.014, S * 0.01, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8657f'; ctx.beginPath(); ctx.ellipse(cx, S * 0.66, S * 0.05, S * 0.075, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c94f68'; ctx.lineWidth = S * 0.006; ctx.beginPath(); ctx.moveTo(cx, S * 0.60); ctx.lineTo(cx, S * 0.72); ctx.stroke();
}
function drawCat(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  for (const s of [-1, 1]) {
    const ex = cx + s * S * 0.17;
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.moveTo(ex - S * 0.09, S * 0.20); ctx.lineTo(ex, S * 0.02); ctx.lineTo(ex + S * 0.09, S * 0.20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3a6c0'; ctx.beginPath(); ctx.moveTo(ex - S * 0.045, S * 0.17); ctx.lineTo(ex, S * 0.075); ctx.lineTo(ex + S * 0.045, S * 0.17); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#e87a97'; ctx.beginPath(); ctx.moveTo(cx - S * 0.03, S * 0.52); ctx.lineTo(cx + S * 0.03, S * 0.52); ctx.lineTo(cx, S * 0.555); ctx.closePath(); ctx.fill();
  whiskers(ctx, S);
}
function drawBunny(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(cx + s * S * 0.10, S * 0.16); ctx.rotate(s * 0.12);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e6d7df'; ctx.lineWidth = S * 0.006;
    ctx.beginPath(); ctx.ellipse(0, 0, S * 0.055, S * 0.20, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6b8cd'; ctx.beginPath(); ctx.ellipse(0, S * 0.01, S * 0.028, S * 0.15, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f0899f'; ctx.beginPath(); ctx.ellipse(cx, S * 0.53, S * 0.03, S * 0.022, 0, 0, TAU); ctx.fill();
  whiskers(ctx, S);
}
function drawMakeup(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(cx + s * S * 0.21, S * 0.57, 2, cx + s * S * 0.21, S * 0.57, S * 0.09);
    g.addColorStop(0, '#ff6a9955'); g.addColorStop(1, '#ff6a9900');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + s * S * 0.21, S * 0.57, S * 0.09, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#d13b63'; ctx.beginPath(); ctx.ellipse(cx, S * 0.66, S * 0.06, S * 0.028, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff66'; ctx.beginPath(); ctx.ellipse(cx - S * 0.02, S * 0.652, S * 0.02, S * 0.008, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#241018'; ctx.lineWidth = S * 0.007; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { const ex = cx + s * S * 0.145; for (const dx of [-0.03, 0, 0.03]) { ctx.beginPath(); ctx.moveTo(ex + dx * S, S * 0.40); ctx.quadraticCurveTo(ex + dx * S, S * 0.365, ex + dx * S + s * S * 0.02, S * 0.36); ctx.stroke(); } }
  emoji(ctx, '✨', cx + S * 0.28, S * 0.30, S * 0.09); emoji(ctx, '💖', cx - S * 0.30, S * 0.44, S * 0.07);
}
function drawShades(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2, eyeY = S * 0.42;
  ctx.fillStyle = '#111';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * S * 0.145, eyeY, S * 0.085, S * 0.06, 0, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#111'; ctx.lineWidth = S * 0.022; ctx.beginPath(); ctx.moveTo(cx - S * 0.06, eyeY); ctx.lineTo(cx + S * 0.06, eyeY); ctx.stroke();
  ctx.fillStyle = '#ffffff55'; for (const s of [-1, 1]) { ctx.save(); ctx.translate(cx + s * S * 0.145 - S * 0.03, eyeY - S * 0.02); ctx.rotate(-0.5); ctx.beginPath(); ctx.ellipse(0, 0, S * 0.03, S * 0.014, 0, 0, TAU); ctx.fill(); ctx.restore(); }
}
function drawDisguise(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2, eyeY = S * 0.42;
  ctx.fillStyle = '#4a3526'; for (const s of [-1, 1]) { ctx.save(); ctx.translate(cx + s * S * 0.145, eyeY - S * 0.10); ctx.beginPath(); ctx.ellipse(0, 0, S * 0.08, S * 0.028, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = S * 0.012;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * S * 0.145, eyeY, S * 0.075, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - S * 0.07, eyeY); ctx.lineTo(cx + S * 0.07, eyeY); ctx.stroke();
  ctx.fillStyle = '#4a3526'; ctx.beginPath();
  ctx.moveTo(cx, S * 0.58);
  ctx.bezierCurveTo(cx - S * 0.10, S * 0.55, cx - S * 0.17, S * 0.60, cx - S * 0.12, S * 0.65);
  ctx.bezierCurveTo(cx - S * 0.08, S * 0.60, cx - S * 0.03, S * 0.61, cx, S * 0.625);
  ctx.bezierCurveTo(cx + S * 0.03, S * 0.61, cx + S * 0.08, S * 0.60, cx + S * 0.12, S * 0.65);
  ctx.bezierCurveTo(cx + S * 0.17, S * 0.60, cx + S * 0.10, S * 0.55, cx, S * 0.58);
  ctx.fill();
}
function drawClown(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  ctx.fillStyle = '#ff7a9a88'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * S * 0.20, S * 0.58, S * 0.055, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#e23'; ctx.beginPath(); ctx.arc(cx, S * 0.54, S * 0.055, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff77'; ctx.beginPath(); ctx.arc(cx - S * 0.018, S * 0.525, S * 0.016, 0, TAU); ctx.fill();
  emoji(ctx, '🎉', cx, S * 0.12, S * 0.17);
}
function drawHearts(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2, eyeY = S * 0.42;
  emoji(ctx, '😍', cx, S * 0.12, S * 0.13);
  emoji(ctx, '❤️', cx - S * 0.145, eyeY, S * 0.15); emoji(ctx, '❤️', cx + S * 0.145, eyeY, S * 0.15);
}
function drawCrown(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2;
  emoji(ctx, '👑', cx, S * 0.12, S * 0.21);
  emoji(ctx, '✨', cx + S * 0.26, S * 0.22, S * 0.08); emoji(ctx, '✨', cx - S * 0.27, S * 0.24, S * 0.07);
}
function drawGoogly(ctx: CanvasRenderingContext2D, S: number) {
  const cx = S / 2, eyeY = S * 0.42;
  for (const s of [-1, 1]) {
    const ex = cx + s * S * 0.145;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = S * 0.006;
    ctx.beginPath(); ctx.arc(ex, eyeY, S * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + s * S * 0.025, eyeY + S * 0.025, S * 0.032, 0, TAU); ctx.fill();
  }
}

const FILTERS: Filt[] = [
  { id: 'none', label: 'None', css: 'none' },
  // Fun face filters first, so they're front-and-centre on a phone.
  { id: 'dog', label: 'Doggo', icon: '🐶', draw: drawDog },
  { id: 'cat', label: 'Kitty', icon: '🐱', draw: drawCat },
  { id: 'bunny', label: 'Bunny', icon: '🐰', draw: drawBunny },
  { id: 'makeup', label: 'Makeup', icon: '💄', draw: drawMakeup },
  { id: 'shades', label: 'Shades', icon: '😎', draw: drawShades },
  { id: 'clown', label: 'Clown', icon: '🤡', draw: drawClown },
  { id: 'disguise', label: 'Silly', icon: '🥸', draw: drawDisguise },
  { id: 'hearts', label: 'Love', icon: '😍', draw: drawHearts },
  { id: 'crown', label: 'Queen', icon: '👑', draw: drawCrown },
  { id: 'googly', label: 'Googly', icon: '👀', draw: drawGoogly },
  // Colour filters after.
  { id: 'warm', label: 'Warm', css: 'sepia(.45) saturate(1.4) contrast(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(-18deg) saturate(1.3) brightness(1.05)' },
  { id: 'mono', label: 'B&W', css: 'grayscale(1) contrast(1.12)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.9) contrast(1.1)' },
  { id: 'dream', label: 'Dreamy', css: 'brightness(1.15) saturate(1.2) blur(.7px)' },
  { id: 'retro', label: 'Retro', css: 'sepia(.4) hue-rotate(-12deg) saturate(1.5) contrast(1.15)' },
];
const MAX_SECS = 8;
const CANVAS = 600;
const GIF_SIZE = 320, GIF_FPS = 10, GIF_FRAMES = 20;   // ~2s looping GIF

/** Turn captured RGBA frames into an animated GIF blob (gifenc, no worker needed). */
function encodeGif(frames: Uint8ClampedArray[], size: number) {
  const enc = GIFEncoder();
  const delay = Math.round(1000 / GIF_FPS);
  for (const data of frames) {
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, size, size, { palette, delay });
  }
  enc.finish();
  return new Blob([new Uint8Array(enc.bytes())], { type: 'image/gif' });
}
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

interface Props { me: string; friend?: FriendRow; group?: { id: string; name: string }; friends: FriendRow[]; onSent: () => void; onClose: () => void }
interface Shot { url: string; blob: Blob; kind: 'photo' | 'video'; ext: string; type: string }
type Mode = 'photo' | 'video' | 'gif';

function drawFrame(c: HTMLCanvasElement, v: HTMLVideoElement, filt: Filt) {
  const S = c.width; const ctx = c.getContext('2d'); if (!ctx) return;
  const vw = v.videoWidth || S, vh = v.videoHeight || S;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2, sy = (vh - side) / 2;
  ctx.save();
  ctx.filter = filt.css && filt.css !== 'none' ? filt.css : 'none';
  ctx.translate(S, 0); ctx.scale(-1, 1);        // mirror, like a real selfie
  ctx.drawImage(v, sx, sy, side, side, 0, 0, S, S);
  ctx.restore();
  ctx.filter = 'none';
  filt.draw?.(ctx, S);
}

export function SelfieStudio({ me, friend, group, friends, onSent, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('photo');
  const [filter, setFilter] = useState('none');
  const [shot, setShot] = useState<Shot | null>(null);
  const [recips, setRecips] = useState<Set<string>>(new Set(friend ? [friend.id] : []));
  const [toSelf, setToSelf] = useState(false);
  const [recording, setRecording] = useState(false);
  const [gifMaking, setGifMaking] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const loopRaf = useRef(0);
  const timer = useRef(0);
  const gifAbort = useRef(false);
  const shotRef = useRef<Shot | null>(null); shotRef.current = shot;
  const filtRef = useRef<Filt>(FILTERS[0]); filtRef.current = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];

  const mates = friends.filter((f) => f.status === 'accepted');

  const stopCamera = () => {
    window.clearTimeout(timer.current);
    gifAbort.current = true;
    if (recRef.current && recRef.current.state !== 'inactive') { try { recRef.current.stop(); } catch { /* ignore */ } }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // One render loop for the whole component: it draws the live camera + filter to
  // the preview canvas, which is also what photos and videos are captured from.
  useEffect(() => {
    const loop = () => {
      loopRaf.current = requestAnimationFrame(loop);
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c || shotRef.current || v.readyState < 2) return;
      drawFrame(c, v, filtRef.current);
    };
    loopRaf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRaf.current);
  }, []);

  // (Re)start the camera whenever the mode changes — video mode also needs the mic.
  useEffect(() => {
    let cancelled = false;
    setErr(''); setShot(null); setRecording(false); setSecs(0);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: mode === 'video' })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => undefined); }
      })
      .catch(() => setErr('Camera unavailable — allow camera (and mic for video) access, then reopen.'));
    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => () => { if (shotRef.current) URL.revokeObjectURL(shotRef.current.url); }, []);

  const takePhoto = () => {
    const c = canvasRef.current, v = videoRef.current;
    if (!c || !v || v.readyState < 2) return;
    drawFrame(c, v, filtRef.current);   // ensure the very latest frame
    c.toBlob((blob) => { if (blob) setShot({ url: URL.createObjectURL(blob), blob, kind: 'photo', ext: 'jpg', type: 'image/jpeg' }); }, 'image/jpeg', 0.82);
  };

  const pickMime = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';

  const startVideo = () => {
    const c = canvasRef.current, s = streamRef.current; if (!c || !s) return;
    const mime = pickMime();
    if (!mime) { setErr('Video recording is not supported on this device — try a photo instead.'); return; }
    const out = c.captureStream(30);
    s.getAudioTracks().forEach((t) => out.addTrack(t));
    const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const type = mime.split(';')[0];
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks.current, { type });
      setShot({ url: URL.createObjectURL(blob), blob, kind: 'video', ext, type });
      setRecording(false); setSecs(0);
    };
    recRef.current = rec; rec.start();
    setRecording(true); setSecs(0);
    const started = performance.now();
    const tick = () => {
      const el = Math.min(MAX_SECS, Math.floor((performance.now() - started) / 1000));
      setSecs(el);
      if (el >= MAX_SECS) { stopVideo(); return; }
      timer.current = window.setTimeout(tick, 250);
    };
    timer.current = window.setTimeout(tick, 250);
  };

  const stopVideo = () => { window.clearTimeout(timer.current); if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); };

  // GIF: sample the (already filtered) preview canvas ~10 fps for 2s, then encode.
  const startGif = async () => {
    const c = canvasRef.current, v = videoRef.current;
    if (!c || !v || v.readyState < 2) { setErr('Camera not ready yet — give it a second.'); return; }
    gifAbort.current = false;
    setErr(''); setRecording(true); setSecs(0);
    const g = document.createElement('canvas'); g.width = GIF_SIZE; g.height = GIF_SIZE;
    const gctx = g.getContext('2d'); if (!gctx) { setRecording(false); return; }
    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < GIF_FRAMES; i += 1) {
      if (gifAbort.current) { setRecording(false); return; }
      gctx.drawImage(c, 0, 0, GIF_SIZE, GIF_SIZE);          // c is kept fresh by the render loop
      frames.push(gctx.getImageData(0, 0, GIF_SIZE, GIF_SIZE).data);
      setSecs(Math.round(((i + 1) / GIF_FRAMES) * (GIF_FRAMES / GIF_FPS) * 10) / 10);
      await sleep(1000 / GIF_FPS);
    }
    setRecording(false);
    setGifMaking(true);
    await sleep(30);                                         // let the "Making GIF…" state paint
    try {
      const blob = encodeGif(frames, GIF_SIZE);
      if (!gifAbort.current) setShot({ url: URL.createObjectURL(blob), blob, kind: 'photo', ext: 'gif', type: 'image/gif' });
    } catch { setErr('Could not make the GIF — try again.'); }
    finally { setGifMaking(false); setSecs(0); }
  };

  const retake = () => { if (shot) URL.revokeObjectURL(shot.url); setShot(null); };
  const toggleRecip = (id: string) => setRecips((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = async () => {
    if (!shot) return;
    if (group) {
      setBusy(true); setErr('');
      try {
        await sendGroupMedia(group.id, me, shot.kind, shot.blob, shot.ext, shot.type);
        if (toSelf) await sendMediaTo(me, me, shot.kind, shot.blob, shot.ext, shot.type);
        setDone('Sent to the group! 🎉'); onSent(); window.setTimeout(onClose, 950);
      } catch { setErr('Could not send — please try again.'); }
      finally { setBusy(false); }
      return;
    }
    const targets = new Set(recips); if (toSelf) targets.add(me);
    if (!targets.size) { setErr('Pick a friend, or choose 🔒 Just me.'); return; }
    setBusy(true); setErr('');
    try {
      for (const r of targets) await sendMediaTo(me, r, shot.kind, shot.blob, shot.ext, shot.type);
      setDone(`Sent to ${targets.size} ${targets.size === 1 ? 'person' : 'people'}! 🎉`);
      onSent();
      window.setTimeout(onClose, 950);
    } catch { setErr('Could not send — please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="quest-over" onClick={onClose}>
      <div className="selfie-studio" onClick={(e) => e.stopPropagation()}>
        <div className="selfie-head"><strong>{group ? `📸 Photo for ${group.name}` : `📸 Selfie for @${friend?.name ?? 'a friend'}`}</strong><button className="selfie-x" onClick={onClose} aria-label="Close">✕</button></div>

        {!shot && <div className="selfie-tabs">
          <button className={mode === 'photo' ? 'on' : ''} onClick={() => setMode('photo')}>📷 Photo</button>
          <button className={mode === 'video' ? 'on' : ''} onClick={() => setMode('video')}>🎬 Video</button>
          <button className={mode === 'gif' ? 'on' : ''} onClick={() => setMode('gif')}>🔁 GIF</button>
        </div>}

        <div className="selfie-stage">
          {/* Live source — kept covered (not display:none) so its frames keep decoding on all devices. */}
          <video className="selfie-src" ref={videoRef} muted playsInline autoPlay />
          {!shot && <canvas className="selfie-cam" ref={canvasRef} width={CANVAS} height={CANVAS} />}
          {shot?.kind === 'photo' && <img src={shot.url} alt="Your selfie" />}
          {shot?.kind === 'video' && <video src={shot.url} controls playsInline />}
          {recording && <span className="selfie-rec">{mode === 'gif' ? `🔁 GIF ${secs}s` : `● REC ${secs}s`}</span>}
          {gifMaking && <span className="selfie-making">✨ Making your GIF…</span>}
          {err && <p className="selfie-err">{err}</p>}
        </div>

        {!shot && <>
          <p className="selfie-filters-hint">🎭 Filters — swipe for dog, cat, makeup &amp; more →</p>
          <div className="selfie-filters">
            {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.icon ? <span className="filter-emoji">{f.icon}</span> : <i style={{ filter: f.css === 'none' ? 'none' : f.css }} />}{f.label}
            </button>)}
          </div>
        </>}

        {!shot
          ? <div className="selfie-capture">
              {mode === 'photo'
                ? <button className="selfie-shutter" onClick={takePhoto} disabled={!!err}>◉ Take photo</button>
                : mode === 'gif'
                  ? <button className="selfie-shutter gif" onClick={startGif} disabled={!!err || recording || gifMaking}>{recording ? `🔁 Recording… ${secs}s` : gifMaking ? '✨ Making GIF…' : '🔁 Make a GIF'}</button>
                  : recording
                    ? <button className="selfie-shutter rec" onClick={stopVideo}>■ Stop · {secs}s</button>
                    : <button className="selfie-shutter" onClick={startVideo} disabled={!!err}>● Record <small>(max {MAX_SECS}s)</small></button>}
            </div>
          : done
            ? <p className="selfie-sent">{done}</p>
            : <>
                <div className="selfie-recips">
                  <p className="selfie-recips-title">Send to:</p>
                  {group
                    ? <label className="selfie-recip on"><input type="checkbox" checked readOnly /><span>👥 {group.name} (everyone in the group)</span></label>
                    : mates.map((f) => <label key={f.id} className={`selfie-recip ${recips.has(f.id) ? 'on' : ''}`}><input type="checkbox" checked={recips.has(f.id)} onChange={() => toggleRecip(f.id)} /><span>{icons[f.character_id] ?? '🙂'} @{f.name}</span></label>)}
                  <label className={`selfie-recip ${toSelf ? 'on' : ''}`}><input type="checkbox" checked={toSelf} onChange={() => setToSelf((v) => !v)} /><span>🔒 Also save to just me</span></label>
                </div>
                <div className="selfie-actions">
                  <button className="ghost" onClick={retake}>↺ Retake</button>
                  <button className="selfie-send" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send ➤'}</button>
                </div>
              </>}

        <p className="selfie-safe">🔒 Only the people you pick can open this. Your friends <b>can't</b> forward it — only you can resend it later.</p>
      </div>
    </div>
  );
}
