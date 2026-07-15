export type VillageZone = 'market' | 'woods' | 'countryside';

export interface VillageShop {
  id: string; icon: string; item: string; price: number; x: number; y: number;
  kind: 'stand' | 'magic' | 'clothing' | 'furniture' | 'home';
}

export const zones: Record<VillageZone, { title: string; background: string; shops: VillageShop[] }> = {
  market: { title: 'Market Square', background: '/assets/pixel-market-world.png', shops: [
    { id: 'carrots', icon: '🥕', item: '5 carrots', price: 8, x: 20, y: 55, kind: 'stand' },
    { id: 'fish', icon: '🐟', item: '4 fish', price: 7, x: 77, y: 51, kind: 'stand' },
    { id: 'bones', icon: '🦴', item: '6 bones', price: 10, x: 83, y: 75, kind: 'stand' },
  ] },
  woods: { title: 'Enchanted Woods', background: '/assets/pixel-village-woods.png', shops: [
    { id: 'spell', icon: '🔮', item: 'Moonlight spell', price: 14, x: 22, y: 55, kind: 'magic' },
    { id: 'potion', icon: '🧪', item: 'Flying potion', price: 12, x: 76, y: 48, kind: 'magic' },
  ] },
  countryside: { title: 'Sunny Countryside', background: '/assets/pixel-countryside.png', shops: [
    { id: 'cape', icon: '🧥', item: 'Adventure cape', price: 16, x: 76, y: 47, kind: 'clothing' },
    { id: 'sofa', icon: '🛋️', item: 'Cozy sofa', price: 18, x: 82, y: 72, kind: 'furniture' },
    { id: 'cottage', icon: '🏡', item: 'Private cottage', price: 20, x: 20, y: 62, kind: 'home' },
  ] },
};

export const nextZone: Record<VillageZone, VillageZone | null> = { market: 'woods', woods: 'countryside', countryside: null };
export const previousZone: Record<VillageZone, VillageZone | null> = { market: null, woods: 'market', countryside: 'woods' };
