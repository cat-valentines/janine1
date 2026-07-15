import { useEffect, useState } from 'react';
import { ChoiceCard } from '../components/ChoiceCard';
import { ChallengeRoom } from '../components/ChallengeRoom';
import { Leaderboard } from '../components/Leaderboard';
import { PlayerProfileCard } from '../components/PlayerProfileCard';
import { ShopMenu } from '../components/ShopMenu';
import { challengeUrl, createChallenge } from '../lib/challenges';
import { supabase } from '../lib/supabase';
import { characterAssets, characterCollectibles } from '../game/characters';
import type { CharacterId, GameSelection, SettingId } from '../game/types';
import { createMarketListing, type CollectibleType } from '../lib/marketplace';
import { FriendsPanel } from '../components/FriendsPanel';
import { Auth } from '../components/Auth';
import { loadLocalProfile, saveLocalProfile } from '../lib/localProfile';
import { updateProfileSelection } from '../lib/gameData';
import type { ShopItem } from '../shop/catalog';
import { MarketWorld } from './MarketWorld';
import { YourHousePage } from './YourHousePage';

const characters: Array<[CharacterId, string, string, string]> = [
  ['cottontail', 'Cottontail', 'A cheerful little house explorer', '/assets/cottontail.png'],
  ['momo', 'Momo', 'Cheerful treasure penguin', '/assets/pixel-penguin.png'],
  ['toby', 'Toby', 'Clever bandana fox', '/assets/pixel-fox.png'],
];
const settings: Array<[SettingId, string, string, string]> = [
  ['haunted', 'Haunted House', 'Friendly ghosts and shield charms', '👻'],
  ['secret', 'Secret Room', 'Keys, doors, and clues', '🗝️'],
  ['power', 'Power House', 'Find a sparkling protection star', '⭐'],
];

