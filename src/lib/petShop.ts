import type { PetSpecies } from './pets';

/** Everything you can buy in the Pet Shop. Bought supplies show up in your house. */
export type ShopCategory = 'food' | 'toy' | 'bowl' | 'bed' | 'house' | 'special';

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  category: ShopCategory;
  /** If set, this item is for that species only (shown under "Just for your…"). */
  species?: PetSpecies;
  blurb?: string;
}

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  food: '🍖 Food & Treats',
  toy: '🧸 Toys',
  bowl: '🥣 Bowls',
  bed: '🛏️ Beds',
  house: '🏠 Pet Houses',
  special: '⭐ Just for your pet',
};

export const PET_SHOP: ShopItem[] = [
  // food & treats — each also fills the food bar (buying = +5 food, see PetShopPanel)
  { id: 'kibble', name: 'Kibble Bag', emoji: '🥫', price: 8, category: 'food', blurb: 'A big bag of everyday food.' },
  { id: 'treats', name: 'Yummy Treats', emoji: '🦴', price: 10, category: 'food', blurb: 'Tasty treats they love.' },
  { id: 'fishfood', name: 'Fish Flakes', emoji: '🐟', price: 9, category: 'food', blurb: 'Extra-tasty flakes.' },
  { id: 'berrymix', name: 'Berry Mix', emoji: '🫐', price: 12, category: 'food', blurb: 'Sweet fruity snacks.' },
  // toys
  { id: 'ball', name: 'Bouncy Ball', emoji: '🎾', price: 14, category: 'toy' },
  { id: 'yarn', name: 'Ball of Yarn', emoji: '🧶', price: 12, category: 'toy' },
  { id: 'frisbee', name: 'Frisbee', emoji: '🥏', price: 15, category: 'toy' },
  { id: 'teddy', name: 'Tiny Teddy', emoji: '🧸', price: 18, category: 'toy' },
  { id: 'mouse', name: 'Toy Mouse', emoji: '🐭', price: 10, category: 'toy' },
  // bowls
  { id: 'foodbowl', name: 'Food Bowl', emoji: '🥣', price: 12, category: 'bowl' },
  { id: 'waterbowl', name: 'Water Bowl', emoji: '💧', price: 12, category: 'bowl' },
  // beds
  { id: 'bed', name: 'Cozy Bed', emoji: '🛏️', price: 26, category: 'bed' },
  { id: 'cushion', name: 'Soft Cushion', emoji: '🟢', price: 20, category: 'bed' },
  { id: 'basket', name: 'Wicker Basket', emoji: '🧺', price: 22, category: 'bed' },
  // pet houses
  { id: 'doghouse', name: 'Doghouse', emoji: '🏠', price: 40, category: 'house' },
  { id: 'cathouse', name: 'Cat Tower', emoji: '🏯', price: 45, category: 'house' },
  { id: 'birdcage', name: 'Birdcage', emoji: '🐦', price: 35, category: 'house' },
  { id: 'aquarium', name: 'Aquarium', emoji: '🐠', price: 48, category: 'house' },
  { id: 'hutch', name: 'Little Hutch', emoji: '🏚️', price: 38, category: 'house' },
  // species specials
  { id: 'scratch', name: 'Scratching Post', emoji: '🐈', price: 24, category: 'special', species: 'cat' },
  { id: 'chewbone', name: 'Big Chew Bone', emoji: '🦴', price: 16, category: 'special', species: 'dog' },
  { id: 'perch', name: 'Swing Perch', emoji: '🪵', price: 18, category: 'special', species: 'parakeet' },
  { id: 'baskrock', name: 'Basking Rock', emoji: '🪨', price: 20, category: 'special', species: 'turtle' },
  { id: 'wheel', name: 'Running Wheel', emoji: '🎡', price: 22, category: 'special', species: 'hamster' },
];

export const shopItemById = (id: string) => PET_SHOP.find((i) => i.id === id);
export const FOOD_CATEGORY: ShopCategory = 'food';

/** Dye your pet any of these colours (or use the picker for custom). */
export const DYE_PRICE = 15;
export const DYE_COLOURS = ['#e0685f', '#e8a04f', '#f2d05e', '#6fbf6a', '#5a9fe0', '#9a6fd0', '#f28fb0', '#ffffff', '#3a3a44', '#8a5a3a'];
