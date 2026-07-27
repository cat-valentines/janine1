import { useEffect, useRef, useState } from 'react';
import { IslandWorldEngine, type WorldSnapshot } from '../game/islandWorldEngine';
import { islands } from '../game/islands';
import { THEME_BY_BIOME, questsForBiome, islandFromStars, starsToNextIsland, STARS_PER_ISLAND, type QuestDef } from '../game/islandWorld';
import { addStars, getStars } from '../lib/escapeStars';
import { loadRewards, useConsumable, CONSUMABLES } from '../lib/rewards';
import { characterAssets } from '../game/characters';
import { joinLiveGame } from '../lib/liveGame';
import { heartbeat, leaveGame } from '../lib/presence';
import { supabase } from '../lib/supabase';
import { KeyPad } from '../components/KeyPad';
import { Joystick } from '../components/Joystick';
import type { CharacterId } from '../game/types';

interface Props { character: CharacterId; onScore: (coins: number) => void; onBack: () => void }

/** How far a quest has come, from the live world snapshot. */
function questProgress(quest: QuestDef, snap: WorldSnapshot): number {
  switch (quest.metric) {
    case 'stars': return snap.stars;
    case 'trinkets': return snap.trinkets;
    case 'gems': return snap.gems;
    case 'dig': return snap.dug;
    case 'explore': return snap.explored;
    case 'cave': return snap.visitedCave ? 1 : 0;
    case 'waterfall': return snap.visitedWaterfall ? 1 : 0;
    case 'players': return snap.livePlayers > 0 ? 1 : 0;
    default: return 0;
  }
}

