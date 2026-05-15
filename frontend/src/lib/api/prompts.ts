import { getSupabase } from '../supabase'
import type { Prompt, ContextMode } from '@/types'

export async function listPrompts(): Promise<Prompt[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('prompts')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Prompt[]
}

export interface PromptInput {
  prompt_name: string
  prompt: string
  context_mode: ContextMode
}

export async function createPrompt(data: PromptInput): Promise<Prompt> {
  const sb = getSupabase()
  const { data: row, error } = await sb.from('prompts').insert(data).select('*').single()
  if (error) throw error
  return row as Prompt
}

export async function updatePrompt(id: string, patch: Partial<PromptInput>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('prompts').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePrompt(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('prompts').delete().eq('id', id)
  if (error) throw error
}

export async function createCustomChatPrompt(text: string): Promise<Prompt> {
  return createPrompt({
    prompt_name: 'Chat Follow-up',
    prompt: text.trim(),
    context_mode: 'full_history_json',
  })
}
