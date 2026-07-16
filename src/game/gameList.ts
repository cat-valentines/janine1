export type GameId =
  | 'tower' | 'hunger' | 'medicine' | 'runner' | 'drive'
  | 'riddle' | 'pong' | 'fruit' | 'escape' | 'connector' | 'underwater';

export interface GameCard {
  id: GameId;
  name: string;
  icon: string;
  /** One line, in plain words, so a new player knows what they are picking. */
  blurb: string;
  kind: 'Adventure' | 'Puzzle' | 'Racing' | 'Arcade' | 'Scary';
}

/**
 * Every game, in one place.
 *
 * The shelf on the front page and the More page both read this, so the two can
 * never drift apart and no game can quietly go missing from one of them.
 */
export const gameList: GameCard[] = [
  { id: 'tower', name: 'Tower Royal', icon: '🏰', kind: 'Adventure', blurb: 'Climb ten floors of a haunted tower, dodge the cats and duck the lasers.' },
  { id: 'hunger', name: 'Hunger Quests', icon: '🏹', kind: 'Adventure', blurb: 'Survive the forest. Fly, teleport and vanish to be the last one standing.' },
  { id: 'medicine', name: 'Medicine Mission', icon: '🌿', kind: 'Adventure', blurb: 'Be the medicine cat. Find herbs and save the most lives.' },
  { id: 'runner', name: 'Runner Up', icon: '🏃', kind: 'Arcade', blurb: 'Jump and dash through your own world. One tap, no brakes.' },
  { id: 'drive', name: 'Truck Trouble', icon: '🚚', kind: 'Racing', blurb: 'Drive a pastel truck over seesaws, lifts and swinging hammers.' },
  { id: 'riddle', name: 'Riddle Rooms', icon: '🧩', kind: 'Puzzle', blurb: 'Two hundred puzzles. Spot the imposter, find the clue, click the answer.' },
  { id: 'pong', name: 'Ping Pong', icon: '🏓', kind: 'Arcade', blurb: 'Keep it up on your own, beat the bot, or play a friend on one keyboard.' },
  { id: 'fruit', name: 'Fruit', icon: '🍓', kind: 'Puzzle', blurb: 'Drop fruit in a cup. Two of the same merge. Do not let it overflow.' },
  { id: 'escape', name: 'The Housekeeper', icon: '🔦', kind: 'Scary', blurb: 'Find three keys and escape her house. Hide before she sees you.' },
  { id: 'connector', name: 'Connector', icon: '🔢', kind: 'Puzzle', blurb: 'Swipe to connect blocks with the same number. They merge and multiply — how high can you go?' },
  { id: 'underwater', name: 'Underwater Maze', icon: '🐠', kind: 'Adventure', blurb: 'Swim a 3-D coral reef as a clownfish or blue tang. Find 10 keys and dodge sharks, eels and big fish.' },
];

export const gameById = (id: GameId) => gameList.find((game) => game.id === id);
