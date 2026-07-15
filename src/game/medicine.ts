export interface Herb {
  id: string; name: string; icon: string; cures: string;
}

/** Real medicine-cat herbs, so the healing reads like the Warriors books. */
export const herbs: Herb[] = [
  { id: 'marigold', name: 'Marigold', icon: '🌼', cures: 'stops infection' },
  { id: 'catmint', name: 'Catmint', icon: '🌿', cures: 'cures greencough' },
  { id: 'poppy', name: 'Poppy Seed', icon: '🌺', cures: 'eases pain' },
  { id: 'cobweb', name: 'Cobweb', icon: '🕸️', cures: 'stops bleeding' },
  { id: 'horsetail', name: 'Horsetail', icon: '🌾', cures: 'treats wounds' },
  { id: 'chervil', name: 'Chervil', icon: '🍃', cures: 'for bellyache' },
  { id: 'honey', name: 'Honey', icon: '🍯', cures: 'soothes throats' },
  { id: 'moss', name: 'Moss', icon: '🍀', cures: 'carries water' },
];

export const herbById = (id: string) => herbs.find((herb) => herb.id === id);

export interface Patient { name: string; hurt: string; icon: string }

/** Who needs saving. Cycled through as lives are saved. */
export const patients: Patient[] = [
  { name: 'Brambleclaw', hurt: 'has a deep cut from a fox', icon: '🐈' },
  { name: 'Littlepaw', hurt: 'is coughing badly', icon: '🐱' },
  { name: 'Sandstorm', hurt: 'twisted her paw on the rocks', icon: '🐈‍⬛' },
  { name: 'Mossfur', hurt: 'ate something bad', icon: '🐆' },
  { name: 'Cloudkit', hurt: 'has a thorn deep in her pad', icon: '🐅' },
  { name: 'Ravenwing', hurt: 'was stung all over by bees', icon: '🐈' },
];

export const patientFor = (saved: number) => patients[saved % patients.length];

export interface RivalHealer { name: string; icon: string; secondsPerLife: number }

/** Other medicine cats racing you. Beat them all to win the prize. */
export const rivalHealers: RivalHealer[] = [
  { name: 'Featherwhisker', icon: '🐈', secondsPerLife: 34 },
  { name: 'Yellowfang', icon: '🐈‍⬛', secondsPerLife: 41 },
];

export const MISSION_SECONDS = 150;
export const HERBS_PER_PATIENT = 3;
export const HEAL_PRIZE = 60;
export const HERBS_IN_WORLD = 14;

/** The herbs this patient needs — stable per patient, so the list never shuffles. */
export function herbList(saved: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < HERBS_PER_PATIENT; i += 1) {
    list.push(herbs[(saved * 3 + i * 5 + 1) % herbs.length].id);
  }
  return [...new Set(list)];
}
