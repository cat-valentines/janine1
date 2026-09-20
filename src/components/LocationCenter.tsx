import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  LIVE_MINUTES, listenForLocationAsks, listenForLocationReplies, setFriendRule, startLiveShare,
  type LiveShare, type LocationAsk, type LocationReply, type Precision,
} from '../lib/friendLocation';
import { publishLocationReply, rememberSpot } from '../lib/locationBus';
import { flashTitle, notify, stopFlashTitle } from '../lib/appNotify';
import { startRing, stopRing } from '../lib/sfx';
import { loadMyFriends } from '../lib/players';

/**
 * "Where are you?" — the request that lands on YOUR screen.
 *
 * A request never seizes the screen. It arrives as a **notification**: a ring, a
 * flashing tab title, a pop-up outside the page, and a card at the top of the
 * app saying who is asking. Tap it and only then do you get the choice — Share,
 * or No thanks. So an answer is always something you went to, never something
 * you were startled into.
 *
 * Nothing at all is read from your device until you press Share, and you are
 * asked every single time. Mounted once at the app root, so it reaches you
 * wherever you are.
 */

/** Ring for a few seconds, not forever. */
const RING_MS = 9000;
/** An unanswered request fades away rather than sitting there all day. */
const EXPIRE_MS = 90000;

