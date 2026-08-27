import { AI_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { ChatMessage, ChatResponse } from '@/components/ai-chat/types'

const aiClient = createHttpClient({ baseURL: AI_API_BASE })

export const aiApi = {
  chat: (messages: ChatMessage[]): Promise<ChatResponse> =>
    aiClient.post('/chat', { messages }) as Promise<ChatResponse>,
}
