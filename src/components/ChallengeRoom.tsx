interface ChallengeRoomProps { onChallenge: () => void; inviteLink: string; message: string }

export function ChallengeRoom({ onChallenge, inviteLink, message }: ChallengeRoomProps) {
  return (
    <section className="panel challenge-panel">
      <div><span className="card-kicker">Play safely together</span><h2>Challenge Room</h2>
        <p>Reach a shared score of 5,000. Invitation links contain a random code—never an email or account ID.</p></div>
      <div className="shared-goal"><div><strong>2,150 / 5,000</strong><small>Shared stars</small></div><div className="goal-track"><i /></div><span>Reward: 🎁 5 bonus coins each</span></div>
      <div className="friends"><span>🐰 You · Floor 6</span><span>🐻 Luna · Floor 8</span><span>🦊 Kai · Floor 4</span></div>
      <button className="primary-button" onClick={onChallenge}>Challenge Friends</button>
      {inviteLink && <div className="invite-box"><input readOnly value={inviteLink} aria-label="Challenge invitation link" /><button onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy</button></div>}
      {message && <p className="fine-print">{message}</p>}
    </section>
  );
}
