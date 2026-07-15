import { itemById, shopItems, type ShopItem } from '../shop/catalog';

interface VillageShopInteriorProps {
  kind: 'magic' | 'clothing' | 'furniture'; coins: number; ownedItems: string[]; equippedItem: string;
  onBuy: (item: ShopItem) => void; onEquip: (id: string) => void; onResell: (item: ShopItem) => void; onClose: () => void;
}

export function VillageShopInterior(props: VillageShopInteriorProps) {
  const { kind, coins, ownedItems, equippedItem, onBuy, onEquip, onResell, onClose } = props;
  const items = shopItems.filter((item) => item.category === kind);
  const equipped = itemById(equippedItem);
  return <main className={`shop-interior interior-${kind}`}><button className="interior-exit" onClick={onClose}>← Leave Shop</button><section><h1>{kind} shop</h1><p>Walked inside! Buy, equip, change, or resell your things.</p><div className="interior-items">{items.map((item) => { const owned = ownedItems.includes(item.id); return <article key={item.id}><span>{item.icon}</span><strong>{item.name}</strong><small><img src="/assets/pixel-coin.png" alt="" /> {item.price}</small>{owned ? <><button onClick={() => onEquip(item.id)}>{equippedItem === item.id ? 'Wearing' : 'Wear'}</button><button onClick={() => onResell(item)}>Resell for {Math.ceil(item.price / 2)}</button></> : <button disabled={coins < item.price} onClick={() => onBuy(item)}>Buy</button>}</article>; })}</div>{equipped && <p className="equipped-note">Currently wearing: {equipped.icon} {equipped.name}</p>}</section></main>;
}
