import { useEffect, useRef, useState } from 'react';
import { IslandWorldEngine, type WorldSnapshot } from '../game/islandWorldEngine';
import { islands } from '../game/islands';
import { THEME_BY_BIOME, questsForBiome, islandFromStars, starsToNextIsland, STARS_PER_ISLAND, type QuestDef } from '../game/islandWorld';
import { addStars, getStars } from '../lib/escapeStars';
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
    case 'cave': return snap.visitedCave ? 1 : 0;
    case 'waterfall': return snap.visitedWaterfall ? 1 : 0;
    case 'players': return snap.livePlayers > 0 ? 1 : 0;
  }
}

export function IslandWorldPage({ character, onScore, onBack }: Props) {
  const [started, setStarted] = useState(false);
  const [total, setTotal] = useState(() => getStars());
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [toast, setToast] = useState('');
  const [userId, setUserId] = useState('');
  const [myName, setMyName] = useState('explorer');

  // Which island you are on comes straight from your star total.
  const islandId = islandFromStars(total);
  const island = islands[islandId - 1];
  const theme = THEME_BY_BIOME[island.biome];
  const quests = questsForBiome(island.biome);

  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<IslandWorldEngine | null>(null);
  const prevEarned = useRef(0);
  const doneQuests = useRef<Set<string>>(new Set());
  const update = useRef<(s: WorldSnapshot) => void>(() => undefined);

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
    const live = joinLiveGame(game, userId, (peers) => engine.current?.setLivePlayers(peers));
    heartbeat(game);
    const beat = window.setInterval(() => heartbeat(game), 5000);
    const shout = window.setInterval(() => {
      const state = engine.current?.getSelfState();
      if (state) live.send({ name: myName, ...state });
    }, 130);
    return () => { window.clearInterval(beat); window.clearInterval(shout); live.leave(); leaveGame(); };
  }, [started, userId, myName, islandId]);

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
        <p>Explore a big magical {island.biome} island in 3-D. Collect ⭐ stars and {theme.trinketName}s, dive into the crystal cave, find the waterfall — and meet real players exploring at the same time.</p>

        <div className="island-goal">
          <div className="island-goal-head"><strong>⭐ {total.toLocaleString()}</strong><small>{toNext.toLocaleString()} more to unlock {islandId < 30 ? islands[islandId].name : 'the crown'}</small></div>
          <div className="island-goal-bar"><i style={{ width: `${pct}%`, background: theme.glow }} /></div>
        </div>

        <p className="island-sub">🎯 Quests on this island</p>
        <div className="island-quest-list">
          {quests.map((q) => <div className="island-quest" key={q.id}><span>{q.icon}</span><strong>{q.label}</strong><i>+{q.reward}⭐</i></div>)}
        </div>

        <p className="island-controls">🎮 <b>↑ ↓</b> walk · <b>← →</b> turn · <b>Space</b> enter the cave / climb out {userId ? '' : '· 🔐 log in to see live players'}</p>
        <button className="island-start" onClick={() => setStarted(true)} style={{ background: theme.glow }}>🌟 Explore {island.name}</button>
      </div>
    </main>;
  }

  return <main className="island-page playing">
    <div className="island-stage">
      <div className="island-canvas" ref={mount} />

      <header className="island-hud">
        <button className="island-leave" onClick={onBack}>← Leave</button>
        <span className="island-name">{island.icon} {island.name}{snapshot?.underground ? ' · 🕳️ cave' : ''}</span>
        <div className="island-hud-stats">
          <b title="Your star collection">⭐ {total.toLocaleString()}</b>
          <b title="Real players here right now">👥 {snapshot?.livePlayers ?? 0}</b>
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

      <button className="island-full" onClick={goFullscreen}>⛶</button>
      <Joystick />
      <KeyPad dirs={[]} actions={[{ codes: ['Space'], label: '✋ Enter / Climb', wide: true }]} />
    </div>
  </main>;
}
