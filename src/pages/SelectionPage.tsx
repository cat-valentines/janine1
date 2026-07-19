import { Suspense, lazy, useEffect, useState } from 'react';
import { ChallengeRoom } from '../components/ChallengeRoom';
import { Leaderboard } from '../components/Leaderboard';
import { PlayersDirectory } from '../components/PlayersDirectory';
import { ProfileTab } from '../components/ProfileTab';
import { ShopMenu } from '../components/ShopMenu';
import { challengeUrl, createChallenge } from '../lib/challenges';
import { supabase } from '../lib/supabase';
import { characterAssets, characterCollectibles } from '../game/characters';
import type { CharacterId, GameSelection, SettingId } from '../game/types';
import { FriendsPanel } from '../components/FriendsPanel';
import { Auth } from '../components/Auth';
import { loadLocalProfile, saveLocalProfile } from '../lib/localProfile';
import { navigate, paramOf, useRoute } from '../lib/router';
import { ensureGuestAccount, isAnonymous } from '../lib/players';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { countUnread, loadNotifications, loadSeenAt, markSeen, type NotificationItem } from '../lib/notifications';
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
const UnderwaterMazePage = lazy(() => import('./UnderwaterMazePage').then((m) => ({ default: m.UnderwaterMazePage })));
import { RiddlePage } from './RiddlePage';
import { PingPongPage } from './PingPongPage';
import { GruitsPage } from './GruitsPage';
import { ConnectorPage } from './ConnectorPage';
import { BlockUpPage } from './BlockUpPage';
import { TruthOrDarePage } from './TruthOrDarePage';
import { PiPage } from './PiPage';
import { TongueTwisterPage } from './TongueTwisterPage';
import { FrictionPage } from './FrictionPage';
import { MoreGamesPage } from './MoreGamesPage';
import type { GameId } from '../game/gameList';
import { AccountSetupPage } from './AccountSetupPage';
import { loadAccountState } from '../lib/players';

