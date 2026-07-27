import { useEffect, useRef, useState } from 'react';
import { SongEngine, GENRES, MOODS, INSTRUMENTS, BACKINGS, DEFAULT_LAYERS, type Genre, type Mood, type Backing, type Layers, type TrackInst, type SongSpec } from '../game/songEngine';
import { createSong, updateSong, deleteSong, loadMySongs, loadPublicSongs, uploadSongAudio, songAudioUrl, generateLyrics, describeSong, type Song } from '../lib/songs';
import { loadAllPlayers, type FoundPlayer } from '../lib/players';
import { supabase } from '../lib/supabase';

const rand = () => Math.floor(Math.random() * 1_000_000_000);
const TRACK_OPTS = [{ id: 'off', icon: '🚫', name: 'Off' }, ...INSTRUMENTS];   // for the chords/melody/arp dropdowns
const icons: Record<string, string> = { cottontail: '🐰', momo: '🐧', toby: '🦊', ollie: '🦦', coral: '🐠', biscuit: '🐶', koala: '🐨', teddy: '🧸', panda: '🐼', tiger: '🐯', piggy: '🐷', parrot: '🦜', mila: '🐄', gabby: '🦒', amsaal: '🐥', misha: '🐄' };

async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close();
  return buf;
}

export function SongStudioPage({ onScore, onBack }: { onScore: (coins: number) => void; onBack: () => void }) {
  const [tab, setTab] = useState<'make' | 'mine' | 'discover'>('make');
  const [genre, setGenre] = useState<Genre>('pop');
  const [mood, setMood] = useState<Mood>('happy');
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [tempo, setTempo] = useState(112);
  const [seed, setSeed] = useState(rand);
  const [playing, setPlaying] = useState(false);      // the "make" beat is playing
  const [nowPlaying, setNowPlaying] = useState('');    // a saved song id that's playing

  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [writing, setWriting] = useState(false);

  const [voice, setVoice] = useState<AudioBuffer | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const [title, setTitle] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  const [userId, setUserId] = useState('');
  const [mine, setMine] = useState<Song[]>([]);
  const [discover, setDiscover] = useState<Song[]>([]);
  const [players, setPlayers] = useState<FoundPlayer[]>([]);

  const engine = useRef<SongEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recTimer = useRef(0);

  if (!engine.current) engine.current = new SongEngine();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ''));
    loadAllPlayers().then(setPlayers).catch(() => undefined);
    return () => { engine.current?.stop(); window.clearTimeout(recTimer.current); };
  }, []);

  useEffect(() => { if (userId && tab === 'mine') loadMySongs(userId).then(setMine).catch(() => undefined); }, [userId, tab]);
  useEffect(() => { if (tab === 'discover') loadPublicSongs().then(setDiscover).catch(() => undefined); }, [tab]);

  const spec = (): SongSpec => ({ genre, mood, tempo, seed, bars: 8, layers });
  const setLayer = <K extends keyof Layers>(k: K, v: Layers[K]) => { setLayers((l) => ({ ...l, [k]: v })); stopAll(); };
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'a player';
  const iconOf = (id: string) => icons[players.find((p) => p.id === id)?.character_id ?? ''] ?? '🎵';

  const stopAll = () => { engine.current?.stop(); audioRef.current?.pause(); setPlaying(false); setNowPlaying(''); };

  const playMake = () => {
    if (playing) { stopAll(); return; }
    stopAll();
    engine.current?.play(spec(), voice, () => setPlaying(false));
    setPlaying(true);
  };
  const newBeat = () => { const s = rand(); setSeed(s); stopAll(); setTimeout(() => { engine.current?.play({ genre, mood, tempo, seed: s, bars: 8, layers }, voice, () => setPlaying(false)); setPlaying(true); }, 40); };
  const pickGenre = (g: Genre) => { setGenre(g); const t = GENRES.find((x) => x.id === g)?.tempo ?? tempo; setTempo(t); stopAll(); };

  const quickCreate = async () => {
    if (!desc.trim()) { setNote('✍️ Describe your song first — like “a happy summer pop song about the beach”.'); return; }
    setCreating(true); setNote('');
    try {
      const idea = await describeSong(desc);
      const newLayers: Layers = { ...layers, chords: idea.instrument, melody: idea.instrument };
      setGenre(idea.genre); setMood(idea.mood); setLayers(newLayers); setTempo(idea.tempo); setLyrics(idea.lyrics);
      if (idea.title && !title.trim()) setTitle(idea.title);
      const s = rand(); setSeed(s); stopAll();
      window.setTimeout(() => { engine.current?.play({ genre: idea.genre, mood: idea.mood, tempo: idea.tempo, seed: s, bars: 8, layers: newLayers }, voice, () => setPlaying(false)); setPlaying(true); }, 60);
      setNote('✨ Your song is ready — playing now! Tweak anything below, then save.');
    } catch { setNote('The AI is busy — try again, or build your song by hand below.'); }
    finally { setCreating(false); }
  };

  const writeLyrics = async () => {
    setWriting(true); setNote('');
    try { setLyrics(await generateLyrics(topic, genre, mood)); }
    catch { setNote('The lyric writer is busy — try again in a moment.'); }
    finally { setWriting(false); }
  };

  const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';
  const startRec = async () => {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime(); const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try { setVoice(await decodeAudio(new Blob(chunks))); setNote('🎙️ Voice added! Press ▶ to hear it with the beat.'); }
        catch { setNote('Could not use that recording — try again.'); }
        setRecording(false); setRecSecs(0);
      };
      recRef.current = rec; rec.start(); setRecording(true); setRecSecs(0);
      // play the beat while you sing, and auto-stop at 20s
      engine.current?.play(spec(), null);
      const started = performance.now();
      const tick = () => { const s = Math.floor((performance.now() - started) / 1000); setRecSecs(s); if (s >= 20) stopRec(); else recTimer.current = window.setTimeout(tick, 300); };
      recTimer.current = window.setTimeout(tick, 300);
    } catch { setNote('🎙️ Allow microphone access to record your voice.'); }
  };
  const stopRec = () => { window.clearTimeout(recTimer.current); engine.current?.stop(); if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); };
  const uploadVoice = async (file: File | undefined) => { if (!file) return; try { setVoice(await decodeAudio(file)); setNote('🎵 Backing/voice added!'); } catch { setNote('That file could not be used — try an mp3 or wav.'); } };

  const save = async () => {
    if (!userId) { setNote('🔐 Log in to save your songs.'); return; }
    if (!title.trim()) { setNote('Give your song a title first.'); return; }
    stopAll(); setSaving(true); setNote('');
    try {
      const inst = layers.melody !== 'off' ? layers.melody : layers.chords !== 'off' ? layers.chords : 'auto';
      const song = await createSong(userId, { title: title.trim(), genre, mood, tempo, seed, bars: 8, instrument: inst, backing: layers.backing, layers, lyrics, is_public: isPublic });
      if (voice) { const wav = await SongEngine.renderWav(spec(), voice); const path = await uploadSongAudio(userId, song.id, wav); await updateSong(song.id, { audio_path: path }); }
      setNote(`✅ Saved “${song.title}”${isPublic ? ' — it\'s public!' : ''} 🎉`);
      onScore(6);
      if (tab === 'mine') loadMySongs(userId).then(setMine).catch(() => undefined);
    } catch { setNote('Could not save — the song tables may still be updating.'); }
    finally { setSaving(false); }
  };

  const download = async () => {
    setNote('⏳ Rendering your song…');
    try {
      const wav = await SongEngine.renderWav(spec(), voice);
      const url = URL.createObjectURL(wav);
      const a = document.createElement('a'); a.href = url; a.download = `${title.trim() || 'my-song'}.wav`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 8000);
      setNote('⬇️ Downloaded! It\'s 100% yours — post it anywhere.');
    } catch { setNote('Could not render the song — try again.'); }
  };

  const playSong = (song: Song) => {
    if (nowPlaying === song.id) { stopAll(); return; }
    stopAll();
    if (song.audio_path && audioRef.current) { audioRef.current.src = songAudioUrl(song.audio_path); audioRef.current.play().catch(() => undefined); setNowPlaying(song.id); }
    else { engine.current?.play({ genre: song.genre, mood: song.mood, tempo: song.tempo, seed: Number(song.seed), bars: song.bars, layers: layersOf(song) }, null, () => setNowPlaying('')); setNowPlaying(song.id); }
  };
  const togglePublic = async (song: Song) => { try { await updateSong(song.id, { is_public: !song.is_public }); loadMySongs(userId).then(setMine).catch(() => undefined); } catch { setNote('Could not change that.'); } };
  const removeSong = async (song: Song) => { stopAll(); try { await deleteSong(song.id); setMine((cur) => cur.filter((s) => s.id !== song.id)); } catch { setNote('Could not delete that.'); } };
  const layersOf = (song: Song): Layers => song.layers ?? { drums: true, bass: true, chords: song.instrument ?? 'auto', melody: song.instrument ?? 'auto', arp: 'off', backing: song.backing ?? 'off' };
  const loadSong = (song: Song) => { setGenre(song.genre); setMood(song.mood); setLayers(layersOf(song)); setTempo(song.tempo); setSeed(Number(song.seed)); setLyrics(song.lyrics); setTitle(song.title); setIsPublic(song.is_public); setVoice(null); setTab('make'); stopAll(); };

  const songRow = (song: Song, mineTab: boolean) => <div className="song-row" key={song.id}>
    <button className="song-play" onClick={() => playSong(song)}>{nowPlaying === song.id ? '⏸' : '▶'}</button>
    <div className="song-meta" onClick={() => loadSong(song)}>
      <strong>{song.title}</strong>
      <small>{GENRES.find((g) => g.id === song.genre)?.icon} {song.genre} · {MOODS.find((m) => m.id === song.mood)?.icon} {song.mood}{song.instrument && song.instrument !== 'auto' ? ` · ${INSTRUMENTS.find((i) => i.id === song.instrument)?.icon}` : ''}{song.audio_path ? ' · 🎙️' : ''}{!mineTab && <> · {iconOf(song.owner_id)} @{nameOf(song.owner_id)}</>}</small>
    </div>
    {mineTab
      ? <><button className={`song-pub ${song.is_public ? 'on' : ''}`} onClick={() => togglePublic(song)} title={song.is_public ? 'Public — tap to make private' : 'Private — tap to make public'}>{song.is_public ? '🌍' : '🔒'}</button>
          <button className="song-del" onClick={() => removeSong(song)} title="Delete">🗑️</button></>
      : <button className="song-open" onClick={() => loadSong(song)} title="Open in the studio">🎛️</button>}
  </div>;

  return <main className="song-page">
    <audio ref={audioRef} onEnded={() => setNowPlaying('')} hidden />
    <header className="song-top">
      <button onClick={() => { stopAll(); onBack(); }}>← Leave</button>
      <h1>🎵 Song Studio</h1>
      <span />
    </header>

    <div className="song-tabs">
      <button className={tab === 'make' ? 'on' : ''} onClick={() => setTab('make')}>🎹 Make</button>
      <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>💾 My Songs</button>
      <button className={tab === 'discover' ? 'on' : ''} onClick={() => setTab('discover')}>🌍 Discover</button>
    </div>

    {tab === 'make' && <div className="song-make">
      <section className="song-card song-quick">
        <p className="song-kicker">✨ Quick create — just describe your song</p>
        <textarea className="song-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. a happy summer pop song about chasing your dreams, with electric guitar" maxLength={300} rows={2} />
        <button className="song-big create" onClick={quickCreate} disabled={creating}>{creating ? '✨ Creating your song…' : '✨ Create my song'}</button>
        <p className="song-hint">The AI picks the style and writes your lyrics — then you can change anything below, add your voice, and save.</p>
      </section>

      <section className="song-card">
        <p className="song-kicker">Or build it yourself · 1 · Pick your sound</p>
        <div className="song-chips">{GENRES.map((g) => <button key={g.id} className={genre === g.id ? 'on' : ''} onClick={() => pickGenre(g.id)}>{g.icon} {g.name}</button>)}</div>
        <div className="song-chips moods">{MOODS.map((m) => <button key={m.id} className={mood === m.id ? 'on' : ''} onClick={() => { setMood(m.id); stopAll(); }}>{m.icon} {m.name}</button>)}</div>
        <p className="song-sub">🎛️ Tracks — layer them like a studio</p>
        <div className="song-tracks">
          <div className="track-row"><span className="track-name">🥁 Drums</span><button className={`track-toggle ${layers.drums ? 'on' : ''}`} onClick={() => setLayer('drums', !layers.drums)}>{layers.drums ? 'On' : 'Off'}</button></div>
          <div className="track-row"><span className="track-name">🎸 Bass</span><button className={`track-toggle ${layers.bass ? 'on' : ''}`} onClick={() => setLayer('bass', !layers.bass)}>{layers.bass ? 'On' : 'Off'}</button></div>
          <div className="track-row"><span className="track-name">🎹 Chords</span><select value={layers.chords} onChange={(e) => setLayer('chords', e.target.value as TrackInst)}>{TRACK_OPTS.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}</select></div>
          <div className="track-row"><span className="track-name">🎵 Melody</span><select value={layers.melody} onChange={(e) => setLayer('melody', e.target.value as TrackInst)}>{TRACK_OPTS.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}</select></div>
          <div className="track-row"><span className="track-name">✨ Arp</span><select value={layers.arp} onChange={(e) => setLayer('arp', e.target.value as TrackInst)}>{TRACK_OPTS.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}</select></div>
          <div className="track-row"><span className="track-name">🎤 Singers</span><select value={layers.backing} onChange={(e) => setLayer('backing', e.target.value as Backing)}>{BACKINGS.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}</select></div>
        </div>
        <label className="song-tempo">Tempo <b>{tempo} BPM</b><input type="range" min={60} max={180} value={tempo} onChange={(e) => { setTempo(Number(e.target.value)); stopAll(); }} /></label>
        <div className="song-transport">
          <button className={`song-big ${playing ? 'on' : ''}`} onClick={playMake}>{playing ? '⏸ Stop' : '▶ Play beat'}</button>
          <button className="song-shuffle" onClick={newBeat}>🎲 New beat</button>
        </div>
      </section>

      <section className="song-card">
        <p className="song-kicker">2 · Lyrics <small>(optional)</small></p>
        <div className="song-lyric-gen">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's it about? (e.g. summer, my dog, never giving up)" maxLength={120} />
          <button onClick={writeLyrics} disabled={writing}>{writing ? '✍️ Writing…' : '✍️ AI write'}</button>
        </div>
        <textarea className="song-lyrics" value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="Write your own lyrics here, or let the AI start you off…" maxLength={6000} rows={6} />
      </section>

      <section className="song-card">
        <p className="song-kicker">3 · Your voice <small>(optional)</small></p>
        <div className="song-voice">
          {recording
            ? <button className="song-rec on" onClick={stopRec}>⏹ Stop · {recSecs}s</button>
            : <button className="song-rec" onClick={startRec}>🎙️ Record over the beat</button>}
          <label className="song-upload">🎵 Upload audio<input type="file" accept="audio/*" onChange={(e) => uploadVoice(e.target.files?.[0])} /></label>
          {voice && !recording && <span className="song-voice-ok">✓ voice added <button onClick={() => setVoice(null)}>✖</button></span>}
        </div>
        {recording && <p className="song-hint">🎤 Sing or rap along — it auto-stops at 20s.</p>}
      </section>

      <section className="song-card">
        <p className="song-kicker">4 · Save &amp; share</p>
        <input className="song-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" maxLength={80} />
        <label className="song-public"><input type="checkbox" checked={isPublic} onChange={() => setIsPublic((v) => !v)} /> 🌍 Make it public so people can hear it on my profile</label>
        <div className="song-save-row">
          <button className="song-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save song'}</button>
          <button className="song-dl" onClick={download}>⬇️ Download</button>
        </div>
        <p className="song-safe">🎧 Every beat is generated fresh and the lyrics/voice are yours — it's <b>100% your own song</b>, safe to post anywhere.</p>
      </section>
      {note && <p className="song-note">{note}</p>}
    </div>}

    {tab === 'mine' && <div className="song-list">
      {!userId ? <p className="song-empty">🔐 Log in to save and see your songs.</p>
        : mine.length ? mine.map((s) => songRow(s, true)) : <p className="song-empty">No songs yet — make one in the 🎹 Make tab!</p>}
      {note && <p className="song-note">{note}</p>}
    </div>}

    {tab === 'discover' && <div className="song-list">
      <p className="song-kicker">🌍 Public songs players made</p>
      {discover.length ? discover.map((s) => songRow(s, false)) : <p className="song-empty">No public songs yet. Make one and tick “Make it public”!</p>}
    </div>}
  </main>;
}
