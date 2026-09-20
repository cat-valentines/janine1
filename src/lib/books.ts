/**
 * Book Writer — write, illustrate, narrate and share your own stories.
 *
 * A book is a list of pages. Each page has words, a scene behind it, any of the
 * island's characters standing on it, optionally a picture you took or drew, and
 * optionally your own voice reading it aloud.
 *
 * Drafts live on your own device, so you can write with no account and nothing
 * half-finished ever goes anywhere. Publishing puts the book on the shared
 * bookshelf where other players can read it, react to it and leave comments —
 * and where its author earns coins for the reactions it gets.
 */
import { supabase } from './supabase';
import { storage } from './storage';

// ---- what a book is --------------------------------------------------------

/**
 * Something standing on a page, where you put it: one of the island's
 * characters, a piece of its pixel art, or a sticker.
 */
export interface PageActor {
  id: string;
  /** A character id from the island's own cast, when it is a character. */
  character: string;
  /** A sticker instead: a picture from the island's art. */
  art?: string;
  /** Or a sticker drawn as a symbol — food, furniture, weather and so on. */
  emoji?: string;
  /** Position as a percentage of the page, so it scales on any screen. */
  x: number;
  y: number;
  size: number;
  /** Facing the other way. */
  flip: boolean;
}

export interface BookPage {
  id: string;
  text: string;
  /** A scene from the island's art, or '' for plain paper. */
  background: string;
  actors: PageActor[];
  /** A photo you uploaded or a picture you drew — a path in the media store. */
  picture?: string;
  /** Your voice reading this page — a path in the media store. */
  voice?: string;
}

/** Who can read a book. */
export type Visibility = 'private' | 'public';

export interface Book {
  id: string;
  title: string;
  /** Private books stay on this device; public ones go on the shared shelf. */
  visibility: Visibility;
  /** The scene shown on the cover. */
  cover: string;
  pages: BookPage[];
  authorId: string;
  authorName: string;
  authorCharacter: string;
  /** Friends invited to write it with you, by player id. */
  coAuthors: string[];
  coAuthorNames: string[];
  published: boolean;
  likes: number;
  hearts: number;
  createdAt: string;
  updatedAt: string;
}

/** What each reaction is worth to the author. */
export const LIKE_COINS = 10;
export const HEART_COINS = 20;

/** The scenes a page can be set in. */
export const SCENES: Array<{ id: string; name: string; art: string }> = [
  { id: 'plain', name: 'White paper', art: '' },
  { id: 'forest', name: 'Magical forest', art: '/assets/pixel-magical-forest.png' },
  { id: 'woods', name: 'Enchanted woods', art: '/assets/pixel-village-woods.png' },
  { id: 'country', name: 'Countryside', art: '/assets/pixel-countryside.png' },
  { id: 'market', name: 'Market square', art: '/assets/pixel-market-world.png' },
  { id: 'ocean', name: 'The ocean', art: '/assets/pixel-ocean.png' },
  { id: 'bedroom', name: 'A bedroom', art: '/assets/pixel-bedroom.png' },
  { id: 'kitchen', name: 'A kitchen', art: '/assets/pixel-kitchen.png' },
  { id: 'dining', name: 'A dining room', art: '/assets/pixel-dining.png' },
  { id: 'spooky', name: 'Somewhere spooky', art: '/assets/pixel-haunted-exterior.png' },
];

// ---- stickers ---------------------------------------------------------------

export interface Sticker { id: string; label: string; art?: string; emoji?: string }
export interface StickerGroup { id: string; name: string; icon: string; stickers: Sticker[] }

const art = (id: string, label: string, file: string): Sticker => ({ id, label, art: `/assets/${file}` });
const emo = (id: string, label: string, emoji: string): Sticker => ({ id, label, emoji });

/**
 * Everything you can put on a page besides the characters. The island's own
 * pixel art is used wherever it exists, and symbols fill in the rest — there is
 * no drawn furniture, and a chair you can actually use beats a chair that does
 * not exist.
 */
