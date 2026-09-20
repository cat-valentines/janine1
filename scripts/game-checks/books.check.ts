import {
  ALL_STICKERS, HEART_COINS, LIKE_COINS, SCENES, STICKER_GROUPS, blankBook, blankPage, bookSize,
  canPublish, collectEarnings, deleteDraft, earnedBy, hasNarration, hasReacted, loadDrafts,
  needsDatabaseUpdate, sceneArt, saveDraft, whatIsMissing, type Book,
} from '../../src/lib/books';
import { existsSync } from 'node:fs';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
};

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
};

const author = { id: 'u1', name: 'Ana', character: 'cottontail' };

// ---- a new book -------------------------------------------------------------
const fresh = blankBook(author);
check('a new book starts with one page', fresh.pages.length, 1);
// White paper first: the scene is something you choose, not something you
// have to undo before you can start.
check('  ...on white paper', fresh.pages[0].background, 'plain');
check('  ...with no picture behind it', sceneArt(fresh.pages[0].background), '');
check('a brand-new page is white too', blankPage().background, 'plain');
// And it is private until the writer says otherwise.
check('  ...and the book is private to begin with', fresh.visibility, 'private');
check('  ...which is empty', [fresh.pages[0].text, fresh.pages[0].actors.length], ['', 0]);
check('  ...and is not published', fresh.published, false);
check('  ...and has earned nothing', earnedBy(fresh), 0);
check('two new books are not the same book', blankBook(author).id !== blankBook(author).id, true);
check('two new pages are not the same page', blankPage().id !== blankPage().id, true);

// ---- what stops it going on the shelf ---------------------------------------
check('a blank book cannot be published', canPublish(fresh), false);
check('  ...and says why', whatIsMissing(fresh), ['Give your book a title', 'Write or draw something on at least one page']);

const titled: Book = { ...fresh, title: 'The Brave Otter' };
check('a title alone is not enough', whatIsMissing(titled), ['Write or draw something on at least one page']);

const written: Book = { ...titled, pages: [{ ...titled.pages[0], text: 'Once upon a time.' }] };
check('a title and some words is a book', canPublish(written), true);
check('  ...with nothing missing', whatIsMissing(written), []);

// A page with only a picture counts — not every story needs words.
const drawn: Book = { ...titled, pages: [{ ...titled.pages[0], picture: 'u1/pic.png' }] };
check('a drawn page counts as written', canPublish(drawn), true);
// So does one with only characters on it.
const acted: Book = { ...titled, pages: [{ ...titled.pages[0], actors: [{ id: 'a', character: 'toby', x: 50, y: 80, size: 16, flip: false }] }] };
check('a page with characters counts too', canPublish(acted), true);
// Whitespace is not writing.
const spaces: Book = { ...titled, pages: [{ ...titled.pages[0], text: '   \n  ' }] };
check('blank space is not writing', canPublish(spaces), false);
check('a title of only spaces is no title', canPublish({ ...written, title: '   ' }), false);

// ---- how long it is -----------------------------------------------------------
check('one page, three words', bookSize({ ...written, pages: [{ ...written.pages[0], text: 'a b c' }] }), '1 page · 3 words');
check('several pages add up', bookSize({ ...written, pages: [
  { ...blankPage(), text: 'one two' }, { ...blankPage(), text: 'three' },
] }), '2 pages · 3 words');
check('an empty book is honest about it', bookSize(fresh), '1 page · 0 words');

check('narration is noticed', hasNarration({ ...written, pages: [{ ...written.pages[0], voice: 'u1/v.webm' }] }), true);
check('  ...and not imagined', hasNarration(written), false);

// ---- drafts on this device ----------------------------------------------------
store.clear();
check('no drafts to begin with', loadDrafts(), []);
saveDraft(written);
check('a draft is kept', loadDrafts().map((b) => b.title), ['The Brave Otter']);
saveDraft({ ...written, title: 'The Brave Otter II' });
check('saving again replaces it, not duplicates', loadDrafts().length, 1);
check('  ...with the newer title', loadDrafts()[0].title, 'The Brave Otter II');
saveDraft(blankBook(author));
check('a second book sits alongside', loadDrafts().length, 2);
deleteDraft(written.id);
check('one can be thrown away', loadDrafts().length, 1);
check('  ...and it is the right one', loadDrafts().some((b) => b.id === written.id), false);

// ---- what reactions are worth --------------------------------------------------
check('a like is worth 10 coins', LIKE_COINS, 10);
check('a heart is worth 20', HEART_COINS, 20);
check('three likes and two hearts', earnedBy({ likes: 3, hearts: 2 }), 3 * 10 + 2 * 20);