export function SelectionPage({ onStart }: { onStart: (selection: GameSelection) => void }) {
  const [savedProfile] = useState(loadLocalProfile);
  const [character, setCharacter] = useState<CharacterId>(savedProfile.character);
  const [setting, setSetting] = useState<SettingId>(savedProfile.setting);
  const [inviteLink, setInviteLink] = useState('');
  const [challengeMessage, setChallengeMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [houseOpen, setHouseOpen] = useState(false);
  const [foodBalance, setFoodBalance] = useState(savedProfile.foodBalance);
  const [shopCoins, setShopCoins] = useState(savedProfile.shopCoins);
  const [ownedItems, setOwnedItems] = useState<string[]>(savedProfile.ownedItems);
  const [equippedItem, setEquippedItem] = useState(savedProfile.equippedItem);
  const [ownsHouse, setOwnsHouse] = useState(savedProfile.ownsHouse);
  const [placedFurniture, setPlacedFurniture] = useState<string[]>(savedProfile.placedFurniture);
  const [username, setUsername] = useState('');
  const selection = { character, setting, equippedItem };
  const collectible = characterCollectibles[character];
  useEffect(() => {
    saveLocalProfile({ character, setting, foodBalance, shopCoins, ownedItems, equippedItem, ownsHouse, placedFurniture });
    supabase.auth.getUser().then(({ data }) => { if (data.user) updateProfileSelection(data.user.id, selection).catch(() => undefined); });
  }, [character, setting, foodBalance, shopCoins, ownedItems, equippedItem, ownsHouse, placedFurniture]);
  useEffect(() => {
    const showUser = (name?: string) => { setUsername(name ?? 'Island Player'); setAuthMode(null); };
    supabase.auth.getUser().then(({ data }) => { if (data.user) showUser(data.user.user_metadata.display_name as string | undefined); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) showUser(session.user.user_metadata.display_name as string | undefined);
      else setUsername('');
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const createFriendChallenge = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setChallengeMessage('Sign in through an invitation first to create a saved challenge room.');
      return;
    }
    try {
      const challenge = await createChallenge(data.user.id);
      setInviteLink(challengeUrl(challenge.invite_code));
      setChallengeMessage('Your secure room link is ready. Friends sign in before joining.');
    } catch {
      setChallengeMessage('The game tables are not online yet. Apply the migration when you are ready.');
    }
  };
  const buyItem = (item: ShopItem) => {
    if (shopCoins < item.price || ownedItems.includes(item.id)) return;
    setShopCoins((total) => total - item.price);
    setOwnedItems((items) => [...items, item.id]);
  };
  const listFood = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user || foodBalance < 5) return false;
    try {
      await createMarketListing(data.user.id, collectible.singular as CollectibleType);
      setFoodBalance((total) => total - 5);
      return true;
    } catch { return false; }
  };
  if (marketOpen) return <MarketWorld foodBalance={foodBalance} coins={shopCoins} foodName={collectible.plural} foodAsset={collectible.asset} avatarAsset={characterAssets[character]} character={character} ownedItems={ownedItems} equippedItem={equippedItem} onBuyItem={buyItem} onEquip={setEquippedItem} onResell={(item) => { setOwnedItems((items) => items.filter((id) => id !== item.id)); if (equippedItem === item.id) setEquippedItem(''); setShopCoins((total) => total + Math.ceil(item.price / 2)); }} onListFood={listFood} onSpendCoins={(price) => { if (shopCoins < price) return false; setShopCoins((total) => total - price); return true; }} onInvite={createFriendChallenge} onClose={() => setMarketOpen(false)} />;
  if (houseOpen) return <YourHousePage coins={shopCoins} ownsHouse={ownsHouse} ownedItems={ownedItems} placedFurniture={placedFurniture} onBuyHouse={() => { if (shopCoins >= 20) { setShopCoins((total) => total - 20); setOwnsHouse(true); } }} onToggleFurniture={(id) => setPlacedFurniture((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])} onInvite={createFriendChallenge} onClose={() => setHouseOpen(false)} />;
  return (
    <main className="selection-page page-shell">
      <button className="menu-button" onClick={() => setMenuOpen(true)}>☰ Menu</button>
      <button className="friends-button" onClick={() => setFriendsOpen(true)}>Friends ☺</button>
      {username ? <><span className="signed-in-name">☺ {username}</span><button className="auth-button login-button" onClick={() => supabase.auth.signOut()}>Log out</button></> : <><button className="auth-button login-button" onClick={() => setAuthMode('signin')}>Log in</button><button className="auth-button signup-button" onClick={() => setAuthMode('signup')}>Sign up</button></>}
      <header><p className="eyebrow">Hana Aloha Island</p><h1>Tiny Tower Tails</h1><p>Climb a cozy 10-floor house, gather treasures, outsmart friendly cats, and discover a new magical island after 30 quests.</p></header>
      <section><h2 className="pixel-section-title">Characters</h2><div className="choice-grid">
        {characters.map(([id, name, text, icon]) => <ChoiceCard key={id} title={name} description={text} icon={icon} selected={character === id} onSelect={() => setCharacter(id)} />)}
      </div></section>
      <section><h2 className="pixel-section-title">Choose a house</h2><div className="choice-grid">
        {settings.map(([id, name, text, icon]) => <ChoiceCard key={id} title={name} description={text} icon={icon} selected={setting === id} onSelect={() => setSetting(id)} />)}
      </div></section>
      <button className="start-button" onClick={() => onStart(selection)}>Start Adventure <span>→</span></button>
      <PlayerProfileCard selection={selection} balance={foodBalance} coins={shopCoins} collectibleAsset={collectible.asset} collectibleName={collectible.plural} />
      <Leaderboard />
      <ChallengeRoom onChallenge={createFriendChallenge} inviteLink={inviteLink} message={challengeMessage} />
      {menuOpen && <ShopMenu coins={shopCoins} foodBalance={foodBalance} ownedItems={ownedItems} onBuy={buyItem} onClose={() => setMenuOpen(false)} collectibleAsset={collectible.asset} collectibleName={collectible.plural} onOpenMarket={() => { setMenuOpen(false); setMarketOpen(true); }} onOpenHouse={() => { setMenuOpen(false); setHouseOpen(true); }} />}
      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} onShare={() => { createFriendChallenge(); setFriendsOpen(false); }} />}
      {authMode && <div className="auth-backdrop" onClick={() => setAuthMode(null)}><div className="auth-modal" onClick={(event) => event.stopPropagation()}><button className="auth-close" onClick={() => setAuthMode(null)}>×</button><Auth key={authMode} initialMode={authMode} /></div></div>}
    </main>
  );
}
