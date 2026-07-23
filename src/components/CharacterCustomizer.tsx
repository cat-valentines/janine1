import { characterAssets } from '../game/characters';
import { ACCESSORIES as accessories } from '../game/accessories';
import type { CharacterId } from '../game/types';

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
    <div><p className="card-kicker">Royal Style Shop · <img className="gold-coin-icon" src="/assets/pixel-coin.png" alt="Gold coins" /> {coins} gold coins</p><h2>🌸 Pick a flower clip</h2><p>Buy a cute flower with gold coins to wear on top of your head. Once unlocked, you can equip it any time.</p>
      <div className="accessory-list">{accessories.map((item) => {
        const owned = ownedAccessories.includes(item.id);
        return <button className={accessory === item.id ? 'selected' : ''} disabled={!owned && coins < item.price} key={item.id} onClick={() => owned ? onChange(item.id) : onBuy(item.id, item.price)} title={item.name}>{item.icon}<small>{item.name}</small><b>{owned ? accessory === item.id ? 'Equipped' : 'Equip' : <><img className="gold-coin-icon" src="/assets/pixel-coin.png" alt="" /> {item.price} gold</>}</b></button>;
      })}</div>
    </div>
  </section>;
}
