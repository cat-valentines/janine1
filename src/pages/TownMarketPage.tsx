import { useEffect, useRef, useState } from 'react';
import { TownEngine, type TownSnapshot } from '../game/townEngine';
import { forageById, forageKinds, sellPrice, shopById, townHouses, townShops } from '../game/town';
import { characterAssets } from '../game/characters';
import { KeyPad } from '../components/KeyPad';
import { Joystick } from '../components/Joystick';
import { heartbeat, leaveGame, playersInGame } from '../lib/presence';
import { supabase } from '../lib/supabase';
import type { FoundPlayer } from '../lib/players';
import type { CharacterId } from '../game/types';
import type { ShopItem } from '../shop/catalog';

const CHAR_ICON: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥', misha: '🐄' };
const charIcon = (id: string) => CHAR_ICON[id] ?? '🙂';
// The joystick-mode "pick / interact" button fires the same Space key the games listen for.
function fireKey(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
}
// A little stock every player's stall offers, so you can always buy from a neighbour.
const RIVAL_GOODS: Array<{ id: string; price: number }> = [
  { id: 'berries', price: 4 }, { id: 'apple', price: 4 }, { id: 'fish', price: 8 }, { id: 'wood', price: 3 }, { id: 'mushroom', price: 4 },
];

interface TownMarketPageProps {
  character: CharacterId;
  coins: number;
  ownedItems: string[];
  supplies: Record<string, number>;
  onGather: (supplies: Record<string, number>) => void;
  onEat: (id: string) => void;
  onBuy: (item: ShopItem) => void;
  /** Coins earned selling goods at your own stand. */
  onEarn: (coins: number) => void;
  /** Coins spent buying goods from another player's stall. */
  onSpend: (coins: number) => void;
  /** Jump straight into sell mode (chosen from the menu's "Sell your items"). */
  initialSell?: boolean;
  onOpenHouseMarket: () => void;
  onBack: () => void;
}

