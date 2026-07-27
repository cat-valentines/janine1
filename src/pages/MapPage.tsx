import { useState } from 'react';
import { biomeAssets, gamesForIsland, islandCentre, islandRewards, islands, type IslandReward } from '../game/islands';
import { characterAssets } from '../game/characters';
import { isIslandOpen, islandLock, streakNeededFor } from '../game/progress';

/** Little "what you'll unlock" card — friends, games and teasers behind a locked island. */
function RewardPreview({ reward }: { reward: IslandReward }) {
  const hasAny = reward.characters.length || reward.newGames.length || reward.comingSoon.length;
  return <div className="reward-preview">
    <p className="reward-title">🎁 Unlock to reveal</p>
    {reward.characters.length > 0 && <div className="reward-friends">
      {reward.characters.map((id) => <img key={id} src={characterAssets[id]} alt="" draggable={false} />)}
      <span>{reward.characters.length} new friend{reward.characters.length > 1 ? 's' : ''}</span>
    </div>}
    {reward.newGames.map((game) => <span className="reward-game" key={game.id}>{game.icon} {game.name}</span>)}
    {reward.comingSoon.map((label) => <span className="reward-soon" key={label}>{label} · soon</span>)}
    {!hasAny && <span className="reward-soon">New adventures await ✨</span>}
  </div>;
}

interface MapPageProps {
  completedQuests: number;
  streak: number;
  isMember: boolean;
  onBack: () => void;
  onPlay: (island: number) => void;
  onPlayGame: (gameId: string, islandName: string) => void;
  onInvite: () => void;
  onJoinMembership: () => void;
}

export function MapPage({ completedQuests, streak, isMember, onBack, onPlay, onPlayGame, onInvite, onJoinMembership }: MapPageProps) {
  const [selected, setSelected] = useState(1);
  const [mode, setMode] = useState<'solo' | 'friends'>('solo');
  const [playTime, setPlayTime] = useState('');
  const island = islands[selected - 1];
  const isOpen = (item: typeof island) => isIslandOpen(item, { completedQuests, streak, isMember });
  const unlocked = isOpen(island);
  const route = islands.map((item) => { const { cx, cy } = islandCentre(item); return `${cx},${cy}`; }).join(' ');

  return <main className="map-page">
    <header className="map-top"><button onClick={onBack}>← Menu</button><div><p className="eyebrow">Magical Islands</p><h1>Magical Island Map</h1></div><span>⭐ {completedQuests} quests</span></header>
    <div className="ocean-map" aria-label="30 magical islands in the ocean">
      <svg className="ocean-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={route} />
      </svg>
      {islands.map((item) => {
        const open = isOpen(item);
        return <button
          className={`ocean-island ${open ? 'unlocked' : 'locked'} ${selected === item.id ? 'selected' : ''}`}
          style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.size}%` }}
          key={item.id}
          onClick={() => setSelected(item.id)}
          aria-label={`Island ${item.id}, ${item.name}${open ? '' : ', locked'}`}
        >
          <img src={biomeAssets[item.biome]} alt="" draggable={false} />
          <span className="ocean-island-name">{item.name}</span>
          <b className="ocean-island-number">{item.id}</b>
          {!open && <i className="ocean-island-lock">{item.membersOnly && !isMember ? '♛' : '🔒'}</i>}
          {!open && <div className={`island-reward-pop ${item.y < 12 ? 'below' : ''}`}><RewardPreview reward={islandRewards(item.id)} /></div>}
        </button>;
      })}
    </div>
    <section className="island-dock">
      <div><img className="island-big-icon" src={biomeAssets[island.biome]} alt="" /><div><p className="card-kicker">Island {island.id} of 30</p><h2>{island.icon} {island.name}</h2><p>{island.membersOnly ? 'Royal Membership island' : island.id <= 1 ? 'Your starting island' : `${island.questsNeeded} quests · 🔥 ${streakNeededFor(island.id)} day streak`} · {unlocked ? 'Ready to explore' : 'Locked'}</p></div></div>
      {!unlocked && <RewardPreview reward={islandRewards(island.id)} />}
      <div className="play-mode"><button className={mode === 'solo' ? 'selected' : ''} onClick={() => setMode('solo')}>🗡️ Play alone</button><button className={mode === 'friends' ? 'selected' : ''} onClick={() => setMode('friends')}>👥 With friends</button></div>
      {mode === 'friends' && <div className="schedule-row"><label>Meet-up time <input type="datetime-local" value={playTime} onChange={(event) => setPlayTime(event.target.value)} /></label><button onClick={onInvite}>Invite friends</button><span>🎙️ Live party chat opens when play begins.</span></div>}
      {island.membersOnly && !isMember && <button className="membership-button" onClick={onJoinMembership}>♛ See Royal Membership · $1.90/month</button>}
      {gamesForIsland(island.id).length > 0 && <div className="island-games">
        <p className="card-kicker">Games on this island</p>
        {gamesForIsland(island.id).map((game) => <button className="island-game" key={game.id} disabled={!unlocked} onClick={() => onPlayGame(game.id, island.name)}>
          <span>{game.icon}</span>
          <strong>{game.name}<small>{game.blurb}</small></strong>
          {game.prize > 0 ? <i>+{game.prize} gold</i> : <i className="coins">collect gold</i>}
        </button>)}
      </div>}
      <button className="map-play" disabled={!unlocked} onClick={() => onPlay(island.id)}>{unlocked ? `Enter Island ${island.id}` : islandLock(island, { completedQuests, streak, isMember })}</button>
    </section>
  </main>;
}
