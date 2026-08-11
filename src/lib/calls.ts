// Friend-to-friend voice calls, WhatsApp-style. Signalling rides Supabase Realtime
// "broadcast": everyone listens on their OWN channel `calls-<userId>` for an incoming
// ring, then both sides join a shared `call-<callId>` channel to trade the WebRTC
// offer / answer / ICE and talk. A call nobody answers is logged as a missed-call
// message so the friend still sees it later in their notifications.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { sendFriendMessage } from './friends';

export type CallEvent = 'ring' | 'accept' | 'offer' | 'answer' | 'ice' | 'hangup';

export interface CallSignal {
  ev: CallEvent;
  callId: string;
  from: string;
  fromName?: string;
  sdp?: string;         // JSON of an RTCSessionDescriptionInit
  candidate?: string;   // JSON of an RTCIceCandidateInit
  reason?: 'decline' | 'ended' | 'busy';
}

// STUN lets two browsers find each other. (Calls between very strict/office networks
// may still need a TURN relay — a known limitation without a TURN server.)
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
};

export function newCallId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `call-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Join a broadcast topic; resolves with a channel that's ready to send. */
export function joinChannel(topic: string, onSignal: (s: CallSignal) => void): Promise<RealtimeChannel> {
  return new Promise((resolve) => {
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload as CallSignal));
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(ch); });
  });
}

export function sendSignal(ch: RealtimeChannel, signal: CallSignal) {
  ch.send({ type: 'broadcast', event: 'signal', payload: signal });
}

export function leaveChannel(ch: RealtimeChannel | null) {
  if (ch) supabase.removeChannel(ch);
}

/** One-shot signal to a user's personal channel (ring them, or decline them). */
export async function signalUser(userId: string, signal: CallSignal) {
  const ch = await joinChannel(`calls-${userId}`, () => undefined);
  sendSignal(ch, signal);
  setTimeout(() => leaveChannel(ch), 1500);
}

/** Log a missed call so an offline friend sees it in their notifications later. */
export async function logMissedCall(fromId: string, fromName: string, toId: string) {
  try { await sendFriendMessage(fromId, toId, `📞 Missed call from @${fromName} — tap to call back`); } catch { /* offline is fine */ }
}
