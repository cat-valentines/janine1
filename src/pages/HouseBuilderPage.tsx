import { useEffect, useState } from 'react';
import {
  ANIMAL_PEN, GARDEN_PLOTS, animalById, animalTypes,
  cropById, cropProgress, cropReady, crops, produceProgress, produceReady,
  type Animal, type Plot,
} from '../game/building';

interface HouseBuilderPageProps {
  coins: number;
  garden: Array<Plot | null>;
  animals: Animal[];
  onChangeGarden: (garden: Array<Plot | null>) => void;
  onChangeAnimals: (animals: Animal[]) => void;
  onEarn: (coins: number) => void;
  onSpend: (coins: number) => boolean;
  onBack: () => void;
}

type Tab = 'garden' | 'animals';

export function HouseBuilderPage(props: HouseBuilderPageProps) {
  const { coins, garden, animals, onChangeGarden, onChangeAnimals, onEarn, onSpend, onBack } = props;
  const [tab, setTab] = useState<Tab>('garden');
  const [seed, setSeed] = useState('carrot');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Crops and animals finish on a timer, so the page needs its own clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const plant = (index: number) => {
    const crop = cropById(seed);
    if (!crop) return;
    if (!onSpend(crop.seedPrice)) { setNote(`You need ${crop.seedPrice} coins for ${crop.name} seeds.`); return; }
    const next = [...garden];
    while (next.length < GARDEN_PLOTS) next.push(null);
    next[index] = { crop: seed, plantedAt: Date.now() };
    onChangeGarden(next);
    setNote(`${crop.name} planted. Come back in ${crop.seconds}s.`);
  };

  const harvest = (index: number) => {
    const plot = garden[index];
    if (!plot || !cropReady(plot, now)) return;
    const crop = cropById(plot.crop);
    if (!crop) return;
    const next = [...garden];
    next[index] = null;
    onChangeGarden(next);
    onEarn(crop.reward);
    setNote(`Harvested ${crop.icon} ${crop.name} for ${crop.reward} coins!`);
  };

  const buyAnimal = (typeId: string) => {
    const type = animalById(typeId);
    if (!type) return;
    if (animals.length >= ANIMAL_PEN) { setNote('Your pen is full.'); return; }
    if (!onSpend(type.price)) { setNote(`You need ${type.price} coins for a ${type.name}.`); return; }
    onChangeAnimals([...animals, { id: `${typeId}-${Date.now()}`, type: typeId, fedAt: Date.now() }]);
    setNote(`${type.icon} A ${type.name} joined your farm!`);
  };

  const collect = (animal: Animal) => {
    if (!produceReady(animal, now)) return;
    const type = animalById(animal.type);
    if (!type) return;
    onChangeAnimals(animals.map((item) => item.id === animal.id ? { ...item, fedAt: Date.now() } : item));
    onEarn(type.reward);
    setNote(`Collected ${type.produceIcon} for ${type.reward} coins!`);
  };

  const plots = Array.from({ length: GARDEN_PLOTS }, (_, index) => garden[index] ?? null);

  return <main className="your-house-page">
    <div className="house-page-top"><button onClick={onBack}>← Back</button><h1>Garden & Animals</h1><span><img src="/assets/pixel-coin.png" alt="" /> {coins}</span></div>

    <div className="builder-tabs">
      <button className={tab === 'garden' ? 'selected' : ''} onClick={() => setTab('garden')}>🌱 Garden</button>
      <button className={tab === 'animals' ? 'selected' : ''} onClick={() => setTab('animals')}>🐔 Animals</button>
    </div>

    {tab === 'garden' && <section className="builder-panel">
      <div className="seed-row">{crops.map((crop) => <button className={seed === crop.id ? 'selected' : ''} key={crop.id} onClick={() => setSeed(crop.id)}>
        <span>{crop.icon}</span><strong>{crop.name}</strong><small>{crop.seedPrice} coins · {crop.seconds}s · sells {crop.reward}</small>
      </button>)}</div>
      <div className="garden-grid">{plots.map((plot, index) => {
        if (!plot) return <button className="plot empty" key={index} onClick={() => plant(index)}><span>🟫</span><small>Plant {cropById(seed)?.name}</small></button>;
        const crop = cropById(plot.crop);
        const ready = cropReady(plot, now);
        const pct = Math.round(cropProgress(plot, now) * 100);
        return <button className={`plot ${ready ? 'ready' : 'growing'}`} key={index} onClick={() => harvest(index)}>
          <span>{ready ? crop?.icon : crop?.seedIcon}</span>
          <small>{ready ? `Harvest for ${crop?.reward}` : `${pct}% grown`}</small>
          <i className="plot-bar"><b style={{ width: `${pct}%` }} /></i>
        </button>;
      })}</div>
    </section>}

    {tab === 'animals' && <section className="builder-panel">
      <div className="seed-row">{animalTypes.map((type) => <button key={type.id} onClick={() => buyAnimal(type.id)} disabled={animals.length >= ANIMAL_PEN}>
        <span>{type.icon}</span><strong>Buy {type.name}</strong><small>{type.price} coins · {type.produceIcon} every {type.seconds}s</small>
      </button>)}</div>
      <div className="garden-grid">{animals.length ? animals.map((animal) => {
        const type = animalById(animal.type);
        const ready = produceReady(animal, now);
        const pct = Math.round(produceProgress(animal, now) * 100);
        return <button className={`plot ${ready ? 'ready' : 'growing'}`} key={animal.id} onClick={() => collect(animal)}>
          <span>{type?.icon}</span>
          <small>{ready ? `Collect ${type?.produceIcon} for ${type?.reward}` : `${pct}% ready`}</small>
          <i className="plot-bar"><b style={{ width: `${pct}%` }} /></i>
        </button>;
      }) : <p className="builder-hint">Your pen is empty. Buy an animal above to start your farm.</p>}</div>
      {animals.length >= ANIMAL_PEN && <p className="builder-hint">Your pen is full ({ANIMAL_PEN} animals).</p>}
    </section>}

    {note && <p className="builder-note">{note}</p>}
  </main>;
}
