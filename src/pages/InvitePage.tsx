import { useEffect, useState } from 'react';
import { Auth } from '../components/Auth';
import { joinChallenge } from '../lib/challenges';
import { supabase } from '../lib/supabase';

export function InvitePage({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState('Sign in to safely join your friend.');

  useEffect(() => {
    const join = async () => {
      setSignedIn(true);
      try {
        await joinChallenge(code);
        setMessage('You joined the challenge room!');
      } catch {
        setMessage('This invitation is not active yet. Ask your friend to create it while signed in.');
      }
    };
    supabase.auth.getSession().then(({ data }) => { if (data.session) join(); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (session) window.setTimeout(join, 0); });
    return () => data.subscription.unsubscribe();
  }, [code]);

  return (
    <main className="invite-page page-shell">
      <section className="panel invite-card">
        <span className="choice-icon" aria-hidden="true">🏡</span>
        <p className="eyebrow">Friend challenge</p><h1>A quest is waiting!</h1>
        <p>{message}</p>
        {signedIn ? <button className="start-button" onClick={onJoined}>Enter Challenge Room</button> : <Auth />}
      </section>
    </main>
  );
}
