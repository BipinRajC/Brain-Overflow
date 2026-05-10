// ============================================================================
// process-prompt — Processes exactly ONE prompt in the chain.
//
// Called by: process-idea (first prompt) and itself (subsequent prompts).
// NEVER called directly by the Flutter app.
//
// Responsibilities:
//   1. Load the prompt. Skip if disabled.
//   2. Check prompt_executions — skip if already 'done' (idempotency).
//   3. Mark execution as 'running'.
//   4. Fetch original idea text (first user chat_message with prompt_id=NULL).
//   5. Fetch prior prompt outputs from prompt_executions for context.
//   6. Build a deterministic, size-bounded context window.
//   7. Route to the correct AI provider adapter.
//   8. Store: system prompt sent (role='user') + AI response (role='assistant').
//   9. Mark execution as 'done', store output_text for future context.
//  10. Parse category/score from response, upsert idea_metadata.
//  11. If next_prompt_id exists: fire-and-forget invoke process-prompt for next.
//  12. If no next prompt: mark idea as 'completed'.
//
// On any error: mark execution 'failed', mark idea 'failed', log everything.
// Prior completed prompts are NEVER affected by a later prompt's failure.
// ============================================================================

import { corsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/db.ts'
import { log, logError } from '../_shared/log.ts'
import { buildContext, PriorOutput } from '../_shared/context.ts'
import * as fireworks  from '../_shared/providers/fireworks.ts'
import * as openai     from '../_shared/providers/openai.ts'
import * as anthropic  from '../_shared/providers/anthropic.ts'

const FN = 'process-prompt'

// Default token limits — safe for all supported providers
const MAX_OUTPUT_TOKENS  = 2048
const DEFAULT_TEMPERATURE = 0.7

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return corsPreflight()

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { idea_id, room_id, prompt_id } = body
  if (!idea_id)   return errorResponse('Missing idea_id', 400)
  if (!room_id)   return errorResponse('Missing room_id', 400)
  if (!prompt_id) return errorResponse('Missing prompt_id', 400)

  const ctx = { fn: FN, idea_id, room_id, prompt_id }

  try {
    await runPrompt(idea_id, room_id, prompt_id)
    return jsonResponse({ ok: true })
  } catch (err) {
    logError(ctx, err, 'process-prompt threw unexpectedly')
    return errorResponse('Internal error in process-prompt', 500)
  }
})

