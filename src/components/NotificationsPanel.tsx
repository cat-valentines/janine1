import type { NotificationItem } from '../lib/notifications';

interface NotificationsPanelProps {
  items: NotificationItem[];
  signedIn: boolean;
  seenAt: string;
  onClose: () => void;
  onOpenFriends: () => void;
}

/** Friendly relative time, e.g. "2h ago". */
function ago(at: string) {
  const seconds = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationsPanel({ items, signedIn, seenAt, onClose, onOpenFriends }: NotificationsPanelProps) {
  return <div className="friends-backdrop" onClick={onClose}>
    <aside className="notif-panel" onClick={(event) => event.stopPropagation()}>
      <div className="shop-heading">
        <div><span className="card-kicker">Friend updates & invites</span><h2>🔔 Notifications</h2></div>
        <button onClick={onClose} aria-label="Close notifications">×</button>
      </div>

      {!signedIn
        ? <div className="friend-login-note"><span>🔐</span><h3>Log in to see your notifications</h3><p>When a friend adds you or invites you to play, it shows up here.</p></div>
        : items.length === 0
          ? <p className="notif-empty">No notifications yet. When a friend adds you or invites you to a game, you will see it here.</p>
          : <ul className="notif-list">
            {items.map((item) => {
              const isNew = !seenAt || item.at > seenAt;
              return <li className={`notif-item ${item.kind} ${isNew ? 'unread' : ''}`} key={item.id}>
                {isNew && <i className="notif-dot" aria-label="new" />}
                <p>{item.text}</p>
                <small>{ago(item.at)}</small>
              </li>;
            })}
          </ul>}

      {signedIn && <button className="notif-friends-link" onClick={onOpenFriends}>👫 Open Friends to reply or invite back</button>}
    </aside>
  </div>;
}
