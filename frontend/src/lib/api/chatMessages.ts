import { getSupabase } from '../supabase'
import type { ChatMessage } from '@/types'

export async function listByIdea(ideaId: string): Promise<ChatMessage[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('chat_messages')
    .select('*')
    .eq('idea_id', ideaId)
    .order('sequence_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

export async function insertIdeaMessage(ideaId: string, text: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('chat_messages').insert({
    idea_id: ideaId,
    message: text.trim(),
    message_type: 'idea',
    sequence_number: 1,
  })
  if (error) throw error
}