// ─── Main logic — extracted so errors are easy to catch and log ──────────────
async function runPrompt(idea_id: string, room_id: string, prompt_id: string): Promise<void> {
  const supabase = createServiceClient()
  const ctx = { fn: FN, idea_id, room_id, prompt_id }

  // ── 1. Load the prompt ──────────────────────────────────────────────────────
  const { data: prompt } = await supabase
    .from('prompts')
    .select('id, name, system_prompt, is_enabled, next_prompt_id')
    .eq('id', prompt_id)
    .single()

  if (!prompt) {
    // Prompt deleted while chain was running. Treat as end of chain.
    log(ctx, 'Prompt not found — treating as end of chain')
    await markIdeaCompleted(supabase, idea_id)
    return
  }

  // ── 2. Skip disabled prompts — move to next ─────────────────────────────────
  if (!prompt.is_enabled) {
    log(ctx, `Prompt '${prompt.name}' is disabled — skipping to next`)
    if (prompt.next_prompt_id) {
      await fireNextPrompt(idea_id, room_id, prompt.next_prompt_id, ctx)
    } else {
      await markIdeaCompleted(supabase, idea_id)
    }
    return
  }

  // ── 3. Idempotency check — skip if already done ─────────────────────────────
  const { data: existing } = await supabase
    .from('prompt_executions')
    .select('status')
    .eq('idea_id', idea_id)
    .eq('prompt_id', prompt_id)
    .maybeSingle()

  if (existing?.status === 'done') {
    log(ctx, `Prompt '${prompt.name}' already done — skipping`)
    if (prompt.next_prompt_id) {
      await fireNextPrompt(idea_id, room_id, prompt.next_prompt_id, ctx)
    } else {
      await markIdeaCompleted(supabase, idea_id)
    }
    return
  }

  // ── 4. Mark execution as 'running' ──────────────────────────────────────────
  await supabase.from('prompt_executions').upsert({
    idea_id,
    prompt_id,
    status:     'running',
    started_at: new Date().toISOString(),
  }, { onConflict: 'idea_id,prompt_id' })

  // ── 5. Load room config → model → provider ──────────────────────────────────
  const { data: config } = await supabase
    .from('room_config')
    .select('selected_model_id')
    .eq('room_id', room_id)
    .single()

  if (!config?.selected_model_id) {
    throw new Error('No model configured for room')
  }

  const { data: model } = await supabase
    .from('models')
    .select('id, provider, api_model_id, display_name')
    .eq('id', config.selected_model_id)
    .single()

  if (!model?.api_model_id) {
    throw new Error(`Model '${config.selected_model_id}' not found`)
  }

  log({ ...ctx, provider: model.provider, model: model.id }, `Running prompt '${prompt.name}'`)

  // ── 6. Get original idea text (first user message, no prompt_id) ─────────────
  const { data: originMsg } = await supabase
    .from('chat_messages')
    .select('content')
    .eq('idea_id', idea_id)
    .eq('role', 'user')
    .is('prompt_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const ideaText = originMsg?.content ?? '(no idea text found)'

  // ── 7. Fetch prior prompt outputs for context ─────────────────────────────────
  // We join prompt_executions with prompts to get the prompt name for labeling.
  const { data: priorRows } = await supabase
    .from('prompt_executions')
    .select('output_text, completed_at, prompts(name)')
    .eq('idea_id', idea_id)
    .eq('status', 'done')
    .order('completed_at', { ascending: true })

  const priorOutputs: PriorOutput[] = (priorRows ?? [])
    .filter(r => r.output_text)
    .map(r => ({
      prompt_name: (r.prompts as { name: string } | null)?.name ?? 'unknown',
      output_text: r.output_text as string,
    }))

  // ── 8. Build deterministic, size-bounded context ─────────────────────────────
  const contextMessages = buildContext(ideaText, priorOutputs)

  log(ctx, 'Context built', {
    context_messages: contextMessages.length,
    prior_outputs:    priorOutputs.length,
    total_chars:      contextMessages.reduce((s, m) => s + m.content.length, 0),
  })

  // ── 9. Get API key for provider ───────────────────────────────────────────────
  const apiKey = getApiKey(model.provider)

  // ── 10. Call AI provider ──────────────────────────────────────────────────────
  const startMs = Date.now()

  const jsonInstruction = `\n\nIMPORTANT: You MUST return your ENTIRE response as a valid JSON object with exactly three keys:
{
  "analysis": "your detailed response and analysis here",
  "category": "e.g. startup idea, dev tool, personal tool, etc. (keep it short)",
  "score": "e.g. strong, needs pivot, weak, etc. (keep it short)"
}
Do NOT wrap the response in markdown code blocks. Return ONLY the raw JSON string.`

  const result = await callProvider({
    provider:     model.provider,
    apiModelId:   model.api_model_id,
    systemPrompt: prompt.system_prompt + jsonInstruction,
    messages:     contextMessages,
    temperature:  DEFAULT_TEMPERATURE,
    maxTokens:    MAX_OUTPUT_TOKENS,
    apiKey,
  })

  const elapsedMs = Date.now() - startMs

  log({ ...ctx, provider: model.provider, model: model.id }, 'AI response received', {
    input_tokens:  result.inputTokens,
    output_tokens: result.outputTokens,
    elapsed_ms:    elapsedMs,
    response_chars: result.content.length,
  })

  // ── 10.5 Parse JSON Response ──────────────────────────────────────────────────
  let aiAnalysis = result.content
  let metadata = { category: null as string | null, score: null as string | null }

  try {
    let cleanJson = result.content.trim()
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7)
    if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3)
    if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3)
    
    const parsed = JSON.parse(cleanJson.trim())
    if (parsed.analysis) aiAnalysis = parsed.analysis
    if (parsed.category) metadata.category = parsed.category
    if (parsed.score)    metadata.score    = parsed.score
  } catch (err) {
    logError(ctx, err, 'Failed to parse JSON response from AI', { response: result.content.substring(0, 200) })
    // Fallback: use raw content as analysis if JSON parsing fails
  }

  // ── 11. Store: system prompt sent as 'user' message (for debugging/audit) ─────
  await supabase.from('chat_messages').insert({
    idea_id,
    room_id,
    role:      'user',
    content:   prompt.system_prompt,
    prompt_id: prompt.id,
    model_id:  model.id,
    metadata:  { type: 'system_prompt_sent' },
  })

  // ── 12. Store: AI response as 'assistant' message ─────────────────────────────
  await supabase.from('chat_messages').insert({
    idea_id,
    room_id,
    role:      'assistant',
    content:   aiAnalysis,
    prompt_id: prompt.id,
    model_id:  model.id,
    metadata:  {
      input_tokens:  result.inputTokens,
      output_tokens: result.outputTokens,
      elapsed_ms:    elapsedMs,
      provider:      model.provider,
      raw_response:  result.content,
    },
  })

  // ── 13. Mark execution as 'done', store output_text ───────────────────────────
  await supabase.from('prompt_executions').upsert({
    idea_id,
    prompt_id:    prompt.id,
    status:       'done',
    output_text:  aiAnalysis,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'idea_id,prompt_id' })

  // ── 14. Parse and store metadata (category / score) ───────────────────────────
  if (metadata.category || metadata.score) {
    const upsertData: Record<string, unknown> = {
      idea_id,
      updated_at: new Date().toISOString(),
    }
    if (metadata.category) upsertData.category = metadata.category
    if (metadata.score)    upsertData.score    = metadata.score

    await supabase.from('idea_metadata').upsert(upsertData, { onConflict: 'idea_id' })

    log(ctx, 'Metadata updated', { category: metadata.category, score: metadata.score })
  }

  // ── 15. Chain next prompt or complete ─────────────────────────────────────────
  if (prompt.next_prompt_id) {
    log(ctx, 'Chaining to next prompt', { next_prompt_id: prompt.next_prompt_id })
    await fireNextPrompt(idea_id, room_id, prompt.next_prompt_id, ctx)
  } else {
    log(ctx, 'Chain complete — marking idea completed')
    await markIdeaCompleted(supabase, idea_id)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Routes to the correct provider adapter based on model.provider.
// Explicit if/else — no factory, no magic, easy to add new providers.
async function callProvider(params: {
  provider:     string
  apiModelId:   string
  systemPrompt: string
  messages:     { role: 'user' | 'assistant'; content: string }[]
  temperature:  number
  maxTokens:    number
  apiKey:       string
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const base = {
    apiModelId:   params.apiModelId,
    systemPrompt: params.systemPrompt,
    messages:     params.messages,
    temperature:  params.temperature,
    maxTokens:    params.maxTokens,
    apiKey:       params.apiKey,
  }

  if (params.provider === 'openai')     return openai.generateCompletion(base)
  if (params.provider === 'anthropic')  return anthropic.generateCompletion(base)
  return fireworks.generateCompletion(base)  // default: fireworks
}

// Returns the API key for the given provider from Supabase secrets.
function getApiKey(provider: string): string {
  if (provider === 'openai') {
    const k = Deno.env.get('OPENAI_API_KEY')
    if (!k) throw new Error('OPENAI_API_KEY secret not configured')
    return k
  }
  if (provider === 'anthropic') {
    const k = Deno.env.get('ANTHROPIC_API_KEY')
    if (!k) throw new Error('ANTHROPIC_API_KEY secret not configured')
    return k
  }
  // Default: fireworks
  const k = Deno.env.get('AI_API_KEY')
  if (!k) throw new Error('AI_API_KEY secret not configured')
  return k
}

// (Old regex parser removed since we now use structured JSON)

// Marks the idea as 'completed'.
async function markIdeaCompleted(supabase: ReturnType<typeof createServiceClient>, idea_id: string): Promise<void> {
  await supabase
    .from('ideas')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', idea_id)
}

// Fire-and-forget: invokes process-prompt for the next prompt in the chain.
// Uses EdgeRuntime.waitUntil so the background task outlives this invocation's response.
async function fireNextPrompt(
  idea_id:   string,
  room_id:   string,
  prompt_id: string,
  logCtx:    Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const nextInvocation = fetch(`${supabaseUrl}/functions/v1/process-prompt`, {
    method:  'POST',
    headers: {
      // Use 'apikey' header for new sb_secret_... format keys.
      // Legacy JWT keys also work here as an apikey value.
      'apikey':        serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idea_id, room_id, prompt_id }),
  }).then(r => {
    if (!r.ok) r.text().then(t =>
      logError({ fn: FN, idea_id, prompt_id }, new Error(`Next invocation failed: ${r.status} ${t}`))
    )
  }).catch(err =>
    logError({ fn: FN, ...logCtx }, err, 'fireNextPrompt fetch threw')
  )

  // @ts-ignore — EdgeRuntime is available in Supabase's Deno runtime
  if (typeof EdgeRuntime !== 'undefined') {
    // @ts-ignore
    EdgeRuntime.waitUntil(nextInvocation)
  }
}
