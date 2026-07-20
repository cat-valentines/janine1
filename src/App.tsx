import { useEffect, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { SelectionPage } from './pages/SelectionPage';
import { InvitePage } from './pages/InvitePage';
import { AuthErrorBanner } from './components/AuthErrorBanner';
import { navigate, useRoute } from './lib/router';
import { markPlayedToday } from './lib/streak';
import { loadLocalProfile } from './lib/localProfile';
import type { GameSelection } from './game/types';
import { AppAssistant } from './components/AppAssistant';

export default function App() {
  const path = useRoute();
  const [selection, setSelection] = useState<GameSelection | null>(null);
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get('challenge'));

  // Playing the Tower game earns today's streak too — but only once you've
  // actually been in it a while, not for merely opening it. (Every other game
  // records the day itself; see markPlayedToday.)
  useEffect(() => {
    if (path !== '/play/tower') return;
    const id = setTimeout(() => { markPlayedToday(); }, 30000);
    return () => clearTimeout(id);
  }, [path]);

  if (inviteCode) {
    return <><InvitePage code={inviteCode} onJoined={() => {
      window.history.replaceState({}, '', window.location.pathname);
      setInviteCode(null);
    }} /><AppAssistant /></>;
  }

  // Tower Royal has its own URL, so it can be linked to and the back button
  // leaves it. Landing on it cold (a shared link) builds a selection from the
  // saved profile rather than bouncing the player home.
  if (path === '/play/tower') {
    const saved = loadLocalProfile();
    const playing = selection ?? { character: saved.character, setting: saved.setting, equippedItem: saved.equippedItem };
    return (
      <>
        <AuthErrorBanner />
        <GamePage selection={playing} onExit={() => { setSelection(null); navigate('/'); }} />
        <AppAssistant />
      </>
    );
  }

  return (
    <>
      <AuthErrorBanner />
      <SelectionPage onStart={(next) => { setSelection(next); navigate('/play/tower'); }} />
      <AppAssistant />
    </>
  );
}
