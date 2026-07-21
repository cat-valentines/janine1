import { useState } from 'react';
import { gameList, type GameId } from '../game/gameList';

interface MoreGamesPageProps {
  onPlay: (id: GameId) => void;
  onBack: () => void;
}

const kinds = ['All', 'Educational', 'Adventure', 'Puzzle', 'Racing', 'Arcade', 'Scary'] as const;

export function MoreGamesPage({ onPlay, onBack }: MoreGamesPageProps) {
  const [kind, setKind] = useState<(typeof kinds)[number]>('All');
  const shown = kind === 'All' ? gameList
    : kind === 'Educational' ? gameList.filter((game) => game.learn)
    : gameList.filter((game) => game.kind === kind);

  return <main className="more-page">
    <header className="more-top">
      <button className="more-back" onClick={onBack}>← Back</button>
      <div>
        <h1>All games</h1>
        <p>{kind === 'Educational'
          ? 'Games that teach you something real while you play.'
          : `${gameList.length} games. Pick one and play — nothing to unlock first.`}</p>
      </div>
    </header>

    <div className="more-filters" role="tablist" aria-label="Filter games">
      {kinds.map((item) => <button
        className={kind === item ? 'on' : ''}
        role="tab"
        aria-selected={kind === item}
        key={item}
        onClick={() => setKind(item)}
      >{item}</button>)}
    </div>

    <div className="more-grid">
      {shown.map((game) => <button
        className={`more-card kind-${game.kind.toLowerCase()}`}
        key={game.id}
        onClick={() => onPlay(game.id)}
      >
        <span className="more-cover" aria-hidden="true">
          <span className="more-emoji">{game.icon}</span>
          <span className="more-kind">{game.kind}</span>
          {game.learn && <span className="more-edu-tag">📚 Educational</span>}
        </span>
        <span className="more-body">
          <strong>{game.name}</strong>
          <small>{game.blurb}</small>
          {game.learn && kind === 'Educational' && <small className="more-learn"><b>You'll learn:</b> {game.learn}</small>}
        </span>
      </button>)}
    </div>
  </main>;
}
