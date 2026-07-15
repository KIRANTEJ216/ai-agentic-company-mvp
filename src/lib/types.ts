export interface Agent {
  id: string
  slug: string
  name: string
  emoji: string
  description: string
  color: string
  division: string
  system_prompt: string
  model: string
  created_at: string
}

export interface Division {
  key: string
  label: string
  emoji: string
  color: string
}

export interface DivisionMap {
  [key: string]: Division
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent_slug?: string
  timestamp: string
}

export interface Conversation {
  id: string
  session_id: string
  agent_id: string
  title: string
  messages: Message[]
  created_at: string
  updated_at: string
}
