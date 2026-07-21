import { useEffect, useRef, useState } from 'react';
import { TOTAL_LEVELS, askGatekeeper, localJudge, openingLine, rewardFor, tierFor, triesFor, type Line } from '../game/proveHuman';
import { storage } from '../lib/storage';

const LEVEL_KEY = 'proveHumanLevel';

export function ProveHumanPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const start = Math.min(TOTAL_LEVELS, Math.max(1, parseInt(storage.get(LEVEL_KEY) ?? '1', 10) || 1));
  const [level, setLevel] = useState(start);
  const [lines, setLines] = useState<Line[]>([{ role: 'robot', text: openingLine(start) }]);
  const [input, setInput] = useState('');
  const [tries, setTries] = useState(triesFor(start));
  const [phase, setPhase] = useState<'chat' | 'passed' | 'failed' | 'won'>('chat');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [lines, thinking]);

  const tier = tierFor(level);

  const beginLevel = (lvl: number) => {
    setLevel(lvl);
    setLines([{ role: 'robot', text: openingLine(lvl) }]);
    setTries(triesFor(lvl));
    setInput('');
    setPhase('chat');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || thinking || phase !== 'chat') return;
    const history: Line[] = [...lines, { role: 'you', text }];
    setLines(history);
    setInput('');
    setThinking(true);
    let verdict: { reply: string; pass: boolean };
    try { verdict = await askGatekeeper(level, history); }
    catch { verdict = localJudge(level, text); }
    setThinking(false);
    setLines((prev) => [...prev, { role: 'robot', text: verdict.reply }]);
    if (verdict.pass) {
      onScore(rewardFor(level));
      const next = level + 1;
      storage.set(LEVEL_KEY, String(Math.min(TOTAL_LEVELS, next)));
      setPhase(next > TOTAL_LEVELS ? 'won' : 'passed');
    } else {
      const left = tries - 1;
      setTries(left);
      if (left <= 0) setPhase('failed');
    }
  };

  return <main className="human-page">
    <header className="human-top">
      <button onClick={onBack}>← Leave</button>
      <div className="human-gate">
        <b>{tier.emoji} Gate {level}<small>/{TOTAL_LEVELS}</small></b>
        <span>{tier.name}</span>
      </div>
      <div className="human-tries" aria-label={`${tries} tries left`}>
        {Array.from({ length: triesFor(level) }, (_, i) => <i key={i} className={i < tries ? 'on' : ''}>♥</i>)}
      </div>
    </header>

    <p className="human-goal">🎯 Convince the robot you're a <b>real human</b>. Say human stuff — feelings, memories, jokes, messy details.</p>

    <div className="human-chat" ref={scroller}>
      {lines.map((line, i) => <div key={i} className={`human-msg ${line.role}`}>
        {line.role === 'robot' && <span className="human-avatar">{tier.emoji}</span>}
        <p>{line.text}</p>
      </div>)}
      {thinking && <div className="human-msg robot"><span className="human-avatar">{tier.emoji}</span><p className="human-typing"><i /><i /><i /></p></div>}
    </div>

    {phase === 'chat' && <div className="human-input">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        placeholder={thinking ? 'The robot is analysing you…' : 'Type something a human would say…'}
        maxLength={500}
        disabled={thinking}
        autoFocus
      />
      <button onClick={send} disabled={thinking || !input.trim()}>Send</button>
    </div>}

    {phase === 'passed' && <div className="human-over">
      <div className="human-over-card win">
        <h2>✅ Gate {level} opened!</h2>
        <p>The robot believed you. You earned <strong>🪙 {rewardFor(level)} coins</strong>. Gate {level + 1} of {TOTAL_LEVELS} is even more suspicious…</p>
        <button onClick={() => beginLevel(level + 1)}>Next gate →</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}

    {phase === 'failed' && <div className="human-over">
      <div className="human-over-card">
        <h2>🚫 Access denied!</h2>
        <p>The robot wasn't convinced you're human. Take a breath and try Gate {level} again — be messier, more personal, more <em>you</em>.</p>
        <button onClick={() => beginLevel(level)}>🔄 Try again</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}

    {phase === 'won' && <div className="human-over">
      <div className="human-over-card win">
        <h2>🏆 You out-humaned every robot!</h2>
        <p>All {TOTAL_LEVELS} gates cleared. The machines have declared you unmistakably, gloriously human.</p>
        <button onClick={() => { storage.set(LEVEL_KEY, '1'); beginLevel(1); }}>Play again</button>
        <button className="ghost" onClick={onBack}>Leave</button>
      </div>
    </div>}
  </main>;
}
