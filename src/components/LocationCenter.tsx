import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listenForLocationAsks, type LocationAsk } from '../lib/friendLocation';
import { flashTitle, notify, stopFlashTitle } from '../lib/appNotify';
import { startRing, stopRing } from '../lib/sfx';
import { loadMyFriends } from '../lib/players';

/**
 * "Where are you?" — the request that lands on YOUR screen.
 *
 * Mounted once at the app root, so a friend's request reaches you wherever you
 * are: it rings, it flashes the tab title, it pops a notification outside the
 * page, and it puts a card in front of you with Share and No thanks. Nothing at
 * all is read from your device until you press Share.
 *
 * It only ever answers for a real friend, and only if you have sharing switched
 * on — and it asks you every single time, because there is no such thing here as
 * a permission you granted once and forgot about.
 */
export function LocationCenter() {
  const [ask, setAsk] = useState<LocationAsk | null>(null);
  const [note, setNote] = useState('');
  const answer = useRef<((choice: 'yes' | 'no') => void) | null>(null);
  /** Ids of your accepted friends — a request from anybody else is ignored. */
  const friendIds = useRef<Set<string>>(new Set());

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
          // not recognise them, check once more first — you may have just
          // become friends since the app opened.
          if (!friendIds.current.has(incoming.from)) {
            await loadFriends();
            if (!friendIds.current.has(incoming.from)) return;
          }
          setAsk(incoming);
          answer.current = reply;
          // Make it impossible to miss, wherever they happen to be looking.
          startRing();
          flashTitle(`📍 ${incoming.name} wants your location`);
          notify('📍 Location request', `${incoming.name} is asking where you are. Tap to answer.`, 'loc-ask');
        })();
      });
    };

    const start = () => supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      void listen({ id: user.id, name: (user.user_metadata.display_name as string | undefined) ?? 'a friend' });
    });
    start();

    // Sign in (or out) part-way through a session, and the listener follows —
    // otherwise a request would land on a tab that had stopped listening.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (dead) return;
      if (session?.user) {
        void listen({ id: session.user.id, name: (session.user.user_metadata.display_name as string | undefined) ?? 'a friend' });
      } else { stop?.(); stop = null; }
    });

    return () => { dead = true; stop?.(); sub.subscription.unsubscribe(); stopRing(); stopFlashTitle(); };
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(id);
  }, [note]);

  const choose = (choice: 'yes' | 'no') => {
    stopRing();
    stopFlashTitle();
    answer.current?.(choice);
    answer.current = null;
    setAsk(null);
    setNote(choice === 'no' ? 'You said no — nothing was shared.' : '📍 Shared your location with them.');
  };

  return <>
    {ask && <div className="loc-ask-backdrop">
      <div className="loc-ask">
        <span className="loc-ask-pin">📍</span>
        <h3>{ask.name} wants to know where you are</h3>
        <p>
          If you press Share, <b>{ask.name}</b> sees your real location on a map. Only they see it, it is not
          saved anywhere, and they have to ask again next time.
        </p>
        <div className="loc-ask-buttons">
          <button className="once" onClick={() => choose('yes')}>📍 Share</button>
          <button className="no" onClick={() => choose('no')}>No thanks</button>
        </div>
      </div>
    </div>}
    {note && <p className="loc-note">{note}</p>}
  </>;
}
