import { useState } from 'react';
import { loadPets, adoptPet, feedPet, buyFood, setWalking, toggleWalking, releasePet, PET_SPECIES, PET_ORDER, FOOD_PRICE, MAX_WALKING, type PetSpecies, type PetsState } from '../lib/pets';
import { PetShopPanel } from './PetShopPanel';

interface PetsPanelProps {
  coins: number;
  onSpendCoins: (amount: number) => void;
  onGoHouse?: () => void;
  onGoMarket?: () => void;
}

/** Adopt pets, buy food, feed them, and pick which ones walk with you. */
export function PetsPanel({ coins, onSpendCoins, onGoHouse, onGoMarket }: PetsPanelProps) {
  const [state, setState] = useState<PetsState>(() => loadPets());
  const [note, setNote] = useState('');
  const [shopOpen, setShopOpen] = useState(false);
  const refresh = (next: PetsState) => setState({ ...next });

  // Everyone you've ticked to come along, in the order you adopted them.
  const walking = state.pets.filter((p) => state.walkingIds.includes(p.id));
  const walkNames = walking.map((p) => p.name).join(', ');
  const walk = (id: string) => {
    const result = toggleWalking(id);
    refresh(result.state);
    if (result.full) setNote(`You can walk ${MAX_WALKING} pets at once — untick one first.`);
    else setNote('');
  };
  const walkAll = () => {
    // Tick everybody (up to the parade limit), or untick everybody if all are out.
    const allOut = walking.length === Math.min(state.pets.length, MAX_WALKING);
    refresh(setWalking(allOut ? [] : state.pets.map((p) => p.id)));
    setNote(allOut ? 'All your pets are staying home.' : '🐾 Off you go — everyone comes along!');
  };

  const adopt = (species: PetSpecies) => {
    const price = PET_SPECIES[species].price;
    if (coins < price) { setNote(`You need ${price} coins to adopt a ${PET_SPECIES[species].name}.`); return; }
    onSpendCoins(price);
    refresh(adoptPet(species, ''));
    setNote(`🎉 You adopted a ${PET_SPECIES[species].name}! Give it a name and keep it fed.`);
  };
  const buy = (n: number) => {
    const price = n * FOOD_PRICE;
    if (coins < price) { setNote(`You need ${price} coins for ${n} food.`); return; }
    onSpendCoins(price);
    refresh(buyFood(n));
    setNote(`🥫 Bought ${n} food.`);
  };
  const feed = (id: string) => {
    if (state.food <= 0) { setNote('No food left — buy some first!'); return; }
    refresh(feedPet(id));
  };

  const hungerClass = (f: number) => (f > 60 ? 'happy' : f > 30 ? 'peckish' : 'hungry');

  return <div className="pets-panel">
    <div className="pets-food-bar">
      <span>🥫 <b>{state.food}</b> food</span>
      <span className="pets-coins">🪙 {coins}</span>
      <button onClick={() => buy(1)}>Buy 1 · {FOOD_PRICE}🪙</button>
      <button onClick={() => buy(5)}>Buy 5 · {FOOD_PRICE * 5}🪙</button>
    </div>

    <button className="petshop-open" onClick={() => setShopOpen((s) => !s)}>🛍️ {shopOpen ? 'Close the Pet Shop' : 'Open the Pet Shop'}</button>
    {shopOpen && <PetShopPanel coins={coins} onSpendCoins={onSpendCoins} onChange={() => setState(loadPets())} />}

    {state.pets.length > 1 && <div className="pets-walking-bar">
      <span>{walking.length
        ? <>🐾 Walking with you: <b>{walkNames}</b></>
        : <>🏠 Nobody is coming along — tap <b>Walk</b> on the pets you want.</>}</span>
      <button onClick={walkAll}>{walking.length === Math.min(state.pets.length, MAX_WALKING) ? 'Leave them all home' : 'Walk them all'}</button>
    </div>}

    {state.pets.length > 0 && <div className="pets-list">
      {state.pets.map((pet) => {
        const info = PET_SPECIES[pet.species];
        const out = state.walkingIds.includes(pet.id);
        return <div key={pet.id} className={`pet-card ${out ? 'active' : ''}`}>
          <span className="pet-emoji">{info.emoji}</span>
          <div className="pet-body">
            <strong>{pet.name} {out && <em>· walking with you</em>}</strong>
            <div className={`pet-hunger ${hungerClass(pet.fullness)}`}><i style={{ width: `${pet.fullness}%` }} /></div>
            <small>{pet.fullness > 60 ? 'Happy & full' : pet.fullness > 30 ? 'Getting peckish' : '😿 Hungry — feed me!'}</small>
          </div>
          <div className="pet-actions">
            <button className="pet-feed" onClick={() => feed(pet.id)} disabled={state.food <= 0 || pet.fullness >= 100}>🍖 Feed</button>
            <button className={`pet-walk ${out ? 'on' : ''}`} aria-pressed={out} onClick={() => walk(pet.id)}>{out ? '✓ Walking' : '🐾 Walk'}</button>
            <button className="pet-release" title="Set free" onClick={() => { if (confirm(`Set ${pet.name} free?`)) refresh(releasePet(pet.id)); }}>✕</button>
          </div>
        </div>;
      })}
    </div>}

    <div className="pets-adopt">
      <strong>🐾 Adopt a pet</strong>
      <div className="pets-adopt-grid">
        {PET_ORDER.map((species) => {
          const info = PET_SPECIES[species];
          return <button key={species} className="pet-adopt-card" onClick={() => adopt(species)} disabled={coins < info.price}>
            <span>{info.emoji}</span>
            <b>{info.name}</b>
            <small>{info.blurb}</small>
            <i>🪙 {info.price}</i>
          </button>;
        })}
      </div>
    </div>

    {walking.length > 0 && (onGoHouse || onGoMarket) && <div className="pets-take">
      <span>🐾 Take <b>{walkNames}</b> for a walk:</span>
      <div className="pets-take-btns">
        {onGoHouse && <button className="pets-take-house" onClick={onGoHouse}>🏡 To my house</button>}
        {onGoMarket && <button className="pets-take-market" onClick={onGoMarket}>🏬 To the market</button>}
      </div>
    </div>}

    {note && <p className="pets-note">{note}</p>}
    <p className="pets-hint">Every pet you tick comes along and acts like a real animal — they follow you when you move and mill about when you stop, up to {MAX_WALKING} at once. Feed them to keep them happy! Each one naps in its <b>own</b> home: a bird roosts in the birdcage or on its perch, a cat curls up in the cat tower.</p>
  </div>;
}
