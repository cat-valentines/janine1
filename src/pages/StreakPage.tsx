import { islands } from '../game/islands';
import { QUESTS_TO_MOVE_UP, isIslandOpen, nextLockedIsland, streakNeededFor } from '../game/progress';

interface StreakPageProps {
  streak: number;
  daysPlayed: number;
  completedQuests: number;
  isMember: boolean;
  signedIn: boolean;
  onBack: () => void;
  onGetMembership: () => void;
}

export function StreakPage({ streak, daysPlayed, completedQuests, isMember, signedIn, onBack, onGetMembership }: StreakPageProps) {
  const progress = { completedQuests, streak, isMember };
  const next = nextLockedIsland(islands, progress);
  const open = islands.filter((island) => isIslandOpen(island, progress)).length;
  const needed = next ? streakNeededFor(next.id) : 0;
  const questsToGo = next ? Math.max(0, next.questsNeeded - completedQuests) : 0;
  const daysToGo = next ? Math.max(0, needed - streak) : 0;
  const bar = next && needed > 0 ? Math.min(100, (streak / needed) * 100) : 100;

  // The next few islands, so it is obvious the ladder keeps going.
  const ladder = islands.filter((island) => island.id > 1 && island.id <= Math.min(30, (next?.id ?? 2) + 3));

  return <main className="streak-page">
    <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🔥 Your streak</span></div>

    <header className="streak-hero">
      <p className="eyebrow">Play every day</p>
      <div className="streak-flame"><span>🔥</span><b>{streak}</b></div>
      <h1>{streak === 0 ? 'Start your streak today!' : streak === 1 ? '1 day in a row' : `${streak} days in a row`}</h1>
      <p>Play a game every day and your streak grows. Miss a day and it starts again at one.</p>
      <div className="streak-stats">
        <span><b>{daysPlayed}</b><small>days played</small></span>
        <span><b>{completedQuests}</b><small>quests done</small></span>
        <span><b>{open}/30</b><small>islands open</small></span>
      </div>
      {!signedIn && <p className="streak-guest">You are playing as a guest, so your streak is only saved on this device. Log in to keep it safely.</p>}
    </header>

    {next ? <section className="streak-next">
      <p className="card-kicker">Next island</p>
      <h2>{next.icon} {next.name} <small>Island {next.id}</small></h2>

      {next.membersOnly && !isMember
        ? <p className="streak-need">This is a Royal Membership island. Join to explore it.</p>
        : isMember
          ? <p className="streak-open">♛ Royal Members skip the streak — you just need {QUESTS_TO_MOVE_UP} quests. {questsToGo > 0 ? `${questsToGo} to go!` : 'You are ready!'}</p>
          : <>
            <div className="streak-bar"><i style={{ width: `${bar}%` }} /></div>
            <p className="streak-need">
              <strong>{streak} of {needed} days.</strong> {daysToGo > 0 ? `${daysToGo} more days of playing to open it.` : 'Your streak is long enough!'}
            </p>
            {questsToGo > 0 && <p className="streak-need">You also need <strong>{questsToGo} more quests</strong> — you need {QUESTS_TO_MOVE_UP} quests to move up.</p>}
          </>}

      {!isMember && <button className="streak-buy" onClick={onGetMembership}>♛ Or open islands early with Royal Membership</button>}
    </section> : <section className="streak-next"><h2>🏆 Every island is open!</h2><p className="streak-open">You have unlocked all 30 islands. Incredible.</p></section>}

    <section className="streak-ladder">
      <p className="card-kicker">How the islands open</p>
      <div className="ladder-rows">
        {ladder.map((island) => {
          const unlocked = isIslandOpen(island, progress);
          const want = streakNeededFor(island.id);
          return <div className={`ladder-row ${unlocked ? 'open' : ''}`} key={island.id}>
            <img src={`/assets/pixel-island-${island.biome}.png`} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
            <strong>{island.icon} {island.name}<small>Island {island.id}</small></strong>
            <span>{unlocked ? '✓ Open' : island.membersOnly && !isMember ? '♛ Members' : `🔥 ${want} day streak`}</span>
          </div>;
        })}
      </div>
      <p className="streak-note">Every island wants a longer streak than the last: island 2 needs 200 days, island 3 needs 300, and so on. Royal Members can open them early.</p>
    </section>
  </main>;
}
