// ============================================================================
// room-management — CRUD for rooms, prompts, models, room_config + export.
//
// Action-dispatch pattern: POST body always has { action: string, ...params }
//
// Actions:
//   Room CRUD:    list_rooms, create_room, get_room, update_room, delete_room
//   Prompt CRUD:  set_prompts, update_prompt, delete_prompt
//   Model CRUD:   list_models, add_model, update_model
//   Ideas:        get_ideas
//   Export:       export_idea  ← formats full analysis as text for AI context
// ============================================================================

import { corsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/db.ts'
import { log, logError } from '../_shared/log.ts'

const FN = 'room-management'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return corsPreflight()

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { action } = body
  if (!action || typeof action !== 'string') {
    return errorResponse('Missing action', 400)
  }

  const supabase = createServiceClient()

  try {
    switch (action) {
      // ── Rooms ───────────────────────────────────────────────────────────────
      case 'list_rooms':   return await listRooms(supabase)
      case 'create_room':  return await createRoom(supabase, body)
      case 'get_room':     return await getRoom(supabase, body)
      case 'update_room':  return await updateRoom(supabase, body)
      case 'delete_room':  return await deleteRoom(supabase, body)

      // ── Prompts ─────────────────────────────────────────────────────────────
      case 'set_prompts':    return await setPrompts(supabase, body)
      case 'update_prompt':  return await updatePrompt(supabase, body)
      case 'delete_prompt':  return await deletePrompt(supabase, body)

      // ── Models ──────────────────────────────────────────────────────────────
      case 'list_models':  return await listModels(supabase)
      case 'add_model':    return await addModel(supabase, body)
      case 'update_model': return await updateModel(supabase, body)

      // ── Ideas (read) ────────────────────────────────────────────────────────
      case 'get_ideas':    return await getIdeas(supabase, body)

      // ── Export ──────────────────────────────────────────────────────────────
      case 'export_idea':  return await exportIdea(supabase, body)

      default:
        return errorResponse(`Unknown action: ${action}`, 400)
    }
  } catch (err) {
    logError({ fn: FN, action }, err)
    return errorResponse(`Action '${action}' failed: ${(err as Error).message}`, 500)
  }
})

// ─── Room actions ─────────────────────────────────────────────────────────────

async function listRooms(supabase: ReturnType<typeof createServiceClient>): Promise<Response> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, name, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) return errorResponse(error.message)
  return jsonResponse({ rooms: data })
}

async function createRoom(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { name } = body
  if (!name || typeof name !== 'string') return errorResponse('Missing name', 400)

  // Insert room
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({ name, is_active: true })
    .select('id, name, is_active, created_at')
    .single()

  if (roomErr || !room) return errorResponse(roomErr?.message ?? 'Room creation failed')

  // Auto-assign the first active model to the room
  const { data: firstModel } = await supabase
    .from('models')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstModel) {
    await supabase.from('room_config').insert({
      room_id:           room.id,
      selected_model_id: firstModel.id,
    })
  }

  log({ fn: FN }, 'Room created', { room_id: room.id, name })
  return jsonResponse({ room })
}

async function getRoom(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id } = body
  if (!room_id) return errorResponse('Missing room_id', 400)

  const { data: room, error } = await supabase
    .from('rooms')
    .select('id, name, is_active, first_prompt_id, created_at')
    .eq('id', room_id)
    .single()

  if (error || !room) return errorResponse('Room not found', 404)

  // Resolve the full prompt chain as an ordered array
  const prompts = await resolvePromptChain(supabase, room.first_prompt_id)

  const { data: config } = await supabase
    .from('room_config')
    .select('selected_model_id')
    .eq('room_id', room_id)
    .maybeSingle()

  return jsonResponse({ ...room, prompts, selected_model_id: config?.selected_model_id ?? null })
}

