import { supabase } from './supabase';
import type { Genre, Mood, Instrument, Backing, Layers } from '../game/songEngine';

export interface Song {
  id: string; owner_id: string; title: string;
  genre: Genre; mood: Mood; tempo: number; seed: number; bars: number; instrument: Instrument; backing: Backing;
  layers: Layers | null;
  lyrics: string; audio_path: string | null; is_public: boolean; created_at: string;
}
export type NewSong = Pick<Song, 'title' | 'genre' | 'mood' | 'tempo' | 'seed' | 'bars' | 'instrument' | 'backing' | 'layers' | 'lyrics' | 'is_public'>;

const BUCKET = 'song-audio';

const GENRE_IDS: Genre[] = ['pop', 'hiphop', 'lofi', 'edm', 'rock', 'chill', 'cinematic', 'chip'];
const MOOD_IDS: Mood[] = ['happy', 'chill', 'sad', 'hype', 'dreamy', 'epic'];
const INST_IDS: Instrument[] = ['auto', 'guitar', 'eguitar', 'piano', 'electro', 'strings', 'brass', 'steeldrum', 'marimba', 'organ', 'bells', 'synth', 'choir', 'flute', 'musicbox'];

export interface SongIdea { genre: Genre; mood: Mood; instrument: Instrument; tempo: number; title: string; lyrics: string }

/** Suno-style one-box create: describe a song, the AI picks the style + writes lyrics. */
export async function describeSong(description: string): Promise<SongIdea> {
  const system = `You set up a kids' music app and write ORIGINAL lyrics. Reply with STRICT JSON only (no markdown, no extra text), shaped exactly:
{"genre":one of ${JSON.stringify(GENRE_IDS)},"mood":one of ${JSON.stringify(MOOD_IDS)},"instrument":one of ${JSON.stringify(INST_IDS)},"tempo":integer 70-160,"title":"short title","lyrics":"original kid-safe lyrics with [Verse] and [Chorus] labels, short singable lines"}
Never copy an existing song, no profanity or adult themes.`;
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ai', { body: { prompt: `Make a song from this idea: ${description}`, system } });
  if (error || !data?.text) throw new Error(data?.error ?? error?.message ?? 'No idea came back');
  const s = data.text.indexOf('{'), e = data.text.lastIndexOf('}');
  const raw = s >= 0 && e > s ? JSON.parse(data.text.slice(s, e + 1)) as Partial<SongIdea> : {};
  const pick = <T,>(v: unknown, list: T[], def: T): T => (list as unknown[]).includes(v) ? v as T : def;
  return {
    genre: pick(raw.genre, GENRE_IDS, 'pop'),
    mood: pick(raw.mood, MOOD_IDS, 'happy'),
    instrument: pick(raw.instrument, INST_IDS, 'auto'),
    tempo: Math.min(160, Math.max(70, Math.round(Number(raw.tempo) || 110))),
    title: (typeof raw.title === 'string' ? raw.title : '').slice(0, 80),
    lyrics: typeof raw.lyrics === 'string' ? raw.lyrics.trim() : '',
  };
}

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
