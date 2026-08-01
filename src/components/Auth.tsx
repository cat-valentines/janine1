import { useState } from 'react';
import { supabase } from '../lib/supabase';

/** Supabase speaks in error codes. Kids don't. */
function friendlyError(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes('invalid login credentials')) return "That email or password isn't right. Try again?";
  if (text.includes('email not confirmed')) return "Your account needs the link we emailed you. If it never arrives (some school emails block it), just tap “▶ Just play” to play with no account, or sign up again with a personal email.";
  if (text.includes('user already registered') || text.includes('already been registered')) return 'You already have an account with that email — try logging in instead.';
  if (text.includes('password should be at least')) return 'Your password needs at least 6 letters or numbers.';
  if (text.includes('rate limit') || text.includes('too many requests')) return 'Too many tries just now. Wait a minute, then have another go.';
  if (text.includes('unable to validate email') || text.includes('invalid email')) return "That email doesn't look right. Check for typos?";
  if (text.includes('database error')) return "We couldn't finish making your account. Try a different username?";
  if (text.includes('unsupported provider') || text.includes('provider is not enabled')) return 'Google sign-in isn\'t switched on for this game yet.';
  if (text.includes('failed to fetch') || text.includes('network')) return "Can't reach the game server. Check your internet?";
  return raw;
}

export function Auth({ initialMode = 'signin', onClose }: { initialMode?: 'signin' | 'signup'; onClose?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  /** Set once a confirmation email is on its way, so we can explain what happens next. */
  const [sentTo, setSentTo] = useState('');

  async function handleGoogleSignIn() {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) {
      setMessage(friendlyError(error.message));
      setBusy(false);
    }
  }

  /** Ask the database whether a username is free. Skipped silently if the game isn't set up yet. */
  async function usernameTaken(name: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('username_available', { name });
    if (error) return false;
    return data === false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage(friendlyError(error.message));
        return;
      }

      const name = username.trim();
      if (await usernameTaken(name)) {
        setMessage(`"${name}" is already taken. Pick a different username — or if it's yours, tap “Log in” below.`);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } },
      });
      if (error) {
        setMessage(friendlyError(error.message));
      } else if (!data.session) {
        // Email confirmation is switched on, so there's no session yet.
        setSentTo(email);
      }
      // With a session, onAuthStateChange signs them straight in and closes this box.
    } catch (error) {
      setMessage(friendlyError(error instanceof Error ? error.message : 'Something went wrong. Try again?'));
    } finally {
      setBusy(false);
    }
  }

  async function resendEmail() {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo });
    setMessage(error ? friendlyError(error.message) : '📨 Sent again! Give it a minute.');
    setBusy(false);
  }

  if (sentTo) {
    return <section className="card auth-sent">
      <h2>📬 Check your email</h2>
      <p>We sent a link to <strong>{sentTo}</strong>. Click it to finish making your account, then come back and log in.</p>
      <p className="auth-tip">Can't find it? Look in your spam or junk folder — it sometimes hides there.</p>
      <p className="auth-school-note">🏫 On a <strong>school email</strong>? These links are often blocked and never arrive. You don't need an account to play — go back and tap <strong>“▶ Just play — no account needed”</strong>. To keep an account, sign up with a personal email instead.</p>
      <button type="button" className="ghost" onClick={resendEmail} disabled={busy}>{busy ? '…' : '📨 Resend the email'}</button>
      {message && <p className="message">{message}</p>}
      <button onClick={() => { setSentTo(''); setMessage(''); setMode('signin'); }}>Back to log in</button>
    </section>;
  }

  return (
    <section className="card">
      <h2>{mode === 'signin' ? 'Welcome back!' : 'Make an account'}</h2>
      {onClose && <>
        <button type="button" className="auth-guest" onClick={onClose}>▶ Just play — no account needed</button>
        <p className="auth-optional">You can play all the games with no sign-in — great for school. Sign in below only if you want to save your progress across devices and text your friends.</p>
        <div className="auth-divider"><span>or sign in</span></div>
      </>}
      <button className="google-auth-button" type="button" disabled={busy} onClick={handleGoogleSignIn}>
        <span aria-hidden="true">G</span> Continue with Google
      </button>
      <p className="auth-school-note">🏫 At some schools Google sign-in is blocked by the admin. If it says “access blocked”, use email below — or just play with no account.</p>
      <div className="auth-divider"><span>or use email</span></div>
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
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="password (6+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Log in' : 'Create account'}
        </button>
      </form>
      {message && <p className="message">{message}</p>}
      <button
        className="ghost"
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}
      >
        {mode === 'signin' ? 'No account yet? Sign up' : 'Already have an account? Log in'}
      </button>
    </section>
  );
}
