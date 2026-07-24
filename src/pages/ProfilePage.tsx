import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { USERNAME_RULE, changeUsername, isTakenError, isUsernameFree, loadPrivateProfile, savePrivateProfile } from '../lib/players';
import { characterAssets, characterCollectibles } from '../game/characters';
import { ChoiceCard } from '../components/ChoiceCard';
import { CharacterCustomizer } from '../components/CharacterCustomizer';
import { getStars, STAR_GOAL } from '../lib/escapeStars';
import type { CharacterId, SettingId } from '../game/types';

const names: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit', koala: 'Bridey', teddy: 'Adi', panda: 'Scarlet', tiger: 'Elena', piggy: 'Piggy', parrot: 'Polly', mila: 'Mila', gabby: 'Gabby', amsaal: 'Amsaal', misha: 'Misha' };
const characterChoices: Array<[CharacterId, string]> = [
  ['cottontail', 'A cheerful little house explorer'],
  ['momo', 'Cheerful treasure penguin'],
  ['toby', 'Clever bandana fox'],
  ['ollie', 'A cuddly, chubby river otter'],
  ['coral', 'A bubbly little clownfish explorer'],
  ['biscuit', 'A loyal floppy-eared puppy'],
  ['koala', 'A snuggly, sleepy koala'],
  ['teddy', 'A soft, cuddly teddy bear'],
  ['panda', 'A roly-poly bamboo panda'],
  ['tiger', 'A bouncy little striped tiger'],
  ['piggy', 'A happy, chubby little pig'],
  ['parrot', 'A colorful little parrot who walks on two legs'],
  ['mila', 'A sweet little cow holding her favorite strawberry'],
  ['gabby', 'A cheerful, chubby little giraffe'],
  ['amsaal', 'A sunny yellow chick with tiny walking feet'],
  ['misha', 'A light-pink strawberry cow holding a strawberry'],
];
const houses: Record<SettingId, string> = { haunted: 'Haunted House', secret: 'Secret Rooms', power: 'Power House' };
const today = new Date().toISOString().slice(0, 10);

interface ProfilePageProps {
  character: CharacterId;
  setting: SettingId;
  coins: number;
  foodBalance: number;
  completedQuests: number;
  isMember: boolean;
  accessory: string;
  /** True on a player's very first visit, before they have picked a character. */
  firstTime: boolean;
  ownedItems: string[];
  onChangeCharacter: (character: CharacterId) => void;
  onChangeAccessory: (accessory: string) => void;
  onBuyAccessory: (id: string, price: number) => void;
  onChosen: () => void;
  realName: string;
  birthday: string;
  country: string;
  onSavePrivate: (fields: { realName: string; birthday: string; country: string }) => void;
  onBack: () => void;
}