export const STICKER_GROUPS: StickerGroup[] = [
  {
    id: 'food', name: 'Food', icon: '🍎',
    stickers: [
      art('apple', 'Apple', 'pixel-apple.png'),
      art('carrot', 'Carrot', 'pixel-carrot.png'),
      art('fish', 'Fish', 'pixel-fish.png'),
      art('honey', 'Honey', 'pixel-honey.png'),
      art('bone', 'Bone', 'pixel-bone.png'),
      art('bamboo', 'Bamboo', 'pixel-bamboo.png'),
      emo('cake', 'Cake', '🍰'), emo('cupcake', 'Cupcake', '🧁'), emo('cookie', 'Cookie', '🍪'),
      emo('donut', 'Doughnut', '🍩'), emo('icecream', 'Ice cream', '🍦'), emo('pizza', 'Pizza', '🍕'),
      emo('burger', 'Burger', '🍔'), emo('sandwich', 'Sandwich', '🥪'), emo('corn', 'Corn', '🌽'),
      emo('strawberry', 'Strawberry', '🍓'), emo('banana', 'Banana', '🍌'), emo('grapes', 'Grapes', '🍇'),
      emo('watermelon', 'Watermelon', '🍉'), emo('milk', 'Milk', '🥛'), emo('juice', 'Juice', '🧃'),
      emo('sweets', 'Sweets', '🍬'), emo('chocolate', 'Chocolate', '🍫'), emo('pancakes', 'Pancakes', '🥞'),
    ],
  },
  {
    id: 'furniture', name: 'Furniture', icon: '🪑',
    stickers: [
      emo('chair', 'Chair', '🪑'), emo('bed', 'Bed', '🛏️'), emo('sofa', 'Sofa', '🛋️'),
      emo('door', 'Door', '🚪'), emo('window', 'Window', '🪟'), emo('mirror', 'Mirror', '🪞'),
      emo('lamp', 'Lamp', '💡'), emo('candle', 'Candle', '🕯️'), emo('clock', 'Clock', '🕰️'),
      emo('picture', 'Picture', '🖼️'), emo('tv', 'Television', '📺'), emo('bath', 'Bath', '🛁'),
      emo('shower', 'Shower', '🚿'), emo('basket', 'Basket', '🧺'), emo('cupboard', 'Cupboard', '🗄️'),
      emo('broom', 'Broom', '🧹'), emo('teddy', 'Teddy', '🧸'), emo('books', 'Books', '📚'),
    ],
  },
  {
    id: 'home', name: 'Home & outside', icon: '🏡',
    stickers: [
      emo('house', 'House', '🏡'), emo('cottage', 'Cottage', '🏠'), emo('castle', 'Castle', '🏰'),
      emo('tent', 'Tent', '⛺'), emo('tree', 'Tree', '🌳'), emo('pine', 'Pine tree', '🌲'),
      emo('flower', 'Flower', '🌸'), emo('sunflower', 'Sunflower', '🌻'), emo('mushroom', 'Mushroom', '🍄'),
      emo('mountain', 'Mountain', '⛰️'), emo('sun', 'Sun', '☀️'), emo('moon', 'Moon', '🌙'),
      emo('star', 'Star', '⭐'), emo('cloud', 'Cloud', '☁️'), emo('rain', 'Rain', '🌧️'),
      emo('snow', 'Snow', '❄️'), emo('rainbow', 'Rainbow', '🌈'), emo('fire', 'Campfire', '🔥'),
      emo('car', 'Car', '🚗'), emo('bike', 'Bicycle', '🚲'), emo('boat', 'Boat', '⛵'),
    ],
  },
  {
    id: 'fun', name: 'Fun things', icon: '✨',
    stickers: [
      art('butterfly', 'Butterfly', 'pixel-butterfly.png'),
      art('coin', 'Coin', 'pixel-coin.png'),
      art('clover', 'Clover', 'pixel-clover.png'),
      art('daisy', 'Daisy', 'pixel-daisy.png'),
      art('maple', 'Maple leaf', 'pixel-maple.png'),
      art('leaf', 'Leaf', 'pixel-leaf.png'),
      art('bubbles', 'Bubbles', 'pixel-bubbles.png'),
      art('cauldron', 'Cauldron', 'pixel-cauldron.png'),
      emo('balloon', 'Balloon', '🎈'), emo('present', 'Present', '🎁'), emo('bow', 'Bow', '🎀'),
      emo('party', 'Party', '🎉'), emo('sparkles', 'Sparkles', '✨'), emo('heart', 'Heart', '💖'),
      emo('music', 'Music', '🎵'), emo('trophy', 'Trophy', '🏆'), emo('crystal', 'Crystal ball', '🔮'),
      emo('pencil', 'Pencil', '✏️'),
    ],
  },
];

/** Every sticker, flat — for looking one up by id. */
export const ALL_STICKERS = STICKER_GROUPS.flatMap((group) => group.stickers);

