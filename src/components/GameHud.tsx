interface GameHudProps {
  lives: number;
  coins: number;
  totalCoins: number;
  score: number;
  level: number;
  collectibleAsset: string;
  goldCoins: number;
  totalGoldCoins: number;
}

export function GameHud({ lives, coins, totalCoins, score, level, collectibleAsset, goldCoins, totalGoldCoins }: GameHudProps) {
  return (
    <div className="game-hud" aria-label="Game status">
      <span>❤️ {lives}</span>
      <span><img className="hud-collectible" src={collectibleAsset} alt="" /> {coins}/{totalCoins}</span>
      <span><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {goldCoins}/{totalGoldCoins}</span>
      <span>⭐ {score}</span>
      <span>Level {level}</span>
      <span>Island 1</span>
    </div>
  );
}
