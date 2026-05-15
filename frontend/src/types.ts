export type IdeaStatus = 'recorded' | 'processing' | 'completed' | 'failed'
export type IdeaScore = 'strong' | 'weak' | 'needs_pivot' | 'needs_refinement'
export type IdeaCategory =
  | 'startup_idea'
  | 'automation'
  | 'personal_tool'
  | 'dev_tool'
  | 'other'

export interface Idea {
  id: string
  idea: string
  category: IdeaCategory | null
  score: IdeaScore | null
  flow_id: string | null
  status: IdeaStatus
  telegram_chat_id: string | null
  telegram_message_id: string | null
  created_at: string
}

export type MessageType = 'idea' | 'prompt' | 'response'

export interface ChatMessage {
  id: string
  idea_id: string
  message: string
  message_type: MessageType
  prompt_id: string | null
  sequence_number: number
  created_at: string
}

export type ContextMode =
  | 'idea_only'
  | 'previous_response'
  | 'full_history_json'

export interface Prompt {
  id: string
  prompt_name: string
  prompt: string
  context_mode: ContextMode
  created_at: string
}

export interface Flow {
  id: string
  flow_name: string
  telegram_command: string | null
  prompt_ids: string[]
  created_at: string
}

export type Provider = 'fireworks' | 'openai' | 'anthropic'

export interface Model {
  id: string
  model_name: string
  model_id: string
  provider: Provider
  is_active: boolean
  created_at: string
}
