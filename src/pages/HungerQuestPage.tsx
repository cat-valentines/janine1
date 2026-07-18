import { useEffect, useRef, useState } from 'react';
import { QuestEngine, type QuestSnapshot } from '../game/questEngine';
import { KeyPad } from '../components/KeyPad';
import { MAX_MAGIC, RIVAL_COUNT, WIN_PRIZE, challengeForDay, pickupTypes, powers, survivalKit, weapons, type Weapon } from '../game/hunger';
import { characterAssets } from '../game/characters';
import { heartbeat, leaveGame, playersInGame } from '../lib/presence';
import { supabase } from '../lib/supabase';
import type { CharacterId } from '../game/types';

interface HungerQuestPageProps {
  character: CharacterId;
  onWin: (coins: number) => void;
  onBack: () => void;
}

export function HungerQuestPage({ character, onWin, onBack }: HungerQuestPageProps) {
  const [weapon, setWeapon] = useState<Weapon | null>(null);
  const [round, setRound] = useState(1);
  const [snapshot, setSnapshot] = useState<QuestSnapshot | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<QuestEngine | null>(null);
  const [myName, setMyName] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setMyName((data.user?.user_metadata.display_name as string | undefined) ?? '');
    });
  }, []);
  const paid = useRef(false);
  const update = useRef<(s: QuestSnapshot) => void>(() => undefined);
  update.current = (next) => {
    setSnapshot(next);
    if (next.status === 'won' && !paid.current) { paid.current = true; onWin(WIN_PRIZE); }
  };

  // While you are in a match, tell the server every few seconds — that is what
  // makes you a "live player" in other people's forests. Leaving stops it and
  // drops you out.
  useEffect(() => {
    if (!weapon) return;
    heartbeat('hunger');
    const id = setInterval(() => heartbeat('hunger'), 5000);
    return () => { clearInterval(id); leaveGame(); };
  }, [weapon]);

  useEffect(() => {
    if (!weapon || !mount.current) return;
    let created: QuestEngine | null = null;
    let disposed = false;
    // The rivals are whoever is ACTUALLY playing Hunger Quests right now — not
    // just anyone signed up. Empty most of the time, and that is correct: bots
    // fill the forest when nobody else is in a match.
    playersInGame('hunger').then((players) => {
      if (disposed || !mount.current) return;
      created = new QuestEngine(mount.current, {
        seed: 1000 + round * 7,
        weapon,
        characterAsset: characterAssets[character],
        rivalPool: players.map((player) => player.name),
        myName,
        onUpdate: (next) => update.current(next),
      });
      engine.current = created;
    });
    const resize = () => created?.resize();
    window.addEventListener('resize', resize);
    return () => { disposed = true; window.removeEventListener('resize', resize); created?.dispose(); engine.current = null; };
  }, [weapon, round, character, myName]);

  const playAgain = () => { paid.current = false; setSnapshot(null); setRound((n) => n + 1); };
  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!weapon) {
    return <main className="quest-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>❤️❤️❤️</span></div>
      <header className="quest-header">
        <p className="eyebrow">A forest survival game</p>
        <h1><span>🏹</span> Hunger Quests <span>🏹</span></h1>
        <p>Survive the night. Be the last one standing.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">Step 1 of 1</p>
        <h2>Choose your weapon</h2>
        <p>You will be dropped into the forest with {RIVAL_COUNT} other players. Survive the night, fight off the monsters, and be the last one standing to win <strong>+{WIN_PRIZE} gold coins</strong>.</p>
        {signedIn === false && <p className="quest-guest-note">👤 You are playing as a <strong>guest</strong>, so you will not show up to other players. You can still play everything! <strong>Log in</strong> from the front page to appear in the forest with your username.</p>}
        {signedIn === true && <p className="quest-real-note">🌟 A live survival test! Real players who are in a Hunger Quests match <strong>right now</strong> drop into your forest — and 🤖 bots fill the rest. When they leave, they are gone.</p>}
        
        <div className="weapon-grid">
          {weapons.map((item) => <button className="weapon-card" key={item.id} onClick={() => setWeapon(item)}>
            <span>{item.icon}</span>
            <strong>{item.name}</strong>
            <small>{item.blurb}</small>
            <i>⚔️ {item.damage} damage · 📏 {item.reach.toFixed(1)} reach</i>
          </button>)}
        </div>
        <div className="power-strip">
          <p className="card-kicker">You also have magic powers</p>
          <div className="power-row">
            {powers.map((power) => <div className="power-chip" key={power.id}>
              <span>{power.icon}</span>
              <div><strong>{power.name} <kbd>{power.key}</kbd></strong><small>{power.blurb}</small></div>
            </div>)}
          </div>
          <p className="power-note">Magic refills on its own, so your powers always come back.</p>
        </div>
        <p className="quest-hint">Find a 💧 water bottle, ⛺ tent and 🧣 blanket for your backpack, and grab ❤️ hearts, ⚔️ weapons and 🪄 magic wands hidden in the forest.</p>
      </section>
    </main>;
  }

  const hearts = snapshot?.hearts ?? 3;
  const maxHearts = snapshot?.maxHearts ?? 3;
  const challenge = challengeForDay(snapshot?.day ?? 1);
  const magic = snapshot?.magic ?? MAX_MAGIC;

  return <main className="quest-page">
    <div className="quest-stage">
      <div className="quest-canvas" ref={mount} />

      <div className="quest-hud">
        <div className="quest-hearts" aria-label={`${hearts} of ${maxHearts} hearts`}>
          {Array.from({ length: maxHearts }, (_, i) => <b className={i < hearts ? 'full' : 'empty'} key={i}>{i < hearts ? '❤️' : '🖤'}</b>)}
        </div>
        <div className="quest-day">
          <strong>{snapshot?.night ? '🌙 Night' : '☀️ Day'} {snapshot?.day ?? 1}</strong>
          <small>{snapshot?.secondsLeft ?? 0}s · {snapshot?.night ? challenge.title : 'until night'}</small>
        </div>
        <div className="quest-alive"><strong>🧍 {snapshot?.alive ?? RIVAL_COUNT + 1} left</strong><small>of {RIVAL_COUNT + 1} players</small></div>
        <div className="quest-weapon"><strong>{snapshot?.weapon.icon} {snapshot?.weapon.name}</strong></div>
        <div className="quest-pack">
          <small>🎒</small>
          {survivalKit.map((kind) => <b className={snapshot?.backpack.includes(kind) ? 'got' : ''} key={kind} title={pickupTypes[kind].name}>{pickupTypes[kind].icon}</b>)}
        </div>
        <div className="quest-magic" aria-label={`${magic} of ${MAX_MAGIC} magic`}>
          <small>✨ Magic</small>
          <i><b style={{ width: `${(magic / MAX_MAGIC) * 100}%` }} /></i>
        </div>
        <div className="quest-powers">
          {powers.map((power) => <b
            className={`${power.id === 'fly' && snapshot?.flying ? 'on' : ''} ${power.id === 'invisible' && (snapshot?.invisibleFor ?? 0) > 0 ? 'on' : ''}`}
            key={power.id}
            title={`${power.name} — ${power.blurb} (${power.cost})`}
          >
            <span>{power.icon}</span>
            <small>{power.key}</small>
          </b>)}
        </div>
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="quest-message">{snapshot.message}</p>}
      {snapshot?.status === 'playing' && <KeyPad actions={[
        { codes: ['Space'], label: '⚔️' },
        { codes: ['ShiftLeft'], label: '⤴' },
        { codes: ['Digit1'], label: '🕊️' },
        { codes: ['Digit2'], label: '✨' },
        { codes: ['Digit3'], label: '👻' },
      ]} />}
      {snapshot?.status === 'playing' && <p className="quest-help"><b>↑ ↓</b> walk · <b>← →</b> turn · <b>Space</b> attack · <b>Shift</b> jump · <b>1</b> fly · <b>2</b> teleport · <b>3</b> invisible · <b>F</b> first person</p>}

      {snapshot?.status === 'dead' && <div className="quest-over">
        <div className="quest-over-card">
          <h2>💀 Game Over</h2>
          <p>You ran out of hearts on {snapshot.night ? 'night' : 'day'} {snapshot.day}. The other players are still out there!</p>
          <button onClick={playAgain}>Play again</button>
          <button className="ghost" onClick={onBack}>Leave the forest</button>
        </div>
      </div>}

      {snapshot?.status === 'won' && <div className="quest-over">
        <div className="quest-over-card win">
          <h2>🏆 Last one standing!</h2>
          <p>You outlasted every other player and survived to day {snapshot.day}. You earned <strong>+{WIN_PRIZE} gold coins</strong> to spend in the shops.</p>
          <button onClick={playAgain}>Play again</button>
          <button className="ghost" onClick={onBack}>Spend my coins</button>
        </div>
      </div>}
    </div>
  </main>;
}
