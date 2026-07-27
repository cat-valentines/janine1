import { RewardsPanel } from '../components/RewardsPanel';

export function RewardsPage({ onBack }: { onBack: () => void }) {
  return <main className="rewards-page">
    <header className="rewards-top">
      <button onClick={onBack}>← Back</button>
      <div><p className="eyebrow">Your prizes</p><h1>🏆 My Rewards</h1></div>
    </header>
    <RewardsPanel />
  </main>;
}
