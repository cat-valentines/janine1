import { useEffect, useState } from 'react';
import { VillageShopPoint } from '../components/VillageShopPoint';
import { VillageShopInterior } from '../components/VillageShopInterior';
import type { CharacterId } from '../game/types';
import { loadMarketListings, type MarketListing } from '../lib/marketplace';
import { isNearStand, marketDirectionFromKey, moveInMarket, type MarketDirection, type MarketPosition } from '../market/movement';
import { nextZone, previousZone, zones, type VillageZone } from '../market/zones';
import { itemById, type ShopItem } from '../shop/catalog';

interface MarketWorldProps {
  foodBalance: number; coins: number; foodName: string; foodAsset: string; avatarAsset: string; character: CharacterId;
  onListFood: () => Promise<boolean>; onSpendCoins: (price: number) => boolean; onInvite: () => void; onClose: () => void;
  ownedItems: string[]; equippedItem: string; onBuyItem: (item: ShopItem) => void;
  onEquip: (id: string) => void; onResell: (item: ShopItem) => void;
}

function WalkingAvatar({ asset, character, equippedItem }: { asset: string; character: CharacterId; equippedItem: string }) {
  const equipped = itemById(equippedItem);
  return <span className={`walking-avatar avatar-${character} is-player`}><img src={asset} alt="" /><i className="left-leg" /><i className="right-leg" />{equipped && <b className="worn-item">{equipped.icon}</b>}</span>;
}

export function MarketWorld(props: MarketWorldProps) {
  const { foodBalance, coins, foodName, foodAsset, avatarAsset, character, onListFood, onSpendCoins, onInvite, onClose, ownedItems, equippedItem, onBuyItem, onEquip, onResell } = props;
  const [zone, setZone] = useState<VillageZone>('market');
  const [player, setPlayer] = useState<MarketPosition>({ x: 50, y: 84 });
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [message, setMessage] = useState('Walk up the trail to explore deeper.');
  const [ownedHome, setOwnedHome] = useState(false);
  const [insideHome, setInsideHome] = useState(false);
  const [activeShop, setActiveShop] = useState<'magic' | 'clothing' | 'furniture' | null>(null);
  const refresh = () => loadMarketListings().then(setListings).catch(() => setListings([]));
  const move = (direction: MarketDirection) => setPlayer((position) => {
    if (direction === 'up' && position.y <= 36 && nextZone[zone]) { setZone(nextZone[zone]!); return { x: 50, y: 86 }; }
    if (direction === 'down' && position.y >= 87 && previousZone[zone]) { setZone(previousZone[zone]!); return { x: 50, y: 38 }; }
    return moveInMarket(position, direction);
  });
  useEffect(() => { refresh(); }, []);
  useEffect(() => { const listener = (event: KeyboardEvent) => { const direction = marketDirectionFromKey(event.key); if (direction) { event.preventDefault(); move(direction); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [zone]);
  const buy = (price: number, isHome: boolean) => { if (!onSpendCoins(price)) return setMessage('Collect more coins first.'); if (isHome) setOwnedHome(true); setMessage(isHome ? 'The cottage is yours!' : 'Item added to your collection!'); };
  const listFood = async () => { const success = await onListFood(); setMessage(success ? 'Your unsigned stand is open!' : 'Sign in and apply the migration first.'); if (success) refresh(); };
  const zoneData = zones[zone];
  if (activeShop) return <VillageShopInterior kind={activeShop} coins={coins} ownedItems={ownedItems} equippedItem={equippedItem} onBuy={onBuyItem} onEquip={onEquip} onResell={onResell} onClose={() => setActiveShop(null)} />;
  if (insideHome) return <main className="private-home"><button onClick={() => setInsideHome(false)}>← Go outside</button><div><h1>My Cottage</h1><p>Only you and invited friends can enter.</p><span>🛏️</span><span>🛋️</span><span>🪔</span><button onClick={onInvite}>Invite Friends Over</button></div></main>;
  return <main className={`market-world zone-${zone}`} style={{ backgroundImage: `url(${zoneData.background})` }}><div className="market-top"><button onClick={onClose}>← Hana Aloha Island</button><h1>{zoneData.title}</h1><div><span><img src="/assets/pixel-coin.png" alt="" /> {coins}</span><span><img src={foodAsset} alt="" /> {foodBalance}</span></div></div>
    <section className="market-plaza">{zone === 'market' && <article className="your-market-stand"><h2>Your Shop</h2><button disabled={foodBalance < 5} onClick={listFood}>Sell 5 {foodName}</button><small>{listings.length} real player stands open</small></article>}<p className="market-help">{message} Prices appear when you get close.</p>
      <div className="market-play-area">{zoneData.shops.map((shop) => <VillageShopPoint key={shop.id} shop={shop} nearby={isNearStand(player, shop)} ownedHome={ownedHome} onBuy={() => shop.kind === 'home' ? buy(shop.price, true) : shop.kind !== 'stand' && setActiveShop(shop.kind)} onEnterHome={() => setInsideHome(true)} onInvite={onInvite} />)}
        <span className="market-player" style={{ left: `${player.x}%`, top: `${player.y}%`, scale: `${.72 + player.y / 220}` }}><WalkingAvatar asset={avatarAsset} character={character} equippedItem={equippedItem} /></span><span className="trail-exit top-exit">↑ Deeper trail</span>{previousZone[zone] && <span className="trail-exit bottom-exit">↓ Go back</span>}</div>
      <div className="market-controls"><button onClick={() => move('left')}>←</button><div><button onClick={() => move('up')}>↑</button><button onClick={() => move('down')}>↓</button></div><button onClick={() => move('right')}>→</button></div></section></main>;
}
