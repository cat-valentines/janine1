import { useEffect, useState } from 'react';
import { loadFriendMessages, sendFriendMessage, type FriendMessage } from '../lib/friends';
import { acceptFriend, addFriend, loadMyFriends, removeFriend, searchPlayers, type FoundPlayer, type FriendRow } from '../lib/players';
import { inviteLink, inviteTargets, gameTargets, type InviteTarget } from '../game/inviteTargets';
import { supabase } from '../lib/supabase';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

export function FriendsPanel({ onClose }: { onClose: () => void; onShare: () => void }) {
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<FriendRow | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<FoundPlayer[]>([]);
  const [chat, setChat] = useState<FriendMessage[]>([]);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [calling, setCalling] = useState(false);
  /** Which invite tray is open: none, "invite now", or "plan a play date". */
  const [tray, setTray] = useState<'none' | 'now' | 'plan'>('none');
  const [planGame, setPlanGame] = useState(gameTargets[0].id);
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('');

  const refresh = () => loadMyFriends().then((rows) => { setFriends(rows); setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null); });
  const openChat = (id: string) => loadFriendMessages(id).then(setChat).catch(() => setChat([]));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'a friend');
      refresh().catch(() => setNote('Friends are not online yet. The database update may still need to be applied.'));
    });
  }, []);

  useEffect(() => {
    setTray('none');
    if (!selected || selected.status !== 'accepted') { setChat([]); return; }
    openChat(selected.id);
  }, [selected]);

  useEffect(() => {
    const query = search.trim();
    if (!userId || query.length < 2) { setFound([]); return; }
    const timer = setTimeout(() => searchPlayers(query).then(setFound).catch(() => setNote('Player search is not online yet.')), 300);
    return () => clearTimeout(timer);
  }, [search, userId]);

  const friendNow = async (player: FoundPlayer) => {
    try { await addFriend(userId, player.id); setNote(`🎉 You and @${player.name} are friends now!`); setFound((rows) => rows.filter((row) => row.id !== player.id)); await refresh(); }
    catch { setNote('Could not add that friend.'); }
  };

  const unfriend = async (player: { id: string; name: string }) => {
    try { await removeFriend(userId, player.id); setSelected((current) => current?.id === player.id ? null : current); await refresh(); setNote(`@${player.name} was removed from your friends.`); }
    catch { setNote('Could not remove that friend.'); }
  };

  const toggleStar = (player: FoundPlayer) => {
    const connection = friends.find((friend) => friend.id === player.id);
    return connection ? unfriend(connection) : friendNow(player);
  };

  const accept = async (friend: FriendRow) => {
    try { await acceptFriend(userId, friend.id); await refresh(); setNote(`You and @${friend.name} are friends now.`); }
    catch { setNote('Could not accept that request.'); }
  };

  const sendInvite = async (target: InviteTarget) => {
    if (!selected) return;
    try {
      const where = target.game ? `to play ${target.icon} ${target.label}` : `to ${target.icon} ${target.label}`;
      await sendFriendMessage(userId, selected.id, `🎮 @${myName} invited you ${where}! ${inviteLink(target)}`);
      await openChat(selected.id);
      setTray('none');
      setNote(`Invitation sent to @${selected.name}.`);
    } catch { setNote('Could not send that invitation.'); }
  };

  const sendPlan = async () => {
    if (!selected) return;
    const target = gameTargets.find((game) => game.id === planGame);
    if (!target || !planDate || !planTime) { setNote('Pick a game, a day and a time first.'); return; }
    try {
      const when = new Date(`${planDate}T${planTime}`);
      const pretty = when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      await sendFriendMessage(userId, selected.id, `📅 Play date! @${myName} wants to play ${target.icon} ${target.label} with you on ${pretty}. ${inviteLink(target)}`);
      await openChat(selected.id);
      setTray('none');
      setNote(`Play date sent to @${selected.name}!`);
    } catch { setNote('Could not send the play date.'); }
  };

  const send = async () => {
    if (!selected || !message.trim()) return;
    try { await sendFriendMessage(userId, selected.id, message); setMessage(''); await openChat(selected.id); }
    catch { setNote('Message not sent.'); }
  };

  return <div className="friends-backdrop" onClick={onClose}><aside className="friends-panel" onClick={(event) => event.stopPropagation()}>
    <div className="shop-heading"><div><span className="card-kicker">Real players only</span><h2>Friends</h2></div><button onClick={onClose} aria-label="Close friends">×</button></div>
    {!userId ? <div className="friend-login-note"><span>🔐</span><h3>Log in to find friends</h3><p>Only signed-up Magical Islands players appear here.</p></div> : <>
      <div className="friend-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search real players by username…" maxLength={24} /></div>
      {search.trim().length >= 2 && <section className="player-search-results"><h3>Player search</h3>{found.map((player) => { const connected = friends.some((friend) => friend.id === player.id); return <div className="player-result" key={player.id}><span>{icons[player.character_id] ?? '🙂'}</span><strong>@{player.name}<small>Level {player.level}</small></strong><button className={`friend-star ${connected ? 'starred' : ''}`} onClick={() => toggleStar(player)} title={connected ? 'Unfriend this player' : 'Add friend'} aria-label={connected ? `Unfriend ${player.name}` : `Friend ${player.name}`}>{connected ? '★' : '☆'}</button></div>; })}{!found.length && <p className="friend-empty">No matching signed-up players.</p>}</section>}
      <div className="friend-list">{friends.map((friend) => <div className="friend-row" key={friend.id}><button className={selected?.id === friend.id ? 'selected' : ''} onClick={() => setSelected(friend)}><span>{icons[friend.character_id] ?? '🙂'}</span><strong>{friend.name}<small>{friend.status === 'accepted' ? `Level ${friend.level}` : 'Wants to be your friend'}</small></strong></button>{friend.status === 'pending' && friend.incoming && <button className="friend-accept" onClick={() => accept(friend)}>✓ Accept</button>}<button className="friend-star starred" onClick={() => unfriend(friend)} title="Unfriend this player" aria-label={`Unfriend ${friend.name}`}>★</button></div>)}{!friends.length && <p className="friend-empty">No friends yet. Search for a username above.</p>}</div>

      {selected && <><article className="friend-profile"><div className="friend-avatar">{icons[selected.character_id] ?? '🙂'}</div><div><p className="card-kicker">Real player profile</p><h3>@{selected.name}</h3><p>⭐ Level {selected.level}</p><p>🤝 Your friend</p></div></article>

        {selected.status === 'accepted' && <>
          <div className="friend-actions">
            <button className={tray === 'now' ? 'on' : ''} onClick={() => setTray(tray === 'now' ? 'none' : 'now')}>🎮 Invite to Play</button>
            <button className={tray === 'plan' ? 'on' : ''} onClick={() => setTray(tray === 'plan' ? 'none' : 'plan')}>📅 Plan a Play Date</button>
            <button onClick={() => setCalling((active) => !active)}>🎙️ {calling ? 'End Call' : 'Live Talk'}</button>
          </div>
          {calling && <p className="call-status">Live party open with @{selected.name}</p>}

          {tray === 'now' && <div className="invite-tray">
            <p className="invite-tray-title">Invite @{selected.name} to…</p>
            <div className="invite-grid">
              {inviteTargets.map((target) => <button key={target.id} onClick={() => sendInvite(target)}>
                <span>{target.icon}</span>{target.game ? target.label : target.id === 'market' ? 'the Market' : 'my House'}
              </button>)}
            </div>
          </div>}

          {tray === 'plan' && <div className="invite-tray">
            <p className="invite-tray-title">Plan a play date with @{selected.name}</p>
            <label className="invite-field">Game
              <select value={planGame} onChange={(event) => setPlanGame(event.target.value)}>
                {gameTargets.map((game) => <option value={game.id} key={game.id}>{game.icon} {game.label}</option>)}
              </select>
            </label>
            <div className="invite-when">
              <label className="invite-field">Day<input type="date" value={planDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setPlanDate(event.target.value)} /></label>
              <label className="invite-field">Time<input type="time" value={planTime} onChange={(event) => setPlanTime(event.target.value)} /></label>
            </div>
            <button className="invite-send" onClick={sendPlan}>📅 Send the play date</button>
          </div>}

          <div className="chat-box"><h3>Chat with {selected.name}</h3>{chat.map((item) => <p className={item.sender_id === userId ? 'chat-mine' : ''} key={item.id}>{item.message}</p>)}<div><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Write a message…" maxLength={500} /><button onClick={send}>Send</button></div></div>
        </>}
      </>}{note && <p className="friend-note">{note}</p>}
    </>}
  </aside></div>;
}
