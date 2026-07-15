import { useEffect, useState } from 'react';
import { loadMyStats, type MyStats } from '../lib/players';
import { supabase } from '../lib/supabase';
import { characterAssets } from '../game/characters';
import { islands } from '../game/islands';
import { itemById } from '../shop/catalog';
import type { CharacterId, SettingId } from '../game/types';

const names: Record<CharacterId, string> = { cottontail: 'Cottontail', momo: 'Momo', toby: 'Toby', ollie: 'Ollie', coral: 'Coral', biscuit: 'Biscuit' };
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

  useEffect(() => {
    const read = (id?: string) => {
      if (!id) { setStats(null); return; }
      loadMyStats(id).then(setStats).catch(() => setStats(null));
    };
    supabase.auth.getUser().then(({ data }) => read(data.user?.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => read(session?.user?.id));
    return () => data.subscription.unsubscribe();
  }, []);

  // Where you live: the furthest island you have unlocked so far.
  const unlocked = islands.filter((island) => completedQuests >= island.questsNeeded && (!island.membersOnly || isMember));
  const home = unlocked[unlocked.length - 1] ?? islands[0];
  const worn = itemById(accessory);

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
