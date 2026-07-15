import { VoxelPreview } from '../components/VoxelPreview';
import { validWorld } from '../game/voxel';

interface YourHousePageProps {
  coins: number; ownsHouse: boolean;
  houseWorld: string; houseName: string; houseSource: '' | 'built' | 'bought';
  onBuildOwn: () => void; onGoInside: () => void; onOpenGarden: () => void; onOpenMarket: () => void;
  onInvite: () => void; onClose: () => void;
}

export function YourHousePage(props: YourHousePageProps) {
  const { coins, ownsHouse, houseWorld, houseName, houseSource, onBuildOwn, onGoInside, onOpenGarden, onOpenMarket, onInvite, onClose } = props;
  return <main className="your-house-page">
    <div className="house-page-top"><button onClick={onClose}>← Menu</button><h1>Your House</h1><span><img src="/assets/pixel-coin.png" alt="" /> {coins}</span></div>

    {!ownsHouse ? <section className="house-choice">
      <h2>How do you want your house?</h2>
      <p>Start from an empty plot and build it block by block in 3D, or buy one another player already built.</p>
      <div className="house-choice-row">
        <button className="house-choice-card" onClick={onBuildOwn}>
          <span>🔨</span>
          <strong>Build from scratch</strong>
          <small>Empty 3D plot, free. Place blocks, then walk inside your house.</small>
        </button>
        <button className="house-choice-card" onClick={onOpenMarket}>
          <span>🏘️</span>
          <strong>Buy from a player</strong>
          <small>Houses other players built and are reselling. Costs coins.</small>
        </button>
      </div>
    </section>
      : <section className="owned-house">
        <h2>{houseName || 'My House'}</h2>
        {validWorld(houseWorld) && <VoxelPreview world={houseWorld} className="voxel-preview big" />}
        <p>{houseSource === 'bought' ? 'You bought this house from another player.' : 'You built this house block by block.'} Only you and friends who accepted your invitation can come inside.</p>
        <div className="house-choice-row">
          <button className="house-choice-card small" onClick={onGoInside}><span>🚶</span><strong>Go inside</strong><small>Walk around in 3D</small></button>
          <button className="house-choice-card small" onClick={onBuildOwn}><span>🔨</span><strong>Keep building</strong><small>Place blocks and furniture</small></button>
        </div>
        <div className="house-choice-row">
          <button className="house-choice-card small" onClick={onOpenGarden}><span>🌱</span><strong>Garden & animals</strong><small>Grow crops, raise animals</small></button>
          <button className="house-choice-card small" onClick={onOpenMarket}><span>🏘️</span><strong>Houses for sale</strong><small>Buy or sell a house</small></button>
        </div>
        <button className="invite-home" onClick={onInvite}>Invite Friends</button>
      </section>}
  </main>;
}
