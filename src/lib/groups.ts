// Group chats — text + photo/video with several friends at once.
import { supabase } from './supabase';
import { mediaMessage, type MediaKind } from './friends';
import { uploadGroupMedia } from './media';
import { storage } from './storage';

export interface ChatGroup { id: string; name: string; owner_id: string; created_at: string }
export interface GroupMessage { id: string; group_id: string; sender_id: string; message: string; created_at: string }

/** Create a group you own and add yourself plus the chosen friends. */
export async function createGroup(name: string, ownerId: string, memberIds: string[]) {
  const { data, error } = await supabase.from('chat_groups').insert({ name: name.trim(), owner_id: ownerId }).select('id').single();
  if (error) throw error;
  const gid = (data as { id: string }).id;
  const ids = Array.from(new Set([ownerId, ...memberIds]));
  const { error: e2 } = await supabase.from('chat_group_members').insert(ids.map((user_id) => ({ group_id: gid, user_id })));
  if (e2) throw e2;
  return gid;
}

/** Every group you're in (owner or member), newest first. */
export async function loadMyGroups() {
  const { data, error } = await supabase.from('chat_groups').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatGroup[];
}

export async function loadGroupMemberIds(gid: string) {
  const { data, error } = await supabase.from('chat_group_members').select('user_id').eq('group_id', gid);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { user_id: string }).user_id);
}

export async function loadGroupMessages(gid: string) {
  const { data, error } = await supabase.from('chat_group_messages').select('*').eq('group_id', gid).order('created_at').limit(300);
  if (error) throw error;
  return (data ?? []) as GroupMessage[];
}

export async function sendGroupText(gid: string, senderId: string, message: string) {
  const clean = message.trim();
  if (!clean) return;
  const { error } = await supabase.from('chat_group_messages').insert({ group_id: gid, sender_id: senderId, message: clean });
  if (error) throw error;
}

/** Upload a captured photo/video to the group and post it as a message. */
export async function sendGroupMedia(gid: string, senderId: string, kind: MediaKind, blob: Blob, ext: string, contentType: string) {
  const path = await uploadGroupMedia(gid, senderId, blob, ext, contentType);
  await sendGroupText(gid, senderId, mediaMessage(kind, path));
  return path;
}

export async function leaveGroup(gid: string, userId: string) {
  const { error } = await supabase.from('chat_group_members').delete().eq('group_id', gid).eq('user_id', userId);
  if (error) throw error;
}

// ---- "Clear my view": a per-device timestamp; messages older than it are hidden ----
const CLEAR_KEY = 'groupClearedAt';
type ClearMap = Record<string, string>;
function readClears(): ClearMap { try { return JSON.parse(storage.get(CLEAR_KEY) ?? '{}') as ClearMap; } catch { return {}; } }
export function clearedAt(gid: string): string { return readClears()[gid] ?? ''; }
export function clearGroupView(gid: string) { const all = readClears(); all[gid] = new Date().toISOString(); storage.set(CLEAR_KEY, JSON.stringify(all)); }
