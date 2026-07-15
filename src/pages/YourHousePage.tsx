import { itemById, shopItems } from '../shop/catalog';

interface YourHousePageProps {
  coins: number; ownsHouse: boolean; ownedItems: string[]; placedFurniture: string[];
  onBuyHouse: () => void; onToggleFurniture: (id: string) => void; onInvite: () => void; onClose: () => void;
}

export function YourHousePage(props: YourHousePageProps) {
  const { coins, ownsHouse, ownedItems, placedFurniture, onBuyHouse, onToggleFurniture, onInvite, onClose } = props;
  const furniture = shopItems.filter((item) => item.category === 'furniture' && ownedItems.includes(item.id));
  return <main className="your-house-page"><div className="house-page-top"><button onClick={onClose}>← Menu</button><h1>Your House</h1><span><img src="/assets/pixel-coin.png" alt="" /> {coins}</span></div>
    {!ownsHouse ? <section className="house-for-sale"><span>🏡</span><h2>Country Cottage</h2><p>Buy this private home and decorate it with furniture from the village shop.</p><strong>20 coins</strong><button disabled={coins < 20} onClick={onBuyHouse}>{coins < 20 ? 'Collect more coins' : 'Buy House'}</button></section>
      : <section className="owned-house"><div className="house-room"><h2>My Private Cottage</h2>{placedFurniture.length ? placedFurniture.map((id) => <span className="placed-furniture" key={id}>{itemById(id)?.icon}</span>) : <p>Choose furniture below to decorate your room.</p>}</div><p>Only you and friends who accepted your invitation can enter.</p><button className="invite-home" onClick={onInvite}>Invite Friends</button><h2>Your Furniture</h2><div className="house-furniture-list">{furniture.length ? furniture.map((item) => <button onClick={() => onToggleFurniture(item.id)} key={item.id}><span>{item.icon}</span>{placedFurniture.includes(item.id) ? 'Remove' : 'Place'} {item.name}</button>) : <p>Buy furniture from the Furniture Shop first.</p>}</div></section>}
  </main>;
}
