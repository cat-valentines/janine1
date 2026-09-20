import { useEffect, useRef, useState } from 'react';
import { BookPageView } from './BookPageView';
import { DrawingPad } from './DrawingPad';
import { characterAssets } from '../game/characters';
import { compressImage } from '../lib/insta';
import {
  SCENES, STICKER_GROUPS, blankPage, canPublish, saveDraft, uploadBookMedia, whatIsMissing,
  type Book, type BookPage, type PageActor, type Sticker,
} from '../lib/books';
import type { CharacterId } from '../game/types';

/**
 * Writing a book: one page at a time.
 *
 * Everything you do is saved to this device as you go, so a story is never lost
 * because a tab closed. Pictures and narration need an account, because they go
 * into the shared media store — everything else works signed out.
 */

const CAST: CharacterId[] = [
  'cottontail', 'momo', 'toby', 'ollie', 'coral', 'biscuit', 'koala', 'teddy', 'panda',
  'tiger', 'piggy', 'parrot', 'frog', 'pigeon', 'roo', 'snowy', 'butterfly', 'honey',
];

let seq = 0;
const actorId = () => `a${Date.now().toString(36)}${(seq += 1)}`;

interface BookEditorProps {
  book: Book;
  signedIn: boolean;
  /** Friends who can be invited to write it with you. */
  friends: Array<{ id: string; name: string }>;
  onChange: (book: Book) => void;
  onPublish: (book: Book) => void;
  onRead: (book: Book) => void;
  onClose: () => void;
}

