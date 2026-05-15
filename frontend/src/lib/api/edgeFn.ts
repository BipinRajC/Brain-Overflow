import { getEdgeFnHeaders, getSupabaseUrl } from '../supabase'

export interface ProcessPromptOpts {
  promptIndex?: number
  customPromptId?: string
}

export async function triggerProcessPrompt(
  ideaId: string,
  opts: ProcessPromptOpts = {},
): Promise<void> {
  const url = getSupabaseUrl()
  const body: Record<string, unknown> = { idea_id: ideaId }
  if (opts.customPromptId) {
    body.custom_prompt_id = opts.customPromptId
  } else {
    body.prompt_index = opts.promptIndex ?? 0
  }
  // Fire-and-forget — backend chains async via EdgeRuntime.waitUntil
  await fetch(`${url}/functions/v1/process-prompt`, {
    method: 'POST',
    headers: getEdgeFnHeaders(),
    body: JSON.stringify(body),
  })
}
