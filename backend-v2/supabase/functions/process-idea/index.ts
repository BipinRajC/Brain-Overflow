// ============================================================================
// process-idea — Entry point for idea processing.
//
// Called by the Flutter app after the user submits an idea.
// Responsibilities:
//   1. Create the idea row
//   2. Store the original idea text as the first chat_message (role='user')
//   3. Mark idea as 'processing'
//   4. Fire-and-forget: invoke process-prompt for the first prompt in the chain
//   5. Return { idea_id } immediately — AI processing happens in the background
//
// The app subscribes to 'ideas' and 'chat_messages' via Supabase Realtime
// and updates the UI automatically as prompts complete.
// ============================================================================

import { corsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/db.ts'
import { log, logError } from '../_shared/log.ts'

const FN = 'process-idea'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return corsPreflight()

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { room_id, content_text, author_name } = body

  if (!room_id)      return errorResponse('Missing room_id', 400)
  if (!content_text) return errorResponse('Missing content_text', 400)
  if (!author_name)  return errorResponse('Missing author_name', 400)

  const supabase = createServiceClient()

  // ── Step 1: Create idea row with status='recorded' ──────────────────────────
  const { data: idea, error: ideaErr } = await supabase
    .from('ideas')
    .insert({ room_id, author_name, status: 'recorded' })
    .select('id')
    .single()

  if (ideaErr || !idea) {
    logError({ fn: FN, room_id }, ideaErr ?? new Error('idea insert returned null'))
    return errorResponse('Failed to create idea', 500)
  }

  const idea_id = idea.id
  log({ fn: FN, idea_id, room_id }, 'Idea created', { author_name })

  // ── Step 2: Store original idea text as first chat_message ──────────────────
  // role='user', prompt_id=NULL identifies this as the original user input.
  // This is how we retrieve the idea text in process-prompt without a separate column.
  const { error: msgErr } = await supabase.from('chat_messages').insert({
    idea_id,
    room_id,
    role:      'user',
    content:   content_text,
    prompt_id: null,
  })

  if (msgErr) {
    logError({ fn: FN, idea_id, room_id }, msgErr, 'Failed to store initial chat message')
    // Non-fatal — idea row exists, still continue
  }

  // ── Step 3: Mark idea as 'processing' ───────────────────────────────────────
  await supabase
    .from('ideas')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', idea_id)

  // ── Step 4: Load room's first prompt ────────────────────────────────────────
  const { data: room } = await supabase
    .from('rooms')
    .select('first_prompt_id')
    .eq('id', room_id)
    .single()

  if (!room?.first_prompt_id) {
    log({ fn: FN, idea_id, room_id }, 'No prompts configured — marking completed')
    await supabase
      .from('ideas')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', idea_id)
    return jsonResponse({ idea_id, status: 'completed', message: 'No prompts configured' })
  }

  // ── Step 5: Fire-and-forget — invoke process-prompt asynchronously ───────────
  // EdgeRuntime.waitUntil keeps the background task alive after this function returns.
  // The HTTP response goes back to the Flutter app immediately.
  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const nextInvocation = fetch(`${supabaseUrl}/functions/v1/process-prompt`, {
    method:  'POST',
    headers: {
      // Use 'apikey' header for new sb_secret_... format keys.
      // Legacy JWT keys also work here as an apikey value.
      'apikey':         serviceKey,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      idea_id,
      room_id,
      prompt_id: room.first_prompt_id,
    }),
  }).then(r => {
    if (!r.ok) r.text().then(t =>
      logError({ fn: FN, idea_id }, new Error(`process-prompt invocation failed: ${r.status} ${t}`))
    )
  }).catch(err =>
    logError({ fn: FN, idea_id }, err, 'process-prompt fetch threw')
  )

  // @ts-ignore — EdgeRuntime is available in Supabase's Deno runtime
  if (typeof EdgeRuntime !== 'undefined') {
    // @ts-ignore
    EdgeRuntime.waitUntil(nextInvocation)
  }
  // If EdgeRuntime.waitUntil is unavailable (local dev), the fetch still fires.

  log({ fn: FN, idea_id, room_id }, 'process-prompt invoked async', {
    first_prompt_id: room.first_prompt_id,
  })

  // ── Return immediately — processing continues in the background ─────────────
  return jsonResponse({ idea_id, status: 'processing' })
})
