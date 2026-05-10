// Anthropic Claude provider adapter.
// Docs: https://docs.anthropic.com/en/api/messages
//
// Implements the shared generateCompletion interface.
// Requires ANTHROPIC_API_KEY to be set as a Supabase secret.
//
// Key differences from OpenAI-style APIs:
//   - 'system' is a top-level field, NOT a message with role='system'
//   - API version header is required: 'anthropic-version'

export interface CompletionParams {
  apiModelId:   string
  systemPrompt: string
  messages:     { role: 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?:   number
  apiKey:       string
}

export interface CompletionResult {
  content:      string
  inputTokens:  number
  outputTokens: number
}

export async function generateCompletion(params: CompletionParams): Promise<CompletionResult> {
  const body: Record<string, unknown> = {
    model:      params.apiModelId,
    messages:   params.messages,  // Anthropic does NOT accept role='system' in messages
    max_tokens: params.maxTokens  ?? 2048,
    temperature: params.temperature ?? 0.7,
  }

  // System prompt is a top-level field in Anthropic's API
  if (params.systemPrompt) {
    body.system = params.systemPrompt
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         params.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${txt}`)
  }

  const data = await res.json()
  return {
    content:      data.content[0].text as string,
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}
