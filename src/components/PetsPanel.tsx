import { useState } from 'react';
import { loadPets, adoptPet, feedPet, buyFood, setActivePet, releasePet, PET_SPECIES, PET_ORDER, FOOD_PRICE, type PetSpecies, type PetsState } from '../lib/pets';

interface PetsPanelProps {
  coins: number;
  onSpendCoins: (amount: number) => void;
}

/** Adopt pets, buy food, feed them, and pick which one walks with you. */
export function PetsPanel({ coins, onSpendCoins }: PetsPanelProps) {
  const [state, setState] = useState<PetsState>(() => loadPets());
  const [note, setNote] = useState('');
  const refresh = (next: PetsState) => setState({ ...next });

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

    {state.pets.length > 0 && <div className="pets-list">
      {state.pets.map((pet) => {
        const info = PET_SPECIES[pet.species];
        const active = state.activePetId === pet.id;
        return <div key={pet.id} className={`pet-card ${active ? 'active' : ''}`}>
          <span className="pet-emoji">{info.emoji}</span>
          <div className="pet-body">
            <strong>{pet.name} {active && <em>· walking with you</em>}</strong>
            <div className={`pet-hunger ${hungerClass(pet.fullness)}`}><i style={{ width: `${pet.fullness}%` }} /></div>
            <small>{pet.fullness > 60 ? 'Happy & full' : pet.fullness > 30 ? 'Getting peckish' : '😿 Hungry — feed me!'}</small>
          </div>
          <div className="pet-actions">
            <button className="pet-feed" onClick={() => feed(pet.id)} disabled={state.food <= 0 || pet.fullness >= 100}>🍖 Feed</button>
            <button className={`pet-walk ${active ? 'on' : ''}`} onClick={() => refresh(setActivePet(active ? null : pet.id))}>{active ? '✓ Walking' : '🐾 Walk'}</button>
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

    {note && <p className="pets-note">{note}</p>}
    <p className="pets-hint">Set one pet <b>Walking</b> and it follows you into your <b>house</b> and the <b>town market</b> — feed it to keep it happy!</p>
  </div>;
}
