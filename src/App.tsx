import { useState } from 'react';
import { GamePage } from './pages/GamePage';
import { SelectionPage } from './pages/SelectionPage';
import { InvitePage } from './pages/InvitePage';
import { AuthErrorBanner } from './components/AuthErrorBanner';
import type { GameSelection } from './game/types';

export default function App() {
  const [selection, setSelection] = useState<GameSelection | null>(null);
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get('challenge'));

  if (inviteCode) {
    return <InvitePage code={inviteCode} onJoined={() => {
      window.history.replaceState({}, '', window.location.pathname);
      setInviteCode(null);
    }} />;
  }

  return (
    <>
      <AuthErrorBanner />
      {selection
        ? <GamePage selection={selection} onExit={() => setSelection(null)} />
        : <SelectionPage onStart={setSelection} />}
    </>
  );
}
