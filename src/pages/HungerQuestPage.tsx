import { useEffect, useRef, useState } from 'react';
import { QuestEngine, type QuestSnapshot } from '../game/questEngine';
import { RIVAL_COUNT, WIN_PRIZE, challengeForDay, pickupTypes, survivalKit, weapons, type Weapon } from '../game/hunger';
import { characterAssets } from '../game/characters';
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
  const paid = useRef(false);
  const update = useRef<(s: QuestSnapshot) => void>(() => undefined);
  update.current = (next) => {
    setSnapshot(next);
    if (next.status === 'won' && !paid.current) { paid.current = true; onWin(WIN_PRIZE); }
  };

  useEffect(() => {
    if (!weapon || !mount.current) return;
    const created = new QuestEngine(mount.current, {
      seed: 1000 + round * 7,
      weapon,
      characterAsset: characterAssets[character],
      onUpdate: (next) => update.current(next),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [weapon, round, character]);

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
        <div className="weapon-grid">
          {weapons.map((item) => <button className="weapon-card" key={item.id} onClick={() => setWeapon(item)}>
            <span>{item.icon}</span>
            <strong>{item.name}</strong>
            <small>{item.blurb}</small>
            <i>⚔️ {item.damage} damage · 📏 {item.reach.toFixed(1)} reach</i>
          </button>)}
        </div>
        <p className="quest-hint">Find a 💧 water bottle, ⛺ tent and 🧣 blanket for your backpack, and grab ❤️ hearts, ⚔️ weapons and 🪄 magic wands hidden in the forest.</p>
      </section>
    </main>;
  }

  const hearts = snapshot?.hearts ?? 3;
  const maxHearts = snapshot?.maxHearts ?? 3;
  const challenge = challengeForDay(snapshot?.day ?? 1);

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
      </div>

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="quest-message">{snapshot.message}</p>}
      {snapshot?.status === 'playing' && <p className="quest-help">Click the forest to look around · <b>W A S D</b> move · <b>Space</b> jump · <b>click</b> to attack · <b>F</b> first person · <b>Esc</b> to let go</p>}

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
