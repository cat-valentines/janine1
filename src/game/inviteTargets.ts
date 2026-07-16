/** Everywhere you can invite a friend to. Games you can play, plus places. */
export interface InviteTarget {
  id: string;
  label: string;
  icon: string;
  path: string;
  /** True for the three games two friends can actually meet up in. */
  game: boolean;
}

export const inviteTargets: InviteTarget[] = [
  { id: 'tower', label: 'Tower Royal', icon: '🏰', path: '/play/tower', game: true },
  { id: 'hunger', label: 'Hunger Quests', icon: '🏹', path: '/play/hunger', game: true },
  { id: 'pong', label: 'Ping Pong', icon: '🏓', path: '/play/pong', game: true },
  { id: 'market', label: 'the Market', icon: '🏪', path: '/market', game: false },
  { id: 'house', label: 'my House', icon: '🏡', path: '/house', game: false },
];

export const gameTargets = inviteTargets.filter((target) => target.game);

/** A full link to a target, so a friend can tap it and land in the right place. */
export const inviteLink = (target: InviteTarget) => `${window.location.origin}${target.path}`;
