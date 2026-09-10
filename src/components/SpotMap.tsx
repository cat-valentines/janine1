import { useEffect, useState } from 'react';
import { distanceWords, kmBetween, mapEmbedUrl, mapLinkUrl, readSpot, type Precision, type Spot } from '../lib/friendLocation';

/**
 * A friend's position on a real map, with how far away they are.
 *
 * Used both by "Where are they?" and by the card that appears when a friend
 * shares with you out of the blue, so a shared spot always looks the same.
 */
export function SpotMap({ name, spot, how }: { name: string; spot: Spot; how: Precision }) {
  const [mine, setMine] = useState<Spot | null>(null);

  useEffect(() => {
    // Your own position, only so the map can say how far away they are. It is
    // worked out here and never sent anywhere.
    let dead = false;
    readSpot().then((s) => { if (!dead) setMine(s); }).catch(() => undefined);
    return () => { dead = true; };
  }, []);

  const km = mine ? kmBetween(mine, spot) : null;

  return <>
    <iframe className="loc-frame" title={`Map showing ${name}`} src={mapEmbedUrl(spot, how)} loading="lazy" />
    <div className="loc-facts">
      <strong>{name} is {km === null ? 'here' : distanceWords(km)}</strong>
      <small>
        {how === 'exact' ? 'They shared their exact spot.' : 'They shared their rough area, not their exact spot.'}
        {' '}Live, not saved anywhere.
      </small>
      <a href={mapLinkUrl(spot)} target="_blank" rel="noreferrer noopener">Open in maps ↗</a>
    </div>
  </>;
}
