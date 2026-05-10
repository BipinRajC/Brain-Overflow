// Fireworks AI provider adapter.
// Docs: https://docs.fireworks.ai/api-reference/post-completions
//
// Implements the shared generateCompletion interface.
// Every provider file exports the same function signature — no classes, no factories.

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
  const body = {
    model: params.apiModelId,
    messages: [
      // System prompt goes first as a system role message (if provided)
      ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
      ...params.messages,
    ],
    temperature: params.temperature ?? 0.7,
    max_tokens:  params.maxTokens  ?? 2048,
  }

  const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Fireworks API error ${res.status}: ${txt}`)
  }

  const data = await res.json()
  return {
    content:      data.choices[0].message.content as string,
    inputTokens:  data.usage?.prompt_tokens     ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }
}
