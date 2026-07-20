import { useEffect, useState } from 'react';
import { loadMyFriends, type FriendRow } from '../lib/players';
import { supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { getStars, STAR_GOAL } from '../lib/escapeStars';

interface ChallengeRoomProps { onChallenge: () => void; inviteLink: string; message: string }

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

export function ChallengeRoom({ onChallenge, inviteLink, message }: ChallengeRoomProps) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [stars, setStars] = useState(0);

  // Re-read the collection every time the panel opens (you may have just played).
  useEffect(() => { setStars(getStars()); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      loadMyFriends().then((rows) => setFriends(rows.filter((row) => row.status === 'accepted'))).catch(() => setFriends([]));
    });
  }, []);

  return (
    <section className="panel challenge-panel">
      <div><span className="card-kicker">Search &amp; escape</span><h2>🔍 Escape Room</h2>
        <p>Open the furniture and find the hidden ⭐ stars to escape. Play alone, or challenge friends to reach a shared 5,000 stars. Invitation links contain a random code—never an email or account ID.</p></div>
      <div className="shared-goal"><div><strong>{stars.toLocaleString()} / {STAR_GOAL.toLocaleString()}</strong><small>Your stars</small></div><div className="goal-track"><i style={{ width: `${Math.min(100, (stars / STAR_GOAL) * 100)}%` }} /></div><span>Reward: 🏆 seasonal champion cup</span></div>
      <div className="friends">
        {signedIn && friends.length
          ? friends.map((friend) => <span key={friend.id}>{icons[friend.character_id] ?? '🙂'} {friend.name} · Level {friend.level}</span>)
          : <span>{signedIn ? '👋 No friends yet — search a username in Friends.' : '🔐 Log in to challenge your real friends.'}</span>}
      </div>
      <div className="challenge-buttons">
        <button className="primary-button" onClick={() => navigate('/play/escaperoom')}>🔍 Play Alone</button>
        <button className="primary-button ghost-btn" onClick={onChallenge}>👥 Challenge Friends</button>
      </div>
      {inviteLink && <div className="invite-box"><input readOnly value={inviteLink} aria-label="Challenge invitation link" /><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</button></div>}
      {message && <p className="fine-print">{message}</p>}
    </section>
  );
}
