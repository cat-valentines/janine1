import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameBoard } from '../components/GameBoard';
import { GameHud } from '../components/GameHud';
import { TouchControls } from '../components/TouchControls';
import { COIN_SCORE, HIT_INVINCIBILITY_MS, POWER_INVINCIBILITY_MS, POWER_SCORE } from '../game/constants';
import { crossesEnemy, isNear, touchesEnemy } from '../game/collision';
import { actionFromKey, type GameAction } from '../game/keyboard';
import { createGameState, generateLevel } from '../game/levelGenerator';
import { climb, enterSecretPortal, moveHorizontal } from '../game/movement';
import { updateCats, updateLadders } from '../game/patrol';
import type { GameSelection, GameState } from '../game/types';
import { characterCollectibles } from '../game/characters';

interface GamePageProps { selection: GameSelection; onExit: () => void }

export function GamePage({ selection, onExit }: GamePageProps) {
  const [level, setLevel] = useState(1);
  const layout = useMemo(() => generateLevel(selection.setting, level), [selection.setting, level]);
  const [state, setState] = useState(() => createGameState(layout));
  const [ladders, setLadders] = useState(layout.ladders);
  const lastFrame = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const collected = layout.coins.length - state.coins.length;
  const collectedGold = layout.goldCoins.length - state.goldCoins.length;

  const act = useCallback((action: GameAction) => {
    setState((current) => {
      if (current.status !== 'playing') return current;
      const portalExit = action === 'up' ? enterSecretPortal(current.player) : null;
      const player = action === 'left' ? moveHorizontal(current.player, -1)
        : action === 'right' ? moveHorizontal(current.player, 1)
        : portalExit ?? climb(current.player, action === 'up' ? 1 : -1, ladders);
      const coins = current.coins.filter((coin) => !isNear(player, coin));
      const goldCoins = current.goldCoins.filter((coin) => !isNear(player, coin));
      const gainedCoins = current.coins.length - coins.length;
      const gainedGold = current.goldCoins.length - goldCoins.length;
      const gotPower = current.powerUp ? isNear(player, current.powerUp) : false;
      const won = coins.length === 0 && goldCoins.length === 0 && player.floor === 9;
      const crossedCat = Date.now() >= current.invincibleUntil
        && crossesEnemy(current.player, player, current.cats);
      const lives = crossedCat ? current.lives - 1 : current.lives;
      return {
        ...current, player, coins, goldCoins,
        powerUp: gotPower ? null : current.powerUp,
        invincibleUntil: gotPower ? Date.now() + POWER_INVINCIBILITY_MS : crossedCat ? Date.now() + HIT_INVINCIBILITY_MS : current.invincibleUntil,
        caughtUntil: crossedCat ? Date.now() + 1200 : current.caughtUntil,
        lives,
        score: current.score + (gainedCoins + gainedGold) * COIN_SCORE + (gotPower ? POWER_SCORE : 0),
        status: lives === 0 ? 'lost' : won ? 'won' : current.status,
      };
    });
  }, [ladders]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = actionFromKey(event.key);
      if (action) { event.preventDefault(); act(action); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [act]);

  useEffect(() => {
    const tick = (time: number) => {
      const delta = lastFrame.current === null ? 0 : Math.min((time - lastFrame.current) / 1000, 0.05);
      lastFrame.current = time;
      setLadders((current) => updateLadders(current, delta));
      setState((current): GameState => {
        if (current.status !== 'playing') return current;
        const cats = updateCats(current.cats, delta);
        if (Date.now() >= current.invincibleUntil && touchesEnemy(current.player, cats)) {
          const lives = current.lives - 1;
          return { ...current, cats, lives, caughtUntil: Date.now() + 1200, invincibleUntil: Date.now() + HIT_INVINCIBILITY_MS, status: lives === 0 ? 'lost' : 'playing' };
        }
        return { ...current, cats };
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);

  const restart = () => { lastFrame.current = null; setLadders(layout.ladders); setState(createGameState(layout)); };
  const nextLevel = () => {
    const next = level + 1;
    const nextLayout = generateLevel(selection.setting, next);
    lastFrame.current = null;
    setLevel(next);
    setLadders(nextLayout.ladders);
    setState(createGameState(nextLayout));
  };
  return (
    <main className="game-page page-shell">
      <div className="game-top"><button className="ghost" onClick={onExit}>← Quest home</button><GameHud lives={state.lives} coins={collected} totalCoins={layout.coins.length} score={state.score} level={level} collectibleAsset={characterCollectibles[selection.character].asset} goldCoins={collectedGold} totalGoldCoins={layout.goldCoins.length} /></div>
      <GameBoard state={state} character={selection.character} setting={selection.setting} ladders={ladders} equippedItem={selection.equippedItem} />
      <p className={`game-tip ${Date.now() < state.caughtUntil ? 'caught-message' : ''}`}>{Date.now() < state.caughtUntil ? '🐾 A cat caught you! One heart was removed.' : level === 1 ? 'Level 1: the first three floors are safe. Stand near a glowing ladder and press ↑ or W.' : `Level ${level}: more cats and moving ladders—time your climb carefully!`}</p>
      <TouchControls onAction={act} />
      {state.status !== 'playing' && <div className="result-overlay"><div className="result-card"><h2>{state.status === 'won' ? `Level ${level} Complete! ✨` : 'Game Over'}</h2><p>{state.status === 'won' ? `You collected every coin and ${characterCollectibles[selection.character].singular}, then finished all 10 floors. Level ${level + 1} will be harder!` : 'The cats caught your toy hero.'}</p><button onClick={state.status === 'won' ? nextLevel : restart}>{state.status === 'won' ? `Start Level ${level + 1}` : 'Try again'}</button><button className="ghost" onClick={onExit}>Change hero</button></div></div>}
    </main>
  );
}
