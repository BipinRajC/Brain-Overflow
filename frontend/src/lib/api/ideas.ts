import { getSupabase } from '../supabase'
import type { Idea, IdeaStatus } from '@/types'

export async function listIdeas(): Promise<Idea[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('ideas')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Idea[]
}

export async function listRecentIdeas(limit = 6): Promise<Idea[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('ideas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Idea[]
}

export async function getIdea(id: string): Promise<Idea> {
  const sb = getSupabase()
  const { data, error } = await sb.from('ideas').select('*').eq('id', id).single()
  if (error) throw error
  return data as Idea
}

export async function createIdea(text: string, flowId: string | null): Promise<Idea> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('ideas')
    .insert({
      idea: text.trim(),
      flow_id: flowId,
      status: flowId ? 'recorded' : 'completed',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Idea
}

export async function updateIdeaStatus(id: string, status: IdeaStatus): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('ideas').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteIdea(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('ideas').delete().eq('id', id)
  if (error) throw error
}
