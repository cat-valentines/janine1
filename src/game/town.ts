import type { ShopItem } from '../shop/catalog';

export interface TownShop {
  id: string; name: string; sign: string;
  keeper: string; keeperIcon: string; greeting: string;
  /** Where the shop sits, in blocks. The door faces the street (−z). */
  x: number; z: number;
  width: number; depth: number; height: number;
  wall: string; roof: string;
  stock: ShopItem[];
}

/** The town's own goods, on top of the existing shop catalogue. */
const magic: ShopItem[] = [
  { id: 'moon-spell', name: 'Moon Spell', icon: '🔮', price: 14, category: 'magic' },
  { id: 'star-dust', name: 'Star Dust', icon: '✨', price: 9, category: 'magic' },
  { id: 'wizard-hat', name: 'Wizard Hat', icon: '🧙', price: 25, category: 'clothing' },
  { id: 'magic-broom', name: 'Magic Broom', icon: '🧹', price: 20, category: 'magic' },
];

const grocery: ShopItem[] = [
  { id: 'apple-basket', name: 'Apple Basket', icon: '🍎', price: 5, category: 'food' },
  { id: 'bread-loaf', name: 'Fresh Bread', icon: '🍞', price: 4, category: 'food' },
  { id: 'cheese-wheel', name: 'Cheese Wheel', icon: '🧀', price: 7, category: 'food' },
  { id: 'honey-jar', name: 'Honey Jar', icon: '🍯', price: 6, category: 'food' },
];

const diner: ShopItem[] = [
  { id: 'berry-cake', name: 'Berry Cake', icon: '🍰', price: 8, category: 'food' },
  { id: 'warm-soup', name: 'Warm Soup', icon: '🥣', price: 6, category: 'food' },
  { id: 'pancakes', name: 'Pancakes', icon: '🥞', price: 7, category: 'food' },
  { id: 'ice-cream', name: 'Ice Cream', icon: '🍨', price: 5, category: 'food' },
];

const petShop: ShopItem[] = [
  { id: 'pet-kitten', name: 'Kitten Friend', icon: '🐈', price: 30, category: 'furniture' },
  { id: 'pet-puppy', name: 'Puppy Friend', icon: '🐕', price: 30, category: 'furniture' },
  { id: 'pet-bunny', name: 'Bunny Friend', icon: '🐇', price: 24, category: 'furniture' },
  { id: 'pet-bowl', name: 'Pet Bowl', icon: '🥣', price: 6, category: 'furniture' },
];

const clothes: ShopItem[] = [
  { id: 'flower-crown', name: 'Flower Crown', icon: '🌼', price: 10, category: 'clothing' },
  { id: 'raincoat', name: 'Sunny Raincoat', icon: '🧥', price: 18, category: 'clothing' },
  { id: 'red-cap', name: 'Explorer Cap', icon: '🧢', price: 4, category: 'clothing' },
  { id: 'star-wings', name: 'Star Wings', icon: '🪽', price: 12, category: 'clothing' },
];

const furniture: ShopItem[] = [
  { id: 'cozy-bed', name: 'Cozy Bed', icon: '🛏️', price: 22, category: 'furniture' },
  { id: 'tiny-lamp', name: 'Tiny Lamp', icon: '🪔', price: 12, category: 'furniture' },
  { id: 'comfy-chair', name: 'Comfy Chair', icon: '🪑', price: 14, category: 'furniture' },
  { id: 'flower-pot', name: 'Flower Pot', icon: '🪴', price: 8, category: 'furniture' },
];

/** Shops line both sides of one street running along +x. */
export const townShops: TownShop[] = [
  {
    id: 'magic', name: 'Moonlight Magic', sign: '🔮', keeper: 'Willow', keeperIcon: '🧙',
    greeting: 'Welcome! Every spell here is freshly brewed.',
    x: 14, z: 10, width: 9, depth: 8, height: 6, wall: '#6b5a8f', roof: '#3f3360', stock: magic,
  },
  {
    id: 'grocery', name: 'Fern & Bramble', sign: '🍎', keeper: 'Bramble', keeperIcon: '🧑‍🌾',
    greeting: 'Fresh from the fields this morning!',
    x: 28, z: 10, width: 9, depth: 8, height: 5, wall: '#8a6642', roof: '#5f4830', stock: grocery,
  },
  {
    id: 'diner', name: 'The Cosy Spoon', sign: '🍰', keeper: 'Pip', keeperIcon: '🧑‍🍳',
    greeting: 'Hungry? The soup is still warm.',
    x: 42, z: 10, width: 10, depth: 8, height: 5, wall: '#b06a5a', roof: '#7d4436', stock: diner,
  },
  {
    id: 'pets', name: 'Whisker Friends', sign: '🐾', keeper: 'Maple', keeperIcon: '🧑',
    greeting: 'They have all been waiting for a friend!',
    x: 14, z: 26, width: 9, depth: 8, height: 5, wall: '#5f8b6b', roof: '#3d5f4a', stock: petShop,
  },
  {
    id: 'clothes', name: 'Royal Threads', sign: '👗', keeper: 'Juniper', keeperIcon: '🧑‍🎨',
    greeting: 'Try something on — it is your style!',
    x: 28, z: 26, width: 9, depth: 8, height: 5, wall: '#c48fa5', roof: '#8f5f74', stock: clothes,
  },
  {
    id: 'furniture', name: 'Hearth & Home', sign: '🪑', keeper: 'Cedar', keeperIcon: '🧑‍🔧',
    greeting: 'Everything you need for a cosy house.',
    x: 42, z: 26, width: 10, depth: 8, height: 5, wall: '#a8763f', roof: '#77522b', stock: furniture,
  },
];

