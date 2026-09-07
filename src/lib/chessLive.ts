/**
 * Live chess against a real person.
 *
 * Two channels, both over Supabase Realtime broadcast (no database rows, so no
 * migration and it works the moment two people open the page):
 *
 *  - the **lobby**, where everyone waiting shouts "I'm here, I want a game" a
 *    few times a minute, and one player invites another;
 *  - a **match** channel per game, carrying the moves.
 *
 * Only moves travel over the wire, never the board — each side replays them
 * through the same rules engine, so the two boards cannot drift apart, and a
 * player who tried to send an illegal move would simply be ignored.
 */
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Move } from '../game/chess';

/** Someone sitting in the lobby waiting for a game. */
export interface Seeker { id: string; name: string; character: string; at: number }

/** Drop anyone we haven't heard from in this long — they closed the tab. */
const STALE_MS = 8000;
const SHOUT_MS = 2500;

export interface ChessLobby {
  /** Ask one waiting player for a game. You are white. */
  invite: (targetId: string) => string;
  /** Say yes to an invitation. You are black. */
  accept: (matchId: string, hostId: string) => void;
  /** Say no thanks. */
  decline: (hostId: string) => void;
  leave: () => void;
}

export interface LobbyHandlers {
  /** The other people waiting right now (never includes you). */
  onSeekers: (seekers: Seeker[]) => void;
  /** Somebody wants to play you. */
  onInvite: (from: { id: string; name: string; matchId: string }) => void;
  /** They said yes — the game is on, and you are white. */
  onAccepted: (matchId: string, opponent: { id: string; name: string }) => void;
  /** They said no. */
  onDeclined: (name: string) => void;
}

export const newMatchId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function joinChessLobby(
  self: { id: string; name: string; character: string },
  handlers: LobbyHandlers,
): ChessLobby {
  const channel: RealtimeChannel = supabase.channel('chess-lobby', { config: { broadcast: { self: false } } });
  const seekers = new Map<string, Seeker>();
  const emit = () => handlers.onSeekers([...seekers.values()].sort((a, b) => a.name.localeCompare(b.name)));

  channel.on('broadcast', { event: 'here' }, ({ payload }) => {
    const p = payload as Seeker;
    if (!p?.id || p.id === self.id) return;
    seekers.set(p.id, { ...p, at: Date.now() });
    emit();
  });
  channel.on('broadcast', { event: 'gone' }, ({ payload }) => {
    const id = (payload as { id?: string })?.id;
    if (id && seekers.delete(id)) emit();
  });
  channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; to?: string; matchId?: string };
    if (p?.to === self.id && p.from && p.matchId) handlers.onInvite({ id: p.from, name: p.name ?? 'a player', matchId: p.matchId });
  });
  channel.on('broadcast', { event: 'accept' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; to?: string; matchId?: string };
    if (p?.to === self.id && p.from && p.matchId) handlers.onAccepted(p.matchId, { id: p.from, name: p.name ?? 'a player' });
  });
  channel.on('broadcast', { event: 'decline' }, ({ payload }) => {
    const p = payload as { name?: string; to?: string };
    if (p?.to === self.id) handlers.onDeclined(p.name ?? 'They');
  });
  channel.subscribe();

  const shout = () => channel.send({ type: 'broadcast', event: 'here', payload: { id: self.id, name: self.name, character: self.character, at: Date.now() } });
  shout();
  const shouting = setInterval(shout, SHOUT_MS);
  const sweep = setInterval(() => {
    const cutoff = Date.now() - STALE_MS;
    let changed = false;
    seekers.forEach((s, id) => { if (s.at < cutoff) { seekers.delete(id); changed = true; } });
    if (changed) emit();
  }, 2000);

  return {
    invite: (targetId) => {
      const matchId = newMatchId();
      channel.send({ type: 'broadcast', event: 'invite', payload: { from: self.id, name: self.name, to: targetId, matchId } });
      return matchId;
    },
    accept: (matchId, hostId) => {
      channel.send({ type: 'broadcast', event: 'accept', payload: { from: self.id, name: self.name, to: hostId, matchId } });
    },
    decline: (hostId) => {
      channel.send({ type: 'broadcast', event: 'decline', payload: { name: self.name, to: hostId } });
    },
    leave: () => {
      clearInterval(shouting);
      clearInterval(sweep);
      channel.send({ type: 'broadcast', event: 'gone', payload: { id: self.id } });
      supabase.removeChannel(channel);
    },
  };
}

// ---- the match itself -----------------------------------------------------

export interface ChessMatch {
  /** Send the move you just played. */
  sendMove: (move: Move, ply: number) => void;
  /** Give up. */
  resign: () => void;
  /** Offer / accept a draw. */
  offerDraw: () => void;
  acceptDraw: () => void;
  /** Say hello so both sides know the other arrived — and who they are. */
  hello: (character: string) => void;
  leave: () => void;
}

export interface MatchHandlers {
  /**
   * Their move. `ply` is how many moves had been played before it, so a message
   * that arrives twice (or out of order) can be ignored instead of corrupting
   * the board.
   */
  onMove: (move: Move, ply: number) => void;
  onResign: () => void;
  onDrawOffer: () => void;
  onDrawAccepted: () => void;
  /** They arrived, or they left. */
  onHello: (name: string, character: string) => void;
  onLeft: () => void;
}

export function joinChessMatch(
  matchId: string,
  self: { id: string; name: string },
  handlers: MatchHandlers,
): ChessMatch {
  const channel: RealtimeChannel = supabase.channel(`chess-${matchId}`, { config: { broadcast: { self: false } } });
  const mine = (from?: string) => from === self.id;

  channel.on('broadcast', { event: 'move' }, ({ payload }) => {
    const p = payload as { from?: string; move?: Move; ply?: number };
    if (mine(p?.from) || !p?.move || typeof p.ply !== 'number') return;
    handlers.onMove(p.move, p.ply);
  });
  channel.on('broadcast', { event: 'resign' }, ({ payload }) => {
    if (!mine((payload as { from?: string })?.from)) handlers.onResign();
  });
  channel.on('broadcast', { event: 'draw-offer' }, ({ payload }) => {
    if (!mine((payload as { from?: string })?.from)) handlers.onDrawOffer();
  });
  channel.on('broadcast', { event: 'draw-accept' }, ({ payload }) => {
    if (!mine((payload as { from?: string })?.from)) handlers.onDrawAccepted();
  });
  channel.on('broadcast', { event: 'hello' }, ({ payload }) => {
    const p = payload as { from?: string; name?: string; character?: string };
    if (!mine(p?.from)) handlers.onHello(p?.name ?? 'your opponent', p?.character ?? '');
  });
  channel.on('broadcast', { event: 'bye' }, ({ payload }) => {
    if (!mine((payload as { from?: string })?.from)) handlers.onLeft();
  });
  channel.subscribe();

  const say = (event: string, extra: Record<string, unknown> = {}) =>
    channel.send({ type: 'broadcast', event, payload: { from: self.id, name: self.name, ...extra } });

  return {
    sendMove: (move, ply) => say('move', { move, ply }),
    resign: () => say('resign'),
    offerDraw: () => say('draw-offer'),
    acceptDraw: () => say('draw-accept'),
    hello: (character) => say('hello', { character }),
    leave: () => { say('bye'); supabase.removeChannel(channel); },
  };
}
