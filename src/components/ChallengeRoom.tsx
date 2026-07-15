import { useEffect, useState } from 'react';
import { loadMyFriends, type FriendRow } from '../lib/players';
import { supabase } from '../lib/supabase';

interface ChallengeRoomProps { onChallenge: () => void; inviteLink: string; message: string }

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

export function ChallengeRoom({ onChallenge, inviteLink, message }: ChallengeRoomProps) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      loadMyFriends().then((rows) => setFriends(rows.filter((row) => row.status === 'accepted'))).catch(() => setFriends([]));
    });
  }, []);

  return (
    <section className="panel challenge-panel">
      <div><span className="card-kicker">Play safely together</span><h2>Challenge Room</h2>
        <p>Reach a shared score of 5,000. Invitation links contain a random code—never an email or account ID.</p></div>
      <div className="shared-goal"><div><strong>0 / 5,000</strong><small>Shared stars</small></div><div className="goal-track"><i style={{ width: '0%' }} /></div><span>Reward: 🎁 5 bonus coins each</span></div>
      <div className="friends">
        {signedIn && friends.length
          ? friends.map((friend) => <span key={friend.id}>{icons[friend.character_id] ?? '🙂'} {friend.name} · Level {friend.level}</span>)
          : <span>{signedIn ? '👋 No friends yet — search a username in Friends.' : '🔐 Log in to challenge your real friends.'}</span>}
      </div>
      <button className="primary-button" onClick={onChallenge}>Challenge Friends</button>
      {inviteLink && <div className="invite-box"><input readOnly value={inviteLink} aria-label="Challenge invitation link" /><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</button></div>}
      {message && <p className="fine-print">{message}</p>}
    </section>
  );
}
