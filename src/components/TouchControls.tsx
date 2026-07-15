import type { GameAction } from '../game/keyboard';

interface TouchControlsProps { onAction: (action: GameAction) => void }

export function TouchControls({ onAction }: TouchControlsProps) {
  return (
    <div className="touch-controls" aria-label="Touch controls">
      <button onClick={() => onAction('left')} aria-label="Move left">←</button>
      <div>
        <button onClick={() => onAction('up')} aria-label="Climb up">↑</button>
        <button onClick={() => onAction('down')} aria-label="Climb down">↓</button>
      </div>
      <button onClick={() => onAction('right')} aria-label="Move right">→</button>
    </div>
  );
}