async function updateRoom(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id, name, is_active, selected_model_id } = body
  if (!room_id) return errorResponse('Missing room_id', 400)

  // Update room table fields
  const roomUpdates: Record<string, unknown> = {}
  if (name      !== undefined) roomUpdates.name      = name
  if (is_active !== undefined) roomUpdates.is_active = is_active

  if (Object.keys(roomUpdates).length > 0) {
    const { error } = await supabase.from('rooms').update(roomUpdates).eq('id', room_id)
    if (error) return errorResponse(error.message)
  }

  // Update selected model if provided
  if (selected_model_id !== undefined) {
    const { error } = await supabase.from('room_config').upsert({
      room_id,
      selected_model_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'room_id' })
    if (error) return errorResponse(error.message)
  }

  return jsonResponse({ updated: true })
}

async function deleteRoom(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id } = body
  if (!room_id) return errorResponse('Missing room_id', 400)

  // CASCADE deletes prompts, ideas, chat_messages, idea_metadata, prompt_executions
  const { error } = await supabase.from('rooms').delete().eq('id', room_id)
  if (error) return errorResponse(error.message)

  log({ fn: FN }, 'Room deleted', { room_id })
  return jsonResponse({ deleted: true })
}

// ─── Prompt actions ───────────────────────────────────────────────────────────

// Replaces the entire prompt chain for a room.
// Frontend sends an ordered array; backend rebuilds the linked list.
async function setPrompts(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id, prompts } = body
  if (!room_id)               return errorResponse('Missing room_id', 400)
  if (!Array.isArray(prompts)) return errorResponse('prompts must be an array', 400)

  // Delete existing prompts (cascade clears next_prompt_id references)
  // We nullify first_prompt_id first to avoid FK constraint issues
  await supabase.from('rooms').update({ first_prompt_id: null }).eq('id', room_id)
  await supabase.from('prompts').delete().eq('room_id', room_id)

  if (prompts.length === 0) {
    return jsonResponse({ prompts: [] })
  }

  // Insert all prompts without next_prompt_id first
  const rows = prompts.map((p: Record<string, unknown>) => ({
    room_id,
    name:          p.name,
    system_prompt: p.system_prompt,
    is_enabled:    p.is_enabled ?? true,
    next_prompt_id: null,
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('prompts')
    .insert(rows)
    .select('id, name, system_prompt, is_enabled, next_prompt_id, created_at')

  if (insertErr || !inserted) return errorResponse(insertErr?.message ?? 'Insert failed')

  // Wire the linked list: each prompt points to the next one
  for (let i = 0; i < inserted.length - 1; i++) {
    await supabase
      .from('prompts')
      .update({ next_prompt_id: inserted[i + 1].id })
      .eq('id', inserted[i].id)
    inserted[i].next_prompt_id = inserted[i + 1].id
  }

  // Set room.first_prompt_id to the head of the chain
  await supabase
    .from('rooms')
    .update({ first_prompt_id: inserted[0].id })
    .eq('id', room_id)

  log({ fn: FN }, 'Prompts set', { room_id, count: inserted.length })
  return jsonResponse({ prompts: inserted })
}

async function updatePrompt(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { prompt_id, name, system_prompt, is_enabled } = body
  if (!prompt_id) return errorResponse('Missing prompt_id', 400)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name          !== undefined) updates.name          = name
  if (system_prompt !== undefined) updates.system_prompt = system_prompt
  if (is_enabled    !== undefined) updates.is_enabled    = is_enabled

  const { error } = await supabase.from('prompts').update(updates).eq('id', prompt_id)
  if (error) return errorResponse(error.message)

  return jsonResponse({ updated: true })
}

// Deletes a prompt and repairs the linked list.
// Finds the prompt pointing to this one and rewires it to skip the deleted prompt.
async function deletePrompt(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id, prompt_id } = body
  if (!room_id)   return errorResponse('Missing room_id', 400)
  if (!prompt_id) return errorResponse('Missing prompt_id', 400)

  const { data: prompt } = await supabase
    .from('prompts')
    .select('id, next_prompt_id')
    .eq('id', prompt_id)
    .single()

  if (!prompt) return errorResponse('Prompt not found', 404)

  // Find the previous prompt in the chain (if any)
  const { data: prev } = await supabase
    .from('prompts')
    .select('id')
    .eq('room_id', room_id)
    .eq('next_prompt_id', prompt_id)
    .maybeSingle()

  if (prev) {
    // Rewire previous → next (skip the deleted one)
    await supabase
      .from('prompts')
      .update({ next_prompt_id: prompt.next_prompt_id })
      .eq('id', prev.id)
  }

  // If this was the chain head, update room.first_prompt_id
  const { data: room } = await supabase
    .from('rooms')
    .select('first_prompt_id')
    .eq('id', room_id)
    .single()

  if (room?.first_prompt_id === prompt_id) {
    await supabase
      .from('rooms')
      .update({ first_prompt_id: prompt.next_prompt_id })
      .eq('id', room_id)
  }

  const { error } = await supabase.from('prompts').delete().eq('id', prompt_id)
  if (error) return errorResponse(error.message)

  return jsonResponse({ deleted: true })
}

