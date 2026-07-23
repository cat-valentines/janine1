import type { CharacterId, GameState, LevelLayout, SettingId } from '../game/types';
import { laserPhase } from '../game/laser';
import { characterAssets, characterCollectibles } from '../game/characters';
import { itemById } from '../shop/catalog';

/** Only clothing is worn. A 🔮 Moon Spell is not a hat. */
const wornIcon = (id: string) => {
  const item = itemById(id);
  return item && item.category === 'clothing' ? item.icon : null;
};

const characterNames: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo the penguin', toby: 'Toby the fox', ollie: 'Ollie the otter', coral: 'Coral the clownfish', biscuit: 'Biscuit the puppy', koala: 'Bridey the koala', teddy: 'Adi the teddy bear', panda: 'Scarlet the panda', tiger: 'Elena the tiger', piggy: 'Piggy the pig', parrot: 'Parrot' };

interface GameBoardProps {
  state: GameState;
  character: CharacterId;
  setting: SettingId;
  ladders: LevelLayout['ladders'];
  walls: LevelLayout['walls'];
  lasers: LevelLayout['lasers'];
  equippedItem?: string;
  username?: string;
}

export function GameBoard({ state, character, setting, ladders, walls, lasers, equippedItem = '', username = 'You' }: GameBoardProps) {
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
          {state.magicDoor?.floor === floor && (
            <span className="magic-door entity" style={{ left: `${state.magicDoor.x}%` }} aria-label="A magic door appeared">
              <b>🚪</b>
              <i className="door-sparkles" aria-hidden="true"><s>✦</s><s>✧</s><s>✦</s><s>✧</s></i>
            </span>
          )}
          {lasers.filter((laser) => laser.floor === floor).map((laser) => {
            const phase = laserPhase(laser, state.time);
            return <span className={`laser-beam ${phase}`} key={`laser-${laser.floor}`} aria-hidden="true" />;
          })}
          {walls.filter((wall) => wall.floor === floor).map((wall) => (
            <span className="brick-wall" style={{ left: `${wall.x}%` }} key={`wall-${wall.floor}`} aria-label="A brick wall to hide behind" />
          ))}
          {state.secrets.filter((secret) => secret.floor === floor).map((secret) => (
            <span className="secret entity" style={{ left: `${secret.x}%` }} key={secret.id} aria-label="A secret power">?</span>
          ))}
          {state.cats.filter((cat) => cat.floor === floor).map((cat) => (
            <img className={`cat entity sprite walking facing-${cat.direction}`} src="/assets/calico-cat.png" alt="Walking calico cat" style={{ left: `${cat.x}%` }} key={cat.id} />
          ))}
          {state.player.floor === floor && (
            <span className={`player entity walking ${Date.now() < state.invincibleUntil ? 'invincible' : ''} ${Date.now() < state.invisibleUntil ? 'invisible' : ''}`} style={{ left: `${state.player.x}%` }}>
              <b className="player-name">{username}</b><img className="sprite" src={characterAssets[character]} alt={characterNames[character]} />{wornIcon(equippedItem) && <b className="game-worn-item">{wornIcon(equippedItem)}</b>}
            </span>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
