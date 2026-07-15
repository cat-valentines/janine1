import { supabase } from './supabase';

export interface FriendMessage {
  id: string; sender_id: string; recipient_id: string; message: string; created_at: string;
}

export async function loadFriendMessages(friendId: string) {
  const { data, error } = await supabase.from('friend_messages').select('*')
    .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`).order('created_at').limit(50);
  if (error) throw error;
  return (data ?? []) as FriendMessage[];
}

export async function sendFriendMessage(senderId: string, recipientId: string, message: string) {
  const { error } = await supabase.from('friend_messages').insert({
    sender_id: senderId, recipient_id: recipientId, message: message.trim(),
  });
  if (error) throw error;
}
