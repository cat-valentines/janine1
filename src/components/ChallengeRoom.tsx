import { useEffect, useState } from 'react';
import { loadMyFriends, type FriendRow } from '../lib/players';
import { sendFriendMessage } from '../lib/friends';
import { supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { getStars, STAR_GOAL } from '../lib/escapeStars';

interface ChallengeRoomProps { onChallenge: () => void; inviteLink: string; message: string }

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥', misha: '🐄', joy: '🐾', melly: '🦭', martin: '🦔' };

export function ChallengeRoom({ onChallenge, inviteLink, message }: ChallengeRoomProps) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [stars, setStars] = useState(0);
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  const [picking, setPicking] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  useEffect(() => { setStars(getStars()); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'a friend');
      loadMyFriends().then((rows) => setFriends(rows.filter((row) => row.status === 'accepted'))).catch(() => setFriends([]));
    });
  }, []);

  const challenge = async (friend: FriendRow) => {
    const link = `${window.location.origin}/play/escaperoom`;
    try {
      await sendFriendMessage(userId, friend.id, `🏝️ @${myName} challenges you to explore the Island World — collect ⭐ stars, do quests and race to unlock the next island! ${link}`);
      setSentTo((prev) => new Set(prev).add(friend.id));
      setNote(`⚔️ Challenge sent to @${friend.name}!`);
    } catch { setNote('Could not send the challenge — try again.'); }
  };

  const onChallengeClick = () => {
    if (signedIn && friends.length) setPicking((open) => !open);
    else onChallenge();
  };

  return (
    <section className="panel challenge-panel">
      <div><span className="card-kicker">Explore &amp; collect</span><h2>🏝️ Island World</h2>
        <p>Explore a big magical 3-D island — collect ⭐ stars, finish themed quests, dive into crystal caves and find waterfalls. Reach 5,000 stars to unlock the next island. You'll see other real players exploring live. Play alone, or challenge friends. Invitation links contain a random code—never an email or account ID.</p></div>
      <div className="shared-goal"><div><strong>{stars.toLocaleString()} / {STAR_GOAL.toLocaleString()}</strong><small>Stars to next island</small></div><div className="goal-track"><i style={{ width: `${Math.min(100, ((stars % STAR_GOAL) / STAR_GOAL) * 100)}%` }} /></div><span>Reward: 🏝️ unlock the next island</span></div>
      <div className="friends">
        {signedIn && friends.length
          ? <span className="friends-count"><b>👥 {friends.length} {friends.length === 1 ? 'friend' : 'friends'}</b> ready — tap <b>Challenge Friends</b> to pick who to challenge.</span>
          : <span>{signedIn ? '👋 No friends yet — search a username in Friends.' : '🔐 Log in to challenge your real friends.'}</span>}
      </div>
      <div className="challenge-buttons">
        <button className="primary-button" onClick={() => navigate('/play/escaperoom')}>🌟 Explore</button>
        <button className={`primary-button ghost-btn ${picking ? 'on' : ''}`} onClick={onChallengeClick}>👥 Challenge Friends</button>
      </div>

      {picking && signedIn && friends.length > 0 && <div className="challenge-picker">
        <p className="challenge-pick-title">Choose who to challenge:</p>
        <div className="challenge-friend-list">
          {friends.map((friend) => <div className="challenge-friend" key={friend.id}>
            <span>{icons[friend.character_id] ?? '🙂'} <strong>{friend.name}</strong> <small>Level {friend.level}</small></span>
            <button className={sentTo.has(friend.id) ? 'sent' : ''} onClick={() => challenge(friend)}>{sentTo.has(friend.id) ? '✓ Sent' : '⚔️ Challenge'}</button>
          </div>)}
        </div>
        <button className="challenge-link-btn" onClick={onChallenge}>🔗 Or make a shareable link instead</button>
      </div>}

      {note && <p className="friend-note">{note}</p>}
      {inviteLink && <div className="invite-box"><input readOnly value={inviteLink} aria-label="Challenge invitation link" /><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</button></div>}
      {message && <p className="fine-print">{message}</p>}
    </section>
  );
}
