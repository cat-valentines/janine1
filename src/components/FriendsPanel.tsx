import { useEffect, useState } from 'react';
import { challengeUrl, createChallenge } from '../lib/challenges';
import { loadFriendMessages, sendFriendMessage, type FriendMessage } from '../lib/friends';
import { acceptFriend, addFriend, loadMyFriends, removeFriend, searchPlayers, type FoundPlayer, type FriendRow } from '../lib/players';
import { supabase } from '../lib/supabase';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

export function FriendsPanel({ onClose }: { onClose: () => void; onShare: () => void }) {
  const [userId, setUserId] = useState('');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<FriendRow | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<FoundPlayer[]>([]);
  const [chat, setChat] = useState<FriendMessage[]>([]);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [calling, setCalling] = useState(false);

  const refresh = () => loadMyFriends().then((rows) => { setFriends(rows); setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null); });
  const openChat = (id: string) => loadFriendMessages(id).then(setChat).catch(() => setChat([]));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      refresh().catch(() => setNote('Friends are not online yet. The database update may still need to be applied.'));
    });
  }, []);

  useEffect(() => {
    if (!selected || selected.status !== 'accepted') { setChat([]); return; }
    openChat(selected.id);
  }, [selected]);

  useEffect(() => {
    const query = search.trim();
    if (!userId || query.length < 2) { setFound([]); return; }
    const timer = setTimeout(() => searchPlayers(query).then(setFound).catch(() => setNote('Player search is not online yet.')), 300);
    return () => clearTimeout(timer);
  }, [search, userId]);

  const requestFriend = async (player: FoundPlayer) => {
    try { await addFriend(userId, player.id); setNote(`Friend request sent to @${player.name}.`); setFound((rows) => rows.filter((row) => row.id !== player.id)); await refresh(); }
    catch { setNote('Could not send the friend request.'); }
  };

  const unfriend = async (player: { id: string; name: string }) => {
    try { await removeFriend(userId, player.id); setSelected((current) => current?.id === player.id ? null : current); await refresh(); setNote(`@${player.name} was removed from your friends.`); }
    catch { setNote('Could not remove that friend.'); }
  };

  const toggleStar = (player: FoundPlayer) => {
    const connection = friends.find((friend) => friend.id === player.id);
    return connection ? unfriend(connection) : requestFriend(player);
  };

  const accept = async (friend: FriendRow) => {
    try { await acceptFriend(userId, friend.id); await refresh(); setNote(`You and @${friend.name} are friends now.`); }
    catch { setNote('Could not accept the friend request.'); }
  };

  const invite = async () => {
    if (!selected) return;
    try { const room = await createChallenge(userId); await sendFriendMessage(userId, selected.id, `🎮 Come play Tower Royal! ${challengeUrl(room.invite_code)}`); await openChat(selected.id); setNote(`Game invitation sent to @${selected.name}.`); }
    catch { setNote('Could not send the game invitation.'); }
  };

  const send = async () => {
    if (!selected || !message.trim()) return;
    try { await sendFriendMessage(userId, selected.id, message); setMessage(''); await openChat(selected.id); }
    catch { setNote('Message not sent.'); }
  };

  return <div className="friends-backdrop" onClick={onClose}><aside className="friends-panel" onClick={(event) => event.stopPropagation()}>
    <div className="shop-heading"><div><span className="card-kicker">Real players only</span><h2>Friends</h2></div><button onClick={onClose} aria-label="Close friends">×</button></div>
    {!userId ? <div className="friend-login-note"><span>🔐</span><h3>Log in to find friends</h3><p>Only signed-up Tower Royal players appear here.</p></div> : <>
      <div className="friend-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search real players by username…" maxLength={24} /></div>
      {search.trim().length >= 2 && <section className="player-search-results"><h3>Player search</h3>{found.map((player) => { const connected = friends.some((friend) => friend.id === player.id); return <div className="player-result" key={player.id}><span>{icons[player.character_id] ?? '🙂'}</span><strong>@{player.name}<small>Level {player.level}</small></strong><button className={`friend-star ${connected ? 'starred' : ''}`} onClick={() => toggleStar(player)} title={connected ? 'Unfriend this player' : 'Add this player as a friend'} aria-label={connected ? `Unfriend ${player.name}` : `Friend ${player.name}`}>{connected ? '★' : '☆'}</button></div>; })}{!found.length && <p className="friend-empty">No matching signed-up players.</p>}</section>}
      <div className="friend-list">{friends.map((friend) => <div className="friend-row" key={friend.id}><button className={selected?.id === friend.id ? 'selected' : ''} onClick={() => setSelected(friend)}><span>{icons[friend.character_id] ?? '🙂'}</span><strong>{friend.name}<small>{friend.status === 'accepted' ? `Level ${friend.level}` : friend.incoming ? 'Wants to be your friend' : 'Request sent'}</small></strong></button>{friend.status === 'pending' && friend.incoming && <button className="friend-accept" onClick={() => accept(friend)}>✓ Accept</button>}<button className="friend-star starred" onClick={() => unfriend(friend)} title="Unfriend this player" aria-label={`Unfriend ${friend.name}`}>★</button></div>)}{!friends.length && <p className="friend-empty">No friends yet. Search for a username above.</p>}</div>
      {selected && <><article className="friend-profile"><div className="friend-avatar">{icons[selected.character_id] ?? '🙂'}</div><div><p className="card-kicker">Real player profile</p><h3>@{selected.name}</h3><p>⭐ Level {selected.level}</p><p>{selected.status === 'accepted' ? '🤝 Your friend' : '⏳ Request pending'}</p></div></article>
        {selected.status === 'accepted' && <><div className="friend-actions"><button onClick={() => setCalling((active) => !active)}>🎙️ {calling ? 'End Call' : 'Live Talk'}</button><button onClick={invite}>🎮 Invite to Play</button></div>{calling && <p className="call-status">Live party open with @{selected.name}</p>}<div className="chat-box"><h3>Chat with {selected.name}</h3>{chat.map((item) => <p className={item.sender_id === userId ? 'chat-mine' : ''} key={item.id}>{item.message}</p>)}<div><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Write a message…" maxLength={500} /><button onClick={send}>Send</button></div></div></>}
      </>}{note && <p className="friend-note">{note}</p>}
    </>}
  </aside></div>;
}
