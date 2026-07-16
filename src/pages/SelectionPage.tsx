import { Suspense, lazy, useEffect, useState } from 'react';
import { ChallengeRoom } from '../components/ChallengeRoom';
import { Leaderboard } from '../components/Leaderboard';
import { ProfileTab } from '../components/ProfileTab';
import { ShopMenu } from '../components/ShopMenu';
import { challengeUrl, createChallenge } from '../lib/challenges';
import { supabase } from '../lib/supabase';
import { characterAssets, characterCollectibles } from '../game/characters';
import type { CharacterId, GameSelection, SettingId } from '../game/types';
import { FriendsPanel } from '../components/FriendsPanel';
import { Auth } from '../components/Auth';
import { loadLocalProfile, saveLocalProfile } from '../lib/localProfile';
import { updateProfileSelection } from '../lib/gameData';
import type { ShopItem } from '../shop/catalog';
import { YourHousePage } from './YourHousePage';
import { MapPage } from './MapPage';
import { ProfilePage } from './ProfilePage';
import { RoyalMemberPage } from './RoyalMemberPage';
import { StreakPage } from './StreakPage';
import { countTodayAsPlayed } from '../game/progress';
import { recordPlayDay } from '../lib/gameData';
import { HouseBuilderPage } from './HouseBuilderPage';
// three.js is ~500KB — load it only when a player actually opens their house.
const HouseWorldPage = lazy(() => import('./HouseWorldPage').then((m) => ({ default: m.HouseWorldPage })));
import { emptyWorld } from '../game/voxel';
import { currentSeason } from '../game/terrain';
import { islands } from '../game/islands';
import { loadMyHouse, saveMyHouse } from '../lib/houses';
import { HouseMarketPage } from './HouseMarketPage';
// three.js is only needed once a survival round actually starts.
const HungerQuestPage = lazy(() => import('./HungerQuestPage').then((m) => ({ default: m.HungerQuestPage })));
const MedicineMissionPage = lazy(() => import('./MedicineMissionPage').then((m) => ({ default: m.MedicineMissionPage })));
const RunnerUpPage = lazy(() => import('./RunnerUpPage').then((m) => ({ default: m.RunnerUpPage })));
const DriveMadPage = lazy(() => import('./DriveMadPage').then((m) => ({ default: m.DriveMadPage })));
const TownMarketPage = lazy(() => import('./TownMarketPage').then((m) => ({ default: m.TownMarketPage })));
const EscapePage = lazy(() => import('./EscapePage').then((m) => ({ default: m.EscapePage })));
import { RiddlePage } from './RiddlePage';
import { PingPongPage } from './PingPongPage';
import { GruitsPage } from './GruitsPage';
import { MoreGamesPage } from './MoreGamesPage';
import type { GameId } from '../game/gameList';
import { AccountSetupPage } from './AccountSetupPage';
import { loadAccountState } from '../lib/players';

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
  const [mapOpen, setMapOpen] = useState(false);
  const [characterChosen, setCharacterChosen] = useState(savedProfile.characterChosen);
  const [supplies, setSupplies] = useState(savedProfile.supplies);
  const [riddleLevel, setRiddleLevel] = useState(savedProfile.riddleLevel);
  const [riddleOpen, setRiddleOpen] = useState(false);
  const [pongOpen, setPongOpen] = useState(false);
  const [gruitsOpen, setGruitsOpen] = useState(false);
  const [escapeOpen, setEscapeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [royalOpen, setRoyalOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [streak, setStreak] = useState(savedProfile.streak);
  const [daysPlayed, setDaysPlayed] = useState(savedProfile.daysPlayed);
  const [lastPlayed, setLastPlayed] = useState(savedProfile.lastPlayed);
  const [signedIn, setSignedIn] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const [hungerOpen, setHungerOpen] = useState(false);
  const [medicineIsland, setMedicineIsland] = useState('');
  const [runnerIsland, setRunnerIsland] = useState('');
  const [driveOpen, setDriveOpen] = useState(false);
  const [worldMode, setWorldMode] = useState<'build' | 'walk'>('build');
  const [houseMarketOpen, setHouseMarketOpen] = useState(false);
  const [foodBalance] = useState(savedProfile.foodBalance);
  const [shopCoins, setShopCoins] = useState(savedProfile.shopCoins);
  const [ownedItems, setOwnedItems] = useState<string[]>(savedProfile.ownedItems);
  const [equippedItem] = useState(savedProfile.equippedItem);
  const [ownsHouse, setOwnsHouse] = useState(savedProfile.ownsHouse);
  const [placedFurniture] = useState<string[]>(savedProfile.placedFurniture);
  const [accessory, setAccessory] = useState(savedProfile.accessory);
  const [isMember, setIsMember] = useState(savedProfile.isMember);
  const [realName, setRealName] = useState(savedProfile.realName);
  const [birthday, setBirthday] = useState(savedProfile.birthday);
  const [country, setCountry] = useState(savedProfile.country);
  const [houseWorld, setHouseWorld] = useState(savedProfile.houseWorld);
  const [houseFurniture, setHouseFurniture] = useState(savedProfile.houseFurniture);
  const [houseSeason, setHouseSeason] = useState(savedProfile.houseSeason);
  const [houseSeed] = useState(savedProfile.houseSeed);
  const [houseSource, setHouseSource] = useState(savedProfile.houseSource);
  const [houseName, setHouseName] = useState(savedProfile.houseName);
  const [garden, setGarden] = useState(savedProfile.garden);
  const [animals, setAnimals] = useState(savedProfile.animals);
  const [username, setUsername] = useState('');
  /** Set once a signed-in player still has the setup screen to fill in. */
  const [setup, setSetup] = useState<{ userId: string; email: string; needsPassword: boolean } | null>(null);
  const selection = { character, setting, equippedItem };
  const collectible = characterCollectibles[character];
  useEffect(() => {
    saveLocalProfile({ character, setting, foodBalance, shopCoins, ownedItems, equippedItem, ownsHouse, placedFurniture, accessory, completedQuests: savedProfile.completedQuests, isMember, realName, birthday, country, houseWorld, houseFurniture, houseSeason, houseSeed, characterChosen, supplies, riddleLevel, houseSource, houseName, garden, animals, streak, daysPlayed, lastPlayed });
    supabase.auth.getUser().then(({ data }) => { if (data.user) updateProfileSelection(data.user.id, selection).catch(() => undefined); });
  }, [character, setting, foodBalance, shopCoins, ownedItems, equippedItem, ownsHouse, placedFurniture, accessory, isMember, realName, birthday, country, houseWorld, houseFurniture, houseSeason, houseSeed, characterChosen, supplies, riddleLevel, houseSource, houseName, garden, animals, streak, daysPlayed, lastPlayed]);
  // The house lives on the account: pull it in on login so it is never lost by
  // logging out or switching device, and fall back to this device when offline.
  useEffect(() => {
    const pull = (id?: string) => {
      if (!id) return;
      loadMyHouse(id).then((saved) => {
        if (!saved) return;
        if (saved.house_world) setHouseWorld(saved.house_world);
        if (Array.isArray(saved.house_furniture) && saved.house_furniture.length) setHouseFurniture(saved.house_furniture);
        if (saved.house_name) setHouseName(saved.house_name);
        if (saved.house_season) setHouseSeason(saved.house_season);
        if (saved.house_world) setOwnsHouse(true);
      }).catch(() => undefined);
    };
    supabase.auth.getUser().then(({ data }) => pull(data.user?.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => pull(session?.user?.id));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!houseWorld) return;
    const timer = setTimeout(() => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        saveMyHouse(data.user.id, {
          house_world: houseWorld, house_furniture: houseFurniture,
          house_name: houseName || 'My House', house_season: houseSeason || null, house_seed: houseSeed,
        }).catch(() => undefined);
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [houseWorld, houseFurniture, houseName, houseSeason, houseSeed]);

  // A player who has signed in but never finished the setup screen has no real
  // username yet, so nobody can find them. Send them to it once.
  useEffect(() => {
    const check = async (user: { id: string; email?: string; app_metadata?: { provider?: string } } | undefined) => {
      if (!user) { setSetup(null); return; }
      const account = await loadAccountState(user.id);
      // null means we could not tell — never trap someone on a form over that.
      if (!account || account.onboarded) { setSetup(null); return; }
      setSetup({
        userId: user.id,
        email: user.email ?? '',
        needsPassword: (user.app_metadata?.provider ?? 'email') !== 'email',
      });
    };
    supabase.auth.getUser().then(({ data }) => check(data.user ?? undefined));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => check(session?.user ?? undefined));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const local = countTodayAsPlayed({ lastPlayed, streak, daysPlayed });
    if (local.lastPlayed !== lastPlayed) {
      setStreak(local.streak);
      setDaysPlayed(local.daysPlayed);
      setLastPlayed(local.lastPlayed);
    }
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      if (!data.user) return;
      // The server counts the day off its own clock, so winding the device
      // forward cannot buy you islands.
      recordPlayDay().then((row) => {
        if (!row) return;
        setStreak(row.streak);
        setDaysPlayed(row.days_played);
        setLastPlayed(row.last_played ?? local.lastPlayed);
      }).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const showUser = (metadata: Record<string, unknown>) => { setUsername(String(metadata.display_name ?? metadata.full_name ?? metadata.name ?? 'Island Player')); setAuthMode(null); };
    supabase.auth.getUser().then(({ data }) => { if (data.user) showUser(data.user.user_metadata); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) showUser(session.user.user_metadata);
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
  if (marketOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Walking into town…</p></main>}><TownMarketPage character={character} coins={shopCoins} ownedItems={ownedItems}
    supplies={supplies}
    onGather={setSupplies}
    onEat={(id) => setSupplies((pack) => ({ ...pack, [id]: Math.max(0, (pack[id] ?? 0) - 1) }))}
    onBuy={buyItem}
    onOpenHouseMarket={() => { setMarketOpen(false); setHouseMarketOpen(true); }}
    onBack={() => setMarketOpen(false)} /></Suspense>;
  const openGame = (id: GameId) => {
    setMoreOpen(false);
    if (id === 'tower') { onStart(selection); return; }
    if (id === 'hunger') setHungerOpen(true);
    if (id === 'medicine') setMedicineIsland('Mosslight 1');
    if (id === 'runner') setRunnerIsland('Mosslight 1');
    if (id === 'drive') setDriveOpen(true);
    if (id === 'riddle') setRiddleOpen(true);
    if (id === 'pong') setPongOpen(true);
    if (id === 'fruit') setGruitsOpen(true);
    if (id === 'escape') setEscapeOpen(true);
  };

  if (moreOpen) return <MoreGamesPage onPlay={openGame} onBack={() => setMoreOpen(false)} />;
  if (escapeOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Opening the front door…</p></main>}><EscapePage character={character} onEscape={(coins) => setShopCoins((total) => total + coins)} onBack={() => setEscapeOpen(false)} /></Suspense>;
  if (gruitsOpen) return <GruitsPage onScore={(points) => setShopCoins((total) => total + Math.max(1, Math.round(points / 10)))} onBack={() => setGruitsOpen(false)} />;
  if (pongOpen) return <PingPongPage character={character} inviteLink={inviteLink} onInvite={createFriendChallenge} onBack={() => setPongOpen(false)} />;
  if (riddleOpen) return <RiddlePage startLevel={riddleLevel}
    onSolved={(level, coins) => { setRiddleLevel((n) => Math.max(n, level + 1)); if (coins) setShopCoins((total) => total + coins); }}
    onBack={() => setRiddleOpen(false)} />;
  if (driveOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the track…</p></main>}><DriveMadPage onCoin={() => setShopCoins((total) => total + 1)} onBack={() => setDriveOpen(false)} /></Suspense>;
  if (runnerIsland) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the course…</p></main>}><RunnerUpPage character={character} islandName={runnerIsland} onCoin={() => setShopCoins((total) => total + 1)} onBack={() => setRunnerIsland('')} /></Suspense>;
  if (medicineIsland) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the herb forest…</p></main>}><MedicineMissionPage islandName={medicineIsland} onWin={(coins) => setShopCoins((total) => total + coins)} onBack={() => setMedicineIsland('')} /></Suspense>;
  if (hungerOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the forest…</p></main>}><HungerQuestPage character={character} onWin={(coins) => setShopCoins((total) => total + coins)} onBack={() => setHungerOpen(false)} /></Suspense>;
  if (worldOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading your 3D house…</p></main>}><HouseWorldPage character={character} initialMode={worldMode} season={houseSeason || currentSeason()} seed={houseSeed} onChangeSeason={setHouseSeason} houseName={houseName} houseWorld={houseWorld} furniture={houseFurniture} ownedItems={ownedItems}
    onChangeWorld={(update) => { setHouseWorld((previous) => update(previous || emptyWorld())); setOwnsHouse(true); if (!houseSource) setHouseSource('built'); }}
    onChangeFurniture={setHouseFurniture}
    onRename={setHouseName}
    onBack={() => { setWorldOpen(false); setHouseOpen(true); }} /></Suspense>;
  if (builderOpen) return <HouseBuilderPage coins={shopCoins} garden={garden} animals={animals}
    onChangeGarden={setGarden} onChangeAnimals={setAnimals}
    onEarn={(amount) => setShopCoins((total) => total + amount)}
    onSpend={(price) => { if (shopCoins < price) return false; setShopCoins((total) => total - price); return true; }}
    onBack={() => { setBuilderOpen(false); setHouseOpen(true); }} />;
  if (houseMarketOpen) return <HouseMarketPage coins={shopCoins} myGrid={houseWorld} myHouseName={houseName}
    onBack={() => { setHouseMarketOpen(false); setHouseOpen(true); }}
    onBought={(house) => {
      setShopCoins((total) => total - house.price);
      setHouseWorld(house.grid); setHouseName(house.name); setHouseSource('bought'); setOwnsHouse(true);
      setHouseMarketOpen(false); setHouseOpen(true);
    }} />;
  if (houseOpen) return <YourHousePage coins={shopCoins} ownsHouse={ownsHouse}
    houseWorld={houseWorld} houseName={houseName} houseSource={houseSource}
    onBuildOwn={() => { if (!houseWorld) setHouseWorld(emptyWorld()); setWorldMode('build'); setHouseOpen(false); setWorldOpen(true); }}
    onGoInside={() => { setWorldMode('walk'); setHouseOpen(false); setWorldOpen(true); }}
    onOpenGarden={() => { setHouseOpen(false); setBuilderOpen(true); }}
    onOpenMarket={() => { setHouseOpen(false); setHouseMarketOpen(true); }}
    onInvite={createFriendChallenge} onClose={() => setHouseOpen(false)} />;
  if (mapOpen) return <MapPage streak={streak} completedQuests={savedProfile.completedQuests} isMember={isMember} onBack={() => setMapOpen(false)} onInvite={createFriendChallenge} onJoinMembership={() => { setMapOpen(false); setRoyalOpen(true); }} onPlay={() => onStart(selection)} onPlayGame={(gameId, islandName) => { setMapOpen(false); if (gameId === 'medicine') setMedicineIsland(islandName); else if (gameId === 'runner') setRunnerIsland(islandName); }} />;
  if (streakOpen) return <StreakPage
    streak={streak} daysPlayed={daysPlayed} completedQuests={savedProfile.completedQuests}
    isMember={isMember} signedIn={signedIn}
    onGetMembership={() => { setStreakOpen(false); setRoyalOpen(true); }}
    onBack={() => setStreakOpen(false)} />;
  if (royalOpen) return <RoyalMemberPage isMember={isMember} onJoin={() => { setIsMember(true); setRoyalOpen(false); }} onLeave={() => setIsMember(false)} onBack={() => setRoyalOpen(false)} />;
  if (setup) return <AccountSetupPage
    userId={setup.userId}
    email={setup.email}
    needsPassword={setup.needsPassword}
    character={character}
    onChangeCharacter={setCharacter}
    onDone={(name) => { setUsername(name); setCharacterChosen(true); setSetup(null); }} />;
  if (profileOpen || !characterChosen) return <ProfilePage character={character} setting={setting} firstTime={!characterChosen} ownedItems={ownedItems} onChangeCharacter={setCharacter} onChangeSetting={setSetting} onChangeAccessory={setAccessory} onBuyAccessory={(id, price) => { if (shopCoins < price) return; setShopCoins((total) => total - price); setOwnedItems((items) => [...items, id]); setAccessory(id); }} onChosen={() => { setCharacterChosen(true); setProfileOpen(false); }} coins={shopCoins} foodBalance={foodBalance} completedQuests={savedProfile.completedQuests} isMember={isMember} accessory={accessory} realName={realName} birthday={birthday} country={country} onSavePrivate={(fields) => { setRealName(fields.realName); setBirthday(fields.birthday); setCountry(fields.country); }} onBack={() => setProfileOpen(false)} />;
  return (
    <main className="selection-page page-shell">
      <button className="menu-button" onClick={() => setMenuOpen(true)}>☰ Menu</button>
      <button className="friends-button" onClick={() => setFriendsOpen(true)}>Friends ☺</button>
      <button className="profile-button" onClick={() => setProfileOpen(true)} title="My profile" aria-label="My profile"><img src={characterAssets[character]} alt="" /></button>
      <button className={`crown-button ${isMember ? 'is-member' : ''}`} onClick={() => setRoyalOpen(true)} title="Royal Membership" aria-label="Royal Membership">♛</button>
      <button className={`streak-button ${streak > 0 ? 'burning' : ''}`} onClick={() => setStreakOpen(true)} title="Your daily streak" aria-label="Your daily streak"><span>🔥</span><b>{streak}</b></button>
      {username ? <><span className="signed-in-name">☺ {username}</span><button className="auth-button login-button" onClick={() => supabase.auth.signOut()}>Log out</button></> : <><button className="auth-button login-button" onClick={() => setAuthMode('signin')}>Log in</button><button className="auth-button signup-button" onClick={() => setAuthMode('signup')}>Sign up</button></>}
      <header className="royal-header"><p className="eyebrow">A 30-island adventure</p><h1><span>♛</span> Magical Islands <span>♛</span></h1><p>Climb cozy towers, finish quests, and unlock a magical kingdom—alone or together with friends.</p></header>
      <ProfileTab character={character} setting={setting} accessory={accessory} coins={shopCoins} foodBalance={foodBalance}
        collectibleAsset={collectible.asset} collectibleName={collectible.plural}
        completedQuests={savedProfile.completedQuests} isMember={isMember} ownsHouse={ownsHouse} houseName={houseName}
        onOpenProfile={() => setProfileOpen(true)} />
      <p className="games-sign">Games</p>
      <button className="power-button" onClick={() => onStart(selection)}>🏰 Tower Royal <span>→</span></button>
      <button className="hunger-button" onClick={() => setHungerOpen(true)}>🏹 Hunger Quests <span>→</span></button>
      <button className="medicine-button" onClick={() => setMedicineIsland(islands[0].name)}>🌿 Medicine Mission <span>→</span></button>
      <button className="runner-button" onClick={() => setRunnerIsland(islands[0].name)}>🏃 Runner Up <span>→</span></button>
      <button className="drive-button" onClick={() => setDriveOpen(true)}>🚚 Truck Trouble <span>→</span></button>
      <button className="riddle-button" onClick={() => setRiddleOpen(true)}>🧩 Riddle Rooms <span>→</span></button>
      <button className="pong-button" onClick={() => setPongOpen(true)}>🏓 Ping Pong <span>→</span></button>
      <button className="gruits-button" onClick={() => setGruitsOpen(true)}>🍓 Fruit <span>→</span></button>
      <button className="escape-button" onClick={() => setEscapeOpen(true)}>🔦 The Housekeeper <span>→</span></button>
      <button className="more-button" onClick={() => setMoreOpen(true)}>⊞ See all games <span>→</span></button>
      <Leaderboard />
      <ChallengeRoom onChallenge={createFriendChallenge} inviteLink={inviteLink} message={challengeMessage} />
      {menuOpen && <ShopMenu coins={shopCoins} foodBalance={foodBalance} ownedItems={ownedItems} onBuy={buyItem} onClose={() => setMenuOpen(false)} collectibleAsset={collectible.asset} collectibleName={collectible.plural} onOpenMarket={() => { setMenuOpen(false); setMarketOpen(true); }} onOpenHouse={() => { setMenuOpen(false); setHouseOpen(true); }} onOpenMap={() => { setMenuOpen(false); setMapOpen(true); }} />}
      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} onShare={() => { createFriendChallenge(); setFriendsOpen(false); }} />}
      {authMode && <div className="auth-backdrop" onClick={() => setAuthMode(null)}><div className="auth-modal" onClick={(event) => event.stopPropagation()}><button className="auth-close" onClick={() => setAuthMode(null)}>×</button><Auth key={authMode} initialMode={authMode} /></div></div>}
    </main>
  );
}
