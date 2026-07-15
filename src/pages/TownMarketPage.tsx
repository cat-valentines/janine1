import { useEffect, useRef, useState } from 'react';
import { TownEngine, type TownSnapshot } from '../game/townEngine';
import { forageById, forageKinds, shopById, townHouses, townShops } from '../game/town';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';
import type { ShopItem } from '../shop/catalog';

interface TownMarketPageProps {
  character: CharacterId;
  coins: number;
  ownedItems: string[];
  supplies: Record<string, number>;
  onGather: (supplies: Record<string, number>) => void;
  onEat: (id: string) => void;
  onBuy: (item: ShopItem) => void;
  onOpenHouseMarket: () => void;
  onBack: () => void;
}

export function TownMarketPage({ character, coins, ownedItems, supplies, onGather, onEat, onBuy, onOpenHouseMarket, onBack }: TownMarketPageProps) {
  const [entered, setEntered] = useState(false);
  const [snapshot, setSnapshot] = useState<TownSnapshot | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<TownEngine | null>(null);
  // Held in refs so the engine is built once and never restarted mid-walk.
  const suppliesRef = useRef(supplies);
  const gatherRef = useRef(onGather);
  gatherRef.current = onGather;

  useEffect(() => {
    if (!entered || !mount.current) return;
    const created = new TownEngine(mount.current, {
      characterAsset: characterAssets[character],
      supplies: suppliesRef.current,
      onUpdate: setSnapshot,
      onGather: (next) => gatherRef.current(next),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [entered, character]);

  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!entered) {
    return <main className="quest-pick town-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🪙 {coins} gold</span></div>
      <header className="quest-header town-header">
        <p className="eyebrow">A whole town to walk around</p>
        <h1><span>🏪</span> Your Market <span>🏪</span></h1>
        <p>Walk the street. Step inside the shops. Buy from real shopkeepers.</p>
      </header>
      <section className="quest-pick-card">
        <p className="card-kicker">The town</p>
        <h2>Six shops, one street</h2>
        <p>Use the <strong>arrow keys</strong> (or W A S D) to walk, and the mouse to look around. Walk <strong>through a shop's door</strong> and its counter opens so you can buy. Follow the trail out to the <strong>forest</strong> — chop trees 🪵, pick berries 🫐 and mushrooms 🍄, fish 🐟, and hunt deer 🦌.</p>
        <p className="quest-hint">Watch your <strong>🔋 battery</strong> — walking uses energy. Eat food from your pack, or sleep in a forest <strong>⛺ camp hut</strong> to fill it right up. And keep away from the <strong>🐍 snakes</strong> — their venom drains you fast!</p>
        <div className="town-shop-grid">
          {townShops.map((shop) => <div className="town-shop-card" key={shop.id}>
            <span>{shop.sign}</span>
            <strong>{shop.name}</strong>
            <small>{shop.keeperIcon} {shop.keeper}</small>
          </div>)}
        </div>
        <button className="profile-start" onClick={() => setEntered(true)}>Walk into town <span>→</span></button>
      </section>
    </main>;
  }

  const pack = snapshot?.gathered ?? supplies;
  const packList = Object.entries(pack).filter(([id, n]) => n > 0 && forageKinds[id]);
  const low = (snapshot?.energy ?? 100) < 30;
  const shop = snapshot?.inside ? shopById(snapshot.inside) : null;
  const house = snapshot?.atHouse ? townHouses.find((h) => h.id === snapshot.atHouse) : null;

  return <main className="quest-page">
    <div className="quest-stage">
      <div className="quest-canvas" ref={mount} />

      <div className="quest-hud">
        <div className="quest-day"><strong>🪙 {coins} gold</strong><small>{shop ? `Inside ${shop.name}` : snapshot?.inForest ? 'In the forest' : 'Walking the street'}</small></div>

      </div>

      {/* Battery: your energy. Eat from the pack or sleep at a camp. */}
      {snapshot && <div className={`energy-meter ${low ? 'low' : ''} ${snapshot.venom ? 'venom' : ''}`}>
        <b>{snapshot.venom ? '🐍' : low ? '🪫' : '🔋'}</b>
        <i><s style={{ height: `${snapshot.energy}%` }} /></i>
        <small>{snapshot.energy}</small>
      </div>}

      {snapshot?.snakeNear && !snapshot.venom && <p className="snake-warning">🐍 A snake is sneaking up on you — run!</p>}

      {snapshot?.canSleep && <button className="sleep-button" onClick={() => engine.current?.sleep()}>
        😴 Sleep at {snapshot.campName}
      </button>}

      <button className="quest-full" onClick={goFullscreen}>⛶ Fullscreen</button>
      <button className="quest-leave" onClick={onBack}>← Leave</button>

      {snapshot?.message && <p className="quest-message">{snapshot.message}</p>}
      {!shop && snapshot?.target && <p className="gather-prompt">{
        snapshot.target === 'tree' ? '🪓 Click to chop this tree'
          : snapshot.target === 'apple' ? '🍎 Click to shake down the apples'
          : snapshot.target === 'rock' ? '⛏️ Click to break this rock'
          : snapshot.target === 'crate' ? '📦 Click to take the camp supplies'
          : snapshot.target === 'deer' ? '🦌 Click to hunt the deer'
          : snapshot.target === 'turtle' ? '🐢 Click the turtle'
          : snapshot.target === 'snake' ? '🐍 Click the snake'
          : snapshot.target === 'bird' ? '🐦 Click the bird'
          : snapshot.target === 'river' ? '🎣 Click to catch a fish'
          : `${forageById(snapshot.target)?.icon ?? '🌿'} Click to pick the ${forageById(snapshot.target)?.name.toLowerCase() ?? 'plant'}`
      }</p>}
      {!shop && !house && !snapshot?.target && <p className="quest-help">Click the town, then <b>arrow keys</b> to walk · mouse to look · <b>F</b> first person · walk into a shop to buy · follow the trail out to the forest</p>}

      {/* Standing inside a shop opens its counter. */}
      {shop && <aside className="shop-counter">
        <div className="shop-counter-top">
          <span>{shop.sign}</span>
          <div><strong>{shop.name}</strong><small>{shop.keeperIcon} {shop.keeper}: “{shop.greeting}”</small></div>
        </div>
        <div className="shop-counter-items">
          {shop.stock.map((item) => {
            const owned = ownedItems.includes(item.id);
            const canAfford = coins >= item.price;
            return <button className="shop-counter-item" key={item.id} disabled={owned || !canAfford} onClick={() => onBuy(item)}>
              <span>{item.icon}</span>
              <strong>{item.name}</strong>
              <i>{owned ? '✓ Owned' : `🪙 ${item.price}`}</i>
            </button>;
          })}
        </div>
        <small className="shop-counter-hint">Walk back out of the door when you are done.</small>
      </aside>}

      {/* The backpack: everything foraged, and anything edible can be eaten. */}
      {!shop && packList.length > 0 && <aside className="pack-panel">
        <strong>🎒 My pack</strong>
        <div>
          {packList.map(([id, count]) => {
            const kind = forageById(id);
            if (!kind) return null;
            return <button
              className={`pack-item ${kind.edible ? 'edible' : ''}`}
              key={id}
              disabled={!kind.edible}
              onClick={() => { if (!kind.edible) return; engine.current?.eat(id); onEat(id); }}
              title={kind.edible ? `Eat ${kind.name} — ${kind.blurb}` : kind.blurb}
            >
              <span>{kind.icon}</span>
              <b>{count}</b>
              {kind.edible && <i>Eat</i>}
            </button>;
          })}
        </div>
        <small>Saved automatically · click food to eat it</small>
      </aside>}

      {house && !shop && <aside className="house-knock">
        <strong>🏠 {house.owner}'s house</strong>
        {house.forSale
          ? <><small>This one is for sale — 🪙 {house.price} gold.</small><button onClick={onOpenHouseMarket}>See houses for sale</button></>
          : <small>Somebody already lives here.</small>}
      </aside>}
    </div>
  </main>;
}