export function IslandWorldPage({ character, onScore, onBack }: Props) {
  const [started, setStarted] = useState(false);
  const [total, setTotal] = useState(() => getStars());
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [toast, setToast] = useState('');
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('explorer');
  const [tray, setTray] = useState(false);
  const [uses, setUses] = useState(() => loadRewards().uses);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2600); };
  const useItem = (kind: 'hint' | 'bubble' | 'weapon') => {
    if (!useConsumable(kind)) return;
    setUses(loadRewards().uses);
    if (kind === 'hint') { engine.current?.showHint(); flash('🔮 Hint! Follow the beacon to the nearest star.'); }
    if (kind === 'bubble') { engine.current?.activateBubble(20); flash('🫧 Bubble on — protected for 20 seconds!'); }
    if (kind === 'weapon') { engine.current?.equipWeapon(20); flash('⚔️ Sword drawn — faster for 20 seconds!'); }
  };

  // Which island you are on comes straight from your star total.
  const islandId = islandFromStars(total);
  const island = islands[islandId - 1];
  const theme = THEME_BY_BIOME[island.biome];
  const quests = questsForBiome(island.biome);

  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<IslandWorldEngine | null>(null);
  const liveRef = useRef<ReturnType<typeof joinLiveGame> | null>(null);
  const prevEarned = useRef(0);
  const doneQuests = useRef<Set<string>>(new Set());
  const update = useRef<(s: WorldSnapshot) => void>(() => undefined);

  const doPlace = () => { if (engine.current?.place()) flash('🧱 Placed a block!'); };
  const doAttack = () => {
    const target = engine.current?.attack();
    if (!target) { flash('⚔️ Swing! Equip the ⚔️ sword and stand next to a player.'); return; }
    const me = engine.current!.getSelfState();
    liveRef.current?.hit(target.id, myName, { x: me.x, z: me.z });
    flash(`⚔️ You bonked @${target.name}!`);
  };

  update.current = (next) => {
    setSnapshot(next);
    // Bank loose star-points the moment you pick them up.
    if (next.earned > prevEarned.current) {
      setTotal(addStars(next.earned - prevEarned.current));
      prevEarned.current = next.earned;
    }
    // Finish a quest → award its bonus once, and celebrate.
    quests.forEach((quest) => {
      if (doneQuests.current.has(quest.id)) return;
      if (questProgress(quest, next) >= quest.goal) {
        doneQuests.current.add(quest.id);
        setTotal(addStars(quest.reward));
        setToast(`✅ Quest done: ${quest.label} · +${quest.reward}⭐`);
        onScore(10);
        window.setTimeout(() => setToast(''), 3200);
      }
    });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'explorer');
    });
  }, []);

  useEffect(() => {
    if (!started || !mount.current) return;
    prevEarned.current = 0;
    doneQuests.current = new Set();
    const created = new IslandWorldEngine(mount.current, {
      theme, characterAsset: characterAssets[character], islandId,
      onUpdate: (next) => update.current(next),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, islandId]);

  // Live players: everyone exploring the same island shows up in real time.
  useEffect(() => {
    if (!started || !userId) return;
    const game = `island-${islandId}`;
    const live = joinLiveGame(game, userId, (peers) => engine.current?.setLivePlayers(peers),
      (_fromId, fromName, at) => {
        const landed = engine.current?.takeHit(at);
        if (landed) flash(`💫 Bonked by @${fromName}! Dodge or bubble up.`);
        else flash('🫧 Your bubble blocked the hit!');
      });
    liveRef.current = live;
    heartbeat(game);
    const beat = window.setInterval(() => heartbeat(game), 5000);
    const shout = window.setInterval(() => {
      const state = engine.current?.getSelfState();
      if (state) live.send({ name: myName, ...state });
    }, 130);
    return () => { window.clearInterval(beat); window.clearInterval(shout); live.leave(); liveRef.current = null; leaveGame(); };
  }, [started, userId, myName, islandId]);

  // Keyboard: E to attack (the engine handles F=dig, G=build, Space=cave).
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyE') doAttack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, myName]);

  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen(); else node.requestFullscreen?.();
  };

  const toNext = starsToNextIsland(total);
  const pct = Math.round(((STARS_PER_ISLAND - toNext) / STARS_PER_ISLAND) * 100);

  if (!started) {
    return <main className="island-page" style={{ background: `linear-gradient(${theme.skyTop}, ${theme.skyBottom})` }}>
      <header className="island-top"><button onClick={onBack}>← Leave</button><span>{island.icon} {island.name}</span></header>
      <div className="island-intro">
        <h1>{island.icon} {island.name}</h1>
        <p className="island-flavour">{theme.flavour}</p>
        <p>Explore an <b>endless</b> magical {island.biome} land in 3-D. Wander as far as you like collecting ⭐ stars and {theme.trinketName}s, <b>dig into the ground</b> for buried treasure, dive into the crystal cave, find the waterfall — and meet real players exploring at the same time. Reaching 5,000 stars takes a real adventure!</p>

        <div className="island-goal">
          <div className="island-goal-head"><strong>⭐ {total.toLocaleString()}</strong><small>{toNext.toLocaleString()} more to unlock {islandId < 30 ? islands[islandId].name : 'the crown'}</small></div>
          <div className="island-goal-bar"><i style={{ width: `${pct}%`, background: theme.glow }} /></div>
        </div>

        <p className="island-sub">🎯 Quests on this island</p>
        <div className="island-quest-list">
          {quests.map((q) => <div className="island-quest" key={q.id}><span>{q.icon}</span><strong>{q.label}</strong><i>+{q.reward}⭐</i></div>)}
        </div>

        <p className="island-controls">🎮 <b>↑ ↓</b> walk · <b>← →</b> turn · <b>F</b> dig · <b>G</b> build · <b>E</b> bonk with sword · <b>Space</b> cave {userId ? '' : '· 🔐 log in to see & battle live players'}</p>
        <button className="island-start" onClick={() => setStarted(true)} style={{ background: theme.glow }}>🌟 Explore {island.name}</button>
      </div>
    </main>;
  }

  return <main className="island-page playing">
    <div className="island-stage">
      <div className="island-canvas" ref={mount} />

      <header className="island-hud">
        <button className="island-leave" onClick={onBack}>← Leave</button>
        <span className="island-name">{island.icon} {island.name}{snapshot?.underground ? ` · 🕳️ cave Lv ${snapshot.caveDepth}` : ''}</span>
        <div className="island-hud-stats">
          <b title="Your star collection">⭐ {total.toLocaleString()}</b>
          <b title="Real players here right now">👥 {snapshot?.livePlayers ?? 0}</b>
          {(snapshot?.bubbleLeft ?? 0) > 0 && <b className="fx">🫧 {snapshot!.bubbleLeft}s</b>}
          {(snapshot?.weaponLeft ?? 0) > 0 && <b className="fx">⚔️ {snapshot!.weaponLeft}s</b>}
        </div>
      </header>

      <div className="island-quests-live">
        {quests.map((q) => {
          const prog = snapshot ? questProgress(q, snapshot) : 0;
          const done = prog >= q.goal;
          return <div className={`island-quest-live ${done ? 'done' : ''}`} key={q.id}>
            <span>{done ? '✅' : q.icon}</span>
            <small>{q.label}</small>
            {q.goal > 1 && <b>{Math.min(prog, q.goal)}/{q.goal}</b>}
          </div>;
        })}
      </div>

      {snapshot?.prompt && <p className="island-prompt">{snapshot.prompt}</p>}
      {toast && <p className="island-toast">{toast}</p>}

      <div className="island-actions">
        <button className="island-act dig" onClick={() => { const r = engine.current?.dig(); if (r?.deeper) flash(`⛏️ Tunnelled down to cave Level ${r.deeper}!`); else if (r?.dug) flash(r.treasure ? '⛏️ You dug up buried treasure!' : '⛏️ Dug a block of earth.'); }} title="Dig / tunnel (F)">⛏️</button>
        <button className="island-act build" onClick={doPlace} title="Build a block (G)">🧱</button>
        <button className="island-act attack" onClick={doAttack} title="Bonk a player with your sword (E)">⚔️</button>
      </div>
      <button className="island-bag" onClick={() => { setUses(loadRewards().uses); setTray((t) => !t); }} title="Your quest items">🎒</button>
      {tray && <div className="island-tray">
        <p className="island-tray-title">🎒 Quest items</p>
        {(['hint', 'bubble', 'weapon'] as const).map((k) => <button key={k} className="island-tray-item" disabled={uses[k] <= 0} onClick={() => useItem(k)}>
          <span>{CONSUMABLES[k].icon}</span><small>{CONSUMABLES[k].name}</small><b>{uses[k]}</b>
        </button>)}
        {uses.hint <= 0 && uses.bubble <= 0 && uses.weapon <= 0 && <p className="island-tray-empty">Win potions & swords from seasonal cups and the leaderboard.</p>}
      </div>}

      <button className="island-full" onClick={goFullscreen}>⛶</button>
      <Joystick />
      <KeyPad dirs={[]} actions={[{ codes: ['Space'], label: '✋ Enter / Climb', wide: true }]} />
    </div>
  </main>;
}