export const sceneArt = (id: string) => SCENES.find((s) => s.id === id)?.art ?? '';

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new page is plain white paper — the scene is something you choose. */
export function blankPage(): BookPage {
  return { id: newId(), text: '', background: 'plain', actors: [] };
}

export function blankBook(author: { id: string; name: string; character: string }): Book {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: '',
    visibility: 'private',
    cover: 'plain',
    pages: [blankPage()],
    authorId: author.id,
    authorName: author.name,
    authorCharacter: author.character,
    coAuthors: [],
    coAuthorNames: [],
    published: false,
    likes: 0,
    hearts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- drafts, kept on your own device ---------------------------------------

const DRAFTS_KEY = 'story-drafts';

export function loadDrafts(): Book[] {
  try {
    const list = JSON.parse(storage.get(DRAFTS_KEY) ?? '[]') as Book[];
    if (!Array.isArray(list)) return [];
    // A book saved before books had a public/private setting is read as
    // private: the quiet option is the one to assume, never the loud one.
    return list
      .filter((b) => b && typeof b.id === 'string')
      .map((b) => ({ ...b, visibility: b.visibility === 'public' ? 'public' : 'private' }));
  } catch { return []; }
}

export function saveDraft(book: Book): Book[] {
  const next = { ...book, updatedAt: new Date().toISOString() };
  const drafts = loadDrafts().filter((b) => b.id !== book.id);
  drafts.unshift(next);
  storage.set(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 40)));
  return drafts;
}

export function deleteDraft(id: string): Book[] {
  const drafts = loadDrafts().filter((b) => b.id !== id);
  storage.set(DRAFTS_KEY, JSON.stringify(drafts));
  return drafts;
}

// ---- is it ready to go out? -------------------------------------------------

/**
 * What still needs doing before a book can be published. A book with no title or
 * no words is not a book yet, and saying so plainly beats a disabled button
 * nobody can explain.
 */
export function whatIsMissing(book: Book): string[] {
  const missing: string[] = [];
  if (!book.title.trim()) missing.push('Give your book a title');
  const written = book.pages.filter((p) => p.text.trim() || p.picture || p.actors.length);
  if (!written.length) missing.push('Write or draw something on at least one page');
  return missing;
}

export const canPublish = (book: Book) => whatIsMissing(book).length === 0;

