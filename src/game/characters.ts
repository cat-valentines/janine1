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
  misha: { asset: '/assets/pixel-apple.png', singular: 'strawberry', plural: 'strawberries' },
  joy: { asset: '/assets/pixel-apple.png', singular: 'berry', plural: 'berries' },
  melly: { asset: '/assets/pixel-fish.png', singular: 'fish', plural: 'fish' },
  martin: { asset: '/assets/pixel-apple.png', singular: 'apple', plural: 'apples' },
  hazel: { asset: '/assets/pixel-apple.png', singular: 'orange', plural: 'oranges' },
  bubbles: { asset: '/assets/pixel-fish.png', singular: 'bubble', plural: 'bubbles' },
  rocky: { asset: '/assets/pixel-apple.png', singular: 'berry', plural: 'berries' },
  ellie: { asset: '/assets/pixel-apple.png', singular: 'peanut', plural: 'peanuts' },
  pip: { asset: '/assets/pixel-leaf.png', singular: 'leaf', plural: 'leaves' },
  clover: { asset: '/assets/pixel-leaf.png', singular: 'clover', plural: 'clovers' },
  maple: { asset: '/assets/pixel-apple.png', singular: 'acorn', plural: 'acorns' },
  lulu: { asset: '/assets/pixel-apple.png', singular: 'apple', plural: 'apples' },
  finn: { asset: '/assets/pixel-apple.png', singular: 'berry', plural: 'berries' },
  daisy: { asset: '/assets/pixel-apple.png', singular: 'seed', plural: 'seeds' },
  hattie: { asset: '/assets/pixel-apple.png', singular: 'watermelon', plural: 'watermelons' },
  kiki: { asset: '/assets/pixel-apple.png', singular: 'mango', plural: 'mangoes' },
  pango: { asset: '/assets/pixel-apple.png', singular: 'ant', plural: 'ants' },
  honey: { asset: '/assets/pixel-honey.png', singular: 'honeypot', plural: 'honeypots' },
  roo: { asset: '/assets/pixel-leaf.png', singular: 'leaf', plural: 'leaves' },
  snowy: { asset: '/assets/pixel-apple.png', singular: 'berry', plural: 'berries' },
  pigeon: { asset: '/assets/pixel-apple.png', singular: 'seed', plural: 'seeds' },
};

export const characterAssets: Record<CharacterId, string> = {
  cottontail: '/assets/cottontail.png', momo: '/assets/pixel-penguin.png', toby: '/assets/pixel-fox.png',
  ollie: '/assets/pixel-otter.png', coral: '/assets/pixel-clownfish.png', biscuit: '/assets/pixel-dog.png',
  koala: '/assets/pixel-koala.png', teddy: '/assets/pixel-teddy.png', panda: '/assets/pixel-panda.png',
  tiger: '/assets/pixel-tiger.png', piggy: '/assets/pixel-piggy.png',
  parrot: '/assets/pixel-parrot.png',
  mila: '/assets/pixel-mila.png', gabby: '/assets/pixel-gabby.png', amsaal: '/assets/pixel-amsaal.png',
  misha: '/assets/pixel-misha.png',
  joy: '/assets/pixel-joy.png', melly: '/assets/pixel-melly.png', martin: '/assets/pixel-martin.png',
  hazel: '/assets/pixel-hazel.png', bubbles: '/assets/pixel-bubbles.png', rocky: '/assets/pixel-rocky.png', ellie: '/assets/pixel-ellie.png',
  pip: '/assets/pixel-pip.png', clover: '/assets/pixel-clover.png', maple: '/assets/pixel-maple.png', lulu: '/assets/pixel-lulu.png',
  finn: '/assets/pixel-finn.png', daisy: '/assets/pixel-daisy.png',
  hattie: '/assets/pixel-hattie.png', kiki: '/assets/pixel-kiki.png', pango: '/assets/pixel-pango.png',
  honey: '/assets/pixel-honey-bee.png', roo: '/assets/pixel-roo.png', snowy: '/assets/pixel-snowy.png',
  pigeon: '/assets/pixel-pigeon.png',
};

/**
 * Which island unlocks each character. Characters NOT listed here are starters
 * — available from the very beginning. The rest unlock as you open islands, and
 * this is the single source of truth for both the profile picker and the map's
 * "what you'll unlock here" preview, so the two always agree.
 */
export const characterIsland = new Map<CharacterId, number>([
  ['joy', 2], ['melly', 2], ['martin', 2],
  ['hazel', 3], ['bubbles', 3],
  ['rocky', 4], ['ellie', 4],
  ['pip', 5], ['clover', 6], ['maple', 7], ['lulu', 8],
  ['finn', 9], ['daisy', 10],
  ['hattie', 11], ['kiki', 12], ['pango', 13],
  ['honey', 14], ['roo', 15], ['snowy', 16],
]);
