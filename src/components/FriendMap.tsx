import { useEffect, useRef, useState } from 'react';
import {
  askFriendForLocation, distanceWords, friendRule, kmBetween, leaveLocationRequestInChat, mapEmbedUrl, mapLinkUrl,
  readSpot, setFriendRule, setSharingOn, sharingOn,
  type FriendRule, type LocationReply, type Precision, type Spot,
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
    // Leave it in the chat as well, so a friend who is away still finds out.
    void leaveLocationRequestInChat(me.id, me.name, friend.id);
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
          <small>Your request is waiting in your chat with them, so they will see it when they come back.</small>
          <button className="loc-again" onClick={ask}>Try again</button>
        </div>}

        {stage === 'trouble' && <div className="loc-stage">
          <p>⚠️ {friend.name} tried to share, but: {why}</p>
          <button className="loc-again" onClick={ask}>Try again</button>
        </div>}

        <MySharing friendId={friend.id} friendName={friend.name} />
      </div>
    </div>
  );
}

/**
 * Your own sharing settings: the master switch, then what this one friend may
 * see. Different friends can be told different things — your closest can have
 * your exact spot, someone else only the part of town, and someone else nothing
 * at all. Nobody ever sees anything without asking first, whatever their rule.
 */
function MySharing({ friendId, friendName }: { friendId: string; friendName: string }) {
  const [on, setOn] = useState(sharingOn);
  const [rule, setRule] = useState<FriendRule>(() => friendRule(friendId));

  const choose = (next: FriendRule) => { setFriendRule(friendId, next); setRule(next); };

  const start = () => {
    // The warning, before anything is ever shared.
    const sure = window.confirm(
      'Are you sure you want to share your location with players?\n\n'
      + 'Only friends can ask, and you get to say yes or no every single time. '
      + 'Your location is never saved anywhere — it is sent straight to the friend who asked.\n\n'
      + 'You can press Stop sharing whenever you like.',
    );
    if (!sure) return;
    setSharingOn(true);
    setOn(true);
  };
  const stop = () => { setSharingOn(false); setOn(false); };

  return (
    <details className="loc-settings" open>
      <summary>⚙️ My location sharing</summary>
      <p className={`loc-state ${on ? 'on' : 'off'}`}>
        {on ? '📍 Friends can ask where you are. You still say yes or no each time.' : '🔕 Nobody can ask where you are.'}
      </p>
      <div className="loc-buttons">
        <button className={`loc-share ${on ? 'on' : ''}`} onClick={start} disabled={on}>📍 Share</button>
        <button className={`loc-stop ${!on ? 'on' : ''}`} onClick={stop} disabled={!on}>🛑 Stop sharing</button>
      </div>
      {on && <>
        <p className="loc-who">What <b>{friendName}</b> can see when they ask:</p>
        <div className="loc-precision three">
          <button className={rule === 'exact' ? 'on' : ''} onClick={() => choose('exact')}>
            📌 Exact spot
            <small>Only for people you really trust</small>
          </button>
          <button className={rule === 'area' ? 'on' : ''} onClick={() => choose('area')}>
            🏘️ Just my area
            <small>About a kilometre — safer</small>
          </button>
          <button className={`never ${rule === 'never' ? 'on' : ''}`} onClick={() => choose('never')}>
            🚫 Nothing
            <small>They are told no, and you are not asked</small>
          </button>
        </div>
        <p className="loc-who quiet">
          {rule === 'never'
            ? `${friendName} will simply be told no. You will not even be interrupted.`
            : `${friendName} has to ask every time, and you can still say no.`}
        </p>
      </>}
    </details>
  );
}