export const shopById = (id: string) => townShops.find((shop) => shop.id === id);

/** Player houses out past the shops, to walk to and buy. */
export interface TownHouse { id: string; owner: string; x: number; z: number; forSale: boolean; price: number }

export const townHouses: TownHouse[] = [
  { id: 'h1', owner: 'A player', x: 62, z: 8, forSale: true, price: 24 },
  { id: 'h2', owner: 'A player', x: 62, z: 22, forSale: false, price: 0 },
  { id: 'h3', owner: 'A player', x: 74, z: 27, forSale: true, price: 31 },
];

export const TOWN_W = 88;
export const TOWN_D = 40;
/** The world runs well past the town: a trail out into the countryside. */
export const WORLD_W = 380;
export const WORLD_D = 260;
/** Everything past here is wild forest. */
export const FOREST_X = 96;
export const RIVER_X = 170;
export const RIVER_WIDTH = 9;
/** The street runs down the middle; shops sit on either side of it. */
export const STREET_Z = 19;
export const STREET_WIDTH = 5;

export interface Forage {
  id: string; name: string; icon: string; edible: boolean; blurb: string;
}

/** Everything the forest gives you. Edible things can be eaten from your pack. */
export const forageKinds: Record<string, Forage> = {
  wood: { id: 'wood', name: 'Wood', icon: '🪵', edible: false, blurb: 'Chopped from a tree.' },
  stone: { id: 'stone', name: 'Stone', icon: '🪨', edible: false, blurb: 'Broken off a rock.' },
  berries: { id: 'berries', name: 'Wild Berries', icon: '🫐', edible: true, blurb: 'Sweet and juicy.' },
  mushroom: { id: 'mushroom', name: 'Mushroom', icon: '🍄', edible: true, blurb: 'Good in a soup.' },
  apple: { id: 'apple', name: 'Apple', icon: '🍎', edible: true, blurb: 'Crunchy and fresh.' },
  herb: { id: 'herb', name: 'Green Herb', icon: '🌿', edible: true, blurb: 'Smells lovely.' },
  carrot: { id: 'carrot', name: 'Wild Carrot', icon: '🥕', edible: true, blurb: 'Pulled from the ground.' },
  fish: { id: 'fish', name: 'Fish', icon: '🐟', edible: true, blurb: 'Caught in the river.' },
  venison: { id: 'venison', name: 'Venison', icon: '🍖', edible: true, blurb: 'From a deer you hunted.' },
  egg: { id: 'egg', name: 'Bird Egg', icon: '🥚', edible: true, blurb: 'Found in a nest.' },
};

export const forageById = (id: string) => forageKinds[id];

/** Camps dotted through the forest, each with a crate of supplies. */
export interface Camp { id: string; name: string; x: number; z: number }

export const forestCamps: Camp[] = [
  { id: 'c1', name: 'Mosswood Camp', x: 112, z: 30 },
  { id: 'c2', name: 'Fernhollow Camp', x: 134, z: 92 },
  { id: 'c3', name: 'Riverside Camp', x: 196, z: 44 },
  { id: 'c4', name: 'Deepwood Camp', x: 250, z: 150 },
  { id: 'c5', name: 'Far Hollow Camp', x: 320, z: 96 },
  { id: 'c6', name: 'Thornbrook Camp', x: 150, z: 200 },
];

/** How much energy each food gives back when eaten. */
export const foodEnergy: Record<string, number> = {
  berries: 12, mushroom: 14, apple: 16, herb: 8, carrot: 12, fish: 22, venison: 30, egg: 15,
};

/** What each foraged good fetches at your own market stand, per item. */
export const sellPrice: Record<string, number> = {
  wood: 2, stone: 2, berries: 3, mushroom: 3, apple: 3, herb: 2, carrot: 3, fish: 6, venison: 10, egg: 4,
};

export const MAX_ENERGY = 100;
/** Energy per second, walking and standing still. */
export const DRAIN_WALK = 0.75;
export const DRAIN_IDLE = 0.28;
/** Venom burns energy fast until it wears off. */
export const VENOM_DRAIN = 4;
export const VENOM_SECONDS = 9;
