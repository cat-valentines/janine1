import { useState } from 'react';
import { USERNAME_RULE, finishAccountSetup, isTakenError, isUsernameFree, setGamePassword } from '../lib/players';
import { characterAssets } from '../game/characters';
import { ChoiceCard } from '../components/ChoiceCard';
import type { CharacterId } from '../game/types';

const names: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit', koala: 'Bridey', teddy: 'Adi', panda: 'Scarlet', tiger: 'Elena', piggy: 'Piggy', parrot: 'Parrot' };
const choices: Array<[CharacterId, string]> = [
  ['cottontail', 'A cheerful little house explorer'],
  ['momo', 'Cheerful treasure penguin'],
  ['toby', 'Clever bandana fox'],
  ['ollie', 'A cuddly, chubby river otter'],
  ['coral', 'A bubbly little clownfish explorer'],
  ['biscuit', 'A loyal floppy-eared puppy'],
  ['parrot', 'A colorful little two-legged parrot'],
];

interface AccountSetupPageProps {
  userId: string;
  email: string;
  /** True when they came in through Google and have no game password yet. */
  needsPassword: boolean;
  /** True for a guest who became a lightweight anonymous account. */
  isGuest: boolean;
  character: CharacterId;
  onChangeCharacter: (character: CharacterId) => void;
  onDone: (username: string) => void;
}

export function AccountSetupPage({ userId, email, needsPassword, isGuest, character, onChangeCharacter, onDone }: AccountSetupPageProps) {
  const [username, setUsername] = useState('');
  const [birthday, setBirthday] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = username.trim();
    setError('');
    if (!USERNAME_RULE.test(clean)) {
      setError('Usernames are 3–24 letters, numbers or underscores — no spaces.');
      return;
    }
    if (!isGuest && !birthday) { setError('Please add your birthday.'); return; }
    if (needsPassword && password && password.length < 6) {
      setError('A password needs at least 6 letters or numbers.');
      return;
    }
    setBusy(true);
    try {
      // A definite "false" is taken. Null means we could not check, and the
      // database's unique index still has the final say on the save below.
      if (await isUsernameFree(clean) === false) {
        setError(`Sorry, @${clean} is already taken. Try another one!`);
        return;
      }
      if (needsPassword && password) await setGamePassword(password);
      await finishAccountSetup(userId, { username: clean, birthday, character });
      onDone(clean);
    } catch (caught) {
      if (isTakenError(caught)) setError(`Sorry, @${clean} is already taken. Try another one!`);
      else setError('Could not save your account — the game database is not online yet.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="setup-page">
    <header className="setup-header">
      <p className="eyebrow">Almost there</p>
      <h1>{isGuest ? 'Pick your player name' : 'Set up your account'}</h1>
      {isGuest
        ? <p>Choose a name and you will show up on the leaderboard and in your friends' searches, just like everyone else.</p>
        : <p>You are signed in as <strong>{email}</strong>. Fill this in once and other players can find you.</p>}
    </header>

    <form className="setup-card" onSubmit={save}>
      <label className="setup-field">
        <span>Username</span>
        <small>This is the name every other player sees, and what your friends search for. Everyone needs a different one.</small>
        <div className="setup-username">
          <i>@</i>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="pick a username"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            title="Use letters, numbers and underscores only"
            autoComplete="username"
            required
          />
        </div>
      </label>

      <label className="setup-field">
        <span>Birthday {isGuest && <i className="setup-optional">optional</i>}</span>
        <small>🔒 Only you can see this. It never shows on your profile, in search, or on the leaderboard.</small>
        <input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} max={new Date().toISOString().slice(0, 10)} required={!isGuest} />
      </label>

      {isGuest && <p className="setup-guest-note">👤 This is a <strong>guest account</strong> — it lives in this browser, so it can be lost if you clear it. To keep it forever, make a full account from the front page later.</p>}

      {needsPassword && <label className="setup-field">
        <span>Password <i className="setup-optional">optional</i></span>
        <small>
          ⚠️ This makes a <strong>new password just for Magical Islands</strong>, so you can also log in with your
          email instead of Google. Do <strong>not</strong> type your Google password — we never ask for that, and
          we never see it.
        </small>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="leave empty to just use Google"
          minLength={6}
          autoComplete="new-password"
        />
      </label>}

      <div className="setup-field">
        <span>Your character</span>
        <small>This is who you play as in every game. You can change it later in your profile.</small>
        <div className="choice-grid setup-characters">
          {choices.map(([id, blurb]) => <ChoiceCard key={id} title={names[id]} description={blurb} icon={characterAssets[id]} selected={character === id} onSelect={() => onChangeCharacter(id)} />)}
        </div>
      </div>

      {error && <p className="setup-error">{error}</p>}
      <button className="setup-save" type="submit" disabled={busy}>{busy ? 'Saving…' : isGuest ? `Play as @${username.trim() || '…'} →` : `Start playing as ${names[character]} →`}</button>
    </form>
  </main>;
}
