import { supabase } from './supabase';
import type { Genre, Mood } from '../game/songEngine';

export interface Song {
  id: string; owner_id: string; title: string;
  genre: Genre; mood: Mood; tempo: number; seed: number; bars: number;
  lyrics: string; audio_path: string | null; is_public: boolean; created_at: string;
}
export type NewSong = Pick<Song, 'title' | 'genre' | 'mood' | 'tempo' | 'seed' | 'bars' | 'lyrics' | 'is_public'>;

const BUCKET = 'song-audio';

/** AI songwriter — original, kid-safe lyrics from a topic (uses the app's `ai` function). */
export async function generateLyrics(topic: string, genre: string, mood: string): Promise<string> {
  const system = 'You are a songwriter for a kids app. Write ORIGINAL, catchy, age-appropriate lyrics — never copy an existing song, no profanity or adult themes. Use [Verse] and [Chorus] section labels, short singable lines.';
  const prompt = `Write original ${mood} ${genre} song lyrics about: ${topic || 'anything fun'}. Give one verse and one catchy chorus (a second verse is fine). Keep it short and singable.`;
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ai', { body: { prompt, system } });
  if (error || !data?.text) throw new Error(data?.error ?? error?.message ?? 'No lyrics came back');
  return data.text.trim();
}

export async function createSong(ownerId: string, fields: NewSong): Promise<Song> {
  const { data, error } = await supabase.from('songs').insert({ owner_id: ownerId, ...fields }).select().single();
  if (error) throw error;
  return data as Song;
}
export async function updateSong(id: string, fields: Partial<Song>): Promise<void> {
  const { error } = await supabase.from('songs').update(fields).eq('id', id);
  if (error) throw error;
}
export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw error;
}
export async function loadMySongs(ownerId: string): Promise<Song[]> {
  const { data, error } = await supabase.from('songs').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Song[];
}
export async function loadPublicSongs(limit = 50): Promise<Song[]> {
  const { data, error } = await supabase.from('songs').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Song[];
}
export async function loadUserPublicSongs(ownerId: string): Promise<Song[]> {
  const { data, error } = await supabase.from('songs').select('*').eq('owner_id', ownerId).eq('is_public', true).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Song[];
}

/** Store a rendered mix (needed so a saved VOICE recording plays back for others). */
export async function uploadSongAudio(ownerId: string, songId: string, wav: Blob): Promise<string> {
  const path = `${ownerId}/${songId}.wav`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, wav, { contentType: 'audio/wav', upsert: true });
  if (error) throw error;
  return path;
}
export function songAudioUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
