import { useEffect, useState } from 'react';
import { VoxelPreview } from '../components/VoxelPreview';
import { buyHouse, listMyHouse, loadHouseMarket, type MarketHouse } from '../lib/houses';
import { supabase } from '../lib/supabase';

interface HouseMarketPageProps {
  coins: number;
  myGrid: string;
  myHouseName: string;
  onBought: (house: { grid: string; name: string; price: number }) => void;
  onBack: () => void;
}

export function HouseMarketPage({ coins, myGrid, myHouseName, onBought, onBack }: HouseMarketPageProps) {
  const [houses, setHouses] = useState<MarketHouse[]>([]);
  const [userId, setUserId] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'guest'>('loading');
  const [price, setPrice] = useState('20');
  const [note, setNote] = useState('');

  const refresh = () => loadHouseMarket()
    .then((rows) => { setHouses(rows); setState('ready'); })
    .catch(() => setState('offline'));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { setState('guest'); return; }
      setUserId(data.user.id);
      refresh();
    });
  }, []);

  const buy = async (house: MarketHouse) => {
    if (coins < house.price) return;
    try {
      const grid = await buyHouse(house.id);
      onBought({ grid, name: house.name, price: house.price });
    } catch {
      setNote('That house was just sold to someone else.');
      refresh();
    }
  };

  const sell = async () => {
    const value = Number(price);
    if (!myGrid) { setNote('Build a house first, then you can sell it.'); return; }
    if (!Number.isInteger(value) || value < 1 || value > 999) { setNote('Pick a price between 1 and 999 coins.'); return; }
    try {
      await listMyHouse(userId, { name: myHouseName || 'My House', blurb: 'Built block by block.', grid: myGrid, price: value });
      setNote(`Your house is for sale for ${value} coins. Other players can buy it now.`);
      refresh();
    } catch {
      setNote('Could not list your house. The database update may still need to be applied.');
    }
  };

  return <main className="your-house-page">
    <div className="house-page-top"><button onClick={onBack}>← Back</button><h1>Houses For Sale</h1><span><img src="/assets/pixel-coin.png" alt="" /> {coins}</span></div>
    <p className="market-intro">Every house here was built and listed by a real signed-up player. Buy one and it becomes yours — you can keep rebuilding it however you like.</p>

    {state === 'guest' && <p className="market-empty">🔐 Log in to buy and sell houses with other players.</p>}
    {state === 'loading' && <p className="market-empty">Loading houses for sale…</p>}
    {state === 'offline' && <p className="market-empty">The house market is not online yet. Apply the database update to trade houses with real players.</p>}
    {state === 'ready' && !houses.length && <p className="market-empty">No player has listed a house yet. Be the first — sell yours below!</p>}

    {state === 'ready' && houses.length > 0 && <div className="house-listings">
      {houses.map((house) => <article className="house-listing" key={house.id}>
        <VoxelPreview world={house.grid} />
        <div>
          <p className="card-kicker">Sold by @{house.seller_name}</p>
          <h2>{house.name}</h2>
          <p>{house.blurb}</p>
        </div>
        <div className="house-listing-buy">
          <strong><img src="/assets/pixel-coin.png" alt="" /> {house.price}</strong>
          <button disabled={coins < house.price} onClick={() => buy(house)}>
            {coins < house.price ? `Need ${house.price - coins} more` : 'Buy House'}
          </button>
        </div>
      </article>)}
    </div>}

    {state !== 'guest' && state !== 'offline' && <section className="sell-house">
      <h2>Sell your house</h2>
      {myGrid
        ? <><VoxelPreview world={myGrid} />
          <div className="sell-row">
            <label>Price <input type="number" min={1} max={999} value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <button onClick={sell}>List “{myHouseName || 'My House'}” for sale</button>
          </div></>
        : <p className="market-empty">Build a house first and it will show up here, ready to sell.</p>}
    </section>}

    {note && <p className="builder-note">{note}</p>}
  </main>;
}
