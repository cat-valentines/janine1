import { useEffect, useRef, useState } from 'react';
import { MansionEngine, type MansionSnapshot } from '../game/mansionEngine';
import { DAYS, KEYS_TO_ESCAPE, STONES_PER_NIGHT } from '../game/mansion';
import { characterAssets } from '../game/characters';
import { loadMyFriends, type FriendRow } from '../lib/players';
import { sendFriendMessage } from '../lib/friends';
import { heartbeat, leaveGame } from '../lib/presence';
import { joinLiveGame } from '../lib/liveGame';
import { KeyPad } from '../components/KeyPad';
import { supabase } from '../lib/supabase';
import type { CharacterId } from '../game/types';

interface EscapePageProps {
  character: CharacterId;
  onEscape: (coins: number) => void;
  onBack: () => void;
}

const ESCAPE_PRIZE = 40;
const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶' };

export function EscapePage({ character, onEscape, onBack }: EscapePageProps) {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<MansionSnapshot | null>(null);
  // Start-screen: play alone, or invite friends to a scheduled game.
  const [mode, setMode] = useState<'alone' | 'friends' | 'everybody'>('alone');
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [inviteDate, setInviteDate] = useState('');
  const [inviteTime, setInviteTime] = useState('');
  const [inviteNote, setInviteNote] = useState('');

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
    const link = `${window.location.origin}/play/housekeeper`;
    let when = '';
    if (inviteDate && inviteTime) {
      when = ` on ${new Date(`${inviteDate}T${inviteTime}`).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    }
    try {
      await Promise.all([...picked].map((id) => sendFriendMessage(userId, id, `🔦 @${myName} invited you to play The Housekeeper${when}! Can you both escape? ${link}`)));
      setInviteNote(`Invite sent to ${picked.size} ${picked.size === 1 ? 'friend' : 'friends'}!`);
      setPicked(new Set());
    } catch { setInviteNote('Could not send the invites.'); }
  };
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<MansionEngine | null>(null);
  const paid = useRef(false);
  const update = useRef<(s: MansionSnapshot) => void>(() => undefined);
  update.current = (next) => {
    setSnapshot(next);
    if (next.status === 'escaped' && !paid.current) { paid.current = true; onEscape(ESCAPE_PRIZE); }
  };

  useEffect(() => {
    if (!started || !mount.current) return;
    const created = new MansionEngine(mount.current, {
      characterAsset: characterAssets[character],
      party: mode === 'everybody',
      onUpdate: (next) => update.current(next),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [started, round, character, mode]);

  // Real multiplayer: in "everybody" mode we shout our own position several
  // times a second and draw every other real player exactly where they are.
  // The AI bots stay bots — real players come in over this live channel, so a
  // friend standing in a corner shows up standing in that corner, not roaming.
  useEffect(() => {
    if (!started || mode !== 'everybody' || !userId) return;
    const live = joinLiveGame('housekeeper', userId, (peers) => engine.current?.setLivePlayers(peers));
    heartbeat('housekeeper');
    const beat = setInterval(() => heartbeat('housekeeper'), 5000);
    const shout = setInterval(() => {
      const state = engine.current?.getSelfState();
      if (state) live.send({ name: myName, ...state });
    }, 120);
    return () => { clearInterval(beat); clearInterval(shout); live.leave(); leaveGame(); };
  }, [started, mode, userId, myName]);

  const again = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!started) {
    return <main className="quest-pick escape-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🔦 Can you get out?</span></div>
      <header className="quest-header escape-header">
        <p className="eyebrow">A creepy escape game</p>
        <h1><span>🏚️</span> The Housekeeper <span>🔦</span></h1>
        <p>You are locked in her house. She is already walking the halls.</p>
      </header>
      <section className="quest-pick-card">
        <div className="escape-mode escape-mode-3">
          <button className={mode === 'alone' ? 'on' : ''} onClick={() => setMode('alone')}>🎮 Play alone</button>
          <button className={mode === 'friends' ? 'on' : ''} onClick={() => setMode('friends')}>👫 Invite friends</button>
          <button className={mode === 'everybody' ? 'on' : ''} onClick={() => setMode('everybody')}>🌍 Play with everybody</button>
        </div>

        {mode === 'everybody' && <div className="escape-invite">
          <p className="escape-invite-note">🌍 A house full of players! <strong>Two housekeepers</strong> patrol, and everyone races to find the keys without getting caught. Escape and you unlock a deeper, harder level. You'll see <strong>other real players live</strong> — wearing their @name, exactly where they really are — and 🤖 bots fill out the house.</p>
        </div>}

        {mode === 'friends' && <div className="escape-invite">
          {!userId
            ? <p className="escape-invite-note">🔐 Log in from the front page to invite your friends. You can still play alone right now.</p>
            : <>
              <p className="escape-invite-note">Pick one or more friends and set a day and time — they will get an invite to play too.</p>
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

        <p className="card-kicker">How to get out</p>
        <h2>Find {KEYS_TO_ESCAPE} keys and reach the door — you have {DAYS} nights.</h2>
        <div className="escape-rules">
          <div><span>🔑</span><strong>Search the cabinets</strong><small>{KEYS_TO_ESCAPE} keys are locked inside cabinets around the house. Stand at a cabinet and press Space to swing it open and grab the key. The front door won't open without all of them.</small></div>
          <div><span>🚪</span><strong>Get to the door</strong><small>It glows faintly. Stand at it and press Space once you have every key.</small></div>
          <div><span>🚪</span><strong>Hide</strong><small>Press Space at a wardrobe to climb in, or at a bed to slide underneath. But if she watches you get in, she will come and open it.</small></div>
          <div><span>🪵</span><strong>Mind the floorboards</strong><small>The worn brown boards creak if you run over them, and she hears it from anywhere.</small></div>
          <div><span>🪤</span><strong>Watch for bear traps</strong><small>Step in one and you are held there for a few seconds, yelling — and she comes running. You can always walk around them.</small></div>
          <div><span>🪨</span><strong>Throw a stone</strong><small>Press E to lob one. It clatters where it lands and she goes to look — which buys you the room she was in. {STONES_PER_NIGHT} a night.</small></div>
          <div><span>🌙</span><strong>You get {DAYS} nights</strong><small>She catches you, you wake up and it is the next night — but you keep every key you already found.</small></div>
          <div><span>🤫</span><strong>Sneak</strong><small>Hold Shift to walk quietly. Running is loud — she can hear it through walls.</small></div>
        </div>
        <p className="quest-hint">She patrols the whole house. If she spots you she will chase, and she keeps searching for a while after she loses you.</p>
        <button className="escape-start" onClick={() => setStarted(true)}>🔦 Go inside</button>
      </section>
    </main>;
  }

  const caught = snapshot?.status === 'caught';
  const lost = snapshot?.status === 'lost';
  const escaped = snapshot?.status === 'escaped';

  return <main className="escape-page">
    <div className={`escape-stage ${snapshot?.keeperState === 'chase' ? 'chased' : ''}`}>
      <div className="escape-canvas" ref={mount} />

      <div className="escape-hud">
        <div className="escape-keys">
          {Array.from({ length: KEYS_TO_ESCAPE }, (_, i) => <b className={i < (snapshot?.keys ?? 0) ? 'got' : ''} key={i}>🔑</b>)}
        </div>
        <div className="escape-stones"><strong>🪨 {snapshot?.stones ?? STONES_PER_NIGHT}</strong><small>stones</small></div>
        <div className="escape-night"><strong>🌙 Night {snapshot?.day ?? 1}</strong><small>of {DAYS}</small></div>
        {snapshot?.party && <div className="escape-night"><strong>🔒 Level {snapshot.level}</strong><small>go deeper</small></div>}
        <div className="escape-state">
          <strong>{(snapshot?.trapped ?? 0) > 0 ? `🪤 Stuck! ${snapshot?.trapped}s` : snapshot?.hidden ? '🤫 Hidden' : snapshot?.keeperState === 'chase' ? '🏃 She sees you!' : snapshot?.keeperState === 'search' ? '👀 She is looking' : '🚶 She is patrolling'}</strong>
          <i className="escape-alarm"><s style={{ width: `${Math.round((snapshot?.alarm ?? 0) * 100)}%` }} /></i>
        </div>
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="escape-message">{snapshot.message}</p>}
      {snapshot?.status === 'playing' && <KeyPad actions={[
        { codes: ['Space'], label: '✋' },
        { codes: ['KeyE'], label: '🪨' },
        { codes: ['ShiftLeft'], label: '🤫' },
      ]} />}
      {snapshot?.status === 'playing' && <p className="escape-help">
        <b>↑ ↓</b> walk · <b>← →</b> turn · <b>Shift</b> sneak · <b>E</b> throw a stone · <b>Space</b> {snapshot.hidden ? 'come back out' : snapshot.nearKey ? '🔑 open the cabinet' : snapshot.nearHide ? 'hide here' : snapshot.nearDoor ? 'open the door' : 'search cabinets / hide'}
      </p>}

      {caught && <div className="quest-over">
        <div className="quest-over-card">
          <h2>🖐️ She caught you!</h2>
          <p>You wake up back in the bedroom. It is now <strong>night {snapshot.day} of {DAYS}</strong> — and the {snapshot.keys} {snapshot.keys === 1 ? 'key' : 'keys'} you already found {snapshot.keys === 1 ? 'is' : 'are'} still yours.</p>
          <button onClick={() => engine.current?.wakeUp()}>Wake up →</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}

      {lost && <div className="quest-over">
        <div className="quest-over-card">
          <h2>💀 She caught you for the last time</h2>
          <p>You ran out of nights with {snapshot.keys} of {KEYS_TO_ESCAPE} keys. Sneak with Shift, watch for creaky boards, and hide before she sees you.</p>
          <button onClick={again}>Start again</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}

      {escaped && <div className="quest-over">
        <div className="quest-over-card win">
          <h2>🚪 You escaped!</h2>
          <p>You found every key and got out of the house. You earned <strong>+{ESCAPE_PRIZE} gold coins</strong>.</p>
          <button onClick={again}>Play again</button>
          <button className="ghost" onClick={onBack}>Spend my coins</button>
        </div>
      </div>}
    </div>
  </main>;
}
