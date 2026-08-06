import { useEffect, useRef, useState } from 'react';
import { ReefEngine, type ReefSnapshot } from '../game/reefEngine';
import { coralFacts, fishKinds, KEYS_TO_WIN, START_LIVES, type FishId } from '../game/reef';
import { Joystick } from '../components/Joystick';
import { storage } from '../lib/storage';
import { joinLiveGame } from '../lib/liveGame';
import { heartbeat, leaveGame } from '../lib/presence';
import { supabase } from '../lib/supabase';

/** Everyone in "play with everybody" shares this one reef, so their positions
 *  land in the exact same spot of the maze for each other. */
const SHARED_REEF_SEED = 24601;

interface UnderwaterMazePageProps {
  onCoins: (coins: number) => void;
  onBack: () => void;
}

export function UnderwaterMazePage({ onCoins, onBack }: UnderwaterMazePageProps) {
  const [fish, setFish] = useState<FishId | null>(null);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<ReefSnapshot | null>(null);
  const [factIndex, setFactIndex] = useState(0);
  // Play alone, or in the shared reef with every other real player online now.
  const [mode, setMode] = useState<'solo' | 'everybody'>('solo');
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('a friend');
  const [liveCount, setLiveCount] = useState(0);
  // Phone: swim with a finger joystick or with the on-screen buttons (your choice).
  const [controls, setControls] = useState<'buttons' | 'joystick'>(() => (storage.get('reefControls') === 'joystick' ? 'joystick' : 'buttons'));
  const chooseControls = (mode: 'buttons' | 'joystick') => { setControls(mode); storage.set('reefControls', mode); };
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<ReefEngine | null>(null);
  const paid = useRef(false);
  const coins = useRef(onCoins);
  coins.current = onCoins;

  // the coral fact at the bottom quietly rotates
  useEffect(() => {
    const id = setInterval(() => setFactIndex((n) => (n + 1) % coralFacts.length), 8000);
    return () => clearInterval(id);
  }, []);

  // who am I? — so my @name floats over my fish for everyone else
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'a friend');
    });
  }, []);

  useEffect(() => {
    if (!started || !fish || !mount.current) return;
    const created = new ReefEngine(mount.current, {
      fish,
      // Everybody-mode players all swim the SAME reef so they line up.
      seed: mode === 'everybody' ? SHARED_REEF_SEED : 1234 + round * 17,
      onUpdate: setSnapshot,
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [started, fish, round, mode]);

  // Live multiplayer: shout my position several times a second, and draw every
  // other real player exactly where they are — wearing their @name.
  useEffect(() => {
    if (!started || mode !== 'everybody' || !userId) return;
    const live = joinLiveGame('reef', userId, (peers) => {
      engine.current?.setLivePlayers(peers);
      setLiveCount(peers.length);
    });
    heartbeat('reef');
    const beat = setInterval(() => heartbeat('reef'), 5000);
    const shout = setInterval(() => {
      const state = engine.current?.getSelfState();
      if (state) live.send({ name: myName, ...state });
    }, 120);
    return () => { clearInterval(beat); clearInterval(shout); live.leave(); leaveGame(); setLiveCount(0); };
  }, [started, mode, userId, myName]);

  // hand out the coins you gathered when the dive ends
  useEffect(() => {
    if (!snapshot || paid.current) return;
    if (snapshot.status === 'won') { paid.current = true; coins.current(snapshot.coins + 30); }
    else if (snapshot.status === 'over') { paid.current = true; coins.current(snapshot.coins); }
  }, [snapshot]);

  const playAgain = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  const touch = (dir: 'up' | 'down' | 'left' | 'right' | 'rise' | 'dive', on: boolean) => (event: React.PointerEvent) => {
    event.preventDefault();
    engine.current?.setTouch(dir, on);
  };

  // ---- start screen: choose your fish ----
  if (!started) {
    return <main className="reef-pick">
      <div className="reef-pick-top"><button onClick={onBack}>← Back</button><span>🫧🐠🫧</span></div>
      <header className="reef-header">
        <p className="eyebrow">A 3-D coral-reef adventure</p>
        <h1><span>🐠</span> Underwater Maze <span>🐟</span></h1>
        <p>Swim the coral maze. Gather {KEYS_TO_WIN} keys and reach a shell lock — without being eaten.</p>
      </header>

      <section className="reef-pick-card">
        <p className="card-kicker">Choose your fish</p>
        <div className="reef-fish-grid">
          {fishKinds.map((kind) => <button
            key={kind.id}
            className={`reef-fish-card ${fish === kind.id ? 'chosen' : ''}`}
            onClick={() => setFish(kind.id)}
          >
            <span className="reef-fish-emoji" style={{ background: `radial-gradient(circle at 40% 35%, ${kind.belly}, ${kind.body})` }}>{kind.emoji}</span>
            <strong>{kind.name}</strong>
            <small>{kind.blurb}</small>
          </button>)}
        </div>

        <div className="reef-rules">
          <div><b>🔑 {KEYS_TO_WIN} keys</b><span>hidden across the reef and inside caves</span></div>
          <div><b>🐚 5 shell locks</b><span>reach one with every key to win</span></div>
          <div><b>🦈 Predators</b><span>sharks, eels and big fish hunt and hide</span></div>
          <div><b>🕳️ Caves</b><span>coins wait inside — but so do hungry surprises</span></div>
        </div>

        <div className="escape-mode">
          <button className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>🎮 Play alone</button>
          <button className={mode === 'everybody' ? 'on' : ''} onClick={() => setMode('everybody')}>🌍 Play with everybody</button>
        </div>
        {mode === 'everybody' && <p className="escape-invite-note">🌍 Swim the <strong>same reef</strong> as everyone playing right now — you'll see other real players with their <strong>@name</strong> floating above them, and you all hunt for coins and keys together. {!userId && <em>Log in from the front page so your name shows too.</em>}</p>}

        <button className="reef-start" disabled={!fish} onClick={() => { paid.current = false; setStarted(true); }}>
          {fish ? (mode === 'everybody' ? '🌍 Dive in with everybody!' : '🤿 Dive in!') : 'Pick a fish first'}
        </button>
      </section>

      <section className="reef-fact-card">
        <p className="card-kicker">🐡 True coral fact</p>
        <p className="reef-fact-text">{coralFacts[factIndex].text}</p>
        <small>Source: {coralFacts[factIndex].source}</small>
      </section>
    </main>;
  }

  // ---- the dive ----
  const keys = snapshot?.keys ?? 0;
  const lives = snapshot?.lives ?? START_LIVES;
  const won = snapshot?.status === 'won';
  const over = snapshot?.status === 'over';
  const shield = snapshot?.shield ?? 0;
  const bubbleOn = snapshot?.bubbleOn ?? false;
  const inCave = snapshot?.inCave ?? false;
  const caveLeft = snapshot?.caveLeft ?? 0;
  const shieldLabel = bubbleOn ? `🫧 ${Math.ceil(shield)}s (off)` : shield > 0 ? `🫧 Bubble ${Math.ceil(shield)}s` : '🫧 …';

  return <main className="reef-page">
    <div className="reef-stage">
      <div className="reef-canvas" ref={mount} />
      {(snapshot?.hurt ?? 0) > 0 && <div className="reef-hurt" style={{ opacity: Math.min(0.6, (snapshot?.hurt ?? 0) * 0.6) }} />}

      <div className="reef-hud">
        <div className="reef-keys"><b>🔑 {keys}<small>/{KEYS_TO_WIN}</small></b><span>keys</span></div>
        <div className="reef-coins"><b>🪙 {snapshot?.coins ?? 0}</b><span>coins</span></div>
        <div className="reef-lives" aria-label={`${lives} lives left`}>
          {Array.from({ length: START_LIVES }, (_, i) => <i key={i}>{i < lives ? '❤️' : '🖤'}</i>)}
        </div>
        <div className={`reef-shield-chip ${bubbleOn ? 'on' : ''}`}><b>{shield > 0 ? `${Math.ceil(shield)}s` : '⏳'}</b><span>{bubbleOn ? '🫧 on' : 'bubble'}</span></div>
        {inCave && <div className="reef-shield-chip on"><b>{Math.ceil(caveLeft)}s</b><span>🪨 hidden</span></div>}
        {mode === 'everybody' && <div className="reef-shield-chip on"><b>{liveCount + 1}</b><span>🌍 live</span></div>}
        {snapshot?.hasAllKeys && <div className="reef-goal">🐚 Find a shell lock!</div>}
      </div>

      <button className="reef-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="reef-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="reef-message">{snapshot.message}</p>}

      {/* Pick how to swim: on-screen buttons or a finger joystick (touch only). */}
      <div className="reef-ctl-toggle">
        <button className={controls === 'buttons' ? 'on' : ''} onClick={() => chooseControls('buttons')}>⬆ Buttons</button>
        <button className={controls === 'joystick' ? 'on' : ''} onClick={() => chooseControls('joystick')}>🕹 Joystick</button>
      </div>
      {controls === 'joystick' && <Joystick />}

      {/* on-screen controls */}
      <div className="reef-controls">
        {controls === 'buttons'
          ? <div className="reef-dpad">
              <button className="up" onPointerDown={touch('up', true)} onPointerUp={touch('up', false)} onPointerLeave={touch('up', false)}>▲</button>
              <button className="left" onPointerDown={touch('left', true)} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)}>◀</button>
              <button className="right" onPointerDown={touch('right', true)} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)}>▶</button>
              <button className="down" onPointerDown={touch('down', true)} onPointerUp={touch('down', false)} onPointerLeave={touch('down', false)}>▼</button>
            </div>
          : <div className="reef-joy-slot" />}
        <div className="reef-vert">
          <button className={`reef-bubble-btn ${bubbleOn ? 'active' : ''}`} disabled={!bubbleOn && shield <= 0} onPointerDown={(event) => { event.preventDefault(); engine.current?.blowBubble(); }}>{shieldLabel}</button>
          <button onPointerDown={touch('rise', true)} onPointerUp={touch('rise', false)} onPointerLeave={touch('rise', false)}>🔼 Up</button>
          <button onPointerDown={touch('dive', true)} onPointerUp={touch('dive', false)} onPointerLeave={touch('dive', false)}>🔽 Dive</button>
        </div>
      </div>

      {snapshot?.status === 'swim' && <p className="reef-help"><b>↑↓</b> swim · <b>←→</b> turn · <b>Space</b> 🫧 bubble on/off (turn it off to save it!) · hide in 🪨 caves · <b>Shift</b> up · <b>Ctrl</b> dive</p>}

      {(won || over) && <div className="quest-over">
        <div className={`quest-over-card ${won ? 'win' : ''}`}>
          <h2>{won ? '🐚 You escaped the reef!' : '💀 Caught!'}</h2>
          <p>{won
            ? <>You found all {KEYS_TO_WIN} keys and opened a shell lock. You gathered <strong>{snapshot?.coins ?? 0} coins</strong> (+30 bonus) for the shops!</>
            : <>The predators got you. You still keep the <strong>{snapshot?.coins ?? 0} coins</strong> you collected. Try a new reef!</>}
          </p>
          <button onClick={playAgain}>{won ? 'Swim a new reef' : 'Try again'}</button>
          <button className="ghost" onClick={onBack}>Leave</button>
        </div>
      </div>}
    </div>

    <div className="reef-fact-strip">
      <b>🐡 Coral fact:</b> {coralFacts[factIndex].text} <em>({coralFacts[factIndex].source})</em>
    </div>
  </main>;
}
