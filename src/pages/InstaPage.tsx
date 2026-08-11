import { useEffect, useRef, useState } from 'react';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';
import {
  addComment, bumpLike, createPost, deleteComment, deletePost, likedLocal, loadComments, loadFeed,
  photoUrl, saveLikedLocal, setFollow, type InstaComment, type InstaPost,
} from '../lib/insta';
import { setSfxMuted, sfx, sfxMuted } from '../lib/sfx';

const avatar = (id: string) => characterAssets[id as CharacterId] ?? characterAssets.cottontail;

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

interface CardProps {
  post: InstaPost;
  liked: boolean;
  signedIn: boolean;
  username: string;
  character: string;
  onLike: (p: InstaPost) => void;
  onFollow: (p: InstaPost) => void;
  onDelete: (p: InstaPost) => void;
  onNeedAccount: () => void;
}

function PostCard({ post, liked, signedIn, username, character, onLike, onFollow, onDelete, onNeedAccount }: CardProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<InstaComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(post.comment_count);
  const vid = useRef<HTMLVideoElement>(null);
  const [vidMuted, setVidMuted] = useState(true);

  const toggleComments = () => {
    const next = !open; setOpen(next);
    if (next && comments === null) loadComments(post.id).then(setComments).catch(() => setComments([]));
  };

  const submit = async () => {
    if (!signedIn) return void onNeedAccount();
    const body = text.trim(); if (!body) return;
    setBusy(true);
    try {
      await addComment(post.id, username, character, body);
      setText(''); sfx('comment');
      const list = await loadComments(post.id); setComments(list); setCount(list.length);
    } catch { /* offline — leave the box as is */ } finally { setBusy(false); }
  };

  const removeComment = (c: InstaComment) => {
    setComments((cs) => cs?.filter((x) => x.id !== c.id) ?? cs); setCount((n) => Math.max(0, n - 1));
    deleteComment(c.id).catch(() => undefined);
  };

  const toggleSound = () => { const v = vid.current; if (!v) return; v.muted = !v.muted; setVidMuted(v.muted); if (v.paused) v.play().catch(() => undefined); };

  return <article className="insta-card">
    <header className="insta-card-top">
      <img className="insta-avatar" src={avatar(post.author_character)} alt="" />
      <div className="insta-who"><strong>@{post.author_name}</strong><small>{ago(post.created_at)}</small></div>
      {post.is_mine
        ? <button className="insta-del" onClick={() => onDelete(post)} title="Delete">🗑️</button>
        : <button className={`insta-follow ${post.followed_by_me ? 'on' : ''}`} onClick={() => onFollow(post)}>{post.followed_by_me ? 'Following' : 'Follow'}</button>}
    </header>

    {post.media_type === 'video'
      ? <div className="insta-video-wrap">
          <video ref={vid} className="insta-photo" src={photoUrl(post.image_path)} muted loop autoPlay playsInline preload="metadata" onClick={toggleSound} />
          <button className="insta-sound" onClick={toggleSound}>{vidMuted ? '🔇' : '🔊'}</button>
        </div>
      : <img className="insta-photo" src={photoUrl(post.image_path)} alt={post.caption || 'photo'} loading="lazy" />}

    <div className="insta-card-actions">
      <button className={`insta-like ${liked ? 'on' : ''}`} onClick={() => onLike(post)}>{liked ? '❤️' : '🤍'} {post.like_count}</button>
      <button className="insta-comment-btn" onClick={toggleComments}>💬 {count}</button>
    </div>

    {post.caption && <p className="insta-caption"><strong>@{post.author_name}</strong> {post.caption}</p>}

    {open && <div className="insta-comments">
      {comments === null && <p className="insta-cmt-loading">Loading comments…</p>}
      {comments?.map((c) => <div className="insta-cmt" key={c.id}>
        <img src={avatar(c.author_character)} alt="" />
        <p><strong>@{c.author_name}</strong> {c.body}</p>
        <CommentDelete comment={c} signedIn={signedIn} username={username} onRemove={removeComment} />
      </div>)}
      {comments?.length === 0 && <p className="insta-cmt-loading">No comments yet — say something nice! 💬</p>}
      {signedIn
        ? <div className="insta-cmt-add">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Add a comment…" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <button onClick={submit} disabled={busy || !text.trim()}>Post</button>
          </div>
        : <button className="insta-cmt-signin" onClick={onNeedAccount}>Log in or sign up to comment</button>}
    </div>}
  </article>;
}

/** Shows a tiny delete on your OWN comments (matched by your username). */
function CommentDelete({ comment, signedIn, username, onRemove }: { comment: InstaComment; signedIn: boolean; username: string; onRemove: (c: InstaComment) => void }) {
  if (!signedIn || comment.author_name !== username) return null;
  return <button className="insta-cmt-del" onClick={() => onRemove(comment)} title="Delete">×</button>;
}

