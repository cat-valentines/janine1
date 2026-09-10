import { useEffect, useRef, useState } from 'react';
import {
  allowsAlways, askFriendForLocation, clearAllowList, distanceWords, kmBetween, mapEmbedUrl, mapLinkUrl,
  precision, readSpot, setAlwaysAllow, setPrecision, setSharingOn, sharingOn,
  type LocationReply, type Precision, type Spot,
} from '../lib/friendLocation';

/**
 * "Where are you?" — the map you get after a friend says yes.
 *
 * Nothing shows until they answer. If they say no, or they are not online, or
 * they have sharing switched off, that is what it says — it never guesses at a
 * position or shows an old one, because no old one is kept anywhere.
 */

type Stage = 'idle' | 'asking' | 'shown' | 'refused' | 'off' | 'quiet' | 'trouble';

interface FriendMapProps {
  me: { id: string; name: string };
  friend: { id: string; name: string };
  onClose: () => void;
}

/** How long to wait for an answer before deciding they are not there. */
const WAIT_MS = 20000;

export function FriendMap({ me, friend, onClose }: FriendMapProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [how, setHow] = useState<Precision>('area');
  const [mySpot, setMySpot] = useState<Spot | null>(null);
  const [why, setWhy] = useState('');
  const stopAsk = useRef<(() => void) | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { stopAsk.current?.(); if (timer.current) clearTimeout(timer.current); }, []);

  const ask = () => {
    stopAsk.current?.();
    if (timer.current) clearTimeout(timer.current);
    setStage('asking');
    setSpot(null);
    setWhy('');
    stopAsk.current = askFriendForLocation(me, friend, (reply: LocationReply) => {
      if (timer.current) clearTimeout(timer.current);
      if (reply.ev === 'spot') {
        setSpot(reply.spot);
        setHow(reply.precision);
        setStage('shown');
        // Your own position, only so the map can say how far away they are. It
        // is never sent anywhere.
        readSpot().then(setMySpot).catch(() => setMySpot(null));
      } else if (reply.ev === 'no') setStage('refused');
      else if (reply.ev === 'off') setStage('off');
      else { setWhy(reply.why); setStage('trouble'); }
    });
    timer.current = window.setTimeout(() => setStage('quiet'), WAIT_MS);
  };

  const km = spot && mySpot ? kmBetween(mySpot, spot) : null;

  return (
    <div className="loc-map-backdrop" onClick={onClose}>
      <div className="loc-map" onClick={(e) => e.stopPropagation()}>
        <div className="loc-map-top">
          <h3>📍 Where is {friend.name}?</h3>
          <button className="loc-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {stage === 'idle' && <div className="loc-stage">
          <p>
            Ask <b>{friend.name}</b> where they are. They will be asked first, and they can say no —
            you will only ever see a place if they say yes. Nothing is saved.
          </p>
          <button className="loc-go" onClick={ask}>📍 Ask {friend.name} to share</button>
        </div>}

        {stage === 'asking' && <div className="loc-stage">
          <p className="loc-waiting">⏳ Asked {friend.name}… waiting for them to answer.</p>
          <small>They have to be in the app to answer. If nothing happens, they are probably not online.</small>
        </div>}

        {stage === 'shown' && spot && <>
          <iframe
            className="loc-frame"
            title={`Map showing ${friend.name}`}
            src={mapEmbedUrl(spot, how)}
            loading="lazy"
          />
          <div className="loc-facts">
            <strong>{friend.name} is {km === null ? 'here' : distanceWords(km)}</strong>
            <small>
              {how === 'exact'
                ? 'They shared their exact spot.'
                : 'They shared their rough area, not their exact spot.'}
              {' '}Updated just now — this is live, not saved.
            </small>
            <a href={mapLinkUrl(spot)} target="_blank" rel="noreferrer noopener">Open in maps ↗</a>
          </div>
          <button className="loc-again" onClick={ask}>↻ Ask again for their spot now</button>
        </>}

        {stage === 'refused' && <div className="loc-stage">
          <p>🙅 {friend.name} said no this time. That is completely up to them.</p>
          <button className="loc-again" onClick={onClose}>Alright</button>
        </div>}

        {stage === 'off' && <div className="loc-stage">
          <p>🔕 {friend.name} has location sharing switched off.</p>
          <button className="loc-again" onClick={onClose}>Alright</button>
        </div>}

        {stage === 'quiet' && <div className="loc-stage">
          <p>💤 No answer — {friend.name} is probably not on Magical Islands right now.</p>
          <button className="loc-again" onClick={ask}>Try again</button>
        </div>}

        {stage === 'trouble' && <div className="loc-stage">
          <p>⚠️ {friend.name} tried to share, but: {why}</p>
          <button className="loc-again" onClick={ask}>Try again</button>
        </div>}

        <MySharing friendName={friend.name} friendId={friend.id} />
      </div>
    </div>
  );
}

/**
 * Your own sharing settings, right where you are thinking about location: the
 * off switch, how exact you are, and who you have said "always" to.
 */
function MySharing({ friendId, friendName }: { friendId: string; friendName: string }) {
  const [on, setOn] = useState(sharingOn);
  const [how, setHow] = useState<Precision>(precision);
  const [always, setAlways] = useState(() => allowsAlways(friendId));

  const flip = () => {
    if (!on) {
      // The warning, before anything is shared for the first time.
      const sure = window.confirm(
        'Are you sure you want to share your location with players?\n\n'
        + 'Only friends can ask, and you get to say yes or no every single time. '
        + 'Your location is never saved anywhere — it is sent straight to the friend who asked.\n\n'
        + 'You can switch this off again whenever you like.',
      );
      if (!sure) return;
    }
    setSharingOn(!on);
    setOn(!on);
  };

  return (
    <details className="loc-settings">
      <summary>⚙️ My location sharing</summary>
      <label className="loc-switch">
        <input type="checkbox" checked={on} onChange={flip} />
        <span>{on ? 'Friends can ask where I am' : 'Nobody can ask where I am'}</span>
      </label>
      {on && <>
        <div className="loc-precision">
          <button className={how === 'area' ? 'on' : ''} onClick={() => { setPrecision('area'); setHow('area'); }}>
            🏘️ My area
            <small>About a kilometre — safer</small>
          </button>
          <button className={how === 'exact' ? 'on' : ''} onClick={() => { setPrecision('exact'); setHow('exact'); }}>
            📌 My exact spot
            <small>Pinpoint — only for people you trust</small>
          </button>
        </div>
        <label className="loc-switch">
          <input
            type="checkbox"
            checked={always}
            onChange={() => { setAlwaysAllow(friendId, !always); setAlways(!always); }}
          />
          <span>Never ask me again about <b>{friendName}</b></span>
        </label>
        <button className="loc-forget" onClick={() => { clearAllowList(); setAlways(false); }}>
          Forget everyone I said “always” to
        </button>
      </>}
      <p className="loc-fine">Your location is never stored — not by this app, not anywhere. It is read from your device only when you say yes, and sent to that one friend.</p>
    </details>
  );
}
