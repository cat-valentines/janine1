import { FormEvent, useEffect, useRef, useState } from 'react';
import { askAppAssistant, type HelpMessage } from '../lib/appAssistant';

const welcome: HelpMessage = {
  role: 'assistant',
  text: 'Hi! I’m your game guide. Ask me where to go, what a button does, or how to play any game.',
};

export function AppAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<HelpMessage[]>([welcome]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', text } satisfies HelpMessage];
    setMessages(next);
    setQuestion('');
    setLoading(true);
    try {
      const answer = await askAppAssistant(next, window.location.pathname);
      setMessages((current) => [...current, { role: 'assistant', text: answer }]);
    } catch {
      setMessages((current) => [...current, {
        role: 'assistant',
        text: 'I could not reach Gemini just now. Please try again in a moment.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className={`app-assistant ${open ? 'is-open' : ''}`}>
      {open && (
        <section className="assistant-panel" role="dialog" aria-label="Gemini app guide">
          <header>
            <div><span>✨</span><div><strong>Game Guide</strong><small>Powered by Gemini</small></div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close guide">×</button>
          </header>
          <div className="assistant-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>
            ))}
            {loading && <p className="assistant thinking">Thinking…</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={submit}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask how to play…" aria-label="Ask the game guide" maxLength={500} />
            <button type="submit" disabled={loading || !question.trim()} aria-label="Send question">➤</button>
          </form>
        </section>
      )}
      <button className="assistant-launcher" type="button" onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close Gemini game guide' : 'Open Gemini game guide'} aria-expanded={open}>
        {open ? '×' : '✨'}<span>{open ? 'Close' : 'Need help?'}</span>
      </button>
    </aside>
  );
}
