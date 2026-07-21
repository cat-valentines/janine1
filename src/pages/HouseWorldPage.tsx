import { useEffect, useRef, useState } from 'react';
import { HouseEngine, type Mode, type View } from '../game/houseEngine';
import { blocks, type Animal, type Plot } from '../game/building';
import { emptyWorld, normaliseWorld, type Furniture } from '../game/voxel';
import { characterAssets } from '../game/characters';
import { seasonOrder, seasonStyles, type Season } from '../game/terrain';
import { itemById, shopItems } from '../shop/catalog';
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
  onChangeWorld: (update: (previous: string) => string) => void;
  onChangeFurniture: (furniture: Furniture[]) => void;
  onRename: (name: string) => void;
  onBack: () => void;
}

export function HouseWorldPage(props: HouseWorldPageProps) {
  const { character, initialMode, season, seed, houseName, houseWorld, furniture, ownedItems, animals, garden, onChangeSeason, onChangeWorld, onChangeFurniture, onRename, onBack } = props;
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<HouseEngine | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode ?? 'build');
  const [view, setView] = useState<View>('third');
  const [picked, setPicked] = useState('W');
  const [pickedItem, setPickedItem] = useState('');
  const [erasing, setErasing] = useState(false);
  const world = normaliseWorld(houseWorld);
  const myFurniture = shopItems.filter((item) => item.category === 'furniture' && ownedItems.includes(item.id));

  // Callbacks live in refs so the engine is built once and never torn down mid-session.
  const changeWorld = useRef(onChangeWorld);
  const placeFurniture = useRef<(cell: { x: number; y: number; z: number }) => void>(() => undefined);
  changeWorld.current = onChangeWorld;
  placeFurniture.current = (cell) => {
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
    });
    engine.current = created;
    const resize = () => created.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); created.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setWorld(world); }, [world]);
  useEffect(() => { engine.current?.setSeason(season); }, [season]);
  useEffect(() => { engine.current?.setFurniture(furniture); }, [furniture]);
  useEffect(() => { engine.current?.setMode(mode); }, [mode]);
  useEffect(() => { engine.current?.setView(view); }, [view]);
  useEffect(() => {
    if (pickedItem) engine.current?.setPickedFurniture(pickedItem);
    else engine.current?.setPicked(picked);
  }, [picked, pickedItem]);
  useEffect(() => { engine.current?.setErasing(erasing); }, [erasing]);

  return <main className="house-world-page">
    <div className="house-page-top">
      <button onClick={onBack}>← Back</button>
      <input className="world-name" value={houseName} onChange={(event) => onRename(event.target.value)} placeholder="My House" maxLength={24} aria-label="House name" />
      <div className="world-modes">
        <button className={mode === 'build' ? 'selected' : ''} onClick={() => setMode('build')}>🔨 Build</button>
        <button className={mode === 'walk' ? 'selected' : ''} onClick={() => setMode('walk')}>🚶 Go inside</button>
      </div>
    </div>

    <div className="world-stage">
      <div className="world-canvas" ref={mount} />
      {mode === 'walk' && <>
        <button className="world-view-toggle" onClick={() => setView(view === 'third' ? 'first' : 'third')}>
          {view === 'third' ? '👁️ First person' : '🧍 See my character'}
        </button>
        <p className="world-help">Click the world, then use <b>W A S D</b> to walk, <b>Space</b> to jump, mouse to look. Press <b>Esc</b> to let go.</p>
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
          className={!pickedItem && !erasing && picked === block.id ? 'selected' : ''}
          key={block.id}
          onClick={() => { setPicked(block.id); setPickedItem(''); setErasing(false); }}
        ><i style={{ background: block.colour }} />{block.name}</button>)}
        <button className={`eraser ${erasing ? 'selected' : ''}`} onClick={() => setErasing(!erasing)}>🧽 Eraser</button>
      </div>
      <div className="furniture-palette">
        <strong>Your furniture</strong>
        {myFurniture.length
          ? myFurniture.map((item) => <button
            className={pickedItem === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => { setPickedItem(pickedItem === item.id ? '' : item.id); setErasing(false); }}
          ><span>{item.icon}</span>{item.name}</button>)
          : <small>Buy furniture in the shop and it will show up here to place in your house.</small>}
        {furniture.length > 0 && <button className="clear-furniture" onClick={() => onChangeFurniture([])}>🧹 Clear furniture ({furniture.length})</button>}
      </div>
      <div className="world-actions">
        <button onClick={() => { if (confirm('Clear the whole plot and start over?')) onChangeWorld(() => emptyWorld()); }}>♻️ Clear plot</button>
        <span className="world-tip">Placed: {furniture.map((piece) => itemById(piece.item)?.icon ?? '📦').join(' ') || 'nothing yet'}</span>
      </div>
    </section>}
  </main>;
}
