import { useEffect, useState } from 'react';
import { loadMyStats, type MyStats } from '../lib/players';
import { supabase } from '../lib/supabase';
import type { GameSelection } from '../game/types';

const names = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit', koala: 'Bridey', teddy: 'Adi', panda: 'Scarlet', tiger: 'Elena', piggy: 'Piggy', parrot: 'Polly' };
const houses = { haunted: 'Haunted House', secret: 'Secret Rooms', power: 'Power House' };

export function PlayerProfileCard({ selection, balance, coins, collectibleAsset, collectibleName }: { selection: GameSelection; balance: number; coins: number; collectibleAsset: string; collectibleName: string }) {
  const [stats, setStats] = useState<MyStats | null>(null);

  useEffect(() => {
    const read = (id?: string) => {
      if (!id) { setStats(null); return; }
      loadMyStats(id).then(setStats).catch(() => setStats(null));
    };
    supabase.auth.getUser().then(({ data }) => read(data.user?.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => read(session?.user?.id));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <article className="info-card profile-card">
      <div><span className="card-kicker">Your explorer</span><h3>{stats?.display_name ?? 'Guest Adventurer'}</h3></div>
      <div className="profile-stats">
        <span><img className="hud-collectible" src={collectibleAsset} alt="" /> {balance} <small>{collectibleName}</small></span>
        <span><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {coins} <small>Coins</small></span>
        <span>⭐ {(stats?.total_score ?? 0).toLocaleString()} <small>Score</small></span>
        <span>🏠 {stats?.current_level ?? 1} <small>Level</small></span>
        <span>🏝️ {stats?.current_island ?? 1} <small>Island</small></span>
      </div>
      <p>{names[selection.character]} · {houses[selection.setting]}</p>
    </article>
  );
}
