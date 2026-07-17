import { useEffect, useRef, useState } from 'react';
import { ScavengerEngine, type ScavSnapshot } from '../game/scavengerEngine';
import { SEARCHABLE_COUNT, TIME_LIMIT } from '../game/scavenger';
import { loadMyFriends, type FriendRow } from '../lib/players';
import { sendFriendMessage } from '../lib/friends';
import { joinLiveGame } from '../lib/liveGame';
import { heartbeat, leaveGame } from '../lib/presence';
import { supabase } from '../lib/supabase';

const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ScavengerPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [mode, setMode] = useState<'alone' | 'friends' | 'everybody'>('alone');
  const [snapshot, setSnapshot] = useState<ScavSnapshot | null>(null);
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inviteDate, setInviteDate] = useState('');
  const [inviteTime, setInviteTime] = useState('');
  const [inviteNote, setInviteNote] = useState('');

  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<ScavengerEngine | null>(null);
  const paid = useRef(false);
  const foundByMe = useRef(false);
  const mySeed = useRef(Math.floor(Math.random() * 1e9));
  const update = useRef<(snap: ScavSnapshot) => void>(() => undefined);
  update.current = (snap) => {
    setSnapshot(snap);
    if (snap.iFoundKey) foundByMe.current = true;
    if (snap.status === 'won' && !paid.current) {
      paid.current = true;
      onScore(12 + Math.floor(snap.timeLeft / 4));
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'a friend');
      loadMyFriends().then((rows) => setFriends(rows.filter((row) => row.status === 'accepted'))).catch(() => undefined);
    });
  }, []);

  const togglePick = (id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const sendInvites = async () => {
    if (!picked.size) return;
    const link = `${window.location.origin}/play/scavenger`;
    let when = '';
    if (inviteDate && inviteTime) {
      when = ` on ${new Date(`${inviteDate}T${inviteTime}`).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    }
    try {
      await Promise.all([...picked].map((id) => sendFriendMessage(userId, id, `🔦 @${myName} invited you to a Scavenger hunt${when}! Find the key and escape together. ${link}`)));
      setInviteNote(`Invite sent to ${picked.size} ${picked.size === 1 ? 'friend' : 'friends'}!`);
      setPicked(new Set());
    } catch { setInviteNote('Could not send the invites.'); }
  };

  // Build the game.
  useEffect(() => {
    if (!started || !mount.current) return;
    const created = new ScavengerEngine(mount.current, { onUpdate: (snap) => update.current(snap) });
    created.setKeyIndex(mySeed.current); // solo key placement; co-op refines it below
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [started, round]);

  // Co-op: shout my position, draw friends where they really are, agree on one
  // shared key (lowest player id owns the seed), and share the moment it's found.
  useEffect(() => {
    if (!started || mode === 'alone' || !userId) return;
    const seed = mySeed.current;
    const live = joinLiveGame('scavenger', userId, (peers) => {
      engine.current?.setPeers(peers.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.z, yaw: p.yaw })));
      let ownerSeed = seed;
      let ownerId = userId;
      peers.forEach((p) => { if (p.seed !== undefined && p.id < ownerId) { ownerId = p.id; ownerSeed = p.seed; } });
      engine.current?.setKeyIndex(ownerSeed);
      const finder = peers.find((p) => p.found);
      if (finder) engine.current?.setTeamFound(`@${finder.name}`);
    });
    heartbeat('scavenger');
    const beat = setInterval(() => heartbeat('scavenger'), 5000);
    const shout = setInterval(() => {
      const st = engine.current?.getSelfState();
      if (st) live.send({ name: myName, x: st.x, z: st.y, yaw: st.yaw, level: 0, seed, found: foundByMe.current });
    }, 110);
    return () => { clearInterval(beat); clearInterval(shout); live.leave(); leaveGame(); };
  }, [started, mode, userId, myName]);

  const again = () => {
    paid.current = false;
    foundByMe.current = false;
    mySeed.current = Math.floor(Math.random() * 1e9);
    setSnapshot(null);
    setRound((n) => n + 1);
  };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!started) {
    return <main className="quest-pick scav-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🔑 Find the key!</span></div>
      <header className="quest-header">
        <p className="eyebrow">A cozy co-op hunt</p>
        <h1><span>🏠</span> Scavenger <span>🔑</span></h1>
        <p>One key is hidden somewhere in the house. Search the cabinets, find it, and unlock the door — before the clock runs out.</p>
      </header>
      <section className="quest-pick-card">
        <div className="escape-mode escape-mode-3">
          <button className={mode === 'alone' ? 'on' : ''} onClick={() => setMode('alone')}>🎮 Play alone</button>
          <button className={mode === 'friends' ? 'on' : ''} onClick={() => setMode('friends')}>👫 Invite friends</button>
          <button className={mode === 'everybody' ? 'on' : ''} onClick={() => setMode('everybody')}>🌍 Play with everybody</button>
        </div>

        {mode === 'everybody' && <div className="escape-invite">
          <p className="escape-invite-note">🌍 Hunt together! Everyone in a Scavenger match right now shares the <strong>same house and the same key</strong>. You'll see each other running room to room — whoever finds the key unlocks the door for the whole team.</p>
        </div>}

        {mode === 'friends' && <div className="escape-invite">
          {!userId
            ? <p className="escape-invite-note">🔐 Log in from the front page to invite your friends. You can still play alone right now.</p>
            : <>
              <p className="escape-invite-note">Pick friends and (optionally) a day and time — they'll get an invite to hunt with you. Everyone who joins shares the same house and key.</p>
              <div className="escape-friend-picks">
                {friends.map((friend) => <label key={friend.id} className={picked.has(friend.id) ? 'on' : ''}>
                  <input type="checkbox" checked={picked.has(friend.id)} onChange={() => togglePick(friend.id)} />
                  <span>{icons[friend.character_id] ?? '🙂'}</span> @{friend.name}
                </label>)}
                {!friends.length && <p className="escape-invite-note">No friends yet — add some with the Friends button first.</p>}
              </div>
              <div className="escape-when">
                <label>Day<input type="date" value={inviteDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setInviteDate(event.target.value)} /></label>
                <label>Time<input type="time" value={inviteTime} onChange={(event) => setInviteTime(event.target.value)} /></label>
              </div>
              <button className="escape-invite-send" onClick={sendInvites} disabled={!picked.size}>📨 Send invite{picked.size > 1 ? `s (${picked.size})` : ''}</button>
              {inviteNote && <p className="escape-invite-ok">{inviteNote}</p>}
            </>}
        </div>}

        <p className="card-kicker">How to play</p>
        <h2>Search the house, find the one key, reach the locked door.</h2>
        <div className="escape-rules">
          <div><span>🚶</span><strong>Move around</strong><small>Use the arrow keys or WASD to walk through the rooms and doorways.</small></div>
          <div><span>🗄️</span><strong>Search furniture</strong><small>Stand next to a cabinet, chest, wardrobe or bed and press Space to search inside it.</small></div>
          <div><span>🔑</span><strong>Find the key</strong><small>It's hidden in exactly one piece of furniture. Find it and the front door unlocks.</small></div>
          <div><span>🚪</span><strong>Get out</strong><small>Once the key is found, go to the glowing door and press Space to escape.</small></div>
          <div><span>⏰</span><strong>Beat the clock</strong><small>You have {clock(TIME_LIMIT)} minutes. There are {SEARCHABLE_COUNT} places to look — split up with friends!</small></div>
        </div>
        <p className="quest-hint">In friends or everybody mode you all share one house and one key — team up to find it faster.</p>
        <button className="escape-start" onClick={() => setStarted(true)}>🏠 Go inside</button>
      </section>
    </main>;
  }

  const won = snapshot?.status === 'won';
  const lost = snapshot?.status === 'lost';

  return <main className="scav-page">
    <div className="scav-stage">
      <div className="scav-canvas" ref={mount} />

      <div className="scav-hud">
        <div className={`scav-timer ${snapshot && snapshot.timeLeft <= 20 ? 'low' : ''}`}><strong>⏰ {clock(snapshot?.timeLeft ?? TIME_LIMIT)}</strong></div>
        <div className="scav-progress">
          {snapshot?.found
            ? <strong>🔑 Key found{snapshot.finder && snapshot.finder !== 'You' ? ` by ${snapshot.finder}` : ''}!</strong>
            : <><strong>🔍 {snapshot?.searched ?? 0}/{snapshot?.searchable ?? SEARCHABLE_COUNT}</strong><small>searched</small></>}
        </div>
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="scav-message">{snapshot.message}</p>}
      {snapshot?.status === 'playing' && <p className="scav-help">
        <b>↑ ↓ ← →</b> move · <b>Space</b> {snapshot.nearAction === 'exit' ? 'open the door 🚪' : snapshot.nearAction === 'search' ? 'search here 🔍' : snapshot.nearAction === 'searched' ? '(already searched)' : snapshot.found ? 'get to the door' : 'search furniture'}
      </p>}

      {won && snapshot && <div className="quest-over">
        <div className="quest-over-card win">
          <h2>🎉 You escaped!</h2>
          <p>You found the key and got out with <strong>{clock(snapshot.timeLeft)}</strong> to spare. You earned <strong>+{12 + Math.floor(snapshot.timeLeft / 4)} gold coins</strong>.</p>
          <button onClick={again}>Play again</button>
          <button className="ghost" onClick={onBack}>Spend my coins</button>
        </div>
      </div>}

      {lost && snapshot && <div className="quest-over">
        <div className="quest-over-card">
          <h2>⏰ Out of time!</h2>
          <p>The key was still hidden when the clock ran out. You searched {snapshot.searched} of {snapshot.searchable} places — team up with friends to cover more rooms!</p>
          <button onClick={again}>Try again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>
  </main>;
}