export function InstaPage({ username, character, signedIn, onNeedAccount, onBack }: { username: string; character: string; signedIn: boolean; onNeedAccount: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<'explore' | 'following'>('explore');
  const [posts, setPosts] = useState<InstaPost[] | null>(null);
  const [note, setNote] = useState('');
  const [composing, setComposing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [likedSet, setLikedSet] = useState<Set<string>>(() => likedLocal());
  const [muted, setMuted] = useState(sfxMuted());
  const fileInput = useRef<HTMLInputElement>(null);
  const isVideoFile = !!file && file.type.startsWith('video/');

  const needAccount = () => { setNote('Log in or sign up (it\'s free) to post, follow, and comment!'); onNeedAccount(); };

  const refresh = (t = tab) => {
    setPosts(null);
    loadFeed(t === 'following').then(setPosts).catch(() => { setPosts([]); setNote('Insta is offline right now — try again in a moment.'); });
  };
  useEffect(() => { refresh(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const pickMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) { setNote('Please choose a photo or a video.'); return; }
    setFile(f); setPreview(URL.createObjectURL(f)); setNote('');
  };

  const share = async () => {
    if (!file) { setNote('Add a photo or video first.'); return; }
    setPosting(true); setNote('');
    try {
      await createPost(username, character, file, caption.trim());
      sfx('post');
      setComposing(false); setFile(null); setPreview(''); setCaption('');
      setTab('explore'); refresh('explore');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not share your post. Please try again.');
    } finally { setPosting(false); }
  };

  // Likes work for EVERYONE (guests too) — a public counter, remembered per device.
  const toggleLike = (p: InstaPost) => {
    const nowLiked = !likedSet.has(p.id);
    const next = new Set(likedSet); if (nowLiked) next.add(p.id); else next.delete(p.id);
    setLikedSet(next); saveLikedLocal(next);
    setPosts((list) => list?.map((x) => x.id === p.id ? { ...x, like_count: Math.max(0, x.like_count + (nowLiked ? 1 : -1)) } : x) ?? list);
    bumpLike(p.id, nowLiked).catch(() => undefined);
    sfx(nowLiked ? 'like' : 'unlike');
  };

  const toggleFollow = (p: InstaPost) => {
    if (!signedIn) return void needAccount();
    const following = !p.followed_by_me;
    setPosts((list) => list?.map((x) => x.author_id === p.author_id ? { ...x, followed_by_me: following } : x) ?? list);
    setFollow(p.author_id, following).catch(() => refresh());
    sfx('follow');
  };

  const removePost = (p: InstaPost) => {
    if (!window.confirm('Delete this post?')) return;
    setPosts((list) => list?.filter((x) => x.id !== p.id) ?? list);
    deletePost(p.id, p.image_path).catch(() => refresh());
  };

  const toggleMute = () => { const m = !muted; setMuted(m); setSfxMuted(m); if (!m) sfx('tap'); };

  return <main className="insta-page">
    <header className="insta-top">
      <button className="insta-back" onClick={onBack}>←</button>
      <h1>📸 Insta</h1>
      <button className="insta-mute" onClick={toggleMute} title={muted ? 'Sound off' : 'Sound on'}>{muted ? '🔇' : '🔊'}</button>
      <button className="insta-new" onClick={() => { if (!signedIn) return void needAccount(); setComposing(true); setNote(''); }}>＋ Post</button>
    </header>

    <div className="insta-me">
      <img src={avatar(character)} alt="" />
      <div><strong>@{username || 'explorer'}</strong><span>Share a photo or video with everyone</span></div>
    </div>

    <div className="insta-tabs">
      <button className={tab === 'explore' ? 'on' : ''} onClick={() => { setTab('explore'); sfx('tap'); }}>🌍 Explore</button>
      <button className={tab === 'following' ? 'on' : ''} onClick={() => { setTab('following'); sfx('tap'); }}>👥 Following</button>
    </div>

    {note && <p className="insta-note">{note}</p>}

    {posts === null && <p className="insta-empty">Loading…</p>}
    {posts && posts.length === 0 && <p className="insta-empty">{tab === 'following' ? 'Follow some players to see their posts here!' : 'No posts yet — be the first to share! 📷🎬'}</p>}

    <div className="insta-feed">
      {posts?.map((p) => <PostCard key={p.id} post={p} liked={likedSet.has(p.id)} signedIn={signedIn} username={username} character={character}
        onLike={toggleLike} onFollow={toggleFollow} onDelete={removePost} onNeedAccount={needAccount} />)}
    </div>

    {composing && <div className="insta-compose-backdrop" onClick={() => !posting && setComposing(false)}>
      <div className="insta-compose" onClick={(e) => e.stopPropagation()}>
        <div className="insta-compose-head"><strong>New post</strong><button onClick={() => setComposing(false)} disabled={posting}>×</button></div>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={pickMedia} />
        {preview
          ? <button className="insta-preview" onClick={() => fileInput.current?.click()}>
              {isVideoFile ? <video src={preview} muted loop autoPlay playsInline /> : <img src={preview} alt="preview" />}
              <span>Tap to change</span>
            </button>
          : <button className="insta-pick" onClick={() => fileInput.current?.click()}>📷🎬 Add a photo or video</button>}
        <textarea className="insta-caption-input" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Write a caption…" />
        {note && <p className="insta-note">{note}</p>}
        <button className="insta-share" onClick={share} disabled={posting || !file}>{posting ? 'Sharing…' : 'Share to everyone'}</button>
        <p className="insta-safety">Your post is public — everyone playing can see it. Be kind, and never share photos or videos of other people without asking.</p>
      </div>
    </div>}
  </main>;
}