/** How long a book is, in a way worth reading: "6 pages · 214 words". */
export function bookSize(book: Book): string {
  const words = book.pages.reduce((sum, p) => sum + p.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const pages = book.pages.length;
  return `${pages} page${pages === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`;
}

/** True when any page has narration — worth saying on the cover. */
export const hasNarration = (book: Book) => book.pages.some((p) => !!p.voice);

// ---- coins the author has earned -------------------------------------------

const PAID_KEY = 'story-coins-paid';

function paidSoFar(): Record<string, number> {
  try { return JSON.parse(storage.get(PAID_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}

/** What a book's reactions are worth in total. */
export const earnedBy = (book: { likes: number; hearts: number }) =>
  book.likes * LIKE_COINS + book.hearts * HEART_COINS;

/**
 * Coins this author has earned since last time, across all their books.
 *
 * Reaction counts live with the book, so the author's own app works out what it
 * has not paid out yet and credits the difference. Paying twice for the same
 * heart is the thing to avoid, so what has been paid is remembered per book.
 */
export function collectEarnings(books: Array<{ id: string; likes: number; hearts: number }>): number {
  const paid = paidSoFar();
  let owed = 0;
  for (const book of books) {
    const earned = earnedBy(book);
    const already = paid[book.id] ?? 0;
    if (earned > already) { owed += earned - already; paid[book.id] = earned; }
  }
  if (owed > 0) storage.set(PAID_KEY, JSON.stringify(paid));
  return owed;
}

// ---- the shared bookshelf ---------------------------------------------------

const BUCKET = 'insta-media';   // the media store the island already has

export const mediaUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Put a picture or a piece of narration into the media store. */
export async function uploadBookMedia(blob: Blob, ext: string, contentType: string): Promise<string> {
  const me = await myId();
  if (!me) throw new Error('Sign in to add pictures and narration.');
  const path = `${me}/story-${newId()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (up.error) throw up.error;
  return path;
}

/** A book as it comes back from the shelf. */
export interface ShelfBook extends Book { comments: number }

const rowToBook = (row: Record<string, unknown>): ShelfBook => ({
  id: String(row.id),
  title: String(row.title ?? ''),
  visibility: 'public',   // it is on the shared shelf, so it is public
  cover: String(row.cover ?? 'plain'),
  pages: (row.pages as BookPage[]) ?? [],
  authorId: String(row.author_id ?? ''),
  authorName: String(row.author_name ?? 'someone'),
  authorCharacter: String(row.author_character ?? 'cottontail'),
  coAuthors: (row.co_authors as string[]) ?? [],
  coAuthorNames: (row.co_author_names as string[]) ?? [],
  published: true,
  likes: Number(row.likes ?? 0),
  hearts: Number(row.hearts ?? 0),
  comments: Number(row.comment_count ?? 0),
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});

/** Every published book, newest first. */
export async function loadShelf(): Promise<ShelfBook[]> {
  const { data, error } = await supabase
    .from('story_books').select('*').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []).map((row) => rowToBook(row as Record<string, unknown>));
}

/** The books this author has out on the shelf (to collect their coins). */
export async function loadMyShelf(authorId: string): Promise<ShelfBook[]> {
  const { data, error } = await supabase
    .from('story_books').select('*').eq('author_id', authorId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => rowToBook(row as Record<string, unknown>));
}

/** Send a book to the shared shelf, or update one already there. */
export async function publishBook(book: Book): Promise<void> {
  const me = await myId();
  if (!me) throw new Error('Sign in to publish your book.');
  const missing = whatIsMissing(book);
  if (missing.length) throw new Error(missing[0]);
  const { error } = await supabase.from('story_books').upsert({
    id: book.id,
    author_id: me,
    author_name: book.authorName.slice(0, 30),
    author_character: book.authorCharacter,
    title: book.title.slice(0, 80),
    cover: book.cover,
    pages: book.pages,
    co_authors: book.coAuthors,
    co_author_names: book.coAuthorNames,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function unpublishBook(id: string): Promise<void> {
  const { error } = await supabase.from('story_books').delete().eq('id', id);
  if (error) throw error;
}

// ---- reactions --------------------------------------------------------------

export type Reaction = 'like' | 'heart';

const REACTED_KEY = 'story-reacted';

/** What you have already reacted with, so nobody can spam an author's coins. */
export function myReactions(): Record<string, Reaction[]> {
  try { return JSON.parse(storage.get(REACTED_KEY) ?? '{}') as Record<string, Reaction[]>; } catch { return {}; }
}

export const hasReacted = (bookId: string, kind: Reaction) => (myReactions()[bookId] ?? []).includes(kind);

function rememberReaction(bookId: string, kind: Reaction) {
  const all = myReactions();
  all[bookId] = [...new Set([...(all[bookId] ?? []), kind])];
  storage.set(REACTED_KEY, JSON.stringify(all));
}

/**
 * React to somebody's book. Each reader counts once per reaction per book, so a
 * like is worth {@link LIKE_COINS} to the author and a heart {@link HEART_COINS}
 * — and holding the button down does not make an author rich.
 */
export async function reactToBook(bookId: string, kind: Reaction): Promise<boolean> {
  if (hasReacted(bookId, kind)) return false;
  const { error } = await supabase.rpc('story_react', { book_id: bookId, kind });
  if (error) throw error;
  rememberReaction(bookId, kind);
  return true;
}

// ---- comments ---------------------------------------------------------------

export interface BookComment { id: string; bookId: string; name: string; character: string; body: string; at: string }

export async function loadBookComments(bookId: string): Promise<BookComment[]> {
  const { data, error } = await supabase
    .from('story_comments').select('*').eq('book_id', bookId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id), bookId: String(r.book_id), name: String(r.author_name ?? 'someone'),
      character: String(r.author_character ?? 'cottontail'), body: String(r.body ?? ''), at: String(r.created_at ?? ''),
    };
  });
}

export async function addBookComment(bookId: string, name: string, character: string, body: string): Promise<void> {
  const me = await myId();
  if (!me) throw new Error('Sign in to leave a comment.');
  const text = body.trim().slice(0, 300);
  if (!text) return;
  const { error } = await supabase.from('story_comments').insert({
    book_id: bookId, author_id: me, author_name: name.slice(0, 30), author_character: character, body: text,
  });
  if (error) throw error;
}

/** True when a missing-table error means the database update has not been applied. */
export const needsDatabaseUpdate = (error: unknown) =>
  /relation .* does not exist|could not find the table|schema cache/i.test(String((error as Error)?.message ?? error));
