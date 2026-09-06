import { useState } from 'react';
import { loadPets, buyFood, buySupply, dyePet, PET_SPECIES, type Pet, type PetsState } from '../lib/pets';
import { PET_SHOP, CATEGORY_LABEL, DYE_COLOURS, DYE_PRICE, RESTING_SPOTS, type ShopCategory, type ShopItem } from '../lib/petShop';

interface PetShopPanelProps {
  coins: number;
  onSpendCoins: (amount: number) => void;
  onChange?: () => void;
}

const ORDER: ShopCategory[] = ['food', 'toy', 'bowl', 'bed', 'house', 'special'];

/** The Pet Shop: buy food, toys, bowls, beds, pet houses, and dye your pet. */
export function PetShopPanel({ coins, onSpendCoins, onChange }: PetShopPanelProps) {
  const [state, setState] = useState<PetsState>(() => loadPets());
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState('#e0685f');
  // With several pets you have to say which one you're dyeing.
  const [dyeId, setDyeId] = useState<string | null>(null);
  const refresh = (next: PetsState) => { setState({ ...next }); onChange?.(); };
  const chosen: Pet | null = state.pets.find((p) => p.id === dyeId) ?? state.pets.find((p) => p.id === state.walkingIds[0]) ?? state.pets[0] ?? null;

  const buy = (item: ShopItem) => {
    if (coins < item.price) { setNote(`You need ${item.price} coins for the ${item.name}.`); return; }
    onSpendCoins(item.price);
    if (item.category === 'food') { refresh(buyFood(5)); setNote(`🍖 Bought ${item.name} — +5 food!`); }
    else { refresh(buySupply(item.id)); setNote(`🛍️ Bought ${item.name} — it's in your house!`); }
  };
  const dye = (colour: string) => {
    if (!chosen) { setNote('Adopt a pet first, then you can dye it!'); return; }
    if (coins < DYE_PRICE) { setNote(`You need ${DYE_PRICE} coins to dye your pet.`); return; }
    onSpendCoins(DYE_PRICE);
    refresh(dyePet(chosen.id, colour));
    setNote(`🎨 Dyed ${chosen.name} a new colour! See it in your house & the market.`);
  };

  return <div className="petshop">
    <div className="petshop-bar"><strong>🛍️ Pet Shop</strong><span>🪙 {coins}</span></div>

    {ORDER.map((cat) => {
      const items = PET_SHOP.filter((i) => i.category === cat);
      if (!items.length) return null;
      return <div className="petshop-cat" key={cat}>
        <h4>{CATEGORY_LABEL[cat]}</h4>
        <div className="petshop-grid">
          {items.map((item) => {
            const owned = state.supplies[item.id] ?? 0;
            // Only one species will ever use it, so say so — and warn if you
            // haven't got that pet, rather than letting it sit unused in the yard.
            const forSpecies = item.species ? PET_SPECIES[item.species] : null;
            const haveOne = !item.species || state.pets.some((p) => p.species === item.species);
            const isHome = item.id in RESTING_SPOTS;
            return <button key={item.id} className={`petshop-item ${!haveOne ? 'no-pet' : ''}`} disabled={coins < item.price} onClick={() => buy(item)}>
              <span className="petshop-emoji">{item.emoji}</span>
              <b>{item.name}</b>
              {forSpecies && <em>{isHome ? 'only' : 'for'} {forSpecies.name.toLowerCase()}s {forSpecies.emoji}</em>}
              {forSpecies && !haveOne && <u>you have no {forSpecies.name.toLowerCase()} yet</u>}
              <i>🪙 {item.price}{owned > 0 ? ` · owned ${owned}` : ''}</i>
            </button>;
          })}
        </div>
      </div>;
    })}

    <div className="petshop-cat petshop-dye">
      <h4>🎨 Pet Dye <small>· {DYE_PRICE}🪙 · {chosen ? `dye ${chosen.name}` : 'adopt a pet first'}</small></h4>
      {state.pets.length > 1 && <div className="petshop-whichpet">
        {state.pets.map((pet) => <button
          key={pet.id}
          className={chosen?.id === pet.id ? 'on' : ''}
          onClick={() => setDyeId(pet.id)}
        >{PET_SPECIES[pet.species].emoji} {pet.name}</button>)}
      </div>}
      <div className="petshop-dyes">
        {DYE_COLOURS.map((c) => <button key={c} className="petshop-swatch" style={{ background: c }} disabled={!chosen || coins < DYE_PRICE} onClick={() => dye(c)} aria-label={`dye ${c}`} />)}
        <label className="petshop-custom">
          <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button disabled={!chosen || coins < DYE_PRICE} onClick={() => dye(custom)}>Dye any colour</button>
        </label>
      </div>
    </div>

    {note && <p className="petshop-note">{note}</p>}
    <p className="pets-hint">Everything you buy shows up in your <b>house</b>, and a dyed pet keeps its colour wherever it walks. Pet houses and perches only suit the animal they were made for — a parakeet roosts in the 🐦 birdcage or on its 🪵 perch, never in the 🏯 cat tower.</p>
  </div>;
}
