const leaders = [
  ['1', 'Luna', '8,920', '12', 'Special character'],
  ['2', 'Kai', '7,650', '10', 'Early island pass'],
  ['3', 'Mira', '6,410', '9', '5 bonus coins'],
  ['4', 'You', '1,240', '2', 'Power-up'],
];

export function Leaderboard() {
  return (
    <section className="panel leaderboard">
      <div className="section-heading"><div><span className="card-kicker">Island rankings</span><h2>Leaderboard</h2></div><span className="leader-prize">👑 Luna can win a special character</span></div>
      <div className="leader-table" role="table">
        <div className="leader-row header" role="row"><span>Rank</span><span>Player</span><span>Score</span><span>Level</span><span>Prize</span></div>
        {leaders.map((row) => <div className={`leader-row ${row[1] === 'You' ? 'you' : ''}`} role="row" key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}
      </div>
      <p className="fine-print">Each seasonal prize can only be claimed once.</p>
    </section>
  );
}