export function BookEditor({ book, signedIn, friends, onChange, onPublish, onRead, onClose }: BookEditorProps) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [tab, setTab] = useState<'words' | 'scene' | 'cast' | 'stickers' | 'picture' | 'voice'>('words');
  const [stickerGroup, setStickerGroup] = useState(STICKER_GROUPS[0].id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [inviting, setInviting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const page = book.pages[Math.min(at, book.pages.length - 1)];

  /** Every change is written straight to the draft, so nothing is ever lost. */
  const update = (next: Book) => { saveDraft(next); onChange(next); };
  const setPage = (changes: Partial<BookPage>) => {
    const pages = book.pages.map((p, i) => (i === at ? { ...p, ...changes } : p));
    update({ ...book, pages });
  };

  // ---- pages ---------------------------------------------------------------

  const addPage = () => {
    const pages = [...book.pages.slice(0, at + 1), blankPage(), ...book.pages.slice(at + 1)];
    update({ ...book, pages });
    setAt(at + 1);
  };
  const removePage = () => {
    if (book.pages.length === 1) { setNote('A book needs at least one page.'); return; }
    if (!window.confirm('Take this page out of the book?')) return;
    const pages = book.pages.filter((_, i) => i !== at);
    update({ ...book, pages });
    setAt(Math.max(0, at - 1));
  };

  // ---- the cast ------------------------------------------------------------

  const addActor = (character: CharacterId) => {
    const actor: PageActor = { id: actorId(), character, x: 30 + Math.random() * 40, y: 82, size: 16, flip: false };
    setPage({ actors: [...page.actors, actor] });
    setPicked(actor.id);
  };

  const addSticker = (sticker: Sticker) => {
    const actor: PageActor = {
      id: actorId(), character: '', art: sticker.art, emoji: sticker.emoji,
      x: 30 + Math.random() * 40, y: 70 + Math.random() * 18,
      size: sticker.emoji ? 10 : 12, flip: false,
    };
    setPage({ actors: [...page.actors, actor] });
    setPicked(actor.id);
  };
  const changeActor = (id: string, changes: Partial<PageActor>) =>
    setPage({ actors: page.actors.map((a) => (a.id === id ? { ...a, ...changes } : a)) });
  const removeActor = (id: string) => {
    setPage({ actors: page.actors.filter((a) => a.id !== id) });
    setPicked(null);
  };

  // ---- pictures ------------------------------------------------------------

  const putPicture = async (blob: Blob, ext: string, type: string) => {
    if (!signedIn) { setNote('Make a free account to put pictures in your book.'); return; }
    setBusy('Adding your picture…');
    try {
      const path = await uploadBookMedia(blob, ext, type);
      setPage({ picture: path });
      setNote('🖼️ Picture added.');
    } catch (error) { setNote((error as Error).message); }
    setBusy('');
  };

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    const small = await compressImage(file, 1200, 0.8);
    await putPicture(small, 'jpg', 'image/jpeg');
  };

  // ---- narration -----------------------------------------------------------

  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  useEffect(() => () => { try { recorder.current?.stop(); } catch { /* already stopped */ } }, []);

  const startRecording = async () => {
    if (!signedIn) { setNote('Make a free account to record your voice.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mime || 'audio/webm' });
        setBusy('Saving your voice…');
        try {
          const ext = (mime.includes('mp4') ? 'm4a' : 'webm');
          const path = await uploadBookMedia(blob, ext, mime || 'audio/webm');
          setPage({ voice: path });
          setNote('🎙️ Narration saved for this page.');
        } catch (error) { setNote((error as Error).message); }
        setBusy('');
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setNote('Let the browser use your microphone to record your voice.');
    }
  };

  const stopRecording = () => {
    try { recorder.current?.stop(); } catch { /* already stopped */ }
    setRecording(false);
  };

  // ---- writing it together --------------------------------------------------

  const toggleCoAuthor = (friend: { id: string; name: string }) => {
    const has = book.coAuthors.includes(friend.id);
    update({
      ...book,
      coAuthors: has ? book.coAuthors.filter((id) => id !== friend.id) : [...book.coAuthors, friend.id],
      coAuthorNames: has ? book.coAuthorNames.filter((n) => n !== friend.name) : [...book.coAuthorNames, friend.name],
    });
  };

  const missing = whatIsMissing(book);

  return (
    <main className="book-editor">
      <div className="quest-top-row">
        <button onClick={onClose}>← My books</button>
        <span>✍️ Writing</span>
      </div>

      <input
        className="book-title-input"
        value={book.title}
        maxLength={80}
        placeholder="What is your book called?"
        onChange={(e) => update({ ...book, title: e.target.value })}
      />

      <div className="book-stage">
        <BookPageView page={page} onMoveActor={(id, x, y) => changeActor(id, { x, y })} selectedActor={picked} onPickActor={setPicked} />

        <div className="book-pager">
          <button disabled={at === 0} onClick={() => { setAt(at - 1); setPicked(null); }}>‹</button>
          <span>Page {at + 1} of {book.pages.length}</span>
          <button disabled={at >= book.pages.length - 1} onClick={() => { setAt(at + 1); setPicked(null); }}>›</button>
        </div>
        <div className="book-page-actions">
          <button onClick={addPage}>＋ Add a page</button>
          <button className="danger" onClick={removePage}>🗑️ This page</button>
        </div>
      </div>

      {/* The picked character's own controls, right where you can see them. */}
      {picked && page.actors.some((a) => a.id === picked) && (() => {
        const actor = page.actors.find((a) => a.id === picked)!;
        return <div className="actor-controls">
          <strong>Drag them where you like</strong>
          <div>
            <button onClick={() => changeActor(actor.id, { size: Math.max(7, actor.size - 3) })}>➖ Smaller</button>
            <button onClick={() => changeActor(actor.id, { size: Math.min(45, actor.size + 3) })}>➕ Bigger</button>
            <button onClick={() => changeActor(actor.id, { flip: !actor.flip })}>↔️ Turn around</button>
            <button className="danger" onClick={() => removeActor(actor.id)}>Take them off</button>
          </div>
        </div>;
      })()}

      <div className="book-tabs">
        <button className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>✏️ Words</button>
        <button className={tab === 'scene' ? 'on' : ''} onClick={() => setTab('scene')}>🌄 Scene</button>
        <button className={tab === 'cast' ? 'on' : ''} onClick={() => setTab('cast')}>🐰 Characters</button>
        <button className={tab === 'stickers' ? 'on' : ''} onClick={() => setTab('stickers')}>🍎 Stickers</button>
        <button className={tab === 'picture' ? 'on' : ''} onClick={() => setTab('picture')}>🖼️ Picture</button>
        <button className={tab === 'voice' ? 'on' : ''} onClick={() => setTab('voice')}>🎙️ Narrate</button>
      </div>

      <div className="book-tool">
        {tab === 'words' && <textarea
          className="book-text-input"
          value={page.text}
          maxLength={600}
          placeholder="Once upon a time…"
          onChange={(e) => setPage({ text: e.target.value })}
        />}

        {tab === 'scene' && <div className="book-scenes">
          {SCENES.map((scene) => <button
            key={scene.id}
            className={page.background === scene.id ? 'on' : ''}
            onClick={() => setPage({ background: scene.id })}
          >
            {scene.art ? <img src={scene.art} alt="" /> : <i className="plain-swatch" />}
            <small>{scene.name}</small>
          </button>)}
        </div>}

        {tab === 'cast' && <>
          <p className="book-hint">Tap a character to put them on the page, then drag them where you want.</p>
          <div className="book-cast">
            {CAST.map((id) => <button key={id} onClick={() => addActor(id)}>
              <img src={characterAssets[id]} alt="" />
            </button>)}
          </div>
        </>}

        {tab === 'stickers' && <>
          <div className="sticker-groups">
            {STICKER_GROUPS.map((group) => <button
              key={group.id}
              className={stickerGroup === group.id ? 'on' : ''}
              onClick={() => setStickerGroup(group.id)}
            >{group.icon} {group.name}</button>)}
          </div>
          <p className="book-hint">Tap one to put it on the page, then drag it about and make it bigger or smaller.</p>
          <div className="book-stickers">
            {(STICKER_GROUPS.find((g) => g.id === stickerGroup) ?? STICKER_GROUPS[0]).stickers.map((sticker) => (
              <button key={sticker.id} title={sticker.label} onClick={() => addSticker(sticker)}>
                {sticker.art
                  ? <img src={sticker.art} alt={sticker.label} />
                  : <span>{sticker.emoji}</span>}
              </button>
            ))}
          </div>
        </>}

        {tab === 'picture' && <div className="book-picture-tools">
          <button onClick={() => setDrawing(true)}>🎨 Draw one</button>
          <button onClick={() => fileInput.current?.click()}>📷 Use a photo</button>
          {page.picture && <button className="danger" onClick={() => setPage({ picture: undefined })}>Take the picture off</button>}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ''; }}
          />
          {!signedIn && <p className="book-hint">Pictures need a free account, because they are kept for everyone who reads your book.</p>}
        </div>}

        {tab === 'voice' && <div className="book-voice-tools">
          {page.voice
            ? <>
              <audio controls src={page.voice.startsWith('http') ? page.voice : undefined} />
              <p className="book-hint">🎙️ This page has your voice on it. Readers hear it as the page turns.</p>
              <button className="danger" onClick={() => setPage({ voice: undefined })}>Record it again</button>
            </>
            : <>
              <p className="book-hint">Read this page out loud and everybody who reads your book hears you.</p>
              {recording
                ? <button className="book-recording" onClick={stopRecording}>⏹️ Stop recording</button>
                : <button onClick={startRecording}>🎙️ Start recording</button>}
            </>}
          {!signedIn && <p className="book-hint">Narration needs a free account, because it is kept for your readers.</p>}
        </div>}
      </div>

      {/* Writing it with a friend. */}
      <div className="book-together">
        <button className="book-invite" onClick={() => setInviting(!inviting)}>
          👫 Write it with a friend {book.coAuthors.length > 0 && <b>({book.coAuthors.length})</b>}
        </button>
        {inviting && (friends.length
          ? <div className="book-friend-list">
            {friends.map((friend) => <label key={friend.id} className={book.coAuthors.includes(friend.id) ? 'on' : ''}>
              <input type="checkbox" checked={book.coAuthors.includes(friend.id)} onChange={() => toggleCoAuthor(friend)} />
              {friend.name}
            </label>)}
          </div>
          : <p className="book-hint">Add some friends first, then you can write books together.</p>)}
        {book.coAuthorNames.length > 0 && <p className="book-hint">✍️ Written with {book.coAuthorNames.join(', ')} — their names go on the cover.</p>}
      </div>

      {busy && <p className="book-busy">{busy}</p>}
      {note && <p className="book-note">{note}</p>}

      <div className="book-visibility">
        <p>Who can read this book?</p>
        <div>
          <button
            className={book.visibility === 'private' ? 'on' : ''}
            onClick={() => update({ ...book, visibility: 'private' })}
          >🔒 Private<small>Only you</small></button>
          <button
            className={book.visibility === 'public' ? 'on' : ''}
            onClick={() => update({ ...book, visibility: 'public' })}
          >🌍 Public<small>Anyone can read it</small></button>
        </div>
      </div>

      <div className="book-finish">
        <button className="book-read" onClick={() => onRead(book)}>📖 Read it through</button>
        <button className="book-publish" disabled={!canPublish(book)} onClick={() => onPublish(book)}>
          {book.visibility === 'public' ? '📚 Put it on the shelf' : '💾 Save it'}
        </button>
      </div>
      {missing.length > 0 && <p className="book-hint">Before it can go on the shelf: {missing.join(' · ')}</p>}

      {drawing && <DrawingPad
        onClose={() => setDrawing(false)}
        onDone={(blob) => { setDrawing(false); void putPicture(blob, 'png', 'image/png'); }}
      />}
    </main>
  );
}
