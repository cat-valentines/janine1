import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { RTC_CONFIG, joinGroup, leaveChannel, ringGroupMember, sendG, type GroupSignal } from '../lib/calls';
import { callTone, startRing, stopRing } from '../lib/sfx';

type Status = 'idle' | 'incoming' | 'active';
interface Peer { pc: RTCPeerConnection; name: string; stream?: MediaStream; pending: RTCIceCandidateInit[] }

function mmss(s: number) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }

/**
 * Group voice/video calls — a mesh where everyone connects to everyone else.
 * The starter rings each member on their `gcalls-<id>` channel; everyone who
 * joins meets on a shared `callroom-<roomId>` channel and pairs up (the smaller
 * id in each pair makes the offer, so there's no glare). Mounted at the app root.
 */
export function GroupCallCenter() {
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [groupName, setGroupName] = useState('');
  const [incoming, setIncoming] = useState<{ roomId: string; groupName: string; fromName: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [mini, setMini] = useState(false);
  const [secs, setSecs] = useState(0);
  const [, setVer] = useState(0);           // bump to re-render when the peer set changes
  const bump = () => setVer((v) => v + 1);

  const room = useRef<RealtimeChannel | null>(null);
  const local = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, Peer>>(new Map());
  const roomId = useRef<string>('');
  const tick = useRef<number | null>(null);
  const meRef = useRef(me); meRef.current = me;

  useEffect(() => {
    const load = (u: { id: string; user_metadata?: Record<string, unknown> } | null | undefined) =>
      setMe(u ? { id: u.id, name: String(u.user_metadata?.display_name ?? u.user_metadata?.name ?? 'a friend') } : null);
    supabase.auth.getUser().then(({ data }) => load(data.user)).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_e, s) => load(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const cleanup = () => {
    if (tick.current !== null) { clearInterval(tick.current); tick.current = null; }
    stopRing();
    peers.current.forEach((p) => { try { p.pc.close(); } catch { /* closed */ } });
    peers.current.clear();
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    leaveChannel(room.current); room.current = null;
    roomId.current = '';
    setStatus('idle'); setGroupName(''); setMuted(false); setCamOff(false); setHasCam(false); setMini(false); setSecs(0);
    bump();
  };

  const getMedia = async () => {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } }); }
    catch { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    local.current = stream;
    const cam = stream.getVideoTracks().length > 0;
    setHasCam(cam); if (!cam) setCamOff(true);
    if (tick.current === null) tick.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return stream;
  };

  const makePeer = (id: string, name: string): Peer => {
    const existing = peers.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
    pc.onicecandidate = (e) => { if (e.candidate && room.current) sendG(room.current, { ev: 'ice', from: meRef.current?.id ?? '', to: id, candidate: JSON.stringify(e.candidate) }); };
    pc.ontrack = (e) => { const p = peers.current.get(id); if (p) { p.stream = e.streams[0]; bump(); } };
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { /* keep others; drop this one */ } };
    const peer: Peer = { pc, name, pending: [] };
    peers.current.set(id, peer);
    bump();
    return peer;
  };

  const flush = async (id: string) => {
    const p = peers.current.get(id); if (!p) return;
    for (const c of p.pending) { try { await p.pc.addIceCandidate(c); } catch { /* ignore */ } }
    p.pending = [];
  };

  // Pair up with a peer: the smaller id makes the offer (no glare).
  const connectPair = async (id: string, name: string) => {
    if (peers.current.has(id) || id === meRef.current?.id) return;
    const p = makePeer(id, name);
    if ((meRef.current?.id ?? '') < id) {
      const offer = await p.pc.createOffer(); await p.pc.setLocalDescription(offer);
      if (room.current) sendG(room.current, { ev: 'offer', from: meRef.current?.id ?? '', to: id, sdp: JSON.stringify(offer) });
    }
  };

  const onRoom = async (s: GroupSignal) => {
    const myId = meRef.current?.id ?? '';
    if (s.from === myId) return;
    try {
      if (s.ev === 'join') { if (room.current) sendG(room.current, { ev: 'hello', from: myId, to: s.from, fromName: meRef.current?.name }); await connectPair(s.from, s.fromName || 'a friend'); }
      else if (s.ev === 'hello' && s.to === myId) { await connectPair(s.from, s.fromName || 'a friend'); }
      else if (s.ev === 'offer' && s.to === myId && s.sdp) {
        const p = makePeer(s.from, s.fromName || 'a friend');
        await p.pc.setRemoteDescription(JSON.parse(s.sdp)); await flush(s.from);
        const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans);
        if (room.current) sendG(room.current, { ev: 'answer', from: myId, to: s.from, sdp: JSON.stringify(ans) });
      } else if (s.ev === 'answer' && s.to === myId && s.sdp) {
        const p = peers.current.get(s.from); if (p) { await p.pc.setRemoteDescription(JSON.parse(s.sdp)); await flush(s.from); }
      } else if (s.ev === 'ice' && s.to === myId && s.candidate) {
        const p = peers.current.get(s.from); const cand = JSON.parse(s.candidate) as RTCIceCandidateInit;
        if (p) { if (p.pc.remoteDescription) { try { await p.pc.addIceCandidate(cand); } catch { /* ignore */ } } else p.pending.push(cand); }
      } else if (s.ev === 'leave') {
        const p = peers.current.get(s.from); if (p) { try { p.pc.close(); } catch { /* closed */ } peers.current.delete(s.from); bump(); }
      }
    } catch { /* one bad signal shouldn't kill the whole call */ }
  };
  const onRoomRef = useRef(onRoom); onRoomRef.current = onRoom;

  const enterRoom = async (rid: string) => {
    roomId.current = rid;
    room.current = await joinGroup(`callroom-${rid}`, (s) => onRoomRef.current(s));
    sendG(room.current, { ev: 'join', from: meRef.current?.id ?? '', fromName: meRef.current?.name });
  };

  // ---- personal group-ring channel ----
  const onPersonal = (s: GroupSignal) => {
    if (s.ev !== 'gring' || !s.roomId) return;
    if (status !== 'idle' || roomId.current) return;      // already busy
    setIncoming({ roomId: s.roomId, groupName: s.groupName || 'a group', fromName: s.fromName || 'a friend' });
    startRing();
  };
  const onPersonalRef = useRef(onPersonal); onPersonalRef.current = onPersonal;

  useEffect(() => {
    if (!me) return;
    let ch: RealtimeChannel | null = null;
    joinGroup(`gcalls-${me.id}`, (s) => onPersonalRef.current(s)).then((c) => { ch = c; });
    return () => { leaveChannel(ch); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----
  const startGroupCall = async (groupId: string, gName: string, memberIds: string[]) => {
    if (!meRef.current) return;
    if (status !== 'idle' || roomId.current) return;
    setGroupName(gName); setStatus('active');
    try {
      await getMedia();
      const rid = `group-${groupId}`;
      await enterRoom(rid);
      const myId = meRef.current.id;
      memberIds.filter((id) => id && id !== myId).forEach((id) =>
        ringGroupMember(id, { ev: 'gring', from: myId, fromName: meRef.current!.name, roomId: rid, groupId, groupName: gName }));
    } catch { cleanup(); }
  };
  const startRef = useRef(startGroupCall); startRef.current = startGroupCall;

  useEffect(() => {
    const handler = (e: Event) => { const d = (e as CustomEvent).detail as { groupId: string; groupName: string; memberIds: string[] }; if (d?.groupId) startRef.current(d.groupId, d.groupName || 'a group', d.memberIds || []); };
    window.addEventListener('group-call', handler);
    return () => window.removeEventListener('group-call', handler);
  }, []);

  const acceptGroup = async () => {
    const inc = incoming; if (!inc) return;
    stopRing(); setIncoming(null); setGroupName(inc.groupName); setStatus('active');
    try { await getMedia(); await enterRoom(inc.roomId); callTone('connect'); }
    catch { cleanup(); }
  };
  const declineGroup = () => { stopRing(); setIncoming(null); };

  const hangUp = () => {
    if (room.current) sendG(room.current, { ev: 'leave', from: meRef.current?.id ?? '' });
    callTone('end'); cleanup();
  };
  const toggleMute = () => { const s = local.current; if (!s) return; const on = !muted; s.getAudioTracks().forEach((t) => { t.enabled = !on; }); setMuted(on); };
  const toggleCam = () => { const s = local.current; if (!s) return; const off = !camOff; s.getVideoTracks().forEach((t) => { t.enabled = !off; }); setCamOff(off); };

  useEffect(() => cleanup, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (incoming && status === 'idle') return <div className="call-overlay"><div className="call-card ringing">
    <div className="call-avatar">👥</div>
    <strong className="call-name">{incoming.groupName}</strong>
    <p className="call-status">@{incoming.fromName} started a group call…</p>
    <div className="call-buttons">
      <button className="call-decline" onClick={declineGroup}>✕ Decline</button>
      <button className="call-accept" onClick={acceptGroup}>📞 Join</button>
    </div>
  </div></div>;

  if (status !== 'active') return null;

  const list = [...peers.current.entries()];
  return <div className={`call-overlay video group ${mini ? 'mini' : ''}`}>
    <div className={`call-grid grid-${Math.min(9, list.length + 1)}`}>
      {list.map(([id, p]) => <div className="call-tile" key={id}>
        <video className="call-tile-video" autoPlay playsInline ref={(el) => { if (el && p.stream && el.srcObject !== p.stream) el.srcObject = p.stream; }} />
        <span className="call-tile-name">@{p.name}</span>
      </div>)}
      <div className="call-tile self">
        <video className="call-tile-video" autoPlay playsInline muted ref={(el) => { if (el && local.current && el.srcObject !== local.current) el.srcObject = local.current; }} />
        <span className="call-tile-name">You</span>
      </div>
    </div>
    {mini ? <div className="call-mini-bar">
      <button onClick={() => setMini(false)} title="Make bigger">⛶</button>
      <span>{groupName} · {mmss(secs)}</span>
      <button className="call-hang" onClick={hangUp} title="Leave">✕</button>
    </div> : <>
      <div className="call-vid-info"><strong>👥 {groupName}</strong><span>{list.length + 1} on the call · {mmss(secs)}</span></div>
      <button className="call-size" onClick={() => setMini(true)} title="Make smaller">🗕</button>
      <div className="call-buttons call-vid-buttons">
        <button className={`call-mute ${muted ? 'on' : ''}`} onClick={toggleMute}>{muted ? '🔇' : '🎙️'}</button>
        {hasCam && <button className={`call-mute ${camOff ? 'on' : ''}`} onClick={toggleCam}>{camOff ? '📷' : '📹'}</button>}
        <button className="call-hang" onClick={hangUp}>✕ Leave</button>
      </div>
    </>}
  </div>;
}
