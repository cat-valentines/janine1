import { useEffect, useRef, useState } from 'react';
import { HouseEngine, type Mode, type View } from '../game/houseEngine';
import { blocks, type Animal, type Plot } from '../game/building';
import { emptyWorld, normaliseWorld, type Furniture, type FurnitureKind } from '../game/voxel';
import { characterAssets } from '../game/characters';
import { seasonOrder, seasonStyles, type Season } from '../game/terrain';
import { itemById, shopItems } from '../shop/catalog';
import { joinLiveGame, type LivePlayer, type HouseGift, type LiveGame } from '../lib/liveGame';
import { heartbeat, leaveGame } from '../lib/presence';
import { supabase } from '../lib/supabase';
import type { CharacterId } from '../game/types';

interface HouseWorldPageProps {
  character: CharacterId;
  /** 'walk' when the player chose "Go inside", so they land in the house. */
  initialMode?: Mode;
  season: Season;
  /** Stable per player, so their landscape is the same every visit. */
  seed: number;
  onChangeSeason: (season: Season) => void;
  houseName: string;
  houseWorld: string;
  furniture: Furniture[];
  ownedItems: string[];
  /** The animals and crops you're raising, so they appear out on your land. */
  animals: Animal[];
  garden: Array<Plot | null>;
  coins: number;
  onSpendCoins: (amount: number) => void;
  onFood: () => void;
  onChangeWorld: (update: (previous: string) => string) => void;
  onChangeFurniture: (furniture: Furniture[]) => void;
  onRename: (name: string) => void;
  onBack: () => void;
}

const FURNITURE_KINDS: Array<{ kind: FurnitureKind; icon: string; name: string }> = [
  { kind: 'table', icon: '🪵', name: 'Table' },
  { kind: 'chair', icon: '🪑', name: 'Chair' },
  { kind: 'sofa', icon: '🛋️', name: 'Sofa' },
  { kind: 'bed', icon: '🛏️', name: 'Bed' },
  { kind: 'lamp', icon: '💡', name: 'Lamp' },
];
const FURNITURE_COLORS = ['#ffffff', '#e0685f', '#e8a04f', '#f2d05e', '#6fbf6a', '#5a9fe0', '#9a6fd0', '#f28fb0', '#8a5a3a', '#3a3a44'];
const FURNITURE_COST = 20;

