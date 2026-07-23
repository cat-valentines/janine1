import { useEffect, useRef, useState } from 'react';
import type { FriendRow } from '../lib/players';
import { sendMediaTo } from '../lib/media';
import { sendGroupMedia } from '../lib/groups';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥' };

// Filters are plain CSS filter strings — applied live to the preview and baked into
// the captured photo/video, so what you see is exactly what your friend gets.
const FILTERS = [
  { id: 'none', label: 'None', css: 'none' },
  { id: 'warm', label: 'Warm', css: 'sepia(.45) saturate(1.4) contrast(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(-18deg) saturate(1.3) brightness(1.05)' },
  { id: 'mono', label: 'B&W', css: 'grayscale(1) contrast(1.12)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.9) contrast(1.1)' },
  { id: 'dream', label: 'Dreamy', css: 'brightness(1.15) saturate(1.2) blur(.7px)' },
  { id: 'retro', label: 'Retro', css: 'sepia(.4) hue-rotate(-12deg) saturate(1.5) contrast(1.15)' },
];
const MAX_SECS = 8;

interface Props { me: string; friend?: FriendRow; group?: { id: string; name: string }; friends: FriendRow[]; onSent: () => void; onClose: () => void }

interface Shot { url: string; blob: Blob; kind: 'photo' | 'video'; ext: string; type: string }

export function SelfieStudio({ me, friend, group, friends, onSent, onClose }: Props) {
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [filter, setFilter] = useState('none');
  const [shot, setShot] = useState<Shot | null>(null);
  const [recips, setRecips] = useState<Set<string>>(new Set(friend ? [friend.id] : []));
  const [toSelf, setToSelf] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef(0);
  const timer = useRef(0);
  const shotRef = useRef<Shot | null>(null);
  shotRef.current = shot;

  const css = FILTERS.find((f) => f.id === filter)?.css ?? 'none';
  const mates = friends.filter((f) => f.status === 'accepted');

  const stopCamera = () => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
    if (recRef.current && recRef.current.state !== 'inactive') { try { recRef.current.stop(); } catch { /* ignore */ } }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

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
    const v = videoRef.current; if (!v || !streamRef.current) return;
    const w = v.videoWidth || 640, h = v.videoHeight || 640;
    const scale = Math.min(1, 720 / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.filter = css;
    ctx.translate(cw, 0); ctx.scale(-1, 1);   // mirror, to match the selfie preview
    ctx.drawImage(v, 0, 0, cw, ch);
    canvas.toBlob((blob) => { if (blob) setShot({ url: URL.createObjectURL(blob), blob, kind: 'photo', ext: 'jpg', type: 'image/jpeg' }); }, 'image/jpeg', 0.82);
  };

  const pickMime = () => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';

  const startVideo = () => {
    const v = videoRef.current, s = streamRef.current; if (!v || !s) return;
    const mime = pickMime();
    if (!mime) { setErr('Video recording is not supported on this device — try a photo instead.'); return; }
    const w = v.videoWidth || 480, h = v.videoHeight || 480;
    const scale = Math.min(1, 560 / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const draw = () => { ctx.filter = css; ctx.save(); ctx.translate(cw, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, cw, ch); ctx.restore(); raf.current = requestAnimationFrame(draw); };
    draw();
    const out = canvas.captureStream(30);
    s.getAudioTracks().forEach((t) => out.addTrack(t));
    const rec = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(raf.current);
      const type = mime.split(';')[0];
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      setShot({ url: URL.createObjectURL(new Blob(chunks.current, { type })), blob: new Blob(chunks.current, { type }), kind: 'video', ext, type });
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
        </div>}

        <div className="selfie-stage">
          {!shot && <video ref={videoRef} muted playsInline autoPlay style={{ filter: css, transform: 'scaleX(-1)' }} />}
          {shot?.kind === 'photo' && <img src={shot.url} alt="Your selfie" />}
          {shot?.kind === 'video' && <video src={shot.url} controls playsInline />}
          {recording && <span className="selfie-rec">● REC {secs}s</span>}
          {err && <p className="selfie-err">{err}</p>}
        </div>

        {!shot && <div className="selfie-filters">
          {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            <i style={{ filter: f.css === 'none' ? 'none' : f.css }} />{f.label}
          </button>)}
        </div>}

        {!shot
          ? <div className="selfie-capture">
              {mode === 'photo'
                ? <button className="selfie-shutter" onClick={takePhoto} disabled={!!err}>◉ Take photo</button>
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
