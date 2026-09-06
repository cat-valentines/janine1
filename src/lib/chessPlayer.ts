/**
 * Who you are at the chess table.
 *
 * Signed-in players use their real account, but plenty of players here are
 * guests (schools block the Google sign-in, so guest play is the normal way in),
 * and a guest still needs a stable id and a name to be matched with. So a guest
 * gets a nickname and an id kept on their own device.
 */
import { storage } from './storage';
import { supabase } from './supabase';
import { loadLocalProfile } from './localProfile';

export interface ChessPlayer { id: string; name: string; character: string; guest: boolean }

const ID_KEY = 'chess-guest-id';
const NAME_KEY = 'chess-guest-name';

const ANIMALS = ['Fox', 'Panda', 'Otter', 'Robin', 'Koala', 'Tiger', 'Puffin', 'Badger', 'Heron', 'Lynx'];

function guestId(): string {
  const saved = storage.get(ID_KEY);
  if (saved) return saved;
  const made = `guest-${Math.random().toString(36).slice(2, 10)}`;
  storage.set(ID_KEY, made);
  return made;
}

/** A guest's chosen nickname, or a friendly made-up one the first time. */
export function guestName(): string {
  const saved = storage.get(NAME_KEY);
  if (saved) return saved;
  const made = `${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}${Math.floor(Math.random() * 90) + 10}`;
  storage.set(NAME_KEY, made);
  return made;
}

export function setGuestName(name: string) {
  const clean = name.trim().slice(0, 16);
  if (clean) storage.set(NAME_KEY, clean);
}

/** Your identity for the lobby: your account if you have one, else this device. */
export async function chessPlayer(): Promise<ChessPlayer> {
  const character = loadLocalProfile().character;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const name = (user.user_metadata.display_name as string | undefined) ?? '';
      if (name) return { id: user.id, name, character, guest: false };
    }
  } catch { /* signed out, or offline — play as a guest */ }
  return { id: guestId(), name: guestName(), character, guest: true };
}
