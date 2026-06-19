// OpenAI provider — stubbed, same interface as fireworks.ts
import type { Message, CompletionResult } from './fireworks.ts'

export async function generateCompletion(params: {
  modelId:     string
  messages:    Message[]
  temperature: number
  maxTokens:   number
  apiKey:      string
}): Promise<CompletionResult> {
  const isNewModel = params.modelId.includes('gpt-5') || params.modelId.startsWith('o')
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       params.modelId,
      messages:    params.messages,
      ...(isNewModel ? {} : { temperature: params.temperature }),
      ...(isNewModel
        ? { max_completion_tokens: params.maxTokens }
        : { max_tokens: params.maxTokens }),
    }),
  })
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${await resp.text()}`)
  const json  = await resp.json()
  const choice = json.choices?.[0]
  return {
    content:      choice.message.content ?? '',
    inputTokens:  json.usage?.prompt_tokens     ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  }
}
