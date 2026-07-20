import { useEffect, useState } from 'react';
import { loadLeaderboard, type LeaderboardRow } from '../lib/gameData';
import { supabase } from '../lib/supabase';

/** Seasonal prizes go by rank, so they follow whoever actually holds the spot. */
const prizes = ['Special character', 'Early island pass', '5 bonus coins'];
const prizeFor = (rank: number) => prizes[rank - 1] ?? 'Power-up';

export function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [me, setMe] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading');

  const refresh = () => loadLeaderboard()
    .then((data) => { setRows(data); setState('ready'); })
    .catch(() => setState('offline'));

  useEffect(() => {
    const readName = (name?: string) => setMe(name ?? '');
    supabase.auth.getUser().then(({ data }) => readName(data.user?.user_metadata.display_name as string | undefined));
    refresh();
    // Re-read the board on a timer so a friend's new score shows up without a
    // page reload, and whenever auth changes (a sign-up adds a profile row).
    const timer = setInterval(refresh, 20000);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      readName(session?.user?.user_metadata.display_name as string | undefined);
      refresh();
    });
    return () => { clearInterval(timer); data.subscription.unsubscribe(); };
  }, []);

  const leader = rows[0];
  return (
    <section className="panel leaderboard">
      <div className="section-heading"><div><span className="card-kicker">Island rankings</span><h2>Leaderboard</h2></div>
        {leader && <span className="leader-prize">👑 {leader.display_name} can win a special character</span>}
      </div>
      {state === 'ready' && rows.length > 0 && <div className="leader-table" role="table">
        <div className="leader-row header" role="row"><span>Rank</span><span>Player</span><span>Score</span><span>Level</span><span>Prize</span></div>
        {rows.map((row, index) => <div className={`leader-row ${me && row.display_name === me ? 'you' : ''}`} role="row" key={`${row.display_name}-${index}`}>
          <span>{row.rank}</span>
          <span>{me && row.display_name === me ? `${row.display_name} (you)` : row.display_name}</span>
          <span>{row.score.toLocaleString()}</span>
          <span>{row.level}</span>
          <span>{prizeFor(row.rank)}</span>
        </div>)}
      </div>}
      {state === 'ready' && rows.length > 7 && <p className="leader-count">🏅 {rows.length} players — scroll the list to see everyone.</p>}
      {state === 'loading' && <p className="leader-empty">Loading the rankings…</p>}
      {state === 'ready' && !rows.length && <p className="leader-empty">No players on the board yet. Sign up and finish a quest to be the first!</p>}
      {state === 'offline' && <p className="leader-empty">The rankings are not online yet. Apply the database update to see real players here.</p>}
      <p className="fine-print">Every player here is a real signed-up player. Each seasonal prize can only be claimed once.</p>
    </section>
  );
}
