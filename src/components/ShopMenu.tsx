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
  onOpenHouse: () => void;
}

const sections = [
  { id: 'clothing' as const, label: 'Clothing Shop', icon: '👕' },
  { id: 'furniture' as const, label: 'Furniture Shop', icon: '🪑' },
  { id: 'food' as const, label: 'Food Shop', icon: '🍎' },
];

export function ShopMenu({ coins, foodBalance, ownedItems, onBuy, onClose, collectibleAsset, collectibleName, onOpenMarket, onOpenHouse }: ShopMenuProps) {
  const [openSection, setOpenSection] = useState<ShopItem['category'] | null>('clothing');
  const [marketOpen, setMarketOpen] = useState(false);
  const [listings, setListings] = useState<MarketListing[]>([]);
  useEffect(() => { loadMarketListings().then(setListings).catch(() => setListings([])); }, []);
  return (
    <div className="menu-backdrop" onClick={onClose}>
      <aside className="shop-menu" onClick={(event) => event.stopPropagation()}>
        <div className="shop-heading"><div><span className="card-kicker">Character clothing</span><h2>Shop</h2></div><button onClick={onClose} aria-label="Close menu">×</button></div>
        <p className="shop-balance"><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {coins} coins</p>
        <div className="shop-sections">{sections.map((section) => <section className="shop-section" key={section.id}>
          <button className="shop-dropdown" onClick={() => setOpenSection(openSection === section.id ? null : section.id)}><span>{section.icon} {section.label}</span><b>{openSection === section.id ? '−' : '+'}</b></button>
          {openSection === section.id && <div className="shop-grid">{shopItems.filter((item) => item.category === section.id).map((item) => {
            const owned = ownedItems.includes(item.id);
            return <article className="shop-item" key={item.id}><span>{item.icon}</span><strong>{item.name}</strong><small><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {item.price}</small><button disabled={owned || coins < item.price} onClick={() => onBuy(item)}>{owned ? 'Owned' : coins < item.price ? 'Need more' : 'Buy'}</button></article>;
          })}</div>}
        </section>)}<section className="shop-section"><button className="shop-dropdown" onClick={() => setMarketOpen((open) => !open)}><span>🏪 Your Shop</span><b>{marketOpen ? '−' : '+'}</b></button>
          {marketOpen && <div className="your-shop"><p><img className="hud-collectible" src={collectibleAsset} alt="" /> You have {foodBalance} {collectibleName}. Enter the market world to open a stand.</p><button className="list-food" onClick={onOpenMarket}>Enter Market World</button>{listings.length > 0 && <p className="fine-print">{listings.length} real player stands are open.</p>}</div>}
        </section><section className="shop-section"><button className="shop-dropdown" onClick={onOpenHouse}><span>🏡 Your House</span><b>→</b></button></section></div>
      </aside>
    </div>
  );
}
