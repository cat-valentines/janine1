import type { GameSelection } from '../game/types';

const names = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby' };
const houses = { haunted: 'Haunted House', secret: 'Secret Rooms', power: 'Power House' };

export function PlayerProfileCard({ selection, balance, coins, collectibleAsset, collectibleName }: { selection: GameSelection; balance: number; coins: number; collectibleAsset: string; collectibleName: string }) {
  return (
    <article className="info-card profile-card">
      <div><span className="card-kicker">Your explorer</span><h3>Guest Adventurer</h3></div>
      <div className="profile-stats">
        <span><img className="hud-collectible" src={collectibleAsset} alt="" /> {balance} <small>{collectibleName}</small></span><span><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {coins} <small>Coins</small></span><span>⭐ 1,240 <small>Score</small></span>
        <span>🏠 2 <small>Level</small></span><span>🏝️ 1 <small>Island</small></span>
      </div>
      <p>{names[selection.character]} · {houses[selection.setting]}</p>
    </article>
  );
}
