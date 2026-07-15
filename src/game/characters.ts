import type { CharacterId } from './types';

interface CharacterCollectible {
  asset: string;
  singular: string;
  plural: string;
}

export const characterCollectibles: Record<CharacterId, CharacterCollectible> = {
  cottontail: { asset: '/assets/pixel-carrot.png', singular: 'carrot', plural: 'carrots' },
  momo: { asset: '/assets/pixel-fish.png', singular: 'fish', plural: 'fish' },
  toby: { asset: '/assets/pixel-bone.png', singular: 'bone', plural: 'bones' },
};

export const characterAssets: Record<CharacterId, string> = {
  cottontail: '/assets/cottontail.png', momo: '/assets/pixel-penguin.png', toby: '/assets/pixel-fox.png',
};
