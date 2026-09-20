import { useCallback, useEffect, useState } from 'react';
import { BookEditor } from '../components/BookEditor';
import { BookCover, BookReader } from '../components/BookReader';
import { characterAssets } from '../game/characters';
import { supabase } from '../lib/supabase';
import { loadMyFriends } from '../lib/players';
import {
  bookSize, blankBook, collectEarnings, deleteDraft, earnedBy, hasNarration, loadDrafts, loadMyShelf,
  loadShelf, needsDatabaseUpdate, publishBook, saveDraft, unpublishBook,
  type Book, type ShelfBook,
} from '../lib/books';
import type { CharacterId } from '../game/types';

/**
 * The Book Writer: your own shelf, everybody's shelf, and the pen.
 *
 * Writing works with no account at all — drafts live on this device. Putting a
 * book where other people can read it needs one, because that is what makes the
 * comments and the coins belong to somebody.
 */

type View = 'shelf' | 'writing' | 'reading';

interface BookWriterPageProps {
  character: CharacterId;
  signedIn: boolean;
  /** Coins the author has earned from likes and hearts since last time. */
  onEarn: (coins: number) => void;
  onSignIn: () => void;
  onBack: () => void;
}

export function BookWriterPage({ character, signedIn, onEarn, onSignIn, onBack }: BookWriterPageProps) {
  const [view, setView] = useState<View>('shelf');
  const [tab, setTab] = useState<'mine' | 'everyone'>('mine');
  const [drafts, setDrafts] = useState<Book[]>(loadDrafts);
  const [shelf, setShelf] = useState<ShelfBook[] | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [reading, setReading] = useState<Book | null>(null);
  const [me, setMe] = useState({ id: '', name: 'A writer' });
  const [friends, setFriends] = useState<Array<{ id: string; name: string }>>([]);
  const [note, setNote] = useState('');
  const [shelfTrouble, setShelfTrouble] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setMe({ id: user.id, name: (user.user_metadata.display_name as string | undefined) ?? 'A writer' });
      loadMyFriends()
        .then((list) => setFriends(list.filter((f) => f.status === 'accepted').map((f) => ({ id: f.id, name: f.name }))))
        .catch(() => setFriends([]));
    });
  }, []);

  const refreshShelf = useCallback(() => {
    loadShelf()
      .then((books) => { setShelf(books); setShelfTrouble(''); })
      .catch((error) => {
        setShelf([]);
        setShelfTrouble(needsDatabaseUpdate(error)
          ? 'The shared bookshelf needs the database update applying (npm run db:push). Your own books still work.'
          : 'The bookshelf is not reachable right now. Your own books still work.');
      });
  }, []);

  useEffect(() => { refreshShelf(); }, [refreshShelf]);

  // Coins your books have earned while you were away. Paid once per reaction.
  useEffect(() => {
    if (!me.id) return;
    loadMyShelf(me.id).then((mine) => {
      const owed = collectEarnings(mine);
      if (owed > 0) { onEarn(owed); setNote(`🪙 Your books earned ${owed} coins from readers!`); }
    }).catch(() => undefined);
  }, [me.id, onEarn]);

  // ---- writing --------------------------------------------------------------

  const startNew = () => {
    const book = blankBook({ id: me.id, name: me.name, character });
    saveDraft(book);
    setDrafts(loadDrafts());
    setEditing(book);
    setView('writing');
  };

  const publish = async (book: Book) => {
    // A private book simply stays here. Saving it is the whole action, and
    // nothing leaves the device.
    if (book.visibility === 'private') {
      saveDraft(book);
      setDrafts(loadDrafts());
      // If it used to be public, take it off the shelf — choosing private has
      // to actually remove it, not just stop updating it.
      unpublishBook(book.id).catch(() => undefined);
      setNote('🔒 Saved as a private book. Only you can read it.');
      setView('shelf');
      return;
    }
    if (!signedIn) { setNote('Make a free account to put your book on the shelf for everyone.'); onSignIn(); return; }
    try {
      await publishBook({ ...book, authorId: me.id, authorName: me.name, authorCharacter: character });
      setNote('📚 Your book is on the shelf! Readers can find it now.');
      setView('shelf');
      setTab('everyone');
      refreshShelf();
    } catch (error) {
      setNote(needsDatabaseUpdate(error)
        ? 'The shared bookshelf needs the database update applying first (npm run db:push).'
        : (error as Error).message);
    }
  };

  const removeDraft = (id: string) => {
    if (!window.confirm('Throw this book away? It cannot be got back.')) return;
    setDrafts(deleteDraft(id));
  };

  const takeOffShelf = async (id: string) => {
    if (!window.confirm('Take this book off the shared shelf? People will not be able to read it any more.')) return;
    try { await unpublishBook(id); refreshShelf(); setNote('The book is off the shelf.'); }
    catch { setNote('Could not take it off just now.'); }
  };

  // ---- the screens ----------------------------------------------------------

  if (view === 'writing' && editing) {
    return <BookEditor
      book={editing}
      signedIn={signedIn}
      friends={friends}
      onChange={(book) => { setEditing(book); setDrafts(loadDrafts()); }}
      onPublish={(book) => void publish(book)}
      onRead={(book) => { setReading(book); setView('reading'); }}
      onClose={() => { setView('shelf'); setDrafts(loadDrafts()); }}
    />;
  }

  if (view === 'reading' && reading) {
    return <BookReader
      book={reading}
      me={{ name: me.name, character }}
      signedIn={signedIn}
      onClose={() => { setView(editing && reading.id === editing.id ? 'writing' : 'shelf'); }}
    />;
  }

  return <main className="quest-pick book-page-shell">
    <div className="quest-top-row"><button onClick={onBack}>← Back</button><span>📚 Book Writer</span></div>
    <header className="quest-header book-header">
      <p className="eyebrow">Write it, draw it, read it out loud</p>
      <h1><span>📖</span> Book Writer <span>✍️</span></h1>
      <p>Make your own storybooks with the island's characters, your own drawings and your own voice — then put them on the shelf for everyone to read.</p>
    </header>

    <button className="book-new" onClick={startNew}>✍️ Start a new book</button>

    <div className="book-shelf-tabs">
      <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>📔 My books ({drafts.length})</button>
      <button className={tab === 'everyone' ? 'on' : ''} onClick={() => { setTab('everyone'); refreshShelf(); }}>
        📚 Everyone's books{shelf ? ` (${shelf.length})` : ''}
      </button>
    </div>

    {note && <p className="book-note">{note}</p>}

    {tab === 'mine' && <section className="book-grid">
      {drafts.length === 0 && <p className="book-hint">No books yet. Press <b>Start a new book</b> and write the first page — it saves as you go.</p>}
      {drafts.map((book) => <article className="book-card" key={book.id}>
        <div className="book-card-cover"><BookCover book={book} /></div>
        <strong>{book.title || 'Untitled'}</strong>
        <small className={book.visibility === 'public' ? 'book-public' : 'book-private'}>
          {book.visibility === 'public' ? '🌍 Public' : '🔒 Private — only you'}
        </small>
        <small>{bookSize(book)}{hasNarration(book) ? ' · 🎙️ narrated' : ''}</small>
        <div className="book-card-buttons">
          <button onClick={() => { setEditing(book); setView('writing'); }}>✍️ Write</button>
          <button onClick={() => { setReading(book); setView('reading'); }}>📖 Read</button>
          <button className="danger" onClick={() => removeDraft(book.id)}>🗑️</button>
        </div>
      </article>)}
    </section>}

    {tab === 'everyone' && <section className="book-grid">
      {shelfTrouble && <p className="book-hint">{shelfTrouble}</p>}
      {shelf === null && <p className="book-hint">Looking along the shelf…</p>}
      {shelf?.length === 0 && !shelfTrouble && <p className="book-hint">Nobody has published a book yet. Yours could be the first!</p>}
      {shelf?.map((book) => <article className="book-card" key={book.id}>
        <div className="book-card-cover"><BookCover book={book} /></div>
        <strong>{book.title || 'Untitled'}</strong>
        <small className="book-by">
          <img src={characterAssets[book.authorCharacter as CharacterId] ?? characterAssets.cottontail} alt="" />
          {book.authorName}{book.coAuthorNames.length > 0 ? ` & ${book.coAuthorNames.join(', ')}` : ''}
        </small>
        <small>{bookSize(book)}{hasNarration(book) ? ' · 🎙️' : ''} · 👍 {book.likes} · ❤️ {book.hearts}</small>
        {book.authorId === me.id && <small className="book-earned">🪙 earned {earnedBy(book)} coins</small>}
        <div className="book-card-buttons">
          <button onClick={() => { setReading(book); setView('reading'); }}>📖 Read it</button>
          {book.authorId === me.id && <button className="danger" onClick={() => void takeOffShelf(book.id)}>Take off</button>}
        </div>
      </article>)}
    </section>}

    <p className="book-fine">
      Books start <b>🔒 private</b> — only you can read them. Make one <b>🌍 public</b> when you are ready and it
      goes on the shelf for everyone. Every 👍 like earns the author 10 coins and every ❤️ heart earns 20, once
      per reader. Be kind in the comments: the author is a real person.
    </p>
  </main>;
}
