import { useCallback, useEffect, useRef, useState } from 'react';
import { FishingEngine, type FishingSnapshot } from '../game/fishingEngine';
import {
  FISHING_BOTS, FISH_KINDS, HOLD_SIZE, RARITY_COLOUR, RARITY_LABEL, ROUND_SECONDS,
  fishById, payout, standings, type FishingBot, type Standing,
} from '../game/fishing';
import { OPEN_ROOM, joinFishingRoom, newRoomCode, watchFishingLobby, type FishingPeer, type FishingRoom, type FishingWaiter } from '../lib/fishingLive';
import { chessPlayer, type ChessPlayer } from '../lib/chessPlayer';
import { FingerPad } from '../components/FingerPad';
import { WalkControls, useWalkControls } from '../components/WalkControls';
import { heartbeat, leaveGame } from '../lib/presence';

interface FishingFrenzyPageProps {
  onScore: (coins: number) => void;
  onBack: () => void;
}

type Screen = 'menu' | 'bots' | 'friends' | 'playing' | 'over';

const CHAR_EMOJI = ['🚤', '⛵', '🛶', '🎣', '🐳', '🦞'];

export function FishingFrenzyPage({ onScore, onBack }: FishingFrenzyPageProps) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [me, setMe] = useState<ChessPlayer | null>(null);
  const [snapshot, setSnapshot] = useState<FishingSnapshot | null>(null);
  const [bots, setBots] = useState<FishingBot[]>([]);
  const [room, setRoom] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [waiting, setWaiting] = useState<FishingWaiter[]>([]);
  const [shouts, setShouts] = useState<string[]>([]);
  const [result, setResult] = useState<{ banked: number; place: number; players: number; coins: number } | null>(null);
  const [controls, pickControls] = useWalkControls('fishing-controls');

  const mount = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FishingEngine | null>(null);
  const live = useRef<FishingRoom | null>(null);
  const emoji = CHAR_EMOJI[(me?.name.length ?? 0) % CHAR_EMOJI.length];

  useEffect(() => { chessPlayer().then(setMe); }, []);

  // While the menu is open, say hello in the lobby and see who else is around.
  useEffect(() => {
    if (screen !== 'menu' && screen !== 'friends') return;
    const stop = watchFishingLobby(me ? { id: me.id, name: me.name, emoji } : null, { onWaiting: setWaiting });
    return () => { stop(); setWaiting([]); };
  }, [screen, me, emoji]);

  useEffect(() => {
    if (screen !== 'playing') return;
    heartbeat('fishing');
    const beat = setInterval(() => heartbeat('fishing'), 5000);
    return () => { clearInterval(beat); leaveGame(); };
  }, [screen]);

  // The engine's callbacks are registered once, so they read the score through a
  // ref rather than a copy of the snapshot from the render they were made in.
  const snapshotRef = useRef<FishingSnapshot | null>(null);
  snapshotRef.current = snapshot;

  const finish = useCallback((banked: number) => {
    const boats: Standing[] = (snapshotRef.current?.boats ?? [])
      .map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, banked: b.banked, hold: b.hold, you: b.you }));
    const table = standings(boats.length ? boats : [{ id: 'me', name: 'You', emoji: '🚤', banked, hold: 0, you: true }]);
    const place = Math.max(1, table.findIndex((row) => row.you) + 1);
    const coins = payout(banked, place, table.length);
    setResult({ banked, place, players: table.length, coins });
    if (coins > 0) onScore(coins);
    setScreen('over');
  }, [onScore]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // ---- starting a round -----------------------------------------------------

  const startRound = (withBots: FishingBot[], liveRoom: string | null) => {
    setBots(withBots);
    setRoom(liveRoom);
    setResult(null);
    setShouts([]);
    setSnapshot(null);
    setScreen('playing');
  };

  useEffect(() => {
    if (screen !== 'playing' || !mount.current || !me) return;
    const created = new FishingEngine(mount.current, {
      myName: me.name,
      myEmoji: emoji,
      bots,
      onUpdate: setSnapshot,
      onBroadcast: (state) => live.current?.send(state),
      onOver: (banked) => finishRef.current(banked),
    });
    engine.current = created;

    let joined: FishingRoom | null = null;
    if (room) {
      joined = joinFishingRoom(room, { id: me.id, name: me.name, emoji }, {
        onPeers: (peers: FishingPeer[]) => created.setRivals(peers.map((p) => ({
          id: p.id, name: p.name, emoji: p.emoji, x: p.x, y: p.y, banked: p.banked, hold: p.hold,
        }))),
        onBrag: (name, text) => setShouts((list) => [`${name} ${text}`, ...list].slice(0, 4)),
      });
      live.current = joined;
    }
    return () => {
      created.dispose();
      engine.current = null;
      joined?.leave();
      live.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, me, bots, room]);

  const leave = () => {
    setScreen('menu');
    setRoom(null);
    setSnapshot(null);
  };

  // ---- the screens ----------------------------------------------------------

  if (screen === 'menu') {
    return <main className="quest-pick fishing-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🎣 Fishing Frenzy</span></div>
      <header className="quest-header fishing-header">
        <p className="eyebrow">Catch the big ones — then get home before the horn</p>
        <h1><span>🎣</span> Fishing Frenzy <span>🐟</span></h1>
        <p>Sail out, land the rarest fish you can, and race back to shore to sell them. Fish still in your hold when time runs out are worth nothing!</p>
      </header>

      <section className="quest-pick-card">
        <p className="card-kicker">Step 1 of 1</p>
        <h2>How do you want to play?</h2>
        <div className="fishing-modes">
          <button className="fishing-mode bots" onClick={() => setScreen('bots')}>
            <span className="fishing-mode-icon">🦦</span>
            <strong>Play with a bot</strong>
            <small>Race an animal skipper. Same game, same sea — pick how tough you want them.</small>
            <i>Play on your own →</i>
          </button>
          <button className="fishing-mode friends" onClick={() => { setRoomCode(newRoomCode()); setScreen('friends'); }}>
            <span className="fishing-mode-icon">👫</span>
            <strong>Play with friends</strong>
            <small>Make a room, share the 4-letter code, and only the people you invite are on your sea.</small>
            <i>Make a room →</i>
          </button>
          <button className="fishing-mode everyone" onClick={() => startRound([], OPEN_ROOM)}>
            <span className="fishing-mode-icon">🌊</span>
            <strong>Play with everybody</strong>
            <small>
              {waiting.length
                ? `${waiting.length} player${waiting.length === 1 ? '' : 's'} out there right now — jump in and race them all.`
                : 'Everyone playing right now shares one sea. Nobody out there yet? Sail anyway — people can join you mid-round.'}
            </small>
            <i>{waiting.length ? `Join ${waiting.length} playing →` : 'Sail out →'}</i>
          </button>
        </div>
      </section>

      <section className="fishing-guide">
        <h3>How to play</h3>
        <ol className="fishing-steps">
          <li><b>🕹️ Sail out.</b> Arrow keys, or the on-screen controls on a tablet. The further up you go, the deeper the water.</li>
          <li><b>🎣 Cast.</b> Get close to a fish — it gets a yellow ring — then press <b>Space</b> (or the ⤴ button).</li>
          <li><b>🎯 Reel it in.</b> A marker sweeps along a bar. Press again to stop it in the <b>green</b>. Rare fish have a smaller green band.</li>
          <li><b>💰 Sell.</b> Sail back down to the shore and your whole hold turns into money automatically.</li>
          <li><b>🐌 Mind the weight.</b> The more fish in your hold, the slower your boat sails — so a greedy trip takes much longer to bring home.</li>
          <li><b>⏰ Watch the clock.</b> {ROUND_SECONDS} seconds per round, and your hold only holds {HOLD_SIZE} fish. Anything still on the boat at the horn is lost.</li>
        </ol>
        <h3>What's in the sea</h3>
        <div className="fishing-species">
          {FISH_KINDS.map((kind) => <div className="fishing-species-card" key={kind.id} style={{ borderColor: RARITY_COLOUR[kind.rarity] }}>
            <span>{kind.emoji}</span>
            <strong>{kind.name}</strong>
            <em style={{ color: RARITY_COLOUR[kind.rarity] }}>{RARITY_LABEL[kind.rarity]}</em>
            <i>🪙 {kind.price}</i>
            <small>{kind.minDepth >= 0.85 ? 'The very deep' : kind.minDepth >= 0.55 ? 'Deep water' : kind.minDepth >= 0.3 ? 'Halfway out' : 'Near the shore'}</small>
          </div>)}
        </div>
      </section>
    </main>;
  }

  if (screen === 'bots') {
    return <main className="quest-pick fishing-pick">
      <div className="quest-top-row"><button onClick={() => setScreen('menu')}>← Back</button><span>🦦 Pick a rival</span></div>
      <header className="quest-header fishing-header">
        <h1>Who are you racing?</h1>
        <p>They fish the same sea you do — catch, fill the hold, and sail back to sell.</p>
      </header>
      <div className="fishing-bots">
        {FISHING_BOTS.map((bot) => <div className="fishing-bot-card" key={bot.id}>
          <div className="chess-bot-face">
            <img src={bot.asset} alt="" className="chess-bot-pixel" />
            <span className="chess-bot-emoji">{bot.emoji}</span>
          </div>
          <strong>{bot.name}</strong>
          <div className="chess-difficulty" aria-label={`Difficulty ${bot.difficulty} of 4`}>
            {Array.from({ length: 4 }, (_, i) => <i key={i} className={i < bot.difficulty ? 'on' : ''}>🐟</i>)}
          </div>
          <em>{bot.level}</em>
          <small>{bot.blurb}</small>
          <button onClick={() => startRound([bot], null)}>🎣 Race {bot.name.split(' ')[0]}</button>
        </div>)}
        <div className="fishing-bot-card all">
          <div className="chess-bot-face"><span className="chess-bot-emoji">🏆</span></div>
          <strong>All four at once</strong>
          <em>A proper frenzy</em>
          <small>Every animal skipper on the water together. Hardest way to win.</small>
          <button onClick={() => startRound(FISHING_BOTS, null)}>🌊 Race them all</button>
        </div>
      </div>
    </main>;
  }

  if (screen === 'friends') {
    return <main className="quest-pick fishing-pick">
      <div className="quest-top-row"><button onClick={() => setScreen('menu')}>← Back</button><span>👫 Friends only</span></div>
      <header className="quest-header fishing-header">
        <h1>Fish with your friends</h1>
        <p>Everyone who enters the same code shares one sea — and nobody else can join it.</p>
      </header>
      <section className="quest-pick-card fishing-room">
        <div className="fishing-code-box">
          <small>Your room code</small>
          <strong className="fishing-code">{roomCode}</strong>
          <p>Tell your friends this code. They tap <b>Play with friends</b>, type it in, and you are all on the same water.</p>
          <button className="fishing-go" onClick={() => startRound([], `room-${roomCode}`)}>🎣 Sail out in room {roomCode}</button>
        </div>
        <div className="fishing-join">
          <small>Got a code from a friend?</small>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            placeholder="ABCD"
            maxLength={4}
            aria-label="Room code"
          />
          <button disabled={joinCode.length < 4} onClick={() => startRound([], `room-${joinCode}`)}>Join their room →</button>
        </div>
        {waiting.length > 0 && <p className="fishing-waiting">🌊 {waiting.length} other player{waiting.length === 1 ? ' is' : 's are'} fishing right now — you could also <b onClick={() => startRound([], OPEN_ROOM)} role="button">join everybody</b>.</p>}
      </section>
    </main>;
  }

  if (screen === 'over' && result) {
    const table = standings((snapshotRef.current?.boats ?? []).map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, banked: b.banked, hold: b.hold, you: b.you })));
    return <main className="quest-pick fishing-pick">
      <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>🔔 Time's up</span></div>
      <section className="quest-pick-card fishing-results">
        <h1>{result.place === 1 && result.players > 1 ? '🏆 You won the frenzy!' : result.players > 1 ? `You finished ${ordinal(result.place)}` : '🎣 Round over'}</h1>
        <p className="fishing-earned">You sold <b>🪙 {result.banked}</b> of fish and earned <b>🪙 {result.coins}</b> coins.</p>
        {table.length > 1 && <ol className="fishing-table">
          {table.map((row, i) => <li key={row.id} className={row.you ? 'you' : ''}>
            <b>{i + 1}</b><span>{row.emoji}</span><strong>{row.you ? 'You' : row.name}</strong><i>🪙 {row.banked}</i>
          </li>)}
        </ol>}
        <div className="fishing-again">
          <button onClick={() => startRound(bots, room)}>↻ Fish again</button>
          <button onClick={leave}>Choose another way to play</button>
        </div>
      </section>
    </main>;
  }

  // ---- the round ----
  const reel = snapshot?.reel ?? null;
  return <main className="fishing-page">
    <div className="quest-top-row">
      <button onClick={leave}>← Leave</button>
      <span className={`fishing-clock ${(snapshot?.secondsLeft ?? 99) <= 20 ? 'low' : ''}`}>⏰ {mmss(snapshot?.secondsLeft ?? ROUND_SECONDS)}</span>
    </div>

    <div className="fishing-stage">
      <canvas className="fishing-canvas" ref={mount} />
      {controls === 'finger' && <FingerPad
        hint="👆 Drag here to sail · tap to cast"
        onTap={() => { engine.current?.press(); engine.current?.release(); }}
      />}

      <div className="fishing-hud">
        <div className="fishing-hold">
          <strong>🛶 Hold {snapshot?.hold.length ?? 0}/{HOLD_SIZE}</strong>
          <div>
            {(snapshot?.hold ?? []).map((id, i) => <span key={i}>{fishById(id)?.emoji}</span>)}
            {!snapshot?.hold.length && <small>empty — go and catch something!</small>}
          </div>
          <em>worth 🪙 {snapshot?.holdValue ?? 0}{snapshot?.atShore ? '' : ' — not yours until you sell it'}</em>
          {snapshot?.laden && !snapshot.atShore && <u>🐌 heavy boat — you are sailing slower</u>}
        </div>
        <div className="fishing-bank"><strong>💰 Sold</strong><b>🪙 {snapshot?.banked ?? 0}</b></div>
      </div>

      {snapshot && snapshot.boats.length > 1 && <aside className="fishing-scores">
        {standings(snapshot.boats.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, banked: b.banked, hold: b.hold, you: b.you })))
          .slice(0, 5)
          .map((row, i) => <div key={row.id} className={row.you ? 'you' : ''}>
            <b>{i + 1}</b><span>{row.emoji}</span><strong>{row.you ? 'You' : row.name.split(' ')[0]}</strong><i>🪙 {row.banked}</i>
          </div>)}
      </aside>}

      {snapshot?.nearby && !reel && <p className="fishing-prompt">
        {snapshot.nearby.emoji} <b>{snapshot.nearby.name}</b> · 🪙 {snapshot.nearby.price} — press <b>Space</b> to cast
      </p>}
      {snapshot?.atShore && (snapshot?.hold.length ?? 0) === 0 && !reel && <p className="fishing-prompt shore">🏠 At the shore. Sail up 🔼 into the deep water to find the good fish!</p>}

      {reel && <div className="fishing-reel">
        <strong>{reel.emoji} Reel in the {reel.fish}! Press again in the green.</strong>
        <div className="reel-bar">
          <i className="reel-band" style={{ left: `${reel.bandStart * 100}%`, width: `${reel.band * 100}%` }} />
          <i className="reel-marker" style={{ left: `${reel.marker * 100}%` }} />
        </div>
      </div>}

      {snapshot?.message && <p className="fishing-message">{snapshot.message}</p>}
      {shouts.length > 0 && <aside className="fishing-shouts">{shouts.map((text, i) => <span key={i}>{text}</span>)}</aside>}

      <WalkControls mode={controls} onPick={pickControls} actionLabel="Cast and reel" />
      <p className="fishing-help">Arrow keys to sail · <b>Space</b> to cast, then <b>Space</b> again to reel · sail to the shore to sell</p>
    </div>
  </main>;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
