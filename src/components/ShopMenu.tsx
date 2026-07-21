import { useEffect, useState } from 'react';
import { loadMarketListings, type MarketListing } from '../lib/marketplace';
import { shopItems, type ShopItem } from '../shop/catalog';

interface ShopMenuProps {
  coins: number;
  foodBalance: number;
  ownedItems: string[];
  onBuy: (item: ShopItem) => void;
  onClose: () => void;
  collectibleAsset: string;
  collectibleName: string;
  onOpenMarket: () => void;
  onSellItems: () => void;
  onOpenHouse: () => void;
  onOpenMap: () => void;
  onInviteFriend: () => void;
}

const sections = [
  { id: 'clothing' as const, label: 'Clothing Shop', icon: '👕' },
  { id: 'furniture' as const, label: 'Furniture Shop', icon: '🪑' },
  { id: 'food' as const, label: 'Food Shop', icon: '🍎' },
];

export function ShopMenu({ coins, foodBalance, ownedItems, onBuy, onClose, collectibleAsset, collectibleName, onOpenMarket, onSellItems, onOpenHouse, onOpenMap, onInviteFriend }: ShopMenuProps) {
  const [openSection, setOpenSection] = useState<ShopItem['category'] | null>('clothing');
  const [marketOpen, setMarketOpen] = useState(false);
  const [listings, setListings] = useState<MarketListing[]>([]);
  useEffect(() => { loadMarketListings().then(setListings).catch(() => setListings([])); }, []);
  return (
    <div className="menu-backdrop" onClick={onClose}>
      <aside className="shop-menu" onClick={(event) => event.stopPropagation()}>
        <div className="shop-heading"><div><span className="card-kicker">Magical Islands</span><h2>Menu</h2></div><button onClick={onClose} aria-label="Close menu">×</button></div>
        <p className="shop-balance"><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {coins} coins</p>
        <div className="shop-sections"><section className="shop-section"><button className="shop-dropdown map-menu-link" onClick={onOpenMap}><span>🗺️ Map · 30 Islands</span><b>→</b></button></section>{sections.map((section) => <section className="shop-section" key={section.id}>
          <button className="shop-dropdown" onClick={() => setOpenSection(openSection === section.id ? null : section.id)}><span>{section.icon} {section.label}</span><b>{openSection === section.id ? '−' : '+'}</b></button>
          {openSection === section.id && <div className="shop-grid">{shopItems.filter((item) => item.category === section.id).map((item) => {
            const owned = ownedItems.includes(item.id);
            return <article className="shop-item" key={item.id}><span>{item.icon}</span><strong>{item.name}</strong><small><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {item.price}</small><button disabled={owned || coins < item.price} onClick={() => onBuy(item)}>{owned ? 'Owned' : coins < item.price ? 'Need more' : 'Buy'}</button></article>;
          })}</div>}
        </section>)}<section className="shop-section"><button className="shop-dropdown" onClick={() => setMarketOpen((open) => !open)}><span>🏪 Your Market</span><b>{marketOpen ? '−' : '+'}</b></button>
          {marketOpen && <div className="your-shop"><p className="market-note"><img className="hud-collectible" src={collectibleAsset} alt="" /> You have {foodBalance} {collectibleName}. Walk the 3-D town to buy from shops, or open your own stand to sell.</p><div className="market-actions"><button className="list-food" onClick={onOpenMarket}>🚶 Walk into town</button><button className="list-food" onClick={onSellItems}>🧺 Sell your items</button></div><button className="invite-friend-link" onClick={onInviteFriend}>👋 Invite a friend to the Market</button>{listings.length > 0 && <p className="fine-print">{listings.length} real player stands are open.</p>}</div>}
        </section><section className="shop-section"><button className="shop-dropdown" onClick={onOpenHouse}><span>🏡 Your House</span><b>→</b></button><button className="invite-friend-link" onClick={onInviteFriend}>👋 Invite a friend to your House</button></section></div>
      </aside>
    </div>
  );
}
