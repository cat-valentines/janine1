import { useEffect, useRef, useState } from 'react';
import { loadMyStats, type MyStats } from '../lib/players';
import { supabase } from '../lib/supabase';
import { characterAssets } from '../game/characters';
import { islands } from '../game/islands';
import { itemById } from '../shop/catalog';
import { accessoryById } from '../game/accessories';
import type { CharacterId, SettingId } from '../game/types';

const names: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit', koala: 'Bridey', teddy: 'Adi', panda: 'Scarlet', tiger: 'Elena', piggy: 'Piggy', parrot: 'Polly', mila: 'Mila', gabby: 'Gabby', amsaal: 'Amsaal', misha: 'Misha' };
const houses: Record<SettingId, string> = { haunted: 'Haunted House', secret: 'Secret Rooms', power: 'Power House' };

interface ProfileTabProps {
  character: CharacterId;
  setting: SettingId;
  accessory: string;
  coins: number;
  foodBalance: number;
  collectibleAsset: string;
  collectibleName: string;
  completedQuests: number;
  isMember: boolean;
  ownsHouse: boolean;
  houseName: string;
  onOpenProfile: () => void;
}

export function ProfileTab(props: ProfileTabProps) {
  const { character, setting, accessory, coins, foodBalance, collectibleAsset, collectibleName, completedQuests, isMember, ownsHouse, houseName, onOpenProfile } = props;
  const [stats, setStats] = useState<MyStats | null>(null);
  const [userId, setUserId] = useState('');
  const userIdRef = useRef('');

  // Your "score" here is your leaderboard score (total_score) — the running
  // total of everything you've earned. Keep it fresh so it always matches the
  // number on the leaderboard, not a stale value from when the page loaded.
  useEffect(() => {
    const read = (id: string) => { if (id) loadMyStats(id).then(setStats).catch(() => undefined); };
    const setId = (id: string) => { userIdRef.current = id; setUserId(id); if (id) read(id); else setStats(null); };
    supabase.auth.getUser().then(({ data }) => setId(data.user?.id ?? ''));
    const timer = setInterval(() => read(userIdRef.current), 12000);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setId(session?.user?.id ?? ''));
    return () => { clearInterval(timer); data.subscription.unsubscribe(); };
  }, []);

  // Earning coins bumps your leaderboard score too — re-read it right after.
  useEffect(() => {
    if (!userId) return;
    const id = setTimeout(() => loadMyStats(userId).then(setStats).catch(() => undefined), 1500);
    return () => clearTimeout(id);
  }, [coins, userId]);

  // Where you live: the furthest island you have unlocked so far.
  const unlocked = islands.filter((island) => completedQuests >= island.questsNeeded && (!island.membersOnly || isMember));
  const home = unlocked[unlocked.length - 1] ?? islands[0];
  const worn = accessoryById(accessory) ?? itemById(accessory);

  const badges = [
    { got: completedQuests >= 1, icon: '⭐', label: 'First quest done' },
    { got: completedQuests >= 10, icon: '🗺️', label: 'Unlocked island 2' },
    { got: ownsHouse, icon: '🏡', label: houseName ? `Built ${houseName}` : 'Has a house' },
    { got: (stats?.total_score ?? 0) > 0, icon: '🏆', label: 'On the leaderboard' },
    { got: isMember, icon: '♛', label: 'Royal Member' },
  ];

  return (
    <section className="profile-tab">
      <div className="profile-tab-top">
        <button className="profile-tab-picture" onClick={onOpenProfile} title="Open my profile">
          <img src={characterAssets[character]} alt={names[character]} />
          {worn && <b>{worn.icon}</b>}
        </button>
        <div className="profile-tab-who">
          <h2>{stats?.display_name ?? 'Guest Adventurer'}{isMember && <em>♛</em>}</h2>
          <p>🏝️ Lives on <strong>{home.icon} {home.name}</strong></p>
          <p>🏠 {names[character]} · {ownsHouse && houseName ? houseName : houses[setting]}</p>
        </div>
        <div className="profile-tab-money">
          <span><img src="/assets/pixel-coin.png" alt="" /> <b>{coins}</b></span>
          <span><img src={collectibleAsset} alt="" /> <b>{foodBalance}</b></span>
          <small>{collectibleName}</small>
        </div>
      </div>

      <div className="profile-tab-stats">
        <span><b>⭐ {completedQuests}</b> quests</span>
        <span><b>🏝️ {unlocked.length}</b>/30 islands</span>
        <span><b>🏆 {(stats?.total_score ?? 0).toLocaleString()}</b> score</span>
        <span><b>🏠 {stats?.current_level ?? 1}</b> level</span>
      </div>

      <div className="profile-tab-badges">
        {badges.map((badge) => <i className={badge.got ? 'got' : ''} key={badge.label} title={badge.label}>{badge.icon} {badge.label}</i>)}
      </div>
    </section>
  );
}
