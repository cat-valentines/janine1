import { useState } from 'react';
import { islands } from '../game/islands';

export const ROYAL_PRICE = '$1.90';

interface RoyalMemberPageProps {
  isMember: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onBack: () => void;
}

const perks = [
  { icon: '🏝️', title: 'Royal islands', blurb: 'Islands 10, 20 and 30 are members only — nobody else can land there.' },
  { icon: '🎮', title: 'More games', blurb: 'Every royal island has its own games, locked to members.' },
  { icon: '♛', title: 'Royal Member sign', blurb: 'A golden sign on your profile so everyone knows.' },
  { icon: '👑', title: 'Royal crown style', blurb: 'Wear the crown in the Royal Style Shop.' },
];

export function RoyalMemberPage({ isMember, onJoin, onLeave, onBack }: RoyalMemberPageProps) {
  const [confirming, setConfirming] = useState(false);
  const royalIslands = islands.filter((island) => island.membersOnly);

  return <main className="quest-pick royal-page">
    <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>{isMember ? '♛ You are a Royal Member' : `♛ ${ROYAL_PRICE} a month`}</span></div>

    <header className="quest-header royal-header-card">
      <p className="eyebrow">Magical Islands</p>
      <h1><span>♛</span> Royal Membership <span>♛</span></h1>
      <p>{isMember ? 'Thank you for being a Royal Member!' : `Unlock the royal islands and their games for ${ROYAL_PRICE} a month.`}</p>
    </header>

    <section className="quest-pick-card">
      {isMember ? <>
        <p className="card-kicker">Your membership</p>
        <h2>♛ You are a Royal Member</h2>
        <p>All {royalIslands.length} royal islands and their games are unlocked, and your golden sign is showing on your profile.</p>
      </> : <>
        <p className="card-kicker">Royal Membership</p>
        <h2>Become a Royal Member</h2>
        <p>Royal Members get the locked islands, the games on them, and a golden sign on their profile.</p>
      </>}

      <div className="royal-perks">
        {perks.map((perk) => <div className="royal-perk" key={perk.title}>
          <span>{perk.icon}</span>
          <strong>{perk.title}</strong>
          <small>{perk.blurb}</small>
        </div>)}
      </div>

      <div className="royal-islands">
        <p className="card-kicker">Royal islands</p>
        {royalIslands.map((island) => <span key={island.id}>{island.icon} {island.name}</span>)}
      </div>

      {isMember ? <>
        <button className="royal-leave" onClick={onLeave}>Stop being a Royal Member</button>
      </> : <>
        <div className="royal-price"><b>{ROYAL_PRICE}</b><small>every month · stop any time</small></div>
        {!confirming
          ? <button className="profile-start royal-join" onClick={() => setConfirming(true)}>♛ Become a Royal Member <span>→</span></button>
          : <div className="royal-confirm">
            <p>👑 Ask a grown-up before you join! Royal Membership costs <strong>{ROYAL_PRICE} every month</strong> until you stop it.</p>
            <button className="profile-start royal-join" onClick={onJoin}>Yes, I asked — join for {ROYAL_PRICE}/month</button>
            <button className="ghost" onClick={() => setConfirming(false)}>Not now</button>
          </div>}
      </>}
    </section>
  </main>;
}