// ─── Model actions ────────────────────────────────────────────────────────────

async function listModels(supabase: ReturnType<typeof createServiceClient>): Promise<Response> {
  const { data, error } = await supabase
    .from('models')
    .select('id, provider, display_name, api_model_id, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) return errorResponse(error.message)
  return jsonResponse({ models: data })
}

async function addModel(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { id, provider, display_name, api_model_id } = body
  if (!id || !provider || !display_name || !api_model_id) {
    return errorResponse('Missing: id, provider, display_name, api_model_id', 400)
  }

  const { error } = await supabase.from('models').insert({
    id,
    provider,
    display_name,
    api_model_id,
    is_active: body.is_active ?? true,
  })

  if (error) return errorResponse(error.message)
  return jsonResponse({ added: true })
}

async function updateModel(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { model_id, provider, display_name, api_model_id, is_active } = body
  if (!model_id) return errorResponse('Missing model_id', 400)

  const updates: Record<string, unknown> = {}
  if (provider      !== undefined) updates.provider      = provider
  if (display_name  !== undefined) updates.display_name  = display_name
  if (api_model_id  !== undefined) updates.api_model_id  = api_model_id
  if (is_active     !== undefined) updates.is_active     = is_active

  const { error } = await supabase.from('models').update(updates).eq('id', model_id)
  if (error) return errorResponse(error.message)

  return jsonResponse({ updated: true })
}

// ─── Ideas (read) ─────────────────────────────────────────────────────────────

async function getIdeas(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { room_id } = body
  if (!room_id) return errorResponse('Missing room_id', 400)

  const page    = Number(body.page    ?? 0)
  const perPage = Number(body.per_page ?? 20)
  const from    = page * perPage
  const to      = from + perPage - 1

  const { data, error } = await supabase
    .from('ideas')
    .select('id, room_id, author_name, status, created_at, updated_at, idea_metadata(category, score)')
    .eq('room_id', room_id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return errorResponse(error.message)
  return jsonResponse({ ideas: data, page, per_page: perPage })
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Exports the full idea analysis as formatted markdown text.
// Use this to paste into another AI conversation for context.
async function exportIdea(supabase: ReturnType<typeof createServiceClient>, body: Record<string, unknown>): Promise<Response> {
  const { idea_id } = body
  if (!idea_id) return errorResponse('Missing idea_id', 400)

  // Load idea + room
  const { data: idea, error: ideaErr } = await supabase
    .from('ideas')
    .select('id, author_name, status, created_at, room_id, rooms(name)')
    .eq('id', idea_id)
    .single()

  if (ideaErr || !idea) return errorResponse('Idea not found', 404)

  // Get original idea text
  const { data: originMsg } = await supabase
    .from('chat_messages')
    .select('content')
    .eq('idea_id', idea_id)
    .eq('role', 'user')
    .is('prompt_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Get all completed prompt executions (ordered by completion)
  const { data: executions } = await supabase
    .from('prompt_executions')
    .select('prompt_id, output_text, completed_at, status, prompts(name, system_prompt)')
    .eq('idea_id', idea_id)
    .order('completed_at', { ascending: true })

  // Get idea metadata
  const { data: meta } = await supabase
    .from('idea_metadata')
    .select('category, score, responses')
    .eq('idea_id', idea_id)
    .maybeSingle()

  // ── Build the export text ──────────────────────────────────────────────────
  const roomName   = (idea.rooms as { name: string } | null)?.name ?? 'Unknown Room'
  const exportDate = new Date().toISOString().split('T')[0]
  const ideaDate   = new Date(idea.created_at).toISOString().split('T')[0]

  const lines: string[] = []

  lines.push(`# Brain Overflow — Idea Export`)
  lines.push(``)
  lines.push(`**Room:** ${roomName}`)
  lines.push(`**Author:** ${idea.author_name}`)
  lines.push(`**Date:** ${ideaDate}`)
  lines.push(`**Status:** ${idea.status}`)

  if (meta?.category || meta?.score) {
    lines.push(`**Category:** ${meta.category ?? 'N/A'}`)
    lines.push(`**Score:** ${meta.score ?? 'N/A'}`)
  }

  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## Original Idea`)
  lines.push(``)
  lines.push(originMsg?.content ?? '*(no idea text found)*')
  lines.push(``)

  if (executions && executions.length > 0) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## AI Analysis`)
    lines.push(``)

    executions.forEach((exec, idx) => {
      const prompt = exec.prompts as { name: string; system_prompt: string } | null
      const promptName = prompt?.name ?? `Step ${idx + 1}`
      const systemPrompt = prompt?.system_prompt ?? ''

      lines.push(`### Step ${idx + 1}: ${promptName}`)
      lines.push(``)

      if (systemPrompt) {
        lines.push(`**Prompt Instructions:**`)
        lines.push(`> ${systemPrompt.replace(/\n/g, '\n> ')}`)
        lines.push(``)
      }

      if (exec.status === 'done' && exec.output_text) {
        lines.push(`**AI Response:**`)
        lines.push(``)
        lines.push(exec.output_text)
      } else if (exec.status === 'failed') {
        lines.push(`**Status:** ❌ Failed`)
      } else {
        lines.push(`**Status:** ⏳ ${exec.status}`)
      }

      lines.push(``)
      if (idx < executions.length - 1) {
        lines.push(`---`)
        lines.push(``)
      }
    })
  } else {
    lines.push(`---`)
    lines.push(``)
    lines.push(`*No AI analysis completed yet.*`)
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(``)
  lines.push(`*Exported from Brain Overflow on ${exportDate}*`)
  lines.push(`*Idea ID: ${idea_id}*`)

  const exportText = lines.join('\n')

  log({ fn: FN }, 'Idea exported', { idea_id })
  return jsonResponse({ text: exportText, idea_id })
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// Walks the prompt linked list from first_prompt_id and returns a flat array.
// Includes cycle detection to prevent infinite loops on corrupted data.
async function resolvePromptChain(
  supabase: ReturnType<typeof createServiceClient>,
  firstPromptId: string | null,
): Promise<unknown[]> {
  if (!firstPromptId) return []

  const result = []
  let currentId: string | null = firstPromptId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const { data: prompt } = await supabase
      .from('prompts')
      .select('id, name, system_prompt, is_enabled, next_prompt_id, created_at')
      .eq('id', currentId)
      .single()

    if (!prompt) break
    result.push(prompt)
    currentId = prompt.next_prompt_id
  }

  return result
}