export function ProfilePage({ character, setting, coins, foodBalance, completedQuests, isMember, accessory, firstTime, ownedItems, onChangeCharacter, onChangeAccessory, onBuyAccessory, onChosen, realName, birthday, country, onSavePrivate, onBack }: ProfilePageProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState(realName);
  const [day, setDay] = useState(birthday);
  const [place, setPlace] = useState(country);
  const [note, setNote] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameNote, setNameNote] = useState('');
  const [nameTaken, setNameTaken] = useState(false);
  const collectible = characterCollectibles[character];

  const saveUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = draftName.trim();
    setNameTaken(false);
    if (clean.toLowerCase() === username.toLowerCase()) { setEditingName(false); setNameNote(''); return; }
    if (!USERNAME_RULE.test(clean)) {
      setNameTaken(true);
      setNameNote('Usernames are 3–24 letters, numbers or underscores — no spaces.');
      return;
    }
    setSavingName(true);
    setNameNote('');
    try {
      // A "false" here is a definite no; null just means we could not check, and
      // the database's unique index still has the final say below.
      if (await isUsernameFree(clean) === false) {
        setNameTaken(true);
        setNameNote(`Sorry, @${clean} is already taken. Try another one!`);
        return;
      }
      await changeUsername(userId, clean);
      setUsername(clean);
      setEditingName(false);
      setNameNote(`You are now @${clean}. Your friends can search for you with it.`);
    } catch (error) {
      setNameTaken(true);
      if (isTakenError(error)) setNameNote(`Sorry, @${clean} is already taken. Try another one!`);
      else setNameNote('Could not change your username — the account tables are not online yet.');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? '');
      setUserId(data.user.id);
      setUsername((data.user.user_metadata.display_name as string | undefined) ?? 'Island Player');
      loadPrivateProfile(data.user.id).then((profile) => {
        if (!profile) return;
        if (profile.display_name) setUsername(profile.display_name);
        if (profile.real_name) setName(profile.real_name);
        if (profile.birthday) setDay(profile.birthday);
        if (profile.country) setPlace(profile.country);
      }).catch(() => undefined);
    });
  }, []);

  const save = async () => {
    onSavePrivate({ realName: name, birthday: day, country: place });
    if (!userId) { setNote('Saved on this device. Log in to keep it when you switch devices.'); return; }
    try {
      await savePrivateProfile(userId, { real_name: name, birthday: day, country: place });
      setNote('Saved to your account.');
    } catch {
      setNote('Saved on this device. The account tables are not online yet.');
    }
  };

  return <main className="profile-page">
    <header className="map-top">
      {firstTime ? <span className="profile-step">Step 1</span> : <button onClick={onBack}>← Back</button>}
      <div><p className="eyebrow">Magical Islands</p><h1>{firstTime ? 'Welcome!' : 'My Profile'}</h1></div>
      <span>⭐ {completedQuests} quests</span>
    </header>

    {firstTime && <p className="profile-welcome">👋 Pick the character you want to play as. You can change it here any time.</p>}

    <section className={`profile-section profile-characters ${firstTime ? 'highlight' : ''}`}>
      <h3>Your character</h3>
      <p className="profile-hint">This is who you play as in every game, and who lives in your house.</p>
      <div className="choice-grid">
        {characterChoices.map(([id, blurb]) => <ChoiceCard key={id} title={names[id]} description={blurb} icon={characterAssets[id]} selected={character === id} onSelect={() => onChangeCharacter(id)} />)}
      </div>
      {firstTime && <button className="profile-start" onClick={onChosen}>Play as {names[character]} <span>→</span></button>}
    </section>

    {!firstTime && <section className="profile-section profile-styles">
      <h3>Royal Style Shop</h3>
      <p className="profile-hint">Dress up {names[character]} with a paid royal style. Once you buy a look it is yours forever — equip it any time.</p>
      <CharacterCustomizer character={character} accessory={accessory} coins={coins} ownedAccessories={ownedItems} onChange={onChangeAccessory} onBuy={onBuyAccessory} />
    </section>}

    <section className="profile-hero">
      <div className="profile-hero-avatar"><img src={characterAssets[character]} alt="" />{accessory && <span className="profile-hero-accessory">✨</span>}</div>
      <div>
        <p className="card-kicker">{isMember ? '♛ Royal Member' : 'Explorer'}</p>
        <h2>@{username || 'Guest Adventurer'}</h2>
        <p>{names[character]} · {houses[setting]}</p>
        {!userId && <p className="profile-guest-note">You are playing as a guest. Log in to save your profile to your account.</p>}
      </div>
      <div className="profile-hero-stats">
        <span><img className="hud-collectible" src={collectible.asset} alt="" /> {foodBalance} <small>{collectible.plural}</small></span>
        <span><img className="hud-collectible" src="/assets/pixel-coin.png" alt="" /> {coins} <small>Coins</small></span>
      </div>
    </section>

    <section className="profile-section">
      <h3>Account</h3>
      <dl className="profile-rows">
        <div><dt>Username</dt><dd>
          {!userId ? 'Guest — not logged in'
            : editingName ? <form className="username-edit" onSubmit={saveUsername}>
              <span>@</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                title="Use letters, numbers and underscores only"
                autoFocus
                required
              />
              <button type="submit" disabled={savingName}>{savingName ? '…' : 'Save'}</button>
              <button type="button" className="ghost" onClick={() => { setEditingName(false); setNameNote(''); }}>Cancel</button>
            </form>
            : <span className="username-view">
              @{username}
              <button onClick={() => { setDraftName(username); setEditingName(true); setNameNote(''); }}>✏️ Change</button>
            </span>}
        </dd></div>
        <div><dt>Email</dt><dd>{email || 'Guest — not logged in'}</dd></div>
      </dl>
      {nameNote && <p className={`username-note ${nameTaken ? 'bad' : 'good'}`}>{nameNote}</p>}
      <p className="profile-hint">Your username is the name other players see and search for, so everybody needs a different one.</p>
    </section>

    <section className="profile-section profile-private">
      <h3>Private details <span className="private-badge">🔒 Only you can see this</span></h3>
      <p className="profile-hint">Your real name, birthday, and country are never shown to other players, never appear in search, and never show on the leaderboard.</p>
      <div className="profile-fields">
        <label>Real name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Not set" maxLength={60} autoComplete="name" />
        </label>
        <label>Birthday
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} max={today} />
        </label>
        <label>Country
          <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Not set" maxLength={56} />
        </label>
      </div>
      <button className="profile-save" onClick={save}>Save private details</button>
      {note && <p className="profile-note">{note}</p>}
    </section>

    <section className="profile-section">
      <h3>Settings</h3>
      <dl className="profile-rows">
        <div><dt>Character</dt><dd>{names[character]}</dd></div>
        <div><dt>House</dt><dd>{houses[setting]}</dd></div>
        <div><dt>Membership</dt><dd>{isMember ? '♛ Royal Membership active' : 'Free explorer'}</dd></div>
        <div><dt>Quests finished</dt><dd>{completedQuests}</dd></div>
        <div><dt>Escape Room stars</dt><dd>⭐ {getStars().toLocaleString()} / {STAR_GOAL.toLocaleString()}</dd></div>
      </dl>
      {userId && <button className="profile-signout" onClick={() => { supabase.auth.signOut(); onBack(); }}>Log out</button>}
    </section>

    {isMember && <div className="royal-sign"><span>♛</span><strong>Royal Member</strong><small>Royal islands and games unlocked</small></div>}
  </main>;
}
