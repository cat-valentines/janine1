import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { clearOnline, joinIslandPresence, publishOnline, type PresenceHandle } from '../lib/islandPresence';
import { placeAtPath } from '../game/gameRoutes';
import { useRoute } from '../lib/router';

/**
 * Says where you are, so a friend asking "what are they playing?" gets a real
 * answer. Mounted once at the app root, and it follows the address bar — walk
 * into the Market and your friends see "the Market" within a few seconds.
 *
 * Nothing is stored: it is a live channel, so closing the tab simply removes
 * you from everybody's list. Signed-out players are not announced at all.
 */
export function PresenceCenter() {
  const path = useRoute();
  const handle = useRef<PresenceHandle | null>(null);

  useEffect(() => {
    let dead = false;

    const join = (user: { id: string; name: string }) => {
      handle.current?.leave();
      // The one join for the whole app: it says where you are, AND keeps the
      // list of everybody else where the Friends panel can read it.
      handle.current = joinIslandPresence({ id: user.id, name: user.name, character: '' }, publishOnline);
      const where = placeAtPath(window.location.pathname);
      handle.current.update(where?.name ?? '', where?.icon ?? '');
    };

    const nameOf = (metadata: Record<string, unknown>) => (metadata.display_name as string | undefined) ?? '';

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      const name = nameOf(user.user_metadata);
      if (name) join({ id: user.id, name });
    });

    // Sign in part-way through and presence follows. Without this, anyone who
    // signed in after the app loaded was never announced at all — so friends
    // saw them as "not on Magical Islands" the whole time they were playing.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (dead) return;
      const user = session?.user;
      const name = user ? nameOf(user.user_metadata) : '';
      if (user && name) join({ id: user.id, name });
      else { handle.current?.leave(); handle.current = null; clearOnline(); }
    });

    return () => {
      dead = true;
      sub.subscription.unsubscribe();
      handle.current?.leave();
      handle.current = null;
      clearOnline();
    };
  }, []);

  useEffect(() => {
    const where = placeAtPath(path);
    handle.current?.update(where?.name ?? '', where?.icon ?? '');
  }, [path]);

  return null;
}
