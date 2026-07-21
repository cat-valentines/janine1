import { useEffect, useState } from 'react';
import { addFriend, loadAllPlayers, loadMyFriends, type FoundPlayer } from '../lib/players';
import { supabase } from '../lib/supabase';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷' };

/**
 * An open, browsable list of everyone signed up — right on the home page, so
 * you can see the people playing without opening the Friends panel. Only real,
 * named players appear; guests who never picked a username are not accounts yet.
 */
export function PlayersDirectory({ onOpenFriends }: { onOpenFriends: () => void }) {
  const [players, setPlayers] = useState<FoundPlayer[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'guest' | 'offline'>('loading');
  const [note, setNote] = useState('');

  useEffect(() => {
    const load = (id?: string) => {
      if (!id) { setState('guest'); return; }
      setUserId(id);
      loadMyFriends().then((rows) => setFriendIds(new Set(rows.map((row) => row.id)))).catch(() => undefined);
      loadAllPlayers().then((rows) => { setPlayers(rows); setState('ready'); }).catch(() => setState('offline'));
    };
    supabase.auth.getUser().then(({ data }) => load(data.user?.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => load(session?.user?.id));
    return () => data.subscription.unsubscribe();
  }, []);

  const add = async (player: FoundPlayer) => {
    try {
      await addFriend(userId, player.id);
      setFriendIds((prev) => new Set(prev).add(player.id));
      setNote(`🎉 You and @${player.name} are friends now!`);
    } catch { setNote('Could not add that player.'); }
  };

  return <section className="panel players-directory">
    <div className="section-heading">
      <div><span className="card-kicker">Everyone playing</span><h2>Players</h2></div>
      {state === 'ready' && <span className="players-count">{players.length} {players.length === 1 ? 'other player' : 'other players'}</span>}
    </div>

    {state === 'loading' && <p className="leader-empty">Loading players…</p>}
    {state === 'guest' && <p className="leader-empty">Log in and pick a username to see everyone playing Magical Islands.</p>}
    {state === 'offline' && <p className="leader-empty">Players are not online yet. Apply the database update to see them here.</p>}
    {state === 'ready' && players.length === 0 && <p className="leader-empty">
      No other named players yet. When someone signs up and picks a username, they show up here — a friend who only played as a guest will not.
    </p>}

    {state === 'ready' && players.length > 0 && <div className="players-grid">
      {players.map((player) => <div className="player-card" key={player.id}>
        <span className="player-emoji">{icons[player.character_id] ?? '🙂'}</span>
        <strong>@{player.name}</strong>
        <small>⭐ Level {player.level}</small>
        {friendIds.has(player.id)
          ? <em className="player-friend">★ Friend</em>
          : <button className="player-add" onClick={() => add(player)}>☆ Add</button>}
      </div>)}
    </div>}

    {note && <p className="friend-note">{note}</p>}
    <p className="fine-print">Only players who signed up and chose a username appear here. <button className="linklike" onClick={onOpenFriends}>Open Friends</button> to search, chat and invite.</p>
  </section>;
}
