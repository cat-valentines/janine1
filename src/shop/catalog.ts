export interface ShopItem {
  id: string; name: string; icon: string; price: number;
  category: 'clothing' | 'furniture' | 'food' | 'magic';
}

export const shopItems: ShopItem[] = [
  { id: 'flower-crown', name: 'Flower Crown', icon: '🌼', price: 10, category: 'clothing' },
  { id: 'raincoat', name: 'Sunny Raincoat', icon: '🧥', price: 18, category: 'clothing' },
  { id: 'wizard-hat', name: 'Wizard Hat', icon: '🧙', price: 25, category: 'clothing' },
  { id: 'cozy-bed', name: 'Cozy Bed', icon: '🛏️', price: 22, category: 'furniture' },
  { id: 'tiny-lamp', name: 'Tiny Lamp', icon: '🪔', price: 12, category: 'furniture' },
  { id: 'berry-cake', name: 'Berry Cake', icon: '🍰', price: 8, category: 'food' },
  { id: 'warm-soup', name: 'Warm Soup', icon: '🥣', price: 6, category: 'food' },
  { id: 'moon-spell', name: 'Moon Spell', icon: '🔮', price: 14, category: 'magic' },
];

export function itemById(id: string) { return shopItems.find((item) => item.id === id); }
