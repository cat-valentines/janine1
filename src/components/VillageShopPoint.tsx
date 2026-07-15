import type { VillageShop } from '../market/zones';

interface VillageShopPointProps {
  shop: VillageShop; nearby: boolean; ownedHome: boolean;
  onBuy: () => void; onEnterHome: () => void; onInvite: () => void;
}

export function VillageShopPoint({ shop, nearby, ownedHome, onBuy, onEnterHome, onInvite }: VillageShopPointProps) {
  const isHome = shop.kind === 'home';
  return <article className={`village-poi poi-${shop.kind} ${nearby ? 'nearby' : ''}`} style={{ left: `${shop.x}%`, top: `${shop.y}%` }}>
    <span className="poi-icon">{shop.icon}</span>{nearby && <div className="stand-price"><span>{isHome && ownedHome ? 'Your private cottage' : shop.item}</span>{!ownedHome || !isHome ? <b><img src="/assets/pixel-coin.png" alt="" /> {shop.price}</b> : null}
      {isHome && ownedHome ? <><button onClick={onEnterHome}>Enter Home</button><button onClick={onInvite}>Invite Friends</button></> : <button onClick={onBuy}>{isHome ? 'Buy House' : 'Go into shop'}</button>}</div>}
  </article>;
}
