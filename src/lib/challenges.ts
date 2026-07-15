import { supabase } from './supabase';

export async function createChallenge(userId: string) {
  const { data, error } = await supabase.from('friend_challenges')
    .insert({ creator_id: userId }).select('id, invite_code').single();
  if (error) throw error;
  const member = await supabase.from('challenge_members').insert({ challenge_id: data.id, user_id: userId });
  if (member.error) throw member.error;
  return data as { id: string; invite_code: string };
}

export async function joinChallenge(inviteCode: string) {
  const { data, error } = await supabase.rpc('join_house_challenge', { code: inviteCode });
  if (error) throw error;
  return data as string;
}

export function challengeUrl(inviteCode: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('challenge', inviteCode);
  return url.toString();
}
