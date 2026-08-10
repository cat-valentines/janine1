import { useState } from 'react';
import { loadRewards, setStreakHolderArmed, CONSUMABLES, type ConsumableKind } from '../lib/rewards';

/** Friendly relative time. */
function ago(at: string) {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ORDER: ConsumableKind[] = ['streakHolder'];

/**
 * The rewards shelf: seasonal cups, consumables and full reward history. Shown
 * both on its own page and as the "Reward history" tab inside the profile.
 */
export function RewardsPanel() {
  const [state, setState] = useState(loadRewards);
  const toggleHolder = () => setState(setStreakHolderArmed(!state.streakHolderArmed));
  const hasSpringTrophy = state.cups.some((cup) => cup.season === 'spring');
  const hasSummerTrophy = state.cups.some((cup) => cup.season === 'summer');
  const hasAutumnTrophy = state.cups.some((cup) => cup.season === 'autumn');
  const hasWinterTrophy = state.cups.some((cup) => cup.season === 'winter');

  return <>
    <section className="rewards-section">
      <h2>🏆 Trophy shelf <small>({state.totalWon} won)</small></h2>
      {state.cups.length === 0 && <p className="rewards-empty">No cups earned yet. Finish a season in the <b>top 3 of the leaderboard</b> to win that season's Champion Cup. Prizes are <b>earned over time</b>, never given for free.</p>}
      <div className="rewards-cups">
        {!hasSpringTrophy && <div className="reward-cup spring locked-trophy">
          <div className="reward-cup-art"><img src="/assets/pixel-spring-trophy.png" alt="Dimmed Spring Champion Cup" /></div>
          <strong>Spring Champion Cup</strong>
          <span className="trophy-year">2026</span>
          <small>🔒 Not earned yet · Finish top 3</small>
        </div>}
        {!hasSummerTrophy && <div className="reward-cup summer locked-trophy">
          <div className="reward-cup-art"><img src="/assets/pixel-summer-trophy.png" alt="Dimmed Summer Champion Cup" /></div>
          <strong>Summer Champion Cup</strong>
          <span className="trophy-year">2026</span>
          <small>🔒 Not earned yet · Finish top 3</small>
        </div>}
        {!hasAutumnTrophy && <div className="reward-cup autumn locked-trophy">
          <div className="reward-cup-art"><img src="/assets/pixel-autumn-trophy.png" alt="Dimmed Autumn Champion Cup" /></div>
          <strong>Autumn Champion Cup</strong>
          <span className="trophy-year">2026</span>
          <small>🔒 Not earned yet · Finish top 3</small>
        </div>}
        {!hasWinterTrophy && <div className="reward-cup winter locked-trophy">
          <div className="reward-cup-art"><img src="/assets/pixel-winter-trophy.png" alt="Dimmed Winter Champion Cup" /></div>
          <strong>Winter Champion Cup</strong>
          <span className="trophy-year">2026</span>
          <small>🔒 Not earned yet · Finish top 3</small>
        </div>}
          {state.cups.map((cup) => <div className={`reward-cup ${cup.season}`} key={cup.id}>
            <div className="reward-cup-art"><span className="cup-vines">{cup.vines}</span><span className="cup-icon">{cup.cup}</span></div>
            <strong>{cup.name}</strong>
            <span className="trophy-year">{new Date(cup.wonAt).getFullYear()}</span>
            <small>Won {ago(cup.wonAt)}</small>
          </div>)}
      </div>
    </section>

    <section className="rewards-section">
      <h2>🧊 Streak Holder</h2>
      <p className="rewards-note">Win the Streak Holder by topping the leaderboard. Activate it and it saves your streak automatically if you miss a day or two. It has a limited number of uses; when they run out it retires to your history below.</p>
      <div className="rewards-items">
        {ORDER.map((kind) => {
          const info = CONSUMABLES[kind];
          const uses = state.uses[kind];
          return <div className={`reward-item ${uses > 0 ? '' : 'spent'}`} key={kind}>
            <span className="reward-item-icon">{info.icon}</span>
            <div className="reward-item-body">
              <strong>{info.name}</strong>
              <small>{info.desc}</small>
            </div>
            <div className="reward-item-side">
              <b className="reward-uses">{uses} {uses === 1 ? 'use' : 'uses'}</b>
              {kind === 'streakHolder' && uses > 0 && <button className={`reward-arm ${state.streakHolderArmed ? 'on' : ''}`} onClick={toggleHolder}>{state.streakHolderArmed ? '✓ Active' : 'Activate'}</button>}
            </div>
          </div>;
        })}
      </div>
      {state.streakHolderArmed && <p className="rewards-armed">🧊 Streak Holder is <b>active</b> — if you miss a day or two, it will save your streak automatically.</p>}
    </section>

    <section className="rewards-section">
      <h2>📜 Reward history <small>({state.history.length})</small></h2>
      {state.history.length === 0
        ? <p className="rewards-empty">Every prize you win or use up shows here as you earn it.</p>
        : <ul className="rewards-history">
          {state.history.map((h) => <li key={h.id}><span>{h.icon}</span><p>{h.text}</p><small>{ago(h.at)}</small></li>)}
        </ul>}
    </section>
  </>;
}
