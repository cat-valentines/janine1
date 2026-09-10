import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listenForLocationAsks, type LocationAsk } from '../lib/friendLocation';
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
  const answer = useRef<((choice: 'yes' | 'no') => void) | null>(null);
  const closeNotice = useRef<(() => void) | null>(null);
  const ringOff = useRef<number | null>(null);
  const expiry = useRef<number | null>(null);
  /** Ids of your accepted friends — a request from anybody else is ignored. */
  const friendIds = useRef<Set<string>>(new Set());

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
  };

  useEffect(() => {
    let stop: (() => void) | null = null;
    let dead = false;

    const loadFriends = async () => {
      const friends = await loadMyFriends().catch(() => []);
      if (!dead) friendIds.current = new Set(friends.filter((f) => f.status === 'accepted').map((f) => f.id));
    };

    const listen = async (user: { id: string; name: string }) => {
      stop?.();
      await loadFriends();
      if (dead) return;
      stop = listenForLocationAsks(user, ({ ask: incoming, reply }) => {
        void (async () => {
          // Friends only. A request from anyone not on your accepted friends
          // list is ignored outright and never even interrupts you. If we do
          // not recognise them, check once more — you may have just become
          // friends since the app opened.
          if (!friendIds.current.has(incoming.from)) {
            await loadFriends();
            if (!friendIds.current.has(incoming.from)) return;
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
            `${incoming.name} is asking where you are. Tap to choose.`,
            'loc-ask',
            () => { stopRing(); stopFlashTitle(); setOpen(true); },   // tapping it opens the choice
          );
          expiry.current = window.setTimeout(() => clearRequest(), EXPIRE_MS);
        })();
      });
    };

    const start = () => supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      void listen({ id: user.id, name: (user.user_metadata.display_name as string | undefined) ?? 'a friend' });
    });
    start();

    // Sign in (or out) part-way through a session and the listener follows —
    // otherwise a request would land on a tab that had stopped listening.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (dead) return;
      if (session?.user) {
        void listen({ id: session.user.id, name: (session.user.user_metadata.display_name as string | undefined) ?? 'a friend' });
      } else { stop?.(); stop = null; }
    });

    return () => { dead = true; stop?.(); sub.subscription.unsubscribe(); hush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(id);
  }, [note]);

  const choose = (choice: 'yes' | 'no') => {
    answer.current?.(choice);
    const who = pending?.name ?? 'them';
    clearRequest();
    setNote(choice === 'no' ? `You said no — nothing was shared with ${who}.` : `📍 Shared your location with ${who}.`);
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
          If you press Share, <b>{pending.name}</b> sees your real location on a map. Only they see it, it is
          not saved anywhere, and they have to ask again next time.
        </p>
        <div className="loc-ask-buttons">
          <button className="once" onClick={() => choose('yes')}>📍 Share my location</button>
          <button className="no" onClick={() => choose('no')}>No thanks</button>
        </div>
      </div>
    </div>}

    {note && <p className="loc-note">{note}</p>}
  </>;
}
