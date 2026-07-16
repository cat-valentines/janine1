import { useEffect, useState } from 'react';

/**
 * Shows a sign-in failure that Google or Supabase handed back in the URL.
 *
 * They report problems by bouncing the player back with the reason in the query
 * or the hash. Nothing read it, so a failed sign-in looked exactly like a
 * button that did nothing at all.
 *
 * This lives at the top of the app on purpose: the returning player usually
 * lands on the first-run screen, which returns early, so a banner further down
 * would never be rendered for the one person who needs it.
 */
export function AuthErrorBanner() {
  const [reason, setReason] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const found = hash.get('error_description') || query.get('error_description')
      || hash.get('error') || query.get('error');
    if (!found) return;
    setReason(decodeURIComponent(found.replace(/\+/g, ' ')));
    // Clear it, so a refresh does not show the same failure forever.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  if (!reason) return null;
  return <div className="auth-error-banner" role="alert">
    <span aria-hidden="true">⚠️</span>
    <div>
      <strong>Sign-in did not finish</strong>
      <small>{reason}</small>
    </div>
    <button onClick={() => setReason('')} aria-label="Dismiss">×</button>
  </div>;
}
