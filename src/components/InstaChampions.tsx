import { INSTA_PRIZES, MEDALS, latestHonours, placeIn } from '../lib/honours';

/**
 * The end-of-month champions card, pinned at the top of the Insta feed.
 *
 * Everybody sees who won and what they won, which is the congratulations going
 * out to the whole island; a medallist also sees their own Insta prize called
 * out, with their name highlighted on the podium.
 */
export function InstaChampions({ username }: { username: string }) {
  const result = latestHonours();
  if (!result) return null;
  const mine = placeIn(result, username);

  return (
    <article className={`insta-champions ${mine ? 'mine' : ''}`}>
      <header>
        <span className="champ-cup">🏆</span>
        <div>
          <strong>{result.label} champions</strong>
          <small>{result.endsSeason ? 'Season finale — the podium took the Champion Cup too' : 'Top three on the leaderboard this month'}</small>
        </div>
      </header>

      <ol className="champ-podium">
        {result.podium.map((who, i) => {
          const place = (i + 1) as 1 | 2 | 3;
          const isMe = !!username && who.trim().toLowerCase() === username.trim().toLowerCase();
          return (
            <li key={who} className={isMe ? 'you' : ''}>
              <span className="champ-medal">{MEDALS[place].icon}</span>
              <div>
                <strong>@{who}{isMe ? ' (you)' : ''}</strong>
                <small>{INSTA_PRIZES[place]}</small>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="champ-note">
        {mine
          ? `🎉 Congratulations! You finished ${MEDALS[mine].name.toLowerCase()} — your prize is on your profile, and your medal is on your trophy shelf.`
          : '🎉 Congratulations to all three! Finish next month in the top three and your name is here, with a medal and an Insta prize of your own.'}
      </p>
    </article>
  );
}
