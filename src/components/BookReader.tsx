import { useEffect, useRef, useState } from 'react';
import { BookPageView } from './BookPageView';
import { characterAssets } from '../game/characters';
import {
  HEART_COINS, LIKE_COINS, addBookComment, hasReacted, loadBookComments, mediaUrl, reactToBook,
  type Book, type BookComment, type Reaction,
} from '../lib/books';
import type { CharacterId } from '../game/types';

/**
 * Reading somebody's book.
 *
 * Turn the pages, hear the author read it if they recorded themselves, and say
 * what you thought: a 👍 like is worth {@link LIKE_COINS} coins to them and a
 * ❤️ heart {@link HEART_COINS}. Each reader counts once per book for each, so
 * an author earns from being read by lots of people rather than by one person
 * tapping a lot.
 */
export function BookReader({ book, me, signedIn, onClose }: {
  book: Book & { comments?: number };
  me: { name: string; character: string };
  signedIn: boolean;
  onClose: () => void;
}) {
  const [at, setAt] = useState(-1);   // -1 is the cover
  const [likes, setLikes] = useState(book.likes);
  const [hearts, setHearts] = useState(book.hearts);
  const [liked, setLiked] = useState(() => hasReacted(book.id, 'like'));
  const [hearted, setHearted] = useState(() => hasReacted(book.id, 'heart'));
  const [comments, setComments] = useState<BookComment[] | null>(null);
  const [saying, setSaying] = useState('');
  const [note, setNote] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);

  const page = at >= 0 ? book.pages[at] : null;

  // The author's voice, if they recorded this page. Stops the moment you turn.
  useEffect(() => {
    audio.current?.pause();
    audio.current = null;
    if (!page?.voice) return;
    const sound = new Audio(mediaUrl(page.voice));
    audio.current = sound;
    sound.play().catch(() => undefined);   // some browsers want a tap first
    return () => { sound.pause(); };
  }, [page?.voice]);

  useEffect(() => () => { audio.current?.pause(); }, []);

  useEffect(() => {
    loadBookComments(book.id).then(setComments).catch(() => setComments([]));
  }, [book.id]);

  const react = async (kind: Reaction) => {
    if (!signedIn) { setNote('Make a free account so the author gets their coins.'); return; }
    try {
      const counted = await reactToBook(book.id, kind);
      if (!counted) { setNote('You already did that one — thank you though!'); return; }
      if (kind === 'like') { setLikes((n) => n + 1); setLiked(true); setNote(`👍 ${book.authorName} earns ${LIKE_COINS} coins.`); }
      else { setHearts((n) => n + 1); setHearted(true); setNote(`❤️ ${book.authorName} earns ${HEART_COINS} coins!`); }
    } catch {
      setNote('The bookshelf is not reachable right now.');
    }
  };

  const say = async () => {
    const text = saying.trim();
    if (!text) return;
    try {
      await addBookComment(book.id, me.name, me.character, text);
      setSaying('');
      setComments(await loadBookComments(book.id));
    } catch (error) { setNote((error as Error).message); }
  };

  return (
    <main className="book-reader">
      <div className="quest-top-row">
        <button onClick={onClose}>← Back to the shelf</button>
        <span>📖 {book.title}</span>
      </div>

      <div className="book-stage">
        {at < 0
          ? <BookCover book={book} />
          : <BookPageView page={book.pages[at]} />}

        <div className="book-pager">
          <button disabled={at < 0} onClick={() => setAt(at - 1)}>‹</button>
          <span>{at < 0 ? 'Cover' : `Page ${at + 1} of ${book.pages.length}`}</span>
          <button disabled={at >= book.pages.length - 1} onClick={() => setAt(at + 1)}>›</button>
        </div>
        {page?.voice && <p className="book-hint">🎙️ {book.authorName} is reading this page to you.</p>}
      </div>

      <div className="book-reactions">
        <button className={liked ? 'on' : ''} onClick={() => react('like')}>
          👍 Like <b>{likes}</b><small>{LIKE_COINS} coins</small>
        </button>
        <button className={`heart ${hearted ? 'on' : ''}`} onClick={() => react('heart')}>
          ❤️ Heart <b>{hearts}</b><small>{HEART_COINS} coins</small>
        </button>
      </div>
      {note && <p className="book-note">{note}</p>}

      <section className="book-comments">
        <h3>💬 What readers said</h3>
        {comments === null && <p className="book-hint">Reading the comments…</p>}
        {comments?.length === 0 && <p className="book-hint">No comments yet — be the first to tell {book.authorName} what you thought.</p>}
        {comments?.map((comment) => <div className="book-comment" key={comment.id}>
          <img src={characterAssets[comment.character as CharacterId] ?? characterAssets.cottontail} alt="" />
          <div><strong>@{comment.name}</strong><p>{comment.body}</p></div>
        </div>)}
        <div className="book-say">
          <input
            value={saying}
            maxLength={300}
            placeholder={signedIn ? 'Say something kind…' : 'Sign in to leave a comment'}
            disabled={!signedIn}
            onChange={(e) => setSaying(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void say()}
          />
          <button disabled={!signedIn || !saying.trim()} onClick={() => void say()}>Send</button>
        </div>
      </section>
    </main>
  );
}

/** The cover: the title, who wrote it, and who helped. */
export function BookCover({ book }: { book: Book }) {
  const scene = book.cover;
  return (
    <div className="book-cover-page">
      <BookPageView page={{ id: 'cover', text: '', background: scene, actors: [] }} />
      <div className="book-cover-plate">
        <h2>{book.title || 'Untitled'}</h2>
        <p>
          by <b>{book.authorName}</b>
          {book.coAuthorNames.length > 0 && <> with <b>{book.coAuthorNames.join(', ')}</b></>}
        </p>
      </div>
    </div>
  );
}
