import { useState } from 'react';

const friends = [{ name: 'Luna', icon: '🐻', status: 'Floor 8' }, { name: 'Kai', icon: '🦊', status: 'Online' }, { name: 'Mira', icon: '🐧', status: 'Level 9' }];

export function FriendsPanel({ onClose, onShare }: { onClose: () => void; onShare: () => void }) {
  const [selected, setSelected] = useState('Luna');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>(['Meet me in the haunted house!']);
  const [calling, setCalling] = useState('');
  const send = () => { if (message.trim()) { setMessages((items) => [...items, message.trim()]); setMessage(''); } };
  return <div className="friends-backdrop" onClick={onClose}><aside className="friends-panel" onClick={(event) => event.stopPropagation()}>
    <div className="shop-heading"><div><span className="card-kicker">Hana Aloha Island</span><h2>Friends</h2></div><button onClick={onClose} aria-label="Close friends">×</button></div>
    <div className="friend-list">{friends.map((friend) => <button className={selected === friend.name ? 'selected' : ''} onClick={() => setSelected(friend.name)} key={friend.name}><span>{friend.icon}</span><strong>{friend.name}<small>{friend.status}</small></strong></button>)}</div>
    <div className="friend-actions"><button onClick={() => setCalling(calling ? '' : selected)}>📞 {calling ? 'End Call' : `Call ${selected}`}</button><button onClick={onShare}>🔗 Share Quest</button><button onClick={onShare}>🏠 Quest Together</button></div>
    {calling && <p className="call-status">Calling {calling}…</p>}
    <div className="chat-box"><h3>Chat with {selected}</h3>{messages.map((text, index) => <p key={`${text}-${index}`}>{text}</p>)}<div><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Write a message…" maxLength={500} /><button onClick={send}>Send</button></div></div>
  </aside></div>;
}
