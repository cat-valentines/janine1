import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listenForLocationAsks, listenForLocationReplies, type LocationAsk, type LocationReply, type Precision, type Spot } from '../lib/friendLocation';
import { publishLocationReply } from '../lib/locationBus';
import { SpotMap } from './SpotMap';
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
  /** What they would see if you say yes — set per friend. */
  const [rule, setRule] = useState<Precision>('area');
  /** You tapped the notification, so now you get the choice. */
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  /** A friend shared with you when you had no map open — shown as its own card. */
  const [shared, setShared] = useState<{ name: string; spot: Spot; how: Precision } | null>(null);
  const answer = useRef<((choice: 'yes' | 'no') => void) | null>(null);
  /** True while a map is open and already showing answers itself. */
  const mapWatching = useRef(false);
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
      stop = listenForLocationAsks(user, ({ ask: incoming, rule: theirRule, reply }) => {
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
          setRule(theirRule);
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

    // One subscription to your reply channel for the whole app. It passes every
    // answer along to any open map, and if no map is open — because the friend
    // answered from their chat, minutes later — it shows the spot itself.
    let stopReplies: (() => void) | null = null;
    const listenReplies = (userId: string) => {
      stopReplies?.();
      stopReplies = listenForLocationReplies(userId, (reply: LocationReply) => {
        publishLocationReply(reply);
        if (mapWatching.current || reply.ev !== 'spot') return;
        setShared({ name: reply.name, spot: reply.spot, how: reply.precision });
        notify('📍 Location shared', `${reply.name} shared where they are.`, 'loc-shared');
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

    // A map being open means it is showing answers itself, so this stays quiet.
    const mapOpened = () => { mapWatching.current = true; };
    const mapClosed = () => { mapWatching.current = false; };
    window.addEventListener('location-map-open', mapOpened);
    window.addEventListener('location-map-close', mapClosed);

    return () => {
      dead = true;
      stop?.();
      stopReplies?.();
      sub.subscription.unsubscribe();
      window.removeEventListener('location-map-open', mapOpened);
      window.removeEventListener('location-map-close', mapClosed);
      hush();
    };
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
          If you press Share, <b>{pending.name}</b> sees {rule === 'exact' ? <b>your exact spot</b> : <>roughly <b>what part of town you are in</b></>} on
          a map. Only they see it, it is not saved anywhere, and they have to ask again next time.
        </p>
        <p className="loc-rule-hint">
          {rule === 'exact'
            ? '📌 You have set them to see your exact spot. You can change that in Where are they? → My location sharing.'
            : '🏘️ They only get your rough area, not your doorstep.'}
        </p>
        <div className="loc-ask-buttons">
          <button className="once" onClick={() => choose('yes')}>📍 Share my location</button>
          <button className="no" onClick={() => choose('no')}>No thanks</button>
        </div>
      </div>
    </div>}

    {/* A friend answered when you had no map open — here is where they are. */}
    {shared && <div className="loc-map-backdrop" onClick={() => setShared(null)}>
      <div className="loc-map" onClick={(e) => e.stopPropagation()}>
        <div className="loc-map-top">
          <h3>📍 {shared.name} shared their location</h3>
          <button className="loc-close" onClick={() => setShared(null)} aria-label="Close">×</button>
        </div>
        <SpotMap name={shared.name} spot={shared.spot} how={shared.how} />
      </div>
    </div>}

    {note && <p className="loc-note">{note}</p>}
  </>;
}
