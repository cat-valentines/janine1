/**
 * Who you are at the table.
 *
 * Signing in gets you your own name and your prizes. Without an account you are
 * simply **Guest** — everyone sees you that way, the name is not yours to change
 * or keep, and a guest's winnings are not saved. That is deliberate: coins,
 * medals and cups belong to an account, so there is a real reason to make one.
 *
 * A guest still gets a private id kept on their own device, so the lobby can
 * tell two guests apart and send each of them the right moves.
 */
import { storage } from './storage';
import { supabase } from './supabase';
import { loadLocalProfile } from './localProfile';
import { GUEST_NAME } from './guestRules';

export interface ChessPlayer {
  id: string;
  /** What everybody sees. Always "Guest" for someone without an account. */
  name: string;
  character: string;
  guest: boolean;
}

const ID_KEY = 'guest-player-id';

/** A private id for this device — never shown, only used to route moves. */
function guestId(): string {
  const saved = storage.get(ID_KEY);
  if (saved) return saved;
  const made = `guest-${Math.random().toString(36).slice(2, 10)}`;
  storage.set(ID_KEY, made);
  return made;
}

/** Your identity for the lobby: your account if you have one, else a guest. */
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
  return { id: guestId(), name: GUEST_NAME, character, guest: true };
}
