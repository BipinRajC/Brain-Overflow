// Deterministic context builder for prompt chains.
//
// Problem this solves:
//   Naively appending all chat_messages creates exponentially growing context
//   windows that exceed model limits and corrupt multi-turn responses.
//
// Strategy:
//   1. Always include the original idea text (role='user')
//   2. Add prior prompt outputs as assistant summaries, oldest first
//   3. Truncate each prior output to MAX_PRIOR_OUTPUT_CHARS
//   4. If total chars exceed maxChars, drop oldest prior outputs (keep original idea)
//
// Result: context window stays small and deterministic regardless of chain length.

export interface ContextMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PriorOutput {
  prompt_name: string    // e.g. "categorize" — used as a label in context
  output_text: string    // the AI's response for that step
}

// Max chars per individual prior output summary (~250 tokens)
const MAX_PRIOR_OUTPUT_CHARS = 1000

// Default total context cap (~1500 tokens, safe for 8k context window models)
const DEFAULT_MAX_CONTEXT_CHARS = 6000

export function buildContext(
  ideaText: string,
  priorOutputs: PriorOutput[],
  maxContextChars: number = DEFAULT_MAX_CONTEXT_CHARS,
): ContextMessage[] {
  // The original idea is always the first message. Never removed.
  const messages: ContextMessage[] = [
    { role: 'user', content: ideaText },
  ]

  // Add each prior prompt's output as an assistant summary.
  for (const prior of priorOutputs) {
    const trimmed = prior.output_text.length > MAX_PRIOR_OUTPUT_CHARS
      ? prior.output_text.slice(0, MAX_PRIOR_OUTPUT_CHARS) + '...[truncated for context]'
      : prior.output_text

    messages.push({
      role: 'assistant',
      content: `[Previous step — ${prior.prompt_name}]:\n${trimmed}`,
    })
  }

  // Drop oldest prior outputs (index 1+) until we are under the char limit.
  // The original idea at index 0 is always preserved.
  while (totalChars(messages) > maxContextChars && messages.length > 1) {
    messages.splice(1, 1)
  }

  return messages
}

function totalChars(messages: ContextMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0)
}
