import { getSupabase } from '../supabase'
import type { Model, Provider } from '@/types'

export async function listModels(): Promise<Model[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('models')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Model[]
}

export interface ModelInput {
  model_name: string
  model_id: string
  provider: Provider
}

export async function createModel(data: ModelInput): Promise<Model> {
  const sb = getSupabase()
  const { data: row, error } = await sb
    .from('models')
    .insert({ ...data, is_active: false })
    .select('*')
    .single()
  if (error) throw error
  return row as Model
}

export async function updateModel(id: string, patch: Partial<ModelInput>): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('models').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteModel(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('models').delete().eq('id', id)
  if (error) throw error
}

export async function setActiveModel(id: string): Promise<void> {
  const sb = getSupabase()
  // Two-step: clear all, then set the chosen one
  const { error: clearErr } = await sb
    .from('models')
    .update({ is_active: false })
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (clearErr) throw clearErr
  const { error: setErr } = await sb.from('models').update({ is_active: true }).eq('id', id)
  if (setErr) throw setErr
}
