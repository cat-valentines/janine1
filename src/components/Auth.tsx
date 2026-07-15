import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Вход и регистрация по email + паролю. Это пример — Codex поможет улучшить (Google-вход и т.д.).
export function Auth({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const fn =
        mode === 'signup'
          ? supabase.auth.signUp({ email, password, options: { data: { display_name: username.trim() } } })
          : supabase.auth.signInWithPassword({ email, password });
      const { error } = await fn;
      if (error) setMessage(error.message);
      else if (mode === 'signup') setMessage('Готово! Проверь почту, если нужна подтверждалка.');
    } catch {
      setMessage('Что-то пошло не так. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{mode === 'signin' ? 'Вход' : 'Регистрация'}</h2>
      <form onSubmit={handleSubmit} className="form">
        {mode === 'signup' && <input
          type="text"
          placeholder="choose your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]+"
          title="Use letters, numbers, and underscores only"
          autoComplete="username"
          required
        />}
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="пароль (6+ символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
      <button
        className="ghost"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? 'Нет аккаунта? Зарегистрируйся' : 'Уже есть аккаунт? Войти'}
      </button>
    </section>
  );
}
