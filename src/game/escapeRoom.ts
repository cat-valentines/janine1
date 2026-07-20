/**
 * Escape Room — a point-and-click search game.
 *
 * You're dropped into a randomly-themed room (bedroom, bathroom, living room,
 * kitchen…) and have to open the furniture to find the hidden ⭐ stars. Searching
 * an empty piece gives a hot/cold clue toward the nearest star. Harder difficulty
 * hides more stars and adds a timer — and pays more coins.
 *
 * The room theme never repeats twice in a row, and which pieces hide the stars is
 * shuffled every game, so no two rooms play the same.
 */

export interface Furniture { icon: string; name: string }

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  wall: string;    // back-wall gradient
  floor: string;   // floor colour
  items: Furniture[];
}

export const THEMES: Theme[] = [
  {
    id: 'bedroom', name: 'Bedroom', emoji: '🛏️',
    wall: 'linear-gradient(#b9a7e6, #d8c8f0)', floor: '#8a6f52',
    items: [
      { icon: '🛏️', name: 'Bed' }, { icon: '🚪', name: 'Wardrobe' }, { icon: '🗄️', name: 'Dresser' },
      { icon: '📚', name: 'Bookshelf' }, { icon: '🧸', name: 'Toy chest' }, { icon: '🪞', name: 'Mirror' },
      { icon: '🪴', name: 'Plant' }, { icon: '💡', name: 'Lamp' }, { icon: '🗑️', name: 'Bin' }, { icon: '🧺', name: 'Laundry' },
    ],
  },
  {
    id: 'bathroom', name: 'Bathroom', emoji: '🛁',
    wall: 'linear-gradient(#8fd3e0, #c4eef2)', floor: '#c8d4dc',
    items: [
      { icon: '🛁', name: 'Bathtub' }, { icon: '🚽', name: 'Toilet' }, { icon: '🚪', name: 'Cabinet' },
      { icon: '🪞', name: 'Mirror' }, { icon: '🧺', name: 'Basket' }, { icon: '🧴', name: 'Shelf' },
      { icon: '🪴', name: 'Plant' }, { icon: '🗑️', name: 'Bin' }, { icon: '🚰', name: 'Sink' }, { icon: '🧻', name: 'Rack' },
    ],
  },
  {
    id: 'living', name: 'Living Room', emoji: '🛋️',
    wall: 'linear-gradient(#e6c79a, #f2e0c0)', floor: '#7a5a3c',
    items: [
      { icon: '🛋️', name: 'Sofa' }, { icon: '📺', name: 'TV stand' }, { icon: '🗄️', name: 'Cabinet' },
      { icon: '🪑', name: 'Armchair' }, { icon: '📚', name: 'Bookshelf' }, { icon: '🪴', name: 'Plant' },
      { icon: '🕰️', name: 'Clock' }, { icon: '🖼️', name: 'Painting' }, { icon: '🧺', name: 'Basket' }, { icon: '💡', name: 'Lamp' },
    ],
  },
  {
    id: 'kitchen', name: 'Kitchen', emoji: '🍳',
    wall: 'linear-gradient(#f0a89a, #f7d0c4)', floor: '#a98a63',
    items: [
      { icon: '🧊', name: 'Fridge' }, { icon: '🔥', name: 'Oven' }, { icon: '🗄️', name: 'Cupboard' },
      { icon: '🚰', name: 'Sink' }, { icon: '🍽️', name: 'Shelf' }, { icon: '🧺', name: 'Basket' },
      { icon: '🪑', name: 'Stool' }, { icon: '🗑️', name: 'Bin' }, { icon: '🪴', name: 'Plant' }, { icon: '☕', name: 'Coffee nook' },
    ],
  },
];

/** Where the ten pieces of furniture sit in the room, as % of the stage. */
export const SLOTS: Array<{ x: number; y: number }> = [
  { x: 11, y: 30 }, { x: 30, y: 26 }, { x: 50, y: 28 }, { x: 70, y: 26 }, { x: 89, y: 30 },
  { x: 12, y: 66 }, { x: 31, y: 70 }, { x: 50, y: 68 }, { x: 69, y: 70 }, { x: 88, y: 66 },
];

export interface Difficulty { id: 'easy' | 'medium' | 'hard'; name: string; stars: number; seconds: number; coins: number }

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'Easy', stars: 3, seconds: 0, coins: 10 },      // no timer, relaxed
  { id: 'medium', name: 'Medium', stars: 4, seconds: 60, coins: 22 },
  { id: 'hard', name: 'Hard', stars: 5, seconds: 45, coins: 40 },
];

/** Hot/cold clue text from the distance (%) to the nearest hidden star. */
export function clueFor(distance: number): string {
  if (distance < 14) return '🔥 Burning hot — a star is right here!';
  if (distance < 28) return '♨️ Warm — a star is close.';
  if (distance < 45) return '🌤️ Cool… keep looking.';
  return '❄️ Cold. Try the other side of the room.';
}
