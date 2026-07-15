import { useEffect, useMemo, useState } from 'react';
import { TOTAL_LEVELS, getRiddle, levelReward } from '../game/riddleScenes';

interface RiddlePageProps {
  startLevel: number;
  onSolved: (level: number, coins: number) => void;
  onBack: () => void;
}

export function RiddlePage({ startLevel, onSolved, onBack }: RiddlePageProps) {
  const [level, setLevel] = useState(Math.min(Math.max(1, startLevel), TOTAL_LEVELS));
  const [state, setState] = useState<'playing' | 'right' | 'wrong'>('playing');
  const [wrongId, setWrongId] = useState('');
  const [tries, setTries] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const riddle = useMemo(() => getRiddle(level), [level]);
  const reward = levelReward(level);

  useEffect(() => { setState('playing'); setWrongId(''); setTries(0); setShowHint(false); }, [level]);

  const answer = (id: string, correct: boolean) => {
    if (state === 'right') return;
    if (correct) { setState('right'); onSolved(level, reward); return; }
    setWrongId(id);
    setState('wrong');
    setTries((n) => n + 1);
    setTimeout(() => { setState('playing'); setWrongId(''); }, 450);
  };

  return <main className="riddle-page">
    <div className="quest-top-row">
      <button onClick={onBack}>← Back</button>
      <span>🧩 Level {level} of {TOTAL_LEVELS}</span>
    </div>

    <div className="riddle-shell">
      <div className="riddle-bar"><i style={{ width: `${(level / TOTAL_LEVELS) * 100}%` }} /></div>

      <div className="riddle-head">
        <span className="riddle-kind">{riddle.kind}</span>
        {riddle.story && <p className="riddle-story">{riddle.story}</p>}
        <p className="riddle-ask">{riddle.question}</p>
      </div>

      {riddle.clues && <ul className="riddle-clues">
        {riddle.clues.map((clue) => <li key={clue}>🔍 {clue}</li>)}
      </ul>}

      {/* The scene itself — everything in here is clickable. */}
      <div className={`riddle-scene bg-${riddle.background}`}>
        {riddle.scene.map((object) => <button
          className={`scene-thing ${wrongId === object.id ? 'wrong' : ''} ${state === 'right' && object.correct ? 'right' : ''} ${object.icon ? '' : 'is-answer'}`}
          style={{
            left: `${object.x}%`,
            top: `${object.y}%`,
            fontSize: `${object.size ?? 2}rem`,
            transform: object.flip ? 'scaleX(-1)' : undefined,
          }}
          key={object.id}
          onClick={() => answer(object.id, object.correct)}
          disabled={state === 'right'}
          aria-label={object.name ?? object.icon}
        >
          {object.icon && <span className="scene-icon">{object.icon}</span>}
          {object.worn && object.worn.length > 0 && <span className="scene-worn">{object.worn.join('')}</span>}
          {object.name && <b className="scene-name">{object.name}</b>}
        </button>)}
      </div>

      {state === 'wrong' && <p className="riddle-nope">Not that one — look again!</p>}
      {state !== 'right' && tries >= 2 && !showHint && <button className="riddle-hint-btn" onClick={() => setShowHint(true)}>🤔 I'm stuck — give me a hint</button>}
      {state !== 'right' && showHint && <p className="riddle-hint">💡 {riddle.explain}</p>}
    </div>

    {state === 'right' && <div className="quest-over">
      <div className="quest-over-card win">
        <h2>🎉 Solved it!</h2>
        <p>{riddle.explain}</p>
        {reward > 0 && <p>You earned <strong>🪙 {reward} gold</strong> for reaching level {level}!</p>}
        {level < TOTAL_LEVELS
          ? <button onClick={() => setLevel((n) => n + 1)}>Level {level + 1} →</button>
          : <p><strong>🏆 You finished all {TOTAL_LEVELS} levels!</strong></p>}
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
