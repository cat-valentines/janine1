import { useEffect, useState } from 'react';
import { loadFriendMessages, sendFriendMessage, parseMedia, loadSavedSelfies, type FriendMessage, type MediaKind } from '../lib/friends';
import { mediaSignedUrl, resendMedia, saveMediaPrivate } from '../lib/media';
import { createGroup, loadMyGroups, loadGroupMessages, sendGroupText, clearedAt, clearGroupView, type ChatGroup, type GroupMessage } from '../lib/groups';
import { acceptFriend, addFriend, changeUsername, isTakenError, isUsernameFree, loadAllPlayers, loadMyFriends, loadMyStats, removeFriend, searchPlayers, USERNAME_RULE, type FoundPlayer, type FriendRow } from '../lib/players';
import { inviteLink, inviteTargets, gameTargets, type InviteTarget } from '../game/inviteTargets';
import { SelfieStudio } from './SelfieStudio';
import { supabase } from '../lib/supabase';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥' };

/** An auto-generated "player_xxxxxxxx" name, or none — either way, invisible to friend search. */
const isPlaceholderName = (name: string) => !name || /^player_[0-9a-f]{8}$/.test(name);

export function FriendsPanel({ onClose }: { onClose: () => void; onShare: () => void }) {
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  /** How you appear to other players in search — your public @handle. */
  const [myHandle, setMyHandle] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [savingHandle, setSavingHandle] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<FriendRow | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<FoundPlayer[]>([]);
  const [everyone, setEveryone] = useState<FoundPlayer[]>([]);
  const [chat, setChat] = useState<FriendMessage[]>([]);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  /** The Selfie camera studio, open for the selected friend. */
  const [selfieOpen, setSelfieOpen] = useState(false);
  /** A media message you're forwarding to another friend (only your own media). */
  const [resend, setResend] = useState<{ kind: MediaKind; path: string } | null>(null);
  /** The "🔒 Just me" private selfie gallery. */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saved, setSaved] = useState<FriendMessage[]>([]);
  /** The chat opens only when you tap 💬 Text on a friend's profile. */
  const [showChat, setShowChat] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'chat' | 'invite'>(null);
  /** Which invite tray is open: none, "invite now", or "plan a play date". */
  const [tray, setTray] = useState<'none' | 'now' | 'plan'>('none');
  const [planGame, setPlanGame] = useState(gameTargets[0].id);
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('');
  const [inviteFriends, setInviteFriends] = useState<Set<string>>(new Set());
  // ---- Group chats ----
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [makeGroupOpen, setMakeGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPick, setGroupPick] = useState<Set<string>>(new Set());
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [groupMsgs, setGroupMsgs] = useState<GroupMessage[]>([]);
  const [groupText, setGroupText] = useState('');
  const [groupSelfie, setGroupSelfie] = useState(false);

  const refresh = () => loadMyFriends().then((rows) => { setFriends(rows); setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null); });
  const openChat = (id: string) => loadFriendMessages(id).then(setChat).catch(() => setChat([]));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const user = data.user;
      setUserId(user.id);
      const authName = (user.user_metadata.display_name as string | undefined) ?? '';
      setMyName(authName || 'a friend');
      refresh().catch(() => setNote('Friends are not online yet. The database update may still need to be applied.'));
      loadAllPlayers().then(setEveryone).catch(() => undefined);
      // Read the name friends actually search by — the one in your profile row.
      loadMyStats(user.id).then((stats) => {
        const profileName = stats?.display_name ?? '';
        setMyHandle(profileName);
        // Self-heal: if your searchable name is still a placeholder but your
        // account already has a real name, adopt it so friends can find you.
        if (isPlaceholderName(profileName) && authName && !isPlaceholderName(authName)) {
          changeUsername(user.id, authName).then(() => setMyHandle(authName)).catch(() => undefined);
        }
      }).catch(() => { if (authName && !isPlaceholderName(authName)) setMyHandle(authName); });
    });
  }, []);

  const saveHandle = async () => {
    const name = handleInput.trim().replace(/^@+/, '');
    if (!USERNAME_RULE.test(name)) { setNote('Usernames are 3–24 letters, numbers or _ (no spaces).'); return; }
    setSavingHandle(true);
    try {
      if (await isUsernameFree(name) === false) { setNote(`@${name} is already taken — try another.`); setSavingHandle(false); return; }
      await changeUsername(userId, name);
      setMyHandle(name); setMyName(name); setHandleInput(''); setEditingHandle(false);
      setNote(`✅ You're now @${name} — your friends can find you!`);
    } catch (error) {
      setNote(isTakenError(error) ? `@${name} is already taken — try another.` : 'Could not save your username. Try again.');
    }
    setSavingHandle(false);
  };

  useEffect(() => {
    setTray('none');
    setShowChat(false);
    if (!selected || selected.status !== 'accepted') { setChat([]); return; }
    openChat(selected.id);
    // a Text/Invite button on the row opens straight into that action
    if (pendingAction === 'chat') setShowChat(true);
    if (pendingAction === 'invite') { setInviteFriends(new Set([selected.id])); setTray('now'); }
    setPendingAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Usernames show everywhere as "@name", so people type the @ when searching.
  // Strip a leading @ so searching "@cat" finds the player named "cat".
  const query = search.trim().replace(/^@+/, '');
  useEffect(() => {
    if (!userId || query.length < 2) { setFound([]); return; }
    const timer = setTimeout(() => searchPlayers(query).then(setFound).catch(() => setNote('Player search is not online yet.')), 300);
    return () => clearTimeout(timer);
  }, [query, userId]);

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
    const ids = [...inviteFriends];
    if (!ids.length) { setNote('Tick at least one friend to invite.'); return; }
    try {
      const where = target.game ? `to play ${target.icon} ${target.label}` : `to ${target.icon} ${target.label}`;
      await Promise.all(ids.map((id) => sendFriendMessage(userId, id, `🎮 @${myName} invited you ${where}! ${inviteLink(target)}`)));
      if (selected && inviteFriends.has(selected.id)) await openChat(selected.id);
      setTray('none');
      setNote(`Invitation sent to ${ids.length} ${ids.length === 1 ? 'friend' : 'friends'}!`);
    } catch { setNote('Could not send that invitation.'); }
  };

  // Opening either tray starts with the friend you have open already ticked.
  const openTray = (which: 'now' | 'plan') => {
    if (tray === which) { setTray('none'); return; }
    setInviteFriends(new Set(selected ? [selected.id] : []));
    setTray(which);
  };

  const toggleInviteFriend = (id: string) => setInviteFriends((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const sendPlan = async () => {
    const target = gameTargets.find((game) => game.id === planGame);
    const ids = [...inviteFriends];
    if (!target || !planDate || !planTime) { setNote('Pick a game, a day and a time first.'); return; }
    if (!ids.length) { setNote('Tick at least one friend to invite.'); return; }
    try {
      const when = new Date(`${planDate}T${planTime}`);
      const pretty = when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      await Promise.all(ids.map((id) => sendFriendMessage(userId, id, `📅 Play date! @${myName} wants to play ${target.icon} ${target.label} with you on ${pretty}. ${inviteLink(target)}`)));
      if (selected && inviteFriends.has(selected.id)) await openChat(selected.id);
      setTray('none');
      setNote(`Play date sent to ${ids.length} ${ids.length === 1 ? 'friend' : 'friends'}!`);
    } catch { setNote('Could not send the play date.'); }
  };

  const send = async () => {
    if (!selected || !message.trim()) return;
    try { await sendFriendMessage(userId, selected.id, message); setMessage(''); await openChat(selected.id); }
    catch { setNote('Message not sent.'); }
  };

  const doResend = async (friend: FriendRow) => {
    if (!resend) return;
    try {
      await resendMedia(userId, friend.id, resend.kind, resend.path);
      setNote(`Sent your ${resend.kind} to @${friend.name}! 🎉`);
      setResend(null);
      if (selected) openChat(selected.id);
    } catch { setNote('Could not forward that — please try again.'); }
  };

  const openGallery = () => { loadSavedSelfies(userId).then(setSaved).catch(() => setSaved([])); setGalleryOpen(true); };

  // ---- Group chats ----
  const nameOf = (id: string) => id === userId ? 'You' : (friends.find((f) => f.id === id)?.name ?? everyone.find((p) => p.id === id)?.name ?? 'a friend');
  const iconOf = (id: string) => { const c = friends.find((f) => f.id === id)?.character_id ?? everyone.find((p) => p.id === id)?.character_id; return icons[c ?? ''] ?? '🙂'; };

  const openGroups = () => { loadMyGroups().then(setGroups).catch(() => setGroups([])); setGroupsOpen(true); };
  const openGroup = (group: ChatGroup) => {
    setActiveGroup(group); setGroupsOpen(false);
    loadGroupMessages(group.id).then(setGroupMsgs).catch(() => setGroupMsgs([]));
  };
  const refreshGroup = () => { if (activeGroup) loadGroupMessages(activeGroup.id).then(setGroupMsgs).catch(() => undefined); };
  const createGroupNow = async () => {
    const name = groupName.trim();
    if (name.length < 1 || groupPick.size === 0) { setNote('Name your group and pick at least one friend.'); return; }
    try {
      const gid = await createGroup(name, userId, [...groupPick]);
      setMakeGroupOpen(false); setGroupName(''); setGroupPick(new Set());
      const fresh = await loadMyGroups(); setGroups(fresh);
      const made = fresh.find((g) => g.id === gid); if (made) openGroup(made);
    } catch { setNote('Could not create the group — the database update may still be applying.'); }
  };
  const sendGroupMsg = async () => {
    if (!activeGroup || !groupText.trim()) return;
    try { await sendGroupText(activeGroup.id, userId, groupText); setGroupText(''); refreshGroup(); }
    catch { setNote('Message not sent.'); }
  };
  const clearGroup = () => { if (activeGroup) { clearGroupView(activeGroup.id); setGroupMsgs((cur) => [...cur]); } };
  const saveMedia = async (kind: MediaKind, path: string) => {
    try { await saveMediaPrivate(userId, kind, path); setNote('💾 Saved to your private selfies.'); }
    catch { setNote('Could not save that — please try again.'); }
  };

  const groupToggle = (id: string) => setGroupPick((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return <div className="friends-backdrop" onClick={onClose}><aside className="friends-panel" onClick={(event) => event.stopPropagation()}>
    <div className="shop-heading"><div><span className="card-kicker">Real players only</span><h2>Friends</h2></div><button onClick={onClose} aria-label="Close friends">×</button></div>
    {!userId ? <div className="friend-login-note"><span>🔐</span><h3>Log in to find friends</h3><p>Only signed-up Magical Islands players appear here.</p></div> : <>
      <button className="my-selfies-btn" onClick={openGallery}>🔒 My private selfies</button>
      {myHandle && !isPlaceholderName(myHandle) && !editingHandle
        ? <div className="friend-you"><span>👋</span><div>
            <strong>Friends find you as <b>@{myHandle}</b></strong>
            <small>Tell your friends this exact username so they can search and text you. <button className="linklike" onClick={() => { setHandleInput(myHandle); setEditingHandle(true); }}>Change it</button></small>
          </div></div>
        : <div className={`friend-you ${myHandle && !isPlaceholderName(myHandle) ? '' : 'warn'}`}><span>{myHandle && !isPlaceholderName(myHandle) ? '✏️' : '⚠️'}</span><div>
            <strong>{myHandle && !isPlaceholderName(myHandle) ? 'Change your username' : 'Set a username so friends can find you'}</strong>
            <small>{myHandle && !isPlaceholderName(myHandle) ? 'Pick the exact @name your friends will search for.' : "You don't have a public name yet, so you're hidden from search. Pick one and your friends can find and text you."}</small>
            <div className="handle-set"><input value={handleInput} onChange={(event) => setHandleInput(event.target.value)} placeholder="your_username" maxLength={24} onKeyDown={(event) => event.key === 'Enter' && saveHandle()} autoFocus={editingHandle} /><button disabled={savingHandle} onClick={saveHandle}>{savingHandle ? 'Saving…' : 'Save'}</button></div>
          </div></div>}
      <div className="friend-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search real players by username…" maxLength={24} /></div>
      {query.length >= 2 && <section className="player-search-results"><h3>Player search</h3>{found.map((player) => { const connected = friends.some((friend) => friend.id === player.id); return <div className="player-result" key={player.id}><span>{icons[player.character_id] ?? '🙂'}</span><strong>@{player.name}<small>Level {player.level}</small></strong><button className={`friend-star ${connected ? 'starred' : ''}`} onClick={() => toggleStar(player)} title={connected ? 'Unfriend this player' : 'Add friend'} aria-label={connected ? `Unfriend ${player.name}` : `Friend ${player.name}`}>{connected ? '★' : '☆'}</button></div>; })}{!found.length && <p className="friend-empty">No matching signed-up players.</p>}</section>}
      <div className="friend-list">{friends.map((friend) => <div className="friend-row" key={friend.id}>
        <button className={selected?.id === friend.id ? 'selected' : ''} onClick={() => setSelected(friend)}><span>{icons[friend.character_id] ?? '🙂'}</span><strong>{friend.name}<small>{friend.status === 'accepted' ? `Level ${friend.level}` : 'Wants to be your friend'}</small></strong></button>
        {friend.status === 'accepted' && <>
          <button className="friend-quick text" onClick={() => { setPendingAction('chat'); setSelected(friend); setShowChat(true); openChat(friend.id); }} title={`Text @${friend.name}`}>💬 Text</button>
          <button className="friend-quick invite" onClick={() => { setPendingAction('invite'); setSelected(friend); openTray('now'); }} title={`Invite @${friend.name}`}>🎮 Invite</button>
        </>}
        {friend.status === 'pending' && friend.incoming && <button className="friend-accept" onClick={() => accept(friend)}>✓ Accept</button>}
        <button className="friend-star starred" onClick={() => unfriend(friend)} title="Unfriend this player" aria-label={`Unfriend ${friend.name}`}>★</button>
      </div>)}{!friends.length && <p className="friend-empty">No friends yet. Add someone from the list below.</p>}</div>

      {query.length < 2 && <section className="all-players">
        <h3>Signed-up players</h3>
        {everyone.filter((player) => !friends.some((friend) => friend.id === player.id)).map((player) => <div className="player-result" key={player.id}>
          <span>{icons[player.character_id] ?? '🙂'}</span>
          <strong>@{player.name}<small>Level {player.level}</small></strong>
          <button className="friend-star" onClick={() => friendNow(player)} title={`Add @${player.name}`} aria-label={`Add ${player.name}`}>☆</button>
        </div>)}
        {everyone.filter((player) => !friends.some((friend) => friend.id === player.id)).length === 0 && <p className="friend-empty">Everyone signed up is already your friend! 🎉</p>}
      </section>}

      {query.length < 2 && <section className="group-cta">
        <button className="group-open-btn" onClick={openGroups}>👥 Group Chats</button>
        <button className="group-make-btn" onClick={() => { setGroupName(''); setGroupPick(new Set()); setMakeGroupOpen(true); }}>➕ Make a Group Chat</button>
      </section>}

      {selected && <><article className="friend-profile"><div className="friend-avatar">{icons[selected.character_id] ?? '🙂'}</div><div><p className="card-kicker">Real player profile</p><h3>@{selected.name}</h3><p>⭐ Level {selected.level}</p><p>🤝 Your friend</p></div></article>

        {selected.status === 'accepted' && <>
          <div className="friend-actions">
            <button className={showChat ? 'on' : ''} onClick={() => { const next = !showChat; setShowChat(next); if (next) openChat(selected.id); }}>💬 Text</button>
            <button className={tray === 'now' ? 'on' : ''} onClick={() => openTray('now')}>🎮 Invite to Play</button>
            <button className={tray === 'plan' ? 'on' : ''} onClick={() => openTray('plan')}>📅 Plan a Play Date</button>
            <button className="selfie-btn" onClick={() => setSelfieOpen(true)}>📸 Selfie</button>
          </div>

          {tray === 'now' && <div className="invite-tray">
            <p className="invite-tray-title">Who's coming?</p>
            <div className="invite-friend-list">
              {friends.filter((friend) => friend.status === 'accepted').map((friend) => <label key={friend.id} className={inviteFriends.has(friend.id) ? 'on' : ''}>
                <input type="checkbox" checked={inviteFriends.has(friend.id)} onChange={() => toggleInviteFriend(friend.id)} />
                <span>{icons[friend.character_id] ?? '🙂'}</span> @{friend.name}
              </label>)}
            </div>
            <p className="invite-tray-sub">Invite {inviteFriends.size || 'them'} to…</p>
            <div className="invite-grid">
              {inviteTargets.map((target) => <button key={target.id} onClick={() => sendInvite(target)}>
                <span>{target.icon}</span>{target.game ? target.label : target.id === 'market' ? 'the Market' : 'my House'}
              </button>)}
            </div>
          </div>}

          {tray === 'plan' && <div className="invite-tray">
            <p className="invite-tray-title">Plan a play date</p>
            <label className="invite-field">Game
              <select value={planGame} onChange={(event) => setPlanGame(event.target.value)}>
                {gameTargets.map((game) => <option value={game.id} key={game.id}>{game.icon} {game.label}</option>)}
              </select>
            </label>
            <p className="invite-tray-sub">Who's coming?</p>
            <div className="invite-friend-list">
              {friends.filter((friend) => friend.status === 'accepted').map((friend) => <label key={friend.id} className={inviteFriends.has(friend.id) ? 'on' : ''}>
                <input type="checkbox" checked={inviteFriends.has(friend.id)} onChange={() => toggleInviteFriend(friend.id)} />
                <span>{icons[friend.character_id] ?? '🙂'}</span> @{friend.name}
              </label>)}
            </div>
            <div className="invite-when">
              <label className="invite-field">Day<input type="date" value={planDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setPlanDate(event.target.value)} /></label>
              <label className="invite-field">Time<input type="time" value={planTime} onChange={(event) => setPlanTime(event.target.value)} /></label>
            </div>
            <button className="invite-send" onClick={sendPlan}>📅 Send to {inviteFriends.size || 'no'} {inviteFriends.size === 1 ? 'friend' : 'friends'}</button>
          </div>}

          {showChat && <div className="chat-box"><h3>Chat with {selected.name}</h3>{chat.map((item) => {
            const media = parseMedia(item.message);
            const mine = item.sender_id === userId;
            if (media) return <ChatMedia key={item.id} mine={mine} kind={media.kind} path={media.path} onSave={() => saveMedia(media.kind, media.path)} onResend={mine ? () => setResend({ kind: media.kind, path: media.path }) : undefined} />;
            return <p className={mine ? 'chat-mine' : ''} key={item.id}>{item.message}</p>;
          })}{!chat.length && <p className="friend-empty">Say hi! @{selected.name} gets a 🔔 when you text.</p>}<div><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Write a message…" maxLength={500} autoFocus /><button onClick={send}>Send</button></div></div>}
        </>}
      </>}{note && <p className="friend-note">{note}</p>}

      {selfieOpen && selected && <SelfieStudio me={userId} friend={selected} friends={friends}
        onSent={() => { if (selected) openChat(selected.id); }} onClose={() => setSelfieOpen(false)} />}

      {resend && <div className="quest-over" onClick={() => setResend(null)}>
        <div className="resend-pick" onClick={(e) => e.stopPropagation()}>
          <h3>↗ Send this {resend.kind} to…</h3>
          <p className="resend-sub">Only you can forward your own photos and videos.</p>
          <div className="resend-list">{friends.filter((f) => f.status === 'accepted').map((f) => <button key={f.id} onClick={() => doResend(f)}>{icons[f.character_id] ?? '🙂'} @{f.name}</button>)}</div>
          <button className="ghost" onClick={() => setResend(null)}>Cancel</button>
        </div>
      </div>}

      {galleryOpen && <div className="quest-over" onClick={() => setGalleryOpen(false)}>
        <div className="selfie-gallery" onClick={(e) => e.stopPropagation()}>
          <h3>🔒 Just me — your private selfies</h3>
          {saved.length ? <div className="selfie-gallery-grid">{saved.map((item) => { const m = parseMedia(item.message); return m ? <ChatMedia key={item.id} mine kind={m.kind} path={m.path} onResend={() => { setGalleryOpen(false); setResend({ kind: m.kind, path: m.path }); }} /> : null; })}</div>
            : <p className="friend-empty">No private selfies yet. Take one and choose 🔒 Just me.</p>}
          <button className="ghost" onClick={() => setGalleryOpen(false)}>Close</button>
        </div>
      </div>}

      {/* Make a group chat: name it and pick from your friends */}
      {makeGroupOpen && <div className="quest-over" onClick={() => setMakeGroupOpen(false)}>
        <div className="group-make" onClick={(e) => e.stopPropagation()}>
          <h3>➕ Make a group chat</h3>
          <input className="group-name-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name (e.g. Best Friends)" maxLength={60} autoFocus />
          <p className="group-make-sub">Add friends — only players you've friended can join.</p>
          <div className="group-pick-list">
            {friends.filter((f) => f.status === 'accepted').map((f) => <label key={f.id} className={`selfie-recip ${groupPick.has(f.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={groupPick.has(f.id)} onChange={() => groupToggle(f.id)} /><span>{icons[f.character_id] ?? '🙂'} @{f.name}</span>
            </label>)}
            {friends.filter((f) => f.status === 'accepted').length === 0 && <p className="friend-empty">Add some friends first, then make a group.</p>}
          </div>
          <div className="selfie-actions">
            <button className="ghost" onClick={() => setMakeGroupOpen(false)}>Cancel</button>
            <button className="selfie-send" onClick={createGroupNow} disabled={!groupName.trim() || groupPick.size === 0}>Create ({groupPick.size})</button>
          </div>
        </div>
      </div>}

      {/* Your group chats */}
      {groupsOpen && <div className="quest-over" onClick={() => setGroupsOpen(false)}>
        <div className="group-list" onClick={(e) => e.stopPropagation()}>
          <h3>👥 Your group chats</h3>
          {groups.length ? <div className="group-list-rows">{groups.map((g) => <button key={g.id} className="group-list-row" onClick={() => openGroup(g)}>
            <span>👥</span><strong>{g.name}</strong>{g.owner_id === userId && <small>owner</small>}
          </button>)}</div> : <p className="friend-empty">No group chats yet — tap “Make a Group Chat”.</p>}
          <button className="ghost" onClick={() => setGroupsOpen(false)}>Close</button>
        </div>
      </div>}

      {/* An open group chat */}
      {activeGroup && <div className="quest-over" onClick={() => { setActiveGroup(null); }}>
        <div className="group-chat" onClick={(e) => e.stopPropagation()}>
          <div className="group-chat-top">
            <button className="group-back" onClick={() => { setActiveGroup(null); setGroupsOpen(true); }}>←</button>
            <strong>👥 {activeGroup.name}</strong>
            <button className="group-clear" onClick={clearGroup} title="Clear these messages from your view">🧹 Clear</button>
          </div>
          <div className="group-chat-body">
            {(() => { const cut = clearedAt(activeGroup.id); const shown = groupMsgs.filter((m) => !cut || m.created_at > cut);
              return shown.length ? shown.map((item) => {
                const media = parseMedia(item.message);
                const mine = item.sender_id === userId;
                if (media) return <ChatMedia key={item.id} mine={mine} kind={media.kind} path={media.path} label={nameOf(item.sender_id)} onSave={() => saveMedia(media.kind, media.path)} onResend={mine ? () => setResend({ kind: media.kind, path: media.path }) : undefined} />;
                return <p className={`group-msg ${mine ? 'chat-mine' : ''}`} key={item.id}><b>{iconOf(item.sender_id)} {nameOf(item.sender_id)}</b>{item.message}</p>;
              }) : <p className="friend-empty">No messages here yet. Say hi, or send a photo! 📸</p>;
            })()}
          </div>
          <div className="group-chat-input">
            <button className="group-photo-btn" onClick={() => setGroupSelfie(true)} title="Send a photo or video">📸</button>
            <input value={groupText} onChange={(e) => setGroupText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendGroupMsg()} placeholder="Message the group…" maxLength={4000} />
            <button className="group-send" onClick={sendGroupMsg}>Send</button>
          </div>
        </div>
      </div>}

      {groupSelfie && activeGroup && <SelfieStudio me={userId} group={{ id: activeGroup.id, name: activeGroup.name }} friends={friends}
        onSent={refreshGroup} onClose={() => setGroupSelfie(false)} />}
    </>}
  </aside></div>;
}

/** Renders a photo/video chat message by resolving its private storage path to a signed URL. */
function ChatMedia({ mine, kind, path, label, onResend, onSave }: { mine: boolean; kind: MediaKind; path: string; label?: string; onResend?: () => void; onSave?: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let live = true; mediaSignedUrl(path).then((u) => { if (live) setUrl(u); }); return () => { live = false; }; }, [path]);
  return <div className={`chat-media ${mine ? 'chat-mine' : ''}`}>
    {label && <small className="chat-media-who">{label}</small>}
    {!url ? <span className="chat-media-load">📷 loading…</span>
      : kind === 'photo' ? <img src={url} alt="selfie" /> : <video src={url} controls playsInline />}
    <div className="chat-media-btns">
      {onSave && <button className="chat-save" onClick={onSave}>💾 Save</button>}
      {onResend && <button className="chat-resend" onClick={onResend}>↗ Send to a friend</button>}
    </div>
  </div>;
}
