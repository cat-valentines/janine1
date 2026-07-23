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
  ollie: { asset: '/assets/pixel-fish.png', singular: 'fish', plural: 'fish' },
  coral: { asset: '/assets/pixel-fish.png', singular: 'fish', plural: 'fish' },
  biscuit: { asset: '/assets/pixel-bone.png', singular: 'bone', plural: 'bones' },
  koala: { asset: '/assets/pixel-leaf.png', singular: 'leaf', plural: 'leaves' },
  teddy: { asset: '/assets/pixel-honey.png', singular: 'honeypot', plural: 'honeypots' },
  panda: { asset: '/assets/pixel-bamboo.png', singular: 'bamboo', plural: 'bamboo' },
  tiger: { asset: '/assets/pixel-bone.png', singular: 'bone', plural: 'bones' },
  piggy: { asset: '/assets/pixel-apple.png', singular: 'apple', plural: 'apples' },
  parrot: { asset: '/assets/pixel-apple.png', singular: 'fruit', plural: 'fruit' },
  mila: { asset: '/assets/pixel-apple.png', singular: 'strawberry', plural: 'strawberries' },
  gabby: { asset: '/assets/pixel-leaf.png', singular: 'leaf', plural: 'leaves' },
  amsaal: { asset: '/assets/pixel-apple.png', singular: 'seed', plural: 'seeds' },
};

export const characterAssets: Record<CharacterId, string> = {
  cottontail: '/assets/cottontail.png', momo: '/assets/pixel-penguin.png', toby: '/assets/pixel-fox.png',
  ollie: '/assets/pixel-otter.png', coral: '/assets/pixel-clownfish.png', biscuit: '/assets/pixel-dog.png',
  koala: '/assets/pixel-koala.png', teddy: '/assets/pixel-teddy.png', panda: '/assets/pixel-panda.png',
  tiger: '/assets/pixel-tiger.png', piggy: '/assets/pixel-piggy.png',
  parrot: '/assets/pixel-parrot.png',
  mila: '/assets/pixel-mila.png', gabby: '/assets/pixel-gabby.png', amsaal: '/assets/pixel-amsaal.png',
};
