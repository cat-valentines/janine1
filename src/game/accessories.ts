// Royal Style Shop flower clips — a paid, medium-size flower that sits on top of
// your character's head. (Shared so the shop and the profile card agree.)
export interface Accessory { id: string; icon: string; name: string; price: number }

export const ACCESSORIES: Accessory[] = [
  { id: 'blossom', icon: '🌸', name: 'Blossom clip', price: 5 },
  { id: 'hibiscus', icon: '🌺', name: 'Hibiscus clip', price: 6 },
  { id: 'tulip', icon: '🌷', name: 'Tulip clip', price: 6 },
  { id: 'daisy', icon: '🌼', name: 'Daisy clip', price: 7 },
  { id: 'sunflower', icon: '🌻', name: 'Sunflower clip', price: 8 },
  { id: 'rose', icon: '🌹', name: 'Rose clip', price: 9 },
];

export const accessoryById = (id: string) => ACCESSORIES.find((item) => item.id === id);
