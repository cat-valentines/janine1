import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  RTC_CONFIG, joinChannel, leaveChannel, logMissedCall, newCallId, sendSignal, signalUser, type CallSignal,
} from '../lib/calls';
import { callTone, startRing, stopRing } from '../lib/sfx';

type Status = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active';
interface CallMeta { callId: string; peerId: string; peerName: string; incoming: boolean; video: boolean }

function mmss(s: number) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }

/**
 * Global voice-call centre — mounted once at the app root so a call can ring you
 * anywhere. Listens on your personal `calls-<id>` channel for incoming calls, and
 * runs the WebRTC audio connection over a shared `call-<callId>` channel.
 */
export function CallCenter() {
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [peerName, setPeerName] = useState('');
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const [video, setVideo] = useState(false);      // is the current call a video call?
  const [camOff, setCamOff] = useState(false);
  const [hasCam, setHasCam] = useState(false);    // did we actually get a camera track?
  const [mini, setMini] = useState(false);        // small floating window vs full screen

  const pc = useRef<RTCPeerConnection | null>(null);
  const shared = useRef<RealtimeChannel | null>(null);
  const local = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeout = useRef<number | null>(null);
  const tick = useRef<number | null>(null);
  const call = useRef<CallMeta | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  // Wire the audio/video streams into their elements (re-runs on render so the refs
  // are always current, even though the overlay mounts after state updates).
  const attachMedia = () => {
    if (call.current?.video) { if (remoteVideo.current && remoteStream.current) { remoteVideo.current.srcObject = remoteStream.current; remoteVideo.current.play().catch(() => undefined); } }
    else if (remoteAudio.current && remoteStream.current) { remoteAudio.current.srcObject = remoteStream.current; remoteAudio.current.play().catch(() => undefined); }
    if (localVideo.current && local.current) { localVideo.current.srcObject = local.current; localVideo.current.play().catch(() => undefined); }
  };

  // Who am I? (works only for signed-in players — calls need a real account.)
  useEffect(() => {
    const load = (user: { id: string; user_metadata?: Record<string, unknown> } | null | undefined) =>
      setMe(user ? { id: user.id, name: String(user.user_metadata?.display_name ?? user.user_metadata?.name ?? 'a friend') } : null);
    supabase.auth.getUser().then(({ data }) => load(data.user)).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const cleanup = () => {
    if (ringTimeout.current !== null) { clearTimeout(ringTimeout.current); ringTimeout.current = null; }
    if (tick.current !== null) { clearInterval(tick.current); tick.current = null; }
    stopRing();
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    if (pc.current) { try { pc.current.close(); } catch { /* already closed */ } pc.current = null; }
    leaveChannel(shared.current); shared.current = null;
    pendingIce.current = [];
    call.current = null;
    remoteStream.current = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteAudio.current) remoteAudio.current.srcObject = null;
    setStatus('idle'); setMuted(false); setSecs(0); setVideo(false); setCamOff(false); setHasCam(false); setMini(false);
  };

  const flushIce = async () => {
    const p = pc.current; if (!p) return;
    for (const c of pendingIce.current) { try { await p.addIceCandidate(c); } catch { /* ignore */ } }
    pendingIce.current = [];
  };

  const setupPeer = () => {
    const p = new RTCPeerConnection(RTC_CONFIG);
    p.onicecandidate = (e) => {
      const c = call.current;
      if (e.candidate && shared.current && c) sendSignal(shared.current, { ev: 'ice', callId: c.callId, from: meRef.current?.id ?? '', candidate: JSON.stringify(e.candidate) });
    };
    p.ontrack = (e) => { remoteStream.current = e.streams[0]; attachMedia(); };
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') {
        setStatus('active'); callTone('connect');
        if (tick.current === null) tick.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
      } else if (p.connectionState === 'failed') { setErr('Call dropped — could not connect.'); cleanup(); }
    };
    pc.current = p;
    return p;
  };

  const getMedia = async (withVideo: boolean) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo ? { facingMode: 'user' } : false });
    } catch (e) {
      // Camera blocked or missing — still make the call, just voice (no camera).
      if (!withVideo) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    local.current = stream;
    stream.getTracks().forEach((t) => pc.current?.addTrack(t, stream));
    const cam = stream.getVideoTracks().length > 0;
    setHasCam(cam); if (!cam) setCamOff(true);   // no camera → show it as off
    attachMedia();
  };

  // ---- shared call-channel signalling (offer/answer/ice/hangup) ----
  const onShared = async (sig: CallSignal) => {
    const c = call.current; const p = pc.current;
    if (!c || sig.callId !== c.callId || !p) return;
    try {
      if (sig.ev === 'accept' && !c.incoming) {
        if (ringTimeout.current !== null) { clearTimeout(ringTimeout.current); ringTimeout.current = null; }
        const offer = await p.createOffer(); await p.setLocalDescription(offer);
        sendSignal(shared.current!, { ev: 'offer', callId: c.callId, from: meRef.current?.id ?? '', sdp: JSON.stringify(offer) });
        setStatus('connecting');
      } else if (sig.ev === 'offer' && c.incoming && sig.sdp) {
        await p.setRemoteDescription(JSON.parse(sig.sdp)); await flushIce();
        const answer = await p.createAnswer(); await p.setLocalDescription(answer);
        sendSignal(shared.current!, { ev: 'answer', callId: c.callId, from: meRef.current?.id ?? '', sdp: JSON.stringify(answer) });
        setStatus('connecting');
      } else if (sig.ev === 'answer' && !c.incoming && sig.sdp) {
        await p.setRemoteDescription(JSON.parse(sig.sdp)); await flushIce();
      } else if (sig.ev === 'ice' && sig.candidate) {
        const cand = JSON.parse(sig.candidate) as RTCIceCandidateInit;
        if (p.remoteDescription) { try { await p.addIceCandidate(cand); } catch { /* ignore */ } }
        else pendingIce.current.push(cand);
      } else if (sig.ev === 'hangup') {
        callTone('end'); cleanup();
      }
    } catch { setErr('Call error.'); cleanup(); }
  };

  // ---- personal-channel signalling (incoming ring / decline / busy) ----
  const onPersonal = (sig: CallSignal) => {
    if (sig.ev === 'ring') {
      if (status !== 'idle' || call.current) { signalUser(sig.from, { ev: 'hangup', reason: 'busy', callId: sig.callId, from: meRef.current?.id ?? '' }); return; }
      call.current = { callId: sig.callId, peerId: sig.from, peerName: sig.fromName || 'a friend', incoming: true, video: !!sig.video };
      setPeerName(call.current.peerName); setVideo(!!sig.video); setErr(''); setStatus('incoming'); startRing();
    } else if (sig.ev === 'hangup') {
      const c = call.current;
      if (c && sig.callId === c.callId && !c.incoming) { setErr(sig.reason === 'busy' ? `${c.peerName} is busy right now.` : `${c.peerName} declined.`); cleanup(); }
    }
  };
  const onPersonalRef = useRef(onPersonal);
  onPersonalRef.current = onPersonal;
  const onSharedRef = useRef(onShared);
  onSharedRef.current = onShared;

  // Subscribe to my personal channel while signed in.
  useEffect(() => {
    if (!me) return;
    let ch: RealtimeChannel | null = null;
    joinChannel(`calls-${me.id}`, (s) => onPersonalRef.current(s)).then((c) => { ch = c; });
    return () => { leaveChannel(ch); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----
  const startCall = async (peerId: string, name: string, wantVideo: boolean) => {
    if (!meRef.current) { setErr('Log in to call your friends.'); return; }
    if (status !== 'idle' || call.current) return;
    setErr('');
    const id = newCallId();
    call.current = { callId: id, peerId, peerName: name, incoming: false, video: wantVideo };
    setPeerName(name); setVideo(wantVideo); setStatus('calling');
    try {
      shared.current = await joinChannel(`call-${id}`, (s) => onSharedRef.current(s));
      setupPeer();
      await getMedia(wantVideo);
      await signalUser(peerId, { ev: 'ring', callId: id, from: meRef.current.id, fromName: meRef.current.name, video: wantVideo });
      ringTimeout.current = window.setTimeout(() => {
        // Still not connected after 30s → treat as a missed call.
        if (call.current && !call.current.incoming && pc.current?.connectionState !== 'connected') {
          logMissedCall(meRef.current!.id, meRef.current!.name, peerId);
          setErr(`${name} didn't answer.`); cleanup();
        }
      }, 30000);
    } catch {
      setErr('Please allow microphone access to make a call.'); cleanup();
    }
  };
  const startCallRef = useRef(startCall);
  startCallRef.current = startCall;

  // The Call button (in Friends) fires this event.
  useEffect(() => {
    const handler = (e: Event) => { const d = (e as CustomEvent).detail as { id: string; name: string; video?: boolean }; if (d?.id) startCallRef.current(d.id, d.name || 'a friend', !!d.video); };
    window.addEventListener('friend-call', handler);
    return () => window.removeEventListener('friend-call', handler);
  }, []);

  const acceptCall = async () => {
    const c = call.current; if (!c) return;
    stopRing(); setStatus('connecting');
    try {
      shared.current = await joinChannel(`call-${c.callId}`, (s) => onSharedRef.current(s));
      setupPeer();
      await getMedia(c.video);
      sendSignal(shared.current, { ev: 'accept', callId: c.callId, from: meRef.current?.id ?? '' });
    } catch {
      setErr('Please allow microphone access to answer.'); cleanup();
    }
  };

  const declineCall = () => {
    const c = call.current; if (!c) return;
    stopRing();
    signalUser(c.peerId, { ev: 'hangup', reason: 'decline', callId: c.callId, from: meRef.current?.id ?? '' });
    cleanup();
  };

  const hangUp = () => {
    const c = call.current;
    if (c && shared.current) sendSignal(shared.current, { ev: 'hangup', reason: 'ended', callId: c.callId, from: meRef.current?.id ?? '' });
    callTone('end'); cleanup();
  };

  const toggleMute = () => {
    const s = local.current; if (!s) return;
    const on = !muted; s.getAudioTracks().forEach((t) => { t.enabled = !on; }); setMuted(on);
  };

  const toggleCam = () => {
    const s = local.current; if (!s) return;
    const off = !camOff; s.getVideoTracks().forEach((t) => { t.enabled = !off; }); setCamOff(off);
  };

  useEffect(() => cleanup, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the media elements wired up as the overlay mounts / the call state changes.
  useEffect(() => { attachMedia(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const statusText = status === 'calling' ? 'Calling…' : status === 'incoming' ? 'is calling you…'
    : status === 'connecting' ? 'Connecting…' : status === 'active' ? `On call · ${mmss(secs)}` : '';

  const controls = status === 'incoming' ? <>
    <button className="call-decline" onClick={declineCall}>✕ Decline</button>
    <button className="call-accept" onClick={acceptCall}>📞 Accept</button>
  </> : <>
    {status === 'active' && <button className={`call-mute ${muted ? 'on' : ''}`} onClick={toggleMute}>{muted ? '🔇' : '🎙️'}</button>}
    {status === 'active' && hasCam && <button className={`call-mute ${camOff ? 'on' : ''}`} onClick={toggleCam} title={camOff ? 'Turn camera on' : 'Turn camera off'}>{camOff ? '📷' : '📹'}</button>}
    <button className="call-hang" onClick={hangUp}>✕ {status === 'calling' ? 'Cancel' : 'Hang up'}</button>
  </>;

  const canResize = status !== 'incoming';   // keep an incoming call full so you can answer it

  return <>
    <audio ref={remoteAudio} autoPlay />
    {status !== 'idle' && video && <div className={`call-overlay video ${mini ? 'mini' : ''}`}>
      <video ref={remoteVideo} className="call-remote-video" autoPlay playsInline onClick={() => mini && setMini(false)} />
      {!mini && <video ref={localVideo} className="call-local-video" autoPlay playsInline muted />}
      {mini ? <div className="call-mini-bar">
        <button onClick={() => setMini(false)} title="Make bigger">⛶</button>
        <span>{mmss(secs)}</span>
        <button className="call-hang" onClick={hangUp} title="Hang up">✕</button>
      </div> : <>
        {canResize && <button className="call-size" onClick={() => setMini(true)} title="Make smaller">🗕</button>}
        <div className="call-vid-info"><strong>@{peerName}</strong><span>{statusText}</span></div>
        <div className="call-buttons call-vid-buttons">{controls}</div>
      </>}
    </div>}
    {status !== 'idle' && !video && <div className={`call-overlay ${mini ? 'mini' : ''}`}>
      <div className={`call-card ${status === 'incoming' ? 'ringing' : ''}`}>
        {canResize && <button className="call-size" onClick={() => setMini(!mini)} title={mini ? 'Make bigger' : 'Make smaller'}>{mini ? '⛶' : '🗕'}</button>}
        <div className="call-avatar">📞</div>
        <strong className="call-name">@{peerName}</strong>
        <p className="call-status">{statusText}</p>
        <div className="call-buttons">{controls}</div>
      </div>
    </div>}
    {err && status === 'idle' && <div className="call-toast" onClick={() => setErr('')}>📞 {err}</div>}
  </>;
}