// The part that must not be wrong: an author is paid for each reaction ONCE.
store.clear();
const mine = [{ id: 'b1', likes: 2, hearts: 1 }];
check('first collection pays everything earned', collectEarnings(mine), 2 * 10 + 20);
check('collecting again pays nothing', collectEarnings(mine), 0);
check('  ...and again', collectEarnings(mine), 0);
check('new reactions pay only the difference', collectEarnings([{ id: 'b1', likes: 3, hearts: 1 }]), 10);
check('  ...then nothing more', collectEarnings([{ id: 'b1', likes: 3, hearts: 1 }]), 0);
check('a second book is counted separately', collectEarnings([
  { id: 'b1', likes: 3, hearts: 1 }, { id: 'b2', likes: 0, hearts: 2 },
]), 40);
// Counts going down (a reader deleted their account) must never claw coins back.
check('counts going down never take coins away', collectEarnings([{ id: 'b1', likes: 0, hearts: 0 }]), 0);

// ---- reacting once per reader ---------------------------------------------------
store.clear();
check('you have not reacted yet', hasReacted('b9', 'like'), false);
store.set('story-reacted', JSON.stringify({ b9: ['like'] }));
check('a like is remembered', hasReacted('b9', 'like'), true);
check('  ...but a heart is still yours to give', hasReacted('b9', 'heart'), false);
check('  ...and another book is untouched', hasReacted('b8', 'like'), false);

// ---- the scenery really exists ---------------------------------------------------
for (const scene of SCENES) {
  if (!scene.art) continue;   // plain paper has no picture, on purpose
  if (!existsSync(`public${scene.art}`)) { bad += 1; console.log(`FAIL  the "${scene.name}" scene is missing: public${scene.art}`); }
}
check('every scene has its picture on disk', true, true);
check('plain paper has no picture, deliberately', sceneArt('plain'), '');
check('an unknown scene falls back to plain', sceneArt('nonsense'), '');
check('there is more than one scene to choose', SCENES.length > 5, true);

// ---- telling the writer what went wrong -------------------------------------------
check('a missing table is spotted', needsDatabaseUpdate(new Error('relation "public.story_books" does not exist')), true);
check('  ...and the schema-cache wording too', needsDatabaseUpdate(new Error('Could not find the table in the schema cache')), true);
check('an ordinary failure is not blamed on the database', needsDatabaseUpdate(new Error('Network request failed')), false);

// ---- private and public --------------------------------------------------
store.clear();
const priv: Book = { ...written, id: 'p1', visibility: 'private' };
saveDraft(priv);
check('a private book is kept private', loadDrafts()[0].visibility, 'private');
saveDraft({ ...priv, visibility: 'public' });
check('and can be made public', loadDrafts()[0].visibility, 'public');
saveDraft({ ...priv, visibility: 'private' });
check('and private again', loadDrafts()[0].visibility, 'private');

// A book saved before books had a setting must be read as private — assuming
// the quiet option is the only safe way round.
store.set('story-drafts', JSON.stringify([{ ...written, id: 'old', visibility: undefined }]));
check('an old book with no setting is private', loadDrafts()[0].visibility, 'private');
store.set('story-drafts', JSON.stringify([{ ...written, id: 'odd', visibility: 'nonsense' }]));
check('and so is one with a nonsense setting', loadDrafts()[0].visibility, 'private');

// ---- stickers ---------------------------------------------------------------
check('there are several groups to choose from', STICKER_GROUPS.length >= 4, true);
check('  ...including food', STICKER_GROUPS.some((g) => g.id === 'food'), true);
check('  ...and furniture', STICKER_GROUPS.some((g) => g.id === 'furniture'), true);
check('  ...and home things', STICKER_GROUPS.some((g) => g.id === 'home'), true);
check('every group has stickers in it', STICKER_GROUPS.every((g) => g.stickers.length > 5), true);
check('every sticker is a picture or a symbol', ALL_STICKERS.every((s) => !!s.art || !!s.emoji), true);
check('  ...and never both at once', ALL_STICKERS.every((s) => !(s.art && s.emoji)), true);
check('every sticker has a name', ALL_STICKERS.every((s) => s.label.length > 1), true);
check('no two stickers share an id', new Set(ALL_STICKERS.map((s) => s.id)).size, ALL_STICKERS.length);

// A sticker that points at a picture must actually have one on disk.
for (const sticker of ALL_STICKERS) {
  if (!sticker.art) continue;
  if (!existsSync(`public${sticker.art}`)) { bad += 1; console.log(`FAIL  the "${sticker.label}" sticker is missing: public${sticker.art}`); }
}
check('every picture sticker exists on disk', true, true);
check('there are plenty to choose from', ALL_STICKERS.length > 50, true);

process.exit(bad ? 1 : 0);
