import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listenForLocationAsks, type LocationAsk } from '../lib/friendLocation';
import { notify } from '../lib/appNotify';
import { sfx } from '../lib/sfx';
import { loadMyFriends } from '../lib/players';

/**
 * Answers "where are you?" — mounted once at the app root, so a friend's
 * request can reach you wherever you are in the app.
 *
 * It only ever answers for a real friend, and only if you have sharing switched
 * on. Even then it asks you first, every time, unless you have chosen "always
 * allow" for that friend. Nothing is stored: your position is read from the
 * device at the moment you say yes and sent straight to them.
 */
export function LocationCenter() {
  const [ask, setAsk] = useState<LocationAsk | null>(null);
  const [note, setNote] = useState('');
  const answer = useRef<((choice: 'once' | 'always' | 'no') => void) | null>(null);
  /** Ids of your accepted friends — a request from anybody else is ignored. */
  const friendIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stop: (() => void) | null = null;
    let dead = false;

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      const name = (user.user_metadata.display_name as string | undefined) ?? 'a friend';
      const friends = await loadMyFriends().catch(() => []);
      friendIds.current = new Set(friends.filter((f) => f.status === 'accepted').map((f) => f.id));

      stop = listenForLocationAsks({ id: user.id, name }, ({ ask: incoming, alreadyAllowed, reply }) => {
        // Friends only. A request from anybody who is not on your accepted
        // friends list gets no answer at all, and never even interrupts you.
        if (!friendIds.current.has(incoming.from)) return;

        if (alreadyAllowed) {
          // You have already said "always" for them, so it goes at once — but
          // you are still told, so sharing is never invisible.
          reply('once');
          setNote(`📍 Shared your location with ${incoming.name} — you chose "always allow" for them.`);
          sfx('tap');
          return;
        }
        setAsk(incoming);
        answer.current = reply;
        sfx('follow');
        notify('📍 Location request', `${incoming.name} is asking where you are.`, 'loc-ask');
      });
    });

    return () => { dead = true; stop?.(); };
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(id);
  }, [note]);

  const choose = (choice: 'once' | 'always' | 'no') => {
    answer.current?.(choice);
    answer.current = null;
    setAsk(null);
    setNote(choice === 'no'
      ? 'You said no — nothing was shared.'
      : choice === 'always'
        ? '📍 Shared, and you will not be asked again for them. You can undo that in Location settings.'
        : '📍 Shared your location, just this once.');
  };

  return <>
    {ask && <div className="loc-ask-backdrop">
      <div className="loc-ask">
        <span className="loc-ask-pin">📍</span>
        <h3>{ask.name} wants to know where you are</h3>
        <p>
          If you say yes, <b>{ask.name}</b> sees your real location on a map. Only they see it, it is not saved
          anywhere, and you can stop sharing whenever you like.
        </p>
        <div className="loc-ask-buttons">
          <button className="once" onClick={() => choose('once')}>Share just this once</button>
          <button className="always" onClick={() => choose('always')}>Always let {ask.name}</button>
          <button className="no" onClick={() => choose('no')}>No thanks</button>
        </div>
      </div>
    </div>}
    {note && <p className="loc-note">{note}</p>}
  </>;
}