export function LocationCenter() {
  /** Somebody is asking, and you have not opened it yet. */
  const [pending, setPending] = useState<LocationAsk | null>(null);
  /** You tapped the notification, so now you get the choice. */
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  /** Friends already mentioned this session, so a live share says so ONCE. */
  const noted = useRef<Set<string>>(new Set());
  /** After pressing Share: which of the two are you sending? */
  const [choosing, setChoosing] = useState(false);
  /** A live share you have running, so there is always a way to stop it. */
  const [live, setLive] = useState<LiveShare | null>(null);
  const liveRef = useRef<LiveShare | null>(null);
  liveRef.current = live;
  const answer = useRef<((choice: 'yes' | 'no') => void) | null>(null);

  const closeNotice = useRef<(() => void) | null>(null);
  const ringOff = useRef<number | null>(null);
  const expiry = useRef<number | null>(null);
  /** Ids of your accepted friends — a request from anybody else is ignored. */
  const friendIds = useRef<Set<string>>(new Set());
  /** Who you are, for starting a share once you have answered. */
  const meRef = useRef({ id: '', name: '' });

  /** Stop shouting: the ring, the tab title and the pop-up all go together. */
  const hush = () => {
    stopRing();
    stopFlashTitle();
    closeNotice.current?.();
    closeNotice.current = null;
    if (ringOff.current) { clearTimeout(ringOff.current); ringOff.current = null; }
  };

  const clearRequest = () => {
    hush();
    if (expiry.current) { clearTimeout(expiry.current); expiry.current = null; }
    answer.current = null;
    setPending(null);
    setOpen(false);
    setChoosing(false);
  };

  useEffect(() => {
    let stop: (() => void) | null = null;
    let dead = false;

    const loadFriends = async () => {
      const friends = await loadMyFriends().catch(() => []);
      if (!dead) friendIds.current = new Set(friends.filter((f) => f.status === 'accepted').map((f) => f.id));
    };

    const listen = async (user: { id: string; name: string }) => {
      meRef.current = user;
      stop?.();
      await loadFriends();
      if (dead) return;
      stop = listenForLocationAsks(user, ({ ask: incoming, approvedAs, reply }) => {
        void (async () => {
          // Friends only. A request from anyone not on your accepted friends
          // list is ignored outright and never even interrupts you. If we do
          // not recognise them, check once more — you may have just become
          // friends since the app opened.
          if (!friendIds.current.has(incoming.from)) {
            await loadFriends();
            if (!friendIds.current.has(incoming.from)) return;
          }
          // Already approved: they pressed the button and the answer is already
          // yes, so it just goes — but you are told, and the Stop button appears.
          if (approvedAs) {
            liveRef.current?.stop();
            const started = startLiveShare(
              { id: meRef.current.id, name: meRef.current.name },
              { id: incoming.from, name: incoming.name },
              approvedAs,
              (why) => { setNote(why); setLive(null); },
            );
            setLive(started);
            setNote(`📍 ${incoming.name} looked — they can see ${approvedAs === 'exact' ? 'your exact spot' : 'your area'} because you approved them.`);
            return;
          }

          answer.current = reply;
          setPending(incoming);
          setOpen(false);

          // Tell them it is there, in every way available — then wait for them
          // to come to it.
          startRing();
          ringOff.current = window.setTimeout(() => stopRing(), RING_MS);
          flashTitle(`📍 ${incoming.name} wants your location`);
          closeNotice.current = notify(
            '📍 Location request',
            `${incoming.name} is asking where you are. Tap to answer in your chat.`,
            'loc-ask',
            () => {
              // Take them to the chat with that friend, where the request is
              // waiting with Share / Not share on it.
              stopRing();
              stopFlashTitle();
              window.dispatchEvent(new CustomEvent('open-friend-chat', { detail: { id: incoming.from } }));
              setOpen(true);
            },
          );
          expiry.current = window.setTimeout(() => clearRequest(), EXPIRE_MS);
        })();
      });
    };

    // One subscription to your reply channel for the whole app. It passes every
    // answer to any open map, and keeps the latest quietly to hand.
    //
    // A live share sends a fresh position every few seconds, so NOTHING is
    // popped up here — a map that keeps appearing by itself is unusable. You
    // see somebody's location when you go to Friends and press "Where are
    // they?", and not a moment before. The only thing said out loud is a
    // one-line note the first time each friend starts sharing, so you know the
    // answer arrived and where to go and look.
    let stopReplies: (() => void) | null = null;
    const listenReplies = (userId: string) => {
      stopReplies?.();
      stopReplies = listenForLocationReplies(userId, (reply: LocationReply) => {
        rememberSpot(reply);
        publishLocationReply(reply);
        if (reply.ev !== 'spot' || noted.current.has(reply.from)) return;
        noted.current.add(reply.from);
        setNote(`📍 ${reply.name} shared their location — open 👥 Friends → 📍 Where are they? to see it.`);
      });
    };

    const start = () => supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      void listen({ id: user.id, name: (user.user_metadata.display_name as string | undefined) ?? 'a friend' });
      listenReplies(user.id);
    });
    start();

    // Sign in (or out) part-way through a session and the listener follows —
    // otherwise a request would land on a tab that had stopped listening.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (dead) return;
      if (session?.user) {
        void listen({ id: session.user.id, name: (session.user.user_metadata.display_name as string | undefined) ?? 'a friend' });
        listenReplies(session.user.id);
      } else { stop?.(); stop = null; stopReplies?.(); stopReplies = null; }
    });

    return () => {
      dead = true;
      liveRef.current?.stop();
      stop?.();
      stopReplies?.();
      sub.subscription.unsubscribe();
      hush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(id);
  }, [note]);

  /** No thanks — nothing is read from the device at all. */
  const refuse = () => {
    answer.current?.('no');
    const who = pending?.name ?? 'them';
    clearRequest();
    setNote(`You said no — nothing was shared with ${who}.`);
  };

  /**
   * You pressed Share, then picked how much. That approves this friend from now
   * on, so next time they can simply look — until you take it back, which puts
   * them right back to having to ask.
   */
  const shareAs = (how: Precision) => {
    const friend = pending;
    if (!friend) return;
    setFriendRule(friend.from, how);
    answer.current = null;   // the live share sends it, not the one-shot reply
    clearRequest();
    liveRef.current?.stop();
    const started = startLiveShare(
      { id: meRef.current.id, name: meRef.current.name },
      { id: friend.from, name: friend.name },
      how,
      (why) => { setNote(why); setLive(null); },
    );
    setLive(started);
    setNote(`📍 Sharing ${how === 'exact' ? 'your exact spot' : 'your area'} with ${friend.name} for ${LIVE_MINUTES} minutes.`);
  };

  const stopLive = () => {
    liveRef.current?.stop();
    const who = liveRef.current?.friendName ?? 'them';
    setLive(null);
    setNote(`🛑 Stopped sharing with ${who}.`);
  };

  const openChoice = () => { hush(); setOpen(true); };

  return <>
    {/* The notification: it tells you, and waits. */}
    {pending && !open && <button className="loc-alert" onClick={openChoice}>
      <span className="loc-alert-pin">📍</span>
      <span className="loc-alert-body">
        <strong>{pending.name} wants to know where you are</strong>
        <small>Tap to choose — share, or don't.</small>
      </span>
      <span className="loc-alert-go">Open</span>
    </button>}

    {/* And only once you have tapped it, the choice. */}
    {pending && open && <div className="loc-ask-backdrop">
      <div className="loc-ask">
        <span className="loc-ask-pin">📍</span>
        <h3>{pending.name} wants to know where you are</h3>
        <p>
          If you press Share, <b>{pending.name}</b> sees where you are on a map. Only they see it, and
          it is never saved anywhere.
        </p>
        <p className="loc-rule-hint">
          Saying yes lets <b>{pending.name}</b> look whenever they like, until you stop it.
          You can take that back any time in <b>📍 Where are they? → My location sharing</b>.
        </p>
        {!choosing
          ? <div className="loc-ask-buttons">
            <button className="once" onClick={() => setChoosing(true)}>📍 Share</button>
            <button className="no" onClick={refuse}>Not share</button>
          </div>
          : <>
            <p className="loc-rule-hint">How much should {pending.name} see?</p>
            <div className="loc-ask-buttons two">
              <button className="exact" onClick={() => shareAs('exact')}>📌 Exact spot</button>
              <button className="area" onClick={() => shareAs('area')}>🏘️ Just my area</button>
            </div>
            <button className="loc-back" onClick={() => setChoosing(false)}>← Back</button>
          </>}
      </div>
    </div>}

    {/* A live share always has a visible way out. */}
    {live && <div className="loc-live">
      <span className="loc-live-dot" />
      <div>
        <strong>Sharing live with {live.friendName}</strong>
        <small>{live.precision === 'exact' ? 'Your exact spot' : 'Your area'} · stops on its own at {new Date(live.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      <button onClick={stopLive}>Stop</button>
    </div>}

    {note && <p className="loc-note">{note}</p>}
  </>;
}
