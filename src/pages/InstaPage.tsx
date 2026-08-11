import { useEffect, useRef, useState } from 'react';
import { characterAssets } from '../game/characters';
import type { CharacterId } from '../game/types';
import { createPost, deletePost, loadFeed, photoUrl, setFollow, setLike, type InstaPost } from '../lib/insta';

const avatar = (id: string) => characterAssets[id as CharacterId] ?? characterAssets.cottontail;

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
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
  const fileInput = useRef<HTMLInputElement>(null);

  // Anyone can browse, but posting/following/liking needs a real account (guests
  // have no server identity here). Nudge them to sign up, kindly.
  const needAccount = () => {
    setNote('Log in or sign up (it\'s free) to post, follow, and like — then join in!');
    onNeedAccount();
    return true;
  };

  const refresh = (t = tab) => {
    setPosts(null);
    loadFeed(t === 'following').then(setPosts).catch(() => { setPosts([]); setNote('Insta is offline right now — try again in a moment.'); });
  };
  useEffect(() => { refresh(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setNote('Please choose a photo (an image).'); return; }
    setFile(f); setPreview(URL.createObjectURL(f)); setNote('');
  };

  const share = async () => {
    if (!file) { setNote('Add a photo first.'); return; }
    setPosting(true); setNote('');
    try {
      await createPost(username, character, file, caption.trim());
      setComposing(false); setFile(null); setPreview(''); setCaption('');
      setTab('explore'); refresh('explore');
    } catch {
      setNote('Could not share your post. Please try again.');
    } finally { setPosting(false); }
  };

  const toggleLike = (p: InstaPost) => {
    if (!signedIn) return void needAccount();
    const liked = !p.liked_by_me;
    setPosts((list) => list?.map((x) => x.id === p.id ? { ...x, liked_by_me: liked, like_count: x.like_count + (liked ? 1 : -1) } : x) ?? list);
    setLike(p.id, liked).catch(() => refresh());
  };

  const toggleFollow = (p: InstaPost) => {
    if (!signedIn) return void needAccount();
    const following = !p.followed_by_me;
    setPosts((list) => list?.map((x) => x.author_id === p.author_id ? { ...x, followed_by_me: following } : x) ?? list);
    setFollow(p.author_id, following).catch(() => refresh());
  };

  const removePost = (p: InstaPost) => {
    if (!window.confirm('Delete this post?')) return;
    setPosts((list) => list?.filter((x) => x.id !== p.id) ?? list);
    deletePost(p.id, p.image_path).catch(() => refresh());
  };

  return <main className="insta-page">
    <header className="insta-top">
      <button className="insta-back" onClick={onBack}>←</button>
      <h1>📸 Insta</h1>
      <button className="insta-new" onClick={() => { if (!signedIn) return void needAccount(); setComposing(true); setNote(''); }}>＋ Post</button>
    </header>

    <div className="insta-me">
      <img src={avatar(character)} alt="" />
      <div><strong>@{username || 'explorer'}</strong><span>Share a photo with everyone</span></div>
    </div>

    <div className="insta-tabs">
      <button className={tab === 'explore' ? 'on' : ''} onClick={() => setTab('explore')}>🌍 Explore</button>
      <button className={tab === 'following' ? 'on' : ''} onClick={() => setTab('following')}>👥 Following</button>
    </div>

    {note && <p className="insta-note">{note}</p>}

    {posts === null && <p className="insta-empty">Loading…</p>}
    {posts && posts.length === 0 && <p className="insta-empty">{tab === 'following' ? 'Follow some players to see their posts here!' : 'No posts yet — be the first to share a photo! 📷'}</p>}

    <div className="insta-feed">
      {posts?.map((p) => <article className="insta-card" key={p.id}>
        <header className="insta-card-top">
          <img className="insta-avatar" src={avatar(p.author_character)} alt="" />
          <div className="insta-who"><strong>@{p.author_name}</strong><small>{ago(p.created_at)}</small></div>
          {p.is_mine
            ? <button className="insta-del" onClick={() => removePost(p)} title="Delete">🗑️</button>
            : <button className={`insta-follow ${p.followed_by_me ? 'on' : ''}`} onClick={() => toggleFollow(p)}>{p.followed_by_me ? 'Following' : 'Follow'}</button>}
        </header>
        <img className="insta-photo" src={photoUrl(p.image_path)} alt={p.caption || 'photo'} loading="lazy" />
        <div className="insta-card-actions">
          <button className={`insta-like ${p.liked_by_me ? 'on' : ''}`} onClick={() => toggleLike(p)}>{p.liked_by_me ? '❤️' : '🤍'} {p.like_count}</button>
        </div>
        {p.caption && <p className="insta-caption"><strong>@{p.author_name}</strong> {p.caption}</p>}
      </article>)}
    </div>

    {composing && <div className="insta-compose-backdrop" onClick={() => !posting && setComposing(false)}>
      <div className="insta-compose" onClick={(e) => e.stopPropagation()}>
        <div className="insta-compose-head"><strong>New post</strong><button onClick={() => setComposing(false)} disabled={posting}>×</button></div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
        {preview
          ? <button className="insta-preview" onClick={() => fileInput.current?.click()}><img src={preview} alt="preview" /><span>Tap to change</span></button>
          : <button className="insta-pick" onClick={() => fileInput.current?.click()}>📷 Add a photo</button>}
        <textarea className="insta-caption-input" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Write a caption…" />
        {note && <p className="insta-note">{note}</p>}
        <button className="insta-share" onClick={share} disabled={posting || !file}>{posting ? 'Sharing…' : 'Share to everyone'}</button>
        <p className="insta-safety">Your photo is public — everyone playing can see it. Be kind, and never share photos of other people without asking.</p>
      </div>
    </div>}
  </main>;
}