export function TownMarketPage({ character, coins, ownedItems, supplies, onGather, onEat, onBuy, onEarn, onSpend, initialSell, onOpenHouseMarket, onBack }: TownMarketPageProps) {
  const [entered, setEntered] = useState(!!initialSell);
  const [sellMode, setSellMode] = useState(!!initialSell);
  const [snapshot, setSnapshot] = useState<TownSnapshot | null>(null);
  const [standSet, setStandSet] = useState<Set<string>>(new Set());
  const [storeOpen, setStoreOpen] = useState(true);
  // Which tab of your stand is showing: sell your goods, or eat your food.
  const [standTab, setStandTab] = useState<'sell' | 'eat'>('sell');
  // How you walk on a phone: a thumb joystick, or the arrow buttons.
  const [controls, setControls] = useState<'buttons' | 'joystick'>('buttons');
  // On phones the panel is collapsed by default so it never hides the game.
  const [standOpen, setStandOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 700 : true));
  const [livePlayers, setLivePlayers] = useState<FoundPlayer[]>([]);
  const [myName, setMyName] = useState('');
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
      selling: sellMode,
      onUpdate: setSnapshot,
      onGather: (next) => gatherRef.current(next),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
  }, [entered, character, sellMode]);

  const goFullscreen = () => {
    const node = mount.current?.parentElement;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyName((data.user?.user_metadata.display_name as string | undefined) ?? '')); }, []);

  // Live market: tell the server you're here, and pull the real players who are
  // at the market right now so you can see them and shop from each other.
  useEffect(() => {
    if (!entered) return;
    heartbeat('market');
    const hb = setInterval(() => heartbeat('market'), 5000);
    const poll = () => playersInGame('market').then((players) => {
      const others = players.filter((p) => p.name !== myName);
      setLivePlayers(others);
      engine.current?.setRivals(others.map((p) => ({ name: p.name, icon: charIcon(p.character_id) })));
    }).catch(() => undefined);
    poll();
    const pollTimer = setInterval(poll, 6000);
    return () => { clearInterval(hb); clearInterval(pollTimer); leaveGame(); };
  }, [entered, myName]);

  const pack = snapshot?.gathered ?? supplies;

  // Lay the goods you ticked out on the 3-D stand — unless your store is closed.
  useEffect(() => {
    if (!engine.current) return;
    if (!storeOpen) { engine.current.setStandItems([]); return; }
    const icons = [...standSet].filter((id) => (pack[id] ?? 0) > 0).map((id) => forageById(id)?.icon ?? '').filter(Boolean);
    engine.current.setStandItems(icons);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standSet, snapshot, storeOpen]);

  const buyFromRival = (id: string, price: number) => {
    if (coins < price) return;
    onSpend(price);
    engine.current?.receive(id, `🛒 Bought a ${forageById(id)?.name.toLowerCase() ?? 'good'} for 🪙 ${price}`);
  };

  const toggleStand = (id: string) => setStandSet((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sellOne = (id: string) => { const sold = engine.current?.sell(id, 1) ?? 0; if (sold > 0) onEarn(sold * (sellPrice[id] ?? 1)); };
  const sellStand = () => {
    let coins = 0;
    standSet.forEach((id) => { const have = pack[id] ?? 0; if (have > 0) coins += (engine.current?.sell(id, have) ?? 0) * (sellPrice[id] ?? 1); });
    if (coins > 0) onEarn(coins);
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
        <button className="profile-start" onClick={() => { setSellMode(false); setEntered(true); }}>Walk into town <span>→</span></button>
        <button className="profile-start sell-start" onClick={() => { setSellMode(true); setEntered(true); }}>🧺 Sell your items <span>→</span></button>
        <p className="quest-hint sell-hint">Open your own market stand on the street and lay out the goods you've gathered — wood 🪵, berries 🫐, fish 🐟 and more — to sell for gold. It's the same town, but this time <strong>you're the shopkeeper</strong>.</p>
      </section>
    </main>;
  }

  const packList = Object.entries(pack).filter(([id, n]) => n > 0 && forageKinds[id]);
  const edibleList = packList.filter(([id]) => forageById(id)?.edible);
  const low = (snapshot?.energy ?? 100) < 30;
  const shop = snapshot?.inside ? shopById(snapshot.inside) : null;
  const house = snapshot?.atHouse ? townHouses.find((h) => h.id === snapshot.atHouse) : null;

  return <main className="quest-page">
    <div className="quest-stage">
      <div className="quest-canvas" ref={mount} />

      <div className="quest-hud">
        <div className="quest-day"><strong>🪙 {coins} gold</strong><small>{shop ? `Inside ${shop.name}` : snapshot?.inForest ? 'In the forest' : 'Walking the street'}</small></div>
      </div>

      {/* Real players at the market right now. */}
      <aside className="market-live">
        <strong>{livePlayers.length ? `🟢 ${livePlayers.length} here now` : '🟢 Live market'}</strong>
        {livePlayers.length
          ? <div>{livePlayers.slice(0, 6).map((p) => <span key={p.id} title={`@${p.name}`}>{charIcon(p.character_id)} {p.name}</span>)}</div>
          : <small>No other players shopping right now. Their stalls appear here when they join.</small>}
      </aside>

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

      {/* Phone controls: pick a joystick OR the arrow buttons to walk; ⤴ to pick/interact. */}
      <button className="control-mode-toggle" onClick={() => setControls((c) => (c === 'buttons' ? 'joystick' : 'buttons'))}>
        {controls === 'buttons' ? '🕹️ Use joystick' : '🎮 Use buttons'}
      </button>
      {controls === 'buttons'
        ? <KeyPad dirs={['up', 'down', 'left', 'right']} actions={[{ codes: ['Space'], label: '⤴' }]} />
        : <>
            <Joystick />
            <button
              className="joy-action" aria-hidden="true"
              onPointerDown={(e) => { e.preventDefault(); fireKey('Space', true); }}
              onPointerUp={() => fireKey('Space', false)}
              onPointerLeave={() => fireKey('Space', false)}
              onPointerCancel={() => fireKey('Space', false)}
              onContextMenu={(e) => e.preventDefault()}
            >⤴</button>
          </>}

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
      {!sellMode && !shop && packList.length > 0 && <aside className="pack-panel">
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

      {/* Sell mode collapsed: still show the food you've collected, tap to sell. */}
      {sellMode && !shop && !snapshot?.atRival && !standOpen && <button className="stand-reopen" onClick={() => setStandOpen(true)}>
        <b>🧺 Sell</b>
        {packList.length
          ? packList.slice(0, 6).map(([id, count]) => <span className="reopen-food" key={id}>{forageById(id)?.icon} {count}</span>)
          : <span className="reopen-food none">no food yet — go gather!</span>}
      </button>}

      {/* Owner-only: walk up to YOUR stand and you get an open/close switch right there. */}
      {sellMode && !shop && snapshot?.atStall && <div className="stand-owner-ctl">
        <strong>🧺 Your stand</strong>
        <span>You're the owner</span>
        <button className={`store-toggle ${storeOpen ? 'open' : ''}`} onClick={() => setStoreOpen((o) => !o)}>{storeOpen ? '🟢 Open — tap to close' : '🔴 Closed — tap to open'}</button>
      </div>}

      {sellMode && !shop && !snapshot?.atRival && standOpen && <aside className="stand-panel">
        <div className="stand-head">
          <strong>🧺 Your stand</strong>
          <div className="stand-head-btns">
            <button className={`store-toggle ${storeOpen ? 'open' : ''}`} onClick={() => setStoreOpen((o) => !o)}>{storeOpen ? '🟢 Open' : '🔴 Closed'}</button>
            <button className="panel-collapse" onClick={() => setStandOpen(false)} aria-label="Hide stand">▾</button>
          </div>
        </div>

        {/* Two tabs: sell your goods for gold, or eat your food to refill energy. */}
        <div className="stand-tabs" role="tablist">
          <button role="tab" className={standTab === 'sell' ? 'on' : ''} onClick={() => setStandTab('sell')}>🧺 Sell</button>
          <button role="tab" className={standTab === 'eat' ? 'on' : ''} onClick={() => setStandTab('eat')}>🍎 Eat</button>
        </div>

        {standTab === 'sell' && (!storeOpen
          ? <p className="stand-empty">Your store is <b>closed</b>. Go gather more supplies, then re-open whenever you like — your stand waits for you.</p>
          : <>
            {snapshot?.atStall
              ? <small>Tick a good to lay it out on your stand, then sell it for gold.</small>
              : <small>Walk to your stand (straight ahead on the street) to lay out goods.</small>}
            <div className="stand-items">
              {packList.length === 0 && <p className="stand-empty">Your pack is empty — head out to the 🌲 forest to gather wood, berries and fish, then come back and sell them!</p>}
              {packList.map(([id, count]) => {
                const kind = forageById(id);
                if (!kind) return null;
                const on = standSet.has(id);
                const price = sellPrice[id] ?? 1;
                return <div className={`stand-row ${on ? 'on' : ''}`} key={id}>
                  <label><input type="checkbox" checked={on} onChange={() => toggleStand(id)} /><span>{kind.icon}</span> {kind.name} <b>×{count}</b></label>
                  <span className="stand-price">🪙 {price}</span>
                  <button className="stand-sell" disabled={!on} onClick={() => sellOne(id)}>Sell</button>
                </div>;
              })}
            </div>
            {[...standSet].some((id) => (pack[id] ?? 0) > 0) && <button className="stand-sell-all" onClick={sellStand}>Sell everything on my stand 🪙</button>}
          </>)}

        {standTab === 'eat' && <>
          <small>Eat food from your pack to refill your 🔋 battery — you can eat any time, even with your store closed.</small>
          <div className="stand-items">
            {edibleList.length === 0
              ? <p className="stand-empty">No food to eat yet — pick 🫐 berries, 🍎 apples and 🍄 mushrooms or catch 🐟 fish in the forest, then come back.</p>
              : edibleList.map(([id, count]) => {
                const kind = forageById(id);
                if (!kind) return null;
                return <div className="stand-row eat-row" key={id}>
                  <label title={kind.blurb}><span>{kind.icon}</span> {kind.name} <b>×{count}</b></label>
                  <button className="stand-eat" onClick={() => { engine.current?.eat(id); onEat(id); }}>Eat</button>
                </div>;
              })}
          </div>
        </>}
      </aside>}

      {/* Standing at another live player's stall — buy their goods. */}
      {snapshot?.atRival && !shop && <aside className="stand-panel rival-panel">
        <div className="stand-head"><strong>🛒 @{snapshot.atRival}'s stand</strong></div>
        <small>Buy goods from this live player for gold.</small>
        <div className="rival-goods">
          {RIVAL_GOODS.map(({ id, price }) => {
            const kind = forageById(id);
            if (!kind) return null;
            return <button key={id} className="rival-good" disabled={coins < price} onClick={() => buyFromRival(id, price)}>
              <span>{kind.icon}</span><b>{kind.name}</b><i>🪙 {price}</i>
            </button>;
          })}
        </div>
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
