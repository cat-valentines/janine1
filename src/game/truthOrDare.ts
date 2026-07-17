/**
 * Truth or Dare — a pass-and-play party game for friends who are together in
 * one place (a bus, a classroom, a sleepover). One device is passed around: you
 * type everyone's names, spin the wheel, and whoever it lands on picks a
 * face-down Truth or Dare card.
 *
 * Every prompt here is deliberately wholesome and kid-safe — nothing personal,
 * embarrassing, or unkind.
 */

export const TRUTHS: string[] = [
  'What was your favorite grade in school, and why?',
  'Who is your best friend, and what do you like most about them?',
  'What is your favorite food of all time?',
  'What is the funniest thing that has ever happened to you?',
  'If you could have any pet in the world, what would it be?',
  'What is your favorite movie or TV show?',
  'What do you want to be when you grow up?',
  'What is your favorite game to play?',
  'What is the best gift you have ever been given?',
  'What is your favorite season, and why?',
  'If you could travel anywhere in the world, where would you go?',
  'What is your favorite subject in school?',
  'What is a talent you wish you had?',
  'What is your favorite thing to do on the weekend?',
  'What is the silliest thing you are a little scared of?',
  'What is your favorite ice cream flavor?',
  'Who makes you laugh the most?',
  'What is your favorite song right now?',
  'What is the best book you have ever read?',
  'If you had three wishes, what would you wish for?',
  'What is your favorite holiday, and why?',
  'What is something you are really good at?',
  'What is your favorite animal?',
  'What is the nicest thing someone has ever done for you?',
  'If you had a superhero name, what would it be?',
  'What is your favorite dessert?',
  'What made you smile today?',
  'What is your favorite color, and why?',
  'What is your dream vacation?',
  'What is your favorite thing about your best friend?',
];

export const DARES: string[] = [
  'Do 5 correct push-ups.',
  'Do 10 jumping jacks.',
  'Hop on one foot for 15 seconds.',
  'Sing the chorus of your favorite song.',
  'Do your best animal impression.',
  'Talk in a robot voice until your next turn.',
  'Do a silly dance for 10 seconds.',
  'Try to touch your toes 5 times.',
  'Balance a book on your head for 10 seconds.',
  'Say the alphabet backwards from J to A.',
  'Make the funniest face you can.',
  'Spin around 5 times, then try to walk in a straight line.',
  'Strike your best superhero pose and hold it for 10 seconds.',
  'Give someone a high five and a nice compliment.',
  'Pretend to be a cat for 20 seconds.',
  'Hum a song and let everyone guess what it is.',
  'Do 8 squats.',
  'Walk like a penguin across the room.',
  'Tell everyone a joke.',
  'Clap your hands 20 times as fast as you can.',
  'Stand on one leg and count out loud to 20.',
  'Pretend to swim in place for 15 seconds.',
  'Make up a short rap about your favorite food.',
  'Do a slow-motion run in place for 10 seconds.',
  'Give a 15-second speech about why pizza is great.',
  'Wiggle like a worm for 10 seconds.',
  'Do your best dinosaur roar.',
  'March in place like a robot for 15 seconds.',
  'Say "bananas" after every word for 30 seconds.',
  'Do a big star jump 5 times.',
];

export const randomFrom = (list: string[]) => list[Math.floor(Math.random() * list.length)];

/** Cheerful wheel-segment colours, cycled across the players. */
export const WHEEL_COLORS = ['#ff8fab', '#4dabf7', '#69db7c', '#ffd43b', '#b197fc', '#4ecdc4', '#ffa94d', '#f783ac', '#63e6be', '#ff6b6b'];