export function HouseWorldPage(props: HouseWorldPageProps) {
  const { character, initialMode, season, seed, houseName, houseWorld, furniture, ownedItems, animals, garden, coins, onSpendCoins, onFood, onChangeSeason, onChangeWorld, onChangeFurniture, onRename, onBack } = props;
  const onFoodRef = useRef(onFood);
  onFoodRef.current = onFood;
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<HouseEngine | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode ?? 'build');
  const [view, setView] = useState<View>('third');
  const [picked, setPicked] = useState('W');
  const [pickedItem, setPickedItem] = useState('');
  const [erasing, setErasing] = useState(false);
  // The colourable furniture you're about to buy (20 coins) and place.
  const [furnKind, setFurnKind] = useState<FurnitureKind | ''>('');
  const [furnColor, setFurnColor] = useState('#ffffff');
  const [buyMsg, setBuyMsg] = useState('');
  // Live neighbours walking the land right now, plus the whole invite-to-visit flow.
  const [peers, setPeers] = useState<LivePlayer[]>([]);
  const [myName, setMyName] = useState('a friend');
  const [userId, setUserId] = useState('');
  const [knock, setKnock] = useState<{ fromId: string; fromName: string } | null>(null);
  const [visiting, setVisiting] = useState<HouseGift | null>(null);
  const [toast, setToast] = useState('');
  const liveRef = useRef<LiveGame | null>(null);
  // While visiting someone's house we render THEIR build, not yours.
  const world = normaliseWorld(visiting ? visiting.world : houseWorld);
  const activeFurniture = (visiting ? (visiting.furniture as Furniture[]) : furniture);
  const myFurniture = shopItems.filter((item) => item.category === 'furniture' && ownedItems.includes(item.id));
  // The current snapshot of MY house, handed to a guest when I welcome them in.
  const houseGift = useRef<HouseGift>({ name: myName, world: houseWorld, furniture, season: season ?? null, seed, houseName });
  houseGift.current = { name: myName, world: houseWorld, furniture, season: season ?? null, seed, houseName };

  // Callbacks live in refs so the engine is built once and never torn down mid-session.
  const changeWorld = useRef(onChangeWorld);
  const placeFurniture = useRef<(cell: { x: number; y: number; z: number }) => void>(() => undefined);
  // While you're a guest in someone else's house, you can't change it.
  changeWorld.current = visiting ? () => undefined : onChangeWorld;
  placeFurniture.current = (cell) => {
    if (visiting) return;
    if (furnKind) {
      if (coins < FURNITURE_COST) { setBuyMsg(`You need ${FURNITURE_COST} coins to place a ${furnKind}.`); return; }
      onSpendCoins(FURNITURE_COST);
      onChangeFurniture([...furniture, { id: `f-${Date.now()}`, item: '', kind: furnKind, color: furnColor, x: cell.x, y: cell.y, z: cell.z, rot: 0 }]);
      return;
    }
    if (!pickedItem) return;
    onChangeFurniture([...furniture, { id: `${pickedItem}-${Date.now()}`, item: pickedItem, x: cell.x, y: cell.y, z: cell.z, rot: 0 }]);
  };

  useEffect(() => {
    if (!mount.current) return;
    const icons: Record<string, string> = {};
    shopItems.forEach((item) => { icons[item.id] = item.icon; });
    const created = new HouseEngine(mount.current, {
      world: normaliseWorld(houseWorld),
      season,
      seed,
      furniture,
      furnitureIcons: icons,
      characterAsset: characterAssets[character],
      animals,
      garden,
      onChangeWorld: (update) => changeWorld.current(update),
      onPlaceFurniture: (cell) => placeFurniture.current(cell),
      onFood: () => onFoodRef.current(),
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // who am I? — so my @name floats over my character for everyone else
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setMyName((data.user.user_metadata.display_name as string | undefined) ?? 'a friend');
    });
  }, []);

  // Live: shout my position several times a second, draw every other real player
  // with their @name, and carry the knock → welcome invitation handshake.
  useEffect(() => {
    if (!userId) return;
    const live = joinLiveGame('house', userId,
      (list) => setPeers(list),
      undefined,
      undefined,
      (fromId, fromName) => setKnock({ fromId, fromName }),                    // someone knocked
      (fromName, house) => { setVisiting(house); setMode('walk'); setToast(`🏡 Come in! You're visiting @${fromName}'s house.`); }, // they welcomed you
      (fromName) => setToast(`🚪 @${fromName} isn't ready for visitors right now.`),  // they turned you away
    );
    liveRef.current = live;
    heartbeat('house');
    const beat = setInterval(() => heartbeat('house'), 5000);
    const shout = setInterval(() => {
      const state = engine.current?.getSelfState();
      if (state) live.send({ name: myName, ...state });
    }, 140);
    return () => { clearInterval(beat); clearInterval(shout); live.leave(); leaveGame(); liveRef.current = null; setPeers([]); };
  }, [userId, myName]);

  // Show neighbours walking around — but hide them while you're inside a house.
  useEffect(() => { engine.current?.setLivePlayers(visiting ? [] : peers); }, [peers, visiting]);

  useEffect(() => { engine.current?.setWorld(world); }, [world]);
  useEffect(() => { engine.current?.setSeason((visiting?.season as Season) ?? season); }, [season, visiting]);
  useEffect(() => { engine.current?.setFurniture(activeFurniture); }, [activeFurniture]);
  useEffect(() => { engine.current?.setMode(mode); }, [mode]);
  useEffect(() => { engine.current?.setView(view); }, [view]);
  useEffect(() => {
    if (furnKind) engine.current?.setPickedFurniture('__custom__');
    else if (pickedItem) engine.current?.setPickedFurniture(pickedItem);
    else engine.current?.setPicked(picked);
  }, [picked, pickedItem, furnKind]);
  useEffect(() => { engine.current?.setErasing(erasing); }, [erasing]);
  // Toasts fade on their own after a few seconds.
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id); }, [toast]);

  // ---- the invite-to-visit handshake ----
  const askToVisit = (peer: LivePlayer) => {
    liveRef.current?.knock(peer.id, myName);
    setToast(`🔔 Asked @${peer.name} if you can come in…`);
  };
  const acceptKnock = () => {
    if (knock) { liveRef.current?.welcome(knock.fromId, houseGift.current); setToast(`🚪 You let @${knock.fromName} into your house!`); }
    setKnock(null);
  };
  const declineKnock = () => {
    if (knock) liveRef.current?.turnAway(knock.fromId, myName);
    setKnock(null);
  };
  const leaveVisit = () => { setVisiting(null); setToast('🏡 Back to your own house.'); };

  return <main className="house-world-page">
    <div className="house-page-top">
      <button onClick={visiting ? leaveVisit : onBack}>← {visiting ? 'Leave' : 'Back'}</button>
      {visiting
        ? <span className="world-name visiting-name">🏡 {visiting.houseName} · @{visiting.name}</span>
        : <input className="world-name" value={houseName} onChange={(event) => onRename(event.target.value)} placeholder="My House" maxLength={24} aria-label="House name" />}
      <div className="world-modes">
        {peers.length > 0 && <span className="world-neighbours" title="Other players walking the land right now">👥 {peers.length} nearby</span>}
        <button className={mode === 'build' ? 'selected' : ''} disabled={!!visiting} onClick={() => setMode('build')}>🔨 Build</button>
        <button className={mode === 'walk' ? 'selected' : ''} onClick={() => setMode('walk')}>🚶 Go inside</button>
      </div>
    </div>

    <div className="world-stage">
      <div className="world-canvas" ref={mount} />

      {toast && <div className="house-toast">{toast}</div>}

      {/* Someone knocked to come into YOUR house — you decide. */}
      {knock && <div className="knock-prompt">
        <p>🚪 <strong>@{knock.fromName}</strong> wants to come into your house!</p>
        <div className="knock-actions">
          <button className="knock-yes" onClick={acceptKnock}>✅ Let them in</button>
          <button className="knock-no" onClick={declineKnock}>🚫 Not now</button>
        </div>
      </div>}

      {/* Visiting banner — you're a guest, so you can look but not build. */}
      {visiting && <div className="visiting-banner">🏡 You're visiting <strong>@{visiting.name}</strong>'s house — have a look around! <button onClick={leaveVisit}>← Go home</button></div>}

      {/* The players online now — ask any of them to let you into their house. */}
      {!visiting && peers.length > 0 && <div className="neighbours-panel">
        <strong>👥 Players here now</strong>
        {peers.map((peer) => <div key={peer.id} className="neighbour-row">
          <span>🧍 @{peer.name}</span>
          <button onClick={() => askToVisit(peer)}>🔔 Ask to visit</button>
        </div>)}
        <small>Ask to come in — they have to say yes before you can walk into their house.</small>
      </div>}

      {mode === 'walk' && <>
        <button className="world-view-toggle" onClick={() => setView(view === 'third' ? 'first' : 'third')}>
          {view === 'third' ? '👁️ First person' : '🧍 See my character'}
        </button>
        <p className="world-help">Use the <b>arrow keys</b> — <b>↑↓</b> walk, <b>←→</b> turn (no mouse needed!) · <b>Space</b> jump · walk into the 🍎 <b>apples</b> on the trees to collect food.</p>
      </>}
      {mode === 'build' && <p className="world-help">{erasing
        ? <>🧽 <b>Eraser on</b> — click any block to rub it out. Pick a block to build again.</>
        : <>Click a face to place a block · <b>Shift+click</b> or the <b>🧽 Eraser</b> to rub out · <b>right-drag</b> to spin · <b>scroll</b> to zoom</>}</p>}
      <div className="season-switch">
        {seasonOrder.map((item) => <button
          className={season === item ? 'selected' : ''}
          key={item}
          onClick={() => onChangeSeason(item)}
          title={seasonStyles[item].name}
        >{seasonStyles[item].icon}<small>{seasonStyles[item].name}</small></button>)}
      </div>
    </div>

    {mode === 'build' && <section className="world-palette">
      <div className="block-palette">
        {blocks.map((block) => <button
          className={!pickedItem && !erasing && !furnKind && picked === block.id ? 'selected' : ''}
          key={block.id}
          onClick={() => { setPicked(block.id); setPickedItem(''); setFurnKind(''); setErasing(false); }}
        ><i style={{ background: block.colour }} />{block.name}</button>)}
        <button className={`eraser ${erasing ? 'selected' : ''}`} onClick={() => { setErasing(!erasing); setFurnKind(''); }}>🧽 Eraser</button>
      </div>

      <div className="furniture-shop">
        <strong>🪑 Furniture <small>· {FURNITURE_COST} coins each · 🪙 {coins}</small></strong>
        <div className="furn-kinds">
          {FURNITURE_KINDS.map((f) => <button
            className={furnKind === f.kind ? 'selected' : ''}
            key={f.kind}
            style={furnKind === f.kind ? { borderColor: furnColor } : undefined}
            onClick={() => { setFurnKind(furnKind === f.kind ? '' : f.kind); setPickedItem(''); setErasing(false); setBuyMsg(''); }}
          ><span>{f.icon}</span>{f.name}</button>)}
        </div>
        {furnKind && <>
          <div className="furn-colors">
            {FURNITURE_COLORS.map((c) => <button
              key={c}
              className={`furn-swatch ${furnColor === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setFurnColor(c)}
              aria-label={`colour ${c}`}
            />)}
          </div>
          <small>Pick a colour, then <b>click your house</b> to place your {furnKind} for {FURNITURE_COST} coins.</small>
          {buyMsg && <small className="furn-warn">{buyMsg}</small>}
        </>}
      </div>

      <div className="furniture-palette">
        <strong>Your shop furniture</strong>
        {myFurniture.length
          ? myFurniture.map((item) => <button
            className={pickedItem === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => { setPickedItem(pickedItem === item.id ? '' : item.id); setFurnKind(''); setErasing(false); }}
          ><span>{item.icon}</span>{item.name}</button>)
          : <small>Buy furniture in the shop and it will show up here too.</small>}
        {furniture.length > 0 && <button className="clear-furniture" onClick={() => onChangeFurniture([])}>🧹 Clear furniture ({furniture.length})</button>}
      </div>
      <div className="world-actions">
        <button onClick={() => { if (confirm('Clear the whole plot and start over?')) onChangeWorld(() => emptyWorld()); }}>♻️ Clear plot</button>
        <span className="world-tip">Placed: {furniture.map((piece) => itemById(piece.item)?.icon ?? '📦').join(' ') || 'nothing yet'}</span>
      </div>
    </section>}
  </main>;
}
