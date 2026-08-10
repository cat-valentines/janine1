/**
 * Pets you adopt, feed and take walking.
 *
 * Each pet has a fullness (0–100) that slowly drops over time, so you have to
 * buy food and feed them. One pet at a time is your "active" companion — it
 * follows you around your house and the town market as a little animated buddy.
 *
 * Lives on-device (like coins) so it works signed-out too.
 */
import { storage } from './storage';

export type PetSpecies = 'cat' | 'dog' | 'parakeet' | 'turtle' | 'hamster';

export interface PetSpeciesInfo { species: PetSpecies; name: string; emoji: string; price: number; blurb: string }

export const PET_SPECIES: Record<PetSpecies, PetSpeciesInfo> = {
  cat: { species: 'cat', name: 'Cat', emoji: '🐈', price: 60, blurb: 'A cuddly cat that pounces around.' },
  dog: { species: 'dog', name: 'Dog', emoji: '🐕', price: 80, blurb: 'A loyal dog that trots by your side.' },
  parakeet: { species: 'parakeet', name: 'Parakeet', emoji: '🦜', price: 50, blurb: 'A chirpy parakeet that flutters along.' },
  turtle: { species: 'turtle', name: 'Turtle', emoji: '🐢', price: 40, blurb: 'A slow, happy little turtle.' },
  hamster: { species: 'hamster', name: 'Hamster', emoji: '🐹', price: 30, blurb: 'A tiny hamster that scurries about.' },
};
export const PET_ORDER: PetSpecies[] = ['cat', 'dog', 'parakeet', 'turtle', 'hamster'];

/** Coins per pellet of food, and how much a feed tops a pet up. */
export const FOOD_PRICE = 5;
export const FOOD_FILL = 40;
/** Fullness lost per hour, so a well-fed pet gets peckish over a day. */
const DECAY_PER_HOUR = 9;

export interface Pet { id: string; species: PetSpecies; name: string; fullness: number; fullnessAt: number; adoptedAt: number }
export interface PetsState {
  pets: Pet[];
  food: number;
  activePetId: string | null;
  /** Pet-shop supplies you own (item id → count) — they show up in your house. */
  supplies: Record<string, number>;
  /** Dye colour per pet id (hex), recolouring your pet. */
  dye: Record<string, string>;
}

const KEY = 'magic-islands-pets';
let counter = 0;
const uid = () => `pet-${Date.now().toString(36)}-${(counter += 1)}`;

function decayed(pet: Pet, now: number): number {
  const hours = Math.max(0, (now - (pet.fullnessAt || now)) / 3_600_000);
  return Math.max(0, Math.min(100, Math.round((pet.fullness ?? 80) - hours * DECAY_PER_HOUR)));
}

export function loadPets(): PetsState {
  const now = Date.now();
  let state: PetsState = { pets: [], food: 0, activePetId: null, supplies: {}, dye: {} };
  const raw = storage.get(KEY);
  if (raw) { try { state = { ...state, ...(JSON.parse(raw) as PetsState) }; } catch { /* keep default */ } }
  state.supplies = state.supplies ?? {};
  state.dye = state.dye ?? {};
  // Apply the hunger that ticked down while you were away.
  state.pets = (state.pets ?? []).map((p) => ({ ...p, fullness: decayed(p, now), fullnessAt: now }));
  if (state.activePetId && !state.pets.some((p) => p.id === state.activePetId)) state.activePetId = state.pets[0]?.id ?? null;
  return state;
}

function save(state: PetsState): PetsState { storage.set(KEY, JSON.stringify(state)); return state; }

/** Bring home a new pet. (Caller spends the coins.) */
export function adoptPet(species: PetSpecies, name: string): PetsState {
  const state = loadPets();
  const pet: Pet = { id: uid(), species, name: name.trim() || PET_SPECIES[species].name, fullness: 80, fullnessAt: Date.now(), adoptedAt: Date.now() };
  state.pets.push(pet);
  if (!state.activePetId) state.activePetId = pet.id;
  return save(state);
}

/** Buy food pellets. (Caller spends the coins.) */
export function buyFood(n: number): PetsState { const state = loadPets(); state.food += n; return save(state); }

/** Feed a pet one pellet, if you have any. */
export function feedPet(id: string): PetsState {
  const state = loadPets();
  const pet = state.pets.find((p) => p.id === id);
  if (pet && state.food > 0) { state.food -= 1; pet.fullness = Math.min(100, pet.fullness + FOOD_FILL); pet.fullnessAt = Date.now(); }
  return save(state);
}

export function setActivePet(id: string | null): PetsState { const state = loadPets(); state.activePetId = id; return save(state); }
export function renamePet(id: string, name: string): PetsState { const state = loadPets(); const p = state.pets.find((x) => x.id === id); if (p) p.name = name.slice(0, 20); return save(state); }
export function releasePet(id: string): PetsState {
  const state = loadPets();
  state.pets = state.pets.filter((p) => p.id !== id);
  if (state.activePetId === id) state.activePetId = state.pets[0]?.id ?? null;
  return save(state);
}

/** The companion that follows you into your house and the market (or null). */
export function activePet(): Pet | null { const state = loadPets(); return state.pets.find((p) => p.id === state.activePetId) ?? null; }

/** Buy a pet-shop supply (caller spends the coins) — it appears in your house. */
export function buySupply(id: string): PetsState { const state = loadPets(); state.supplies[id] = (state.supplies[id] ?? 0) + 1; return save(state); }
/** Dye a pet a colour (caller spends the coins). */
export function dyePet(petId: string, colour: string): PetsState { const state = loadPets(); state.dye[petId] = colour; return save(state); }
/** The dye colour of a pet, or null for its natural colour. */
export function petDye(petId: string): string | null { return loadPets().dye[petId] ?? null; }
/** The colour to draw the active pet in (its dye, or null). */
export function activePetDye(): string | null { const s = loadPets(); return s.activePetId ? (s.dye[s.activePetId] ?? null) : null; }
