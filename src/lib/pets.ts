/**
 * Pets you adopt, feed and take walking.
 *
 * Each pet has a fullness (0–100) that slowly drops over time, so you have to
 * buy food and feed them. You choose which of your pets come out with you — just
 * the cat, just the dog, or both at once — and they follow you around your house
 * and the town market as little animated buddies.
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
  /** The pets you've chosen to take walking — any mix of them, or none at all. */
  walkingIds: string[];
  /** Pet-shop supplies you own (item id → count) — they show up in your house. */
  supplies: Record<string, number>;
  /** Dye colour per pet id (hex), recolouring your pet. */
  dye: Record<string, string>;
}

/** How many pets can be out at once — enough for a proper little parade. */
export const MAX_WALKING = 4;

const KEY = 'magic-islands-pets';
let counter = 0;
const uid = () => `pet-${Date.now().toString(36)}-${(counter += 1)}`;

function decayed(pet: Pet, now: number): number {
  const hours = Math.max(0, (now - (pet.fullnessAt || now)) / 3_600_000);
  return Math.max(0, Math.min(100, Math.round((pet.fullness ?? 80) - hours * DECAY_PER_HOUR)));
}

export function loadPets(): PetsState {
  const now = Date.now();
  let state: PetsState = { pets: [], food: 0, walkingIds: [], supplies: {}, dye: {} };
  let legacyActive: string | null = null;
  let hasWalkingIds = false;
  const raw = storage.get(KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as PetsState & { activePetId?: string | null };
      legacyActive = saved.activePetId ?? null;
      // Note whether the SAVE had a walking list: the default one is already an
      // array, so "is it an array" can't tell a pre-parade save from a new one.
      hasWalkingIds = Array.isArray(saved.walkingIds);
      state = { ...state, ...saved };
    } catch { /* keep default */ }
  }
  state.supplies = state.supplies ?? {};
  state.dye = state.dye ?? {};
  // Apply the hunger that ticked down while you were away.
  state.pets = (state.pets ?? []).map((p) => ({ ...p, fullness: decayed(p, now), fullnessAt: now }));
  // Saves from when only one pet could walk kept a single `activePetId`.
  if (!hasWalkingIds) state.walkingIds = legacyActive ? [legacyActive] : [];
  state.walkingIds = state.walkingIds.filter((id) => state.pets.some((p) => p.id === id)).slice(0, MAX_WALKING);
  return state;
}

function save(state: PetsState): PetsState { storage.set(KEY, JSON.stringify(state)); return state; }

/** Bring home a new pet. (Caller spends the coins.) */
export function adoptPet(species: PetSpecies, name: string): PetsState {
  const state = loadPets();
  const pet: Pet = { id: uid(), species, name: name.trim() || PET_SPECIES[species].name, fullness: 80, fullnessAt: Date.now(), adoptedAt: Date.now() };
  state.pets.push(pet);
  if (!state.walkingIds.length) state.walkingIds = [pet.id];   // your first pet comes along straight away
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

/** Choose exactly which pets come walking (ignores unknown ids, caps the parade). */
export function setWalking(ids: string[]): PetsState {
  const state = loadPets();
  state.walkingIds = ids.filter((id) => state.pets.some((p) => p.id === id)).slice(0, MAX_WALKING);
  return save(state);
}

/**
 * Take one pet along, or leave it at home. Returns the new state plus whether it
 * actually changed, so the panel can explain a full parade instead of silently
 * doing nothing.
 */
export function toggleWalking(id: string): { state: PetsState; walking: boolean; full: boolean } {
  const state = loadPets();
  if (state.walkingIds.includes(id)) {
    state.walkingIds = state.walkingIds.filter((x) => x !== id);
    return { state: save(state), walking: false, full: false };
  }
  if (state.walkingIds.length >= MAX_WALKING) return { state, walking: false, full: true };
  state.walkingIds = [...state.walkingIds, id];
  return { state: save(state), walking: true, full: false };
}
export function renamePet(id: string, name: string): PetsState { const state = loadPets(); const p = state.pets.find((x) => x.id === id); if (p) p.name = name.slice(0, 20); return save(state); }
export function releasePet(id: string): PetsState {
  const state = loadPets();
  state.pets = state.pets.filter((p) => p.id !== id);
  state.walkingIds = state.walkingIds.filter((x) => x !== id);
  return save(state);
}

/**
 * A pet out walking, ready to hand to a 3-D world. Deliberately the same shape as
 * the engines' `ScenePetSpec` (in game/petMesh) — the game layer imports from
 * here, so it can't be the other way round.
 */
export interface WalkingPet { id: string; species: PetSpecies; name: string; dye: string | null }

/** The companions that follow you into your house and the market (maybe none). */
export function walkingPets(): WalkingPet[] {
  const state = loadPets();
  return state.walkingIds
    .map((id) => state.pets.find((p) => p.id === id))
    .filter((p): p is Pet => !!p)
    .map((p) => ({ id: p.id, species: p.species, name: p.name, dye: state.dye[p.id] ?? null }));
}


/** Buy a pet-shop supply (caller spends the coins) — it appears in your house. */
export function buySupply(id: string): PetsState { const state = loadPets(); state.supplies[id] = (state.supplies[id] ?? 0) + 1; return save(state); }
/** Dye a pet a colour (caller spends the coins). */
export function dyePet(petId: string, colour: string): PetsState { const state = loadPets(); state.dye[petId] = colour; return save(state); }
