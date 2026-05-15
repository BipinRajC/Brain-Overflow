import { getSupabase } from '../supabase'
import type { Flow } from '@/types'

export async function listFlows(): Promise<Flow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('flows')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Flow[]
}

export async function getDefaultFlow(): Promise<Flow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('flows')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data?.[0] as Flow | undefined) ?? null
}

export interface FlowInput {
  flow_name: string
  telegram_command: string | null
  prompt_ids: string[]
}

export async function createFlow(data: FlowInput): Promise<Flow> {
  const sb = getSupabase()
  const { data: row, error } = await sb.from('flows').insert(data).select('*').single()
  if (error) throw error
  return row as Flow
}

export async function updateFlow(id: string, patch: Partial<FlowInput>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('flows').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteFlow(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('flows').delete().eq('id', id)
  if (error) throw error
}
