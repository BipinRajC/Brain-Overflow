import { createServiceClient } from '../_shared/db.ts'
import { corsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { log, logError } from '../_shared/log.ts'

const FN = 'start-run'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return corsPreflight()

  let body: { idea_id?: string; flow_id?: string }
  try { body = await req.json() }
  catch { return errorResponse('Invalid JSON body', 400) }

  const { idea_id, flow_id } = body
  if (!idea_id) return errorResponse('Missing idea_id', 400)
  if (!flow_id) return errorResponse('Missing flow_id', 400)

  const supabase = createServiceClient()
  const ctx = { fn: FN, idea_id, flow_id }

  try {
    // 1. Load and validate flow
    const { data: flow, error: flowErr } = await supabase
      .from('flows')
      .select('id, prompt_ids')
      .eq('id', flow_id)
      .single()

    if (flowErr || !flow) return errorResponse('Flow not found', 400)

    const promptIds = flow.prompt_ids as string[]
    if (!promptIds || promptIds.length === 0) {
      return errorResponse('Flow has no prompts', 400)
    }

    // 2. Verify all prompts exist
    const { data: prompts } = await supabase
      .from('prompts')
      .select('id')
      .in('id', promptIds)

    if (!prompts || prompts.length !== promptIds.length) {
      return errorResponse('Flow references one or more missing prompts', 400)
    }

    // 3. Verify active model exists
    const { data: model } = await supabase
      .from('models')
      .select('id, model_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!model) return errorResponse('No active model configured', 400)

    // 4. Create run as queued
    const { data: run, error: runErr } = await supabase
      .from('idea_runs')
      .insert({ idea_id, flow_id, model_id: model.model_id, status: 'queued' })
      .select('id')
      .single()

    if (runErr || !run) {
      logError(ctx, runErr ?? new Error('insert returned no data'), 'Failed to create run')
      return errorResponse('Failed to create run', 500)
    }

    const run_id = run.id
    log(ctx, 'Run created as queued', { run_id })

    // 5. Set latest_run_id on idea
    await supabase
      .from('ideas')
      .update({ latest_run_id: run_id })
      .eq('id', idea_id)

    // 6. Fire process-prompt (fire-and-forget)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    fetch(`${supabaseUrl}/functions/v1/process-prompt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_id, prompt_index: 0, run_id, flow_id }),
    }).catch(() => {})

    return jsonResponse({ run_id })

  } catch (err) {
    logError(ctx, err, 'start-run threw')
    return errorResponse('Internal error', 500)
  }
})
