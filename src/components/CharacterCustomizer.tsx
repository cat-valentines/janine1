import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';

const accessories = [
  { id: 'red-cap', icon: '🧢', name: 'Explorer cap', price: 4 },
  { id: 'flower-crown', icon: '🌸', name: 'Flower crown', price: 6 },
  { id: 'royal-crown', icon: '👑', name: 'Royal crown', price: 10 },
  { id: 'star-wings', icon: '🪽', name: 'Star wings', price: 12 },
];

interface CharacterCustomizerProps {
  character: CharacterId;
  accessory: string;
  coins: number;
  ownedAccessories: string[];
  onBuy: (id: string, price: number) => void;
  onChange: (id: string) => void;
}

export function CharacterCustomizer({ character, accessory, coins, ownedAccessories, onBuy, onChange }: CharacterCustomizerProps) {
  return <section className="customizer-card">
    <div className="customizer-preview"><img src={characterAssets[character]} alt="Your customized character" />{accessory && <span>{accessories.find((item) => item.id === accessory)?.icon}</span>}</div>
    <div><p className="card-kicker">Royal Style Shop · <img className="gold-coin-icon" src="/assets/pixel-coin.png" alt="Gold coins" /> {coins} gold coins</p><h2>Choose a paid royal style</h2><p>Buy one of four looks with gold coins. Once unlocked, you can equip it anytime.</p>
      <div className="accessory-list">{accessories.map((item) => {
        const owned = ownedAccessories.includes(item.id);
        return <button className={accessory === item.id ? 'selected' : ''} disabled={!owned && coins < item.price} key={item.id} onClick={() => owned ? onChange(item.id) : onBuy(item.id, item.price)} title={item.name}>{item.icon}<small>{item.name}</small><b>{owned ? accessory === item.id ? 'Equipped' : 'Equip' : <><img className="gold-coin-icon" src="/assets/pixel-coin.png" alt="" /> {item.price} gold</>}</b></button>;
      })}</div>
    </div>
  </section>;
}
