import type { CharacterId, GameState, LevelLayout, SettingId } from '../game/types';
import { characterCollectibles } from '../game/characters';
import { itemById } from '../shop/catalog';

const faces: Record<CharacterId, string> = { cottontail: '/assets/cottontail.png', momo: '/assets/pixel-penguin.png', toby: '/assets/pixel-fox.png' };
const characterNames: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo the penguin', toby: 'Toby the fox' };

interface GameBoardProps {
  state: GameState;
  character: CharacterId;
  setting: SettingId;
  ladders: LevelLayout['ladders'];
  equippedItem?: string;
}

export function GameBoard({ state, character, setting, ladders, equippedItem = '' }: GameBoardProps) {
  const cameraY = (9 - state.player.floor + 0.5) * 10;
  const portalIsNear = state.player.floor === 2 && Math.abs(state.player.x - 88) <= 14;
  return (
    <div className={`game-board theme-${setting}`}>
      <div className="house-camera" style={{ transformOrigin: `50% ${cameraY}%` }}>
      {Array.from({ length: 10 }, (_, index) => 9 - index).map((floor) => (
        <div className="floor" key={floor}>
          {floor === 1 && <img className="furniture dining-set" src="/assets/pixel-dining.png" alt="Pixel dining table and chairs" />}
          {floor === 2 && <><img className="furniture bedroom-set" src="/assets/pixel-bedroom.png" alt="Pixel bed, bedside table, and lamp" /><img className={`furniture wardrobe portal ${portalIsNear ? 'active' : ''}`} src="/assets/pixel-wardrobe.png" alt="Magical closet portal" />{portalIsNear && <span className="portal-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i></span>}</>}
          {floor === 4 && <img className="furniture kitchen-set" src="/assets/pixel-kitchen.png" alt="Pixel kitchen furniture" />}
          {setting === 'haunted' && floor === 6 && <img className="furniture haunted-decor" src="/assets/pixel-haunted-decor.png" alt="Pixel spiders, webs, skeleton, and flickering lights" />}
          {setting === 'haunted' && floor === 7 && <img className="furniture cauldron" src="/assets/pixel-cauldron.png" alt="Bubbling pixel cauldron" />}
          {floor < 9 && <span className={`${ladders[floor].speed ? 'ladder moving' : 'ladder'} ${(state.player.floor === floor || state.player.floor === floor + 1) && Math.abs(state.player.x - ladders[floor].x) <= 10 ? 'usable' : ''}`} style={{ left: `${ladders[floor].x}%` }} />}
          {state.coins.filter((coin) => coin.floor === floor).map((coin) => (
            <img className={`coin entity collectible-${character}`} src={characterCollectibles[character].asset} alt={`Pixel ${characterCollectibles[character].singular}`} style={{ left: `${coin.x}%` }} key={coin.x} />
          ))}
          {state.goldCoins.filter((coin) => coin.floor === floor).map((coin) => (
            <img className="gold-coin entity" src="/assets/pixel-coin.png" alt="Pixel coin" style={{ left: `${coin.x}%` }} key={coin.x} />
          ))}
          {state.powerUp?.floor === floor && (
            <span className="power entity" style={{ left: `${state.powerUp.x}%` }}>★</span>
          )}
          {state.cats.filter((cat) => cat.floor === floor).map((cat) => (
            <img className={`cat entity sprite walking facing-${cat.direction}`} src="/assets/calico-cat.png" alt="Walking calico cat" style={{ left: `${cat.x}%` }} key={cat.floor} />
          ))}
          {state.player.floor === floor && (
            <span className={`player entity walking ${Date.now() < state.invincibleUntil ? 'invincible' : ''}`} style={{ left: `${state.player.x}%` }}>
              <img className="sprite" src={faces[character]} alt={characterNames[character]} />{itemById(equippedItem) && <b className="game-worn-item">{itemById(equippedItem)?.icon}</b>}
            </span>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