export function SelectionPage({ onStart }: { onStart: (selection: GameSelection) => void }) {
  const path = useRoute();
  const marketOpen = path === '/market';
  const houseOpen = path === '/house';
  const mapOpen = path === '/map';
  const riddleOpen = path === '/play/riddles';
  const pongOpen = path === '/play/pong';
  const gruitsOpen = path === '/play/fruit';
  const escapeOpen = path === '/play/housekeeper';
  const moreOpen = path === '/games';
  const profileOpen = path === '/profile';
  const royalOpen = path === '/royal';
  const streakOpen = path === '/streak';
  const builderOpen = path === '/house/build';
  const worldOpen = path === '/house/world';
  const hungerOpen = path === '/play/hunger';
  const driveOpen = path === '/play/truck';
  const houseMarketOpen = path === '/house/market';
  const connectorOpen = path === '/play/connector';
  const underwaterOpen = path === '/play/underwater';
  const blockUpOpen = path === '/play/blockup';
  const truthDareOpen = path === '/play/truthdare';
  const piOpen = path === '/play/pi';
  const tongueOpen = path === '/play/tongue';
  const frictionOpen = path === '/play/friction';
  const medicineIsland = paramOf(path, '/play/medicine');
  const runnerIsland = paramOf(path, '/play/runner');
  const home = () => navigate('/');

  const [savedProfile] = useState(loadLocalProfile);
  const [character, setCharacter] = useState<CharacterId>(savedProfile.character);
  const [setting, setSetting] = useState<SettingId>(savedProfile.setting);
  const [inviteLink, setInviteLink] = useState('');
  const [challengeMessage, setChallengeMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [characterChosen, setCharacterChosen] = useState(savedProfile.characterChosen);
  const [supplies, setSupplies] = useState(savedProfile.supplies);
  const [riddleLevel, setRiddleLevel] = useState(savedProfile.riddleLevel);
  const [streak, setStreak] = useState(savedProfile.streak);
  const [daysPlayed, setDaysPlayed] = useState(savedProfile.daysPlayed);
  const [lastPlayed, setLastPlayed] = useState(savedProfile.lastPlayed);
  const [signedIn, setSignedIn] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifSeen, setNotifSeen] = useState(loadSeenAt);
  const [worldMode, setWorldMode] = useState<'build' | 'walk'>('build');
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
  const [setup, setSetup] = useState<{ userId: string; email: string; needsPassword: boolean; isGuest: boolean } | null>(null);
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

  // Give a returning guest a lightweight account so they show up like everyone
  // else. A brand-new visitor gets theirs when they finish the character screen
  // (see makeGuestReal), so a passing bot that only loads the page makes no row.
  useEffect(() => {
    if (characterChosen) ensureGuestAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A player who has signed in but never finished the setup screen has no real
  // username yet, so nobody can find them. Send them to it once.
  useEffect(() => {
    const check = async (user: { id: string; email?: string; app_metadata?: { provider?: string }; is_anonymous?: boolean } | undefined) => {
      if (!user) { setSetup(null); return; }
      const account = await loadAccountState(user.id);
      // null means we could not tell — never trap someone on a form over that.
      if (!account || account.onboarded) { setSetup(null); return; }
      const guest = isAnonymous(user);
      setSetup({
        userId: user.id,
        email: user.email ?? '',
        needsPassword: !guest && (user.app_metadata?.provider ?? 'email') !== 'email',
        isGuest: guest,
      });
    };
    supabase.auth.getUser().then(({ data }) => check(data.user ?? undefined));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => check(session?.user ?? undefined));
    return () => data.subscription.unsubscribe();
  }, []);

  const makeGuestReal = () => { ensureGuestAccount(); };

  useEffect(() => {
    // Dev-only: lets the headless test push real-shaped notifications in.
    if (import.meta.env.DEV) (window as unknown as { __notifTest: unknown }).__notifTest = { setNotifs, setSignedIn };
    let stop = false;
    // Refresh on a timer so a friend's text lights up the 🔔 without a reload.
    const pull = () => supabase.auth.getUser().then(({ data }) => {
      if (!data.user || stop) return;
      loadNotifications(data.user.id).then((items) => { if (!stop) setNotifs(items); }).catch(() => undefined);
    });
    pull();
    const id = setInterval(pull, 20000);
    return () => { stop = true; clearInterval(id); };
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
    onOpenHouseMarket={() => { home(); navigate('/house/market'); }}
    onBack={() => home()} /></Suspense>;
  const openGame = (id: GameId) => {
    home();
    if (id === 'tower') { onStart(selection); return; }
    if (id === 'hunger') navigate('/play/hunger');
    if (id === 'medicine') navigate('/play/medicine/' + encodeURIComponent('Mosslight 1'));
    if (id === 'runner') navigate('/play/runner/' + encodeURIComponent('Mosslight 1'));
    if (id === 'drive') navigate('/play/truck');
    if (id === 'riddle') navigate('/play/riddles');
    if (id === 'pong') navigate('/play/pong');
    if (id === 'fruit') navigate('/play/fruit');
    if (id === 'escape') navigate('/play/housekeeper');
    if (id === 'connector') navigate('/play/connector');
    if (id === 'underwater') navigate('/play/underwater');
    if (id === 'blockup') navigate('/play/blockup');
    if (id === 'truthdare') navigate('/play/truthdare');
    if (id === 'pi') navigate('/play/pi');
    if (id === 'tongue') navigate('/play/tongue');
    if (id === 'friction') navigate('/play/friction');
  };

  if (moreOpen) return <MoreGamesPage onPlay={openGame} onBack={() => home()} />;
  if (escapeOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Opening the front door…</p></main>}><EscapePage character={character} onEscape={(coins) => setShopCoins((total) => total + coins)} onBack={() => home()} /></Suspense>;
  if (connectorOpen) return <ConnectorPage onScore={(points) => setShopCoins((total) => total + Math.max(1, Math.round(points / 40)))} onBack={() => home()} />;
  if (underwaterOpen) return <Suspense fallback={<main className="reef-page"><p className="world-loading">Diving into the reef…</p></main>}><UnderwaterMazePage onCoins={(gained) => setShopCoins((total) => total + gained)} onBack={() => home()} /></Suspense>;
  if (blockUpOpen) return <BlockUpPage onScore={(points) => setShopCoins((total) => total + Math.max(1, Math.round(points / 40)))} onBack={() => home()} />;
  if (truthDareOpen) return <TruthOrDarePage onBack={() => home()} />;
  if (piOpen) return <PiPage onScore={(digits) => setShopCoins((total) => total + Math.max(1, Math.round(digits / 4)))} onBack={() => home()} />;
  if (tongueOpen) return <TongueTwisterPage onScore={(coins) => setShopCoins((total) => total + coins)} onBack={() => home()} />;
  if (frictionOpen) return <FrictionPage onScore={(coins) => setShopCoins((total) => total + coins)} onBack={() => home()} />;
  if (gruitsOpen) return <GruitsPage onScore={(points) => setShopCoins((total) => total + Math.max(1, Math.round(points / 10)))} onBack={() => home()} />;
  if (pongOpen) return <PingPongPage character={character} inviteLink={inviteLink} onInvite={createFriendChallenge} onBack={() => home()} />;
  if (riddleOpen) return <RiddlePage startLevel={riddleLevel}
    onSolved={(level, coins) => { setRiddleLevel((n) => Math.max(n, level + 1)); if (coins) setShopCoins((total) => total + coins); }}
    onBack={() => home()} />;
  if (driveOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the track…</p></main>}><DriveMadPage onCoin={() => setShopCoins((total) => total + 1)} onBack={() => home()} /></Suspense>;
  if (runnerIsland) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the course…</p></main>}><RunnerUpPage character={character} islandName={runnerIsland} onCoin={() => setShopCoins((total) => total + 1)} onBack={() => home()} /></Suspense>;
  if (medicineIsland) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the herb forest…</p></main>}><MedicineMissionPage islandName={medicineIsland} onWin={(coins) => setShopCoins((total) => total + coins)} onBack={() => home()} /></Suspense>;
  if (hungerOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading the forest…</p></main>}><HungerQuestPage character={character} onWin={(coins) => setShopCoins((total) => total + coins)} onBack={() => home()} /></Suspense>;
  if (worldOpen) return <Suspense fallback={<main className="house-world-page"><p className="world-loading">Loading your 3D house…</p></main>}><HouseWorldPage character={character} initialMode={worldMode} season={houseSeason || currentSeason()} seed={houseSeed} onChangeSeason={setHouseSeason} houseName={houseName} houseWorld={houseWorld} furniture={houseFurniture} ownedItems={ownedItems}
    onChangeWorld={(update) => { setHouseWorld((previous) => update(previous || emptyWorld())); setOwnsHouse(true); if (!houseSource) setHouseSource('built'); }}
    onChangeFurniture={setHouseFurniture}
    onRename={setHouseName}
    onBack={() => { navigate('/house'); navigate('/house'); }} /></Suspense>;
  if (builderOpen) return <HouseBuilderPage coins={shopCoins} garden={garden} animals={animals}
    onChangeGarden={setGarden} onChangeAnimals={setAnimals}
    onEarn={(amount) => setShopCoins((total) => total + amount)}
    onSpend={(price) => { if (shopCoins < price) return false; setShopCoins((total) => total - price); return true; }}
    onBack={() => { navigate('/house'); navigate('/house'); }} />;
  if (houseMarketOpen) return <HouseMarketPage coins={shopCoins} myGrid={houseWorld} myHouseName={houseName}
    onBack={() => { navigate('/house'); navigate('/house'); }}
    onBought={(house) => {
      setShopCoins((total) => total - house.price);
      setHouseWorld(house.grid); setHouseName(house.name); setHouseSource('bought'); setOwnsHouse(true);
      navigate('/house'); navigate('/house');
    }} />;
  if (houseOpen) return <YourHousePage coins={shopCoins} ownsHouse={ownsHouse}
    houseWorld={houseWorld} houseName={houseName} houseSource={houseSource}
    onBuildOwn={() => { if (!houseWorld) setHouseWorld(emptyWorld()); setWorldMode('build'); home(); navigate('/house/world'); }}
    onGoInside={() => { setWorldMode('walk'); home(); navigate('/house/world'); }}
    onOpenGarden={() => { home(); navigate('/house/build'); }}
    onOpenMarket={() => { home(); navigate('/house/market'); }}
    onInvite={createFriendChallenge} onClose={() => home()} />;
  if (mapOpen) return <MapPage streak={streak} completedQuests={savedProfile.completedQuests} isMember={isMember} onBack={() => home()} onInvite={createFriendChallenge} onJoinMembership={() => { home(); navigate('/royal'); }} onPlay={() => onStart(selection)} onPlayGame={(gameId, islandName) => { home(); if (gameId === 'medicine') navigate('/play/medicine/' + encodeURIComponent(islandName)); else if (gameId === 'runner') navigate('/play/runner/' + encodeURIComponent(islandName)); }} />;
  if (streakOpen) return <StreakPage
    streak={streak} daysPlayed={daysPlayed} completedQuests={savedProfile.completedQuests}
    isMember={isMember} signedIn={signedIn}
    onGetMembership={() => { home(); navigate('/royal'); }}
    onBack={() => home()} />;
  if (royalOpen) return <RoyalMemberPage isMember={isMember} onJoin={() => { setIsMember(true); home(); }} onLeave={() => setIsMember(false)} onBack={() => home()} />;
  if (setup) return <AccountSetupPage
    userId={setup.userId}
    email={setup.email}
    needsPassword={setup.needsPassword}
    isGuest={setup.isGuest}
    character={character}
    onChangeCharacter={setCharacter}
    onDone={(name) => { setUsername(name); setCharacterChosen(true); setSetup(null); }} />;
  if (profileOpen || !characterChosen) return <ProfilePage character={character} setting={setting} firstTime={!characterChosen} ownedItems={ownedItems} onChangeCharacter={setCharacter} onChangeSetting={setSetting} onChangeAccessory={setAccessory} onBuyAccessory={(id, price) => { if (shopCoins < price) return; setShopCoins((total) => total - price); setOwnedItems((items) => [...items, id]); setAccessory(id); }} onChosen={() => { setCharacterChosen(true); makeGuestReal(); home(); }} coins={shopCoins} foodBalance={foodBalance} completedQuests={savedProfile.completedQuests} isMember={isMember} accessory={accessory} realName={realName} birthday={birthday} country={country} onSavePrivate={(fields) => { setRealName(fields.realName); setBirthday(fields.birthday); setCountry(fields.country); }} onBack={() => home()} />;
  return (
    <main className="selection-page page-shell">
      <button className="menu-button" onClick={() => setMenuOpen(true)}>☰ Menu</button>
      <button className="friends-button" onClick={() => setFriendsOpen(true)}>Friends ☺</button>
      <button className="profile-button" onClick={() => navigate('/profile')} title="My profile" aria-label="My profile"><img src={characterAssets[character]} alt="" /></button>
      <button className={`crown-button ${isMember ? 'is-member' : ''}`} onClick={() => navigate('/royal')} title="Royal Membership" aria-label="Royal Membership">♛</button>
      <button className={`streak-button ${streak > 0 ? 'burning' : ''}`} onClick={() => navigate('/streak')} title="Your daily streak" aria-label="Your daily streak"><span>🔥</span><b>{streak}</b></button>
      <button className="notif-button" onClick={() => { setNotifOpen(true); markSeen(); setNotifSeen(loadSeenAt()); }} title="Notifications" aria-label="Notifications">🔔{countUnread(notifs, notifSeen) > 0 && <i className="notif-badge">{Math.min(9, countUnread(notifs, notifSeen))}</i>}</button>
      {username ? <><span className="signed-in-name">☺ {username}</span><button className="auth-button login-button" onClick={() => supabase.auth.signOut()}>Log out</button></> : <><button className="auth-button login-button" onClick={() => setAuthMode('signin')}>Log in</button><button className="auth-button signup-button" onClick={() => setAuthMode('signup')}>Sign up</button></>}
      <header className="royal-header"><p className="eyebrow">A 30-island adventure</p><h1><span>♛</span> Magical Islands <span>♛</span></h1><p>Climb cozy towers, finish quests, and unlock a magical kingdom—alone or together with friends.</p></header>
      <ProfileTab character={character} setting={setting} accessory={accessory} coins={shopCoins} foodBalance={foodBalance}
        collectibleAsset={collectible.asset} collectibleName={collectible.plural}
        completedQuests={savedProfile.completedQuests} isMember={isMember} ownsHouse={ownsHouse} houseName={houseName}
        onOpenProfile={() => navigate('/profile')} />
      <p className="games-sign">Games</p>
      <div className="game-grid">
        <button className="power-button" onClick={() => onStart(selection)}>🏰 Tower Royal <span>→</span></button>
        <button className="hunger-button" onClick={() => navigate('/play/hunger')}>🏹 Hunger Quests <span>→</span></button>
        <button className="medicine-button" onClick={() => navigate('/play/medicine/' + encodeURIComponent(islands[0].name))}>🌿 Medicine Mission <span>→</span></button>
        <button className="runner-button" onClick={() => navigate('/play/runner/' + encodeURIComponent(islands[0].name))}>🏃 Runner Up <span>→</span></button>
        <button className="drive-button" onClick={() => navigate('/play/truck')}>🚚 Truck Trouble <span>→</span></button>
        <button className="riddle-button" onClick={() => navigate('/play/riddles')}>🧩 Riddle Rooms <span>→</span></button>
        <button className="pong-button" onClick={() => navigate('/play/pong')}>🏓 Ping Pong <span>→</span></button>
        <button className="gruits-button" onClick={() => navigate('/play/fruit')}>🍓 Fruit <span>→</span></button>
        <button className="escape-button" onClick={() => navigate('/play/housekeeper')}>🔦 The Housekeeper <span>→</span></button>
        <button className="connector-button" onClick={() => navigate('/play/connector')}>🔢 Connector <span>→</span></button>
        <button className="underwater-button" onClick={() => navigate('/play/underwater')}>🐠 Underwater Maze <span>→</span></button>
        <button className="blockup-button" onClick={() => navigate('/play/blockup')}>🧱 Block Up <span>→</span></button>
        <button className="truthdare-button" onClick={() => navigate('/play/truthdare')}>🌀 Truth or Dare <span>→</span></button>
        <button className="pi-button" onClick={() => navigate('/play/pi')}>π Pi <span>→</span></button>
        <button className="tongue-button" onClick={() => navigate('/play/tongue')}>👅 Tongue Twister <span>→</span></button>
        <button className="friction-button" onClick={() => navigate('/play/friction')}>🧊 Slip &amp; Grip <span>→</span></button>
      </div>
      <button className="more-button" onClick={() => navigate('/games')}>⊞ See all games <span>→</span></button>
      <Leaderboard />
      <PlayersDirectory onOpenFriends={() => setFriendsOpen(true)} />
      <ChallengeRoom onChallenge={createFriendChallenge} inviteLink={inviteLink} message={challengeMessage} />
      {menuOpen && <ShopMenu coins={shopCoins} foodBalance={foodBalance} ownedItems={ownedItems} onBuy={buyItem} onClose={() => setMenuOpen(false)} collectibleAsset={collectible.asset} collectibleName={collectible.plural} onOpenMarket={() => { setMenuOpen(false); navigate('/market'); }} onOpenHouse={() => { setMenuOpen(false); navigate('/house'); }} onOpenMap={() => { setMenuOpen(false); navigate('/map'); }} onInviteFriend={() => { setMenuOpen(false); setFriendsOpen(true); }} />}
      {notifOpen && <NotificationsPanel items={notifs} signedIn={signedIn} seenAt={notifSeen} onClose={() => setNotifOpen(false)} onOpenFriends={() => { setNotifOpen(false); setFriendsOpen(true); }} />}
      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} onShare={() => { createFriendChallenge(); setFriendsOpen(false); }} />}
      {authMode && <div className="auth-backdrop" onClick={() => setAuthMode(null)}><div className="auth-modal" onClick={(event) => event.stopPropagation()}><button className="auth-close" onClick={() => setAuthMode(null)}>×</button><Auth key={authMode} initialMode={authMode} /></div></div>}
    </main>
  );
}
