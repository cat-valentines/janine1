import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { joinIslandPresence, type PresenceHandle } from '../lib/islandPresence';
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
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || dead) return;
      const name = (user.user_metadata.display_name as string | undefined) ?? '';
      if (!name) return;
      handle.current = joinIslandPresence({ id: user.id, name, character: '' }, () => undefined);
      const where = placeAtPath(window.location.pathname);
      handle.current.update(where?.name ?? '', where?.icon ?? '');
    });
    return () => { dead = true; handle.current?.leave(); handle.current = null; };
  }, []);

  useEffect(() => {
    const where = placeAtPath(path);
    handle.current?.update(where?.name ?? '', where?.icon ?? '');
  }, [path]);

  return null;
}
