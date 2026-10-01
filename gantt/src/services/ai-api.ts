import { AI_API_BASE } from '@/config/api-paths'
import { createHttpClient } from './http-client'
import type { ChatMessage, ChatResponse } from '@/components/ai-chat/types'
import type { ViewportSnapshot } from '@/components/ai-chat/viewport-snapshot'

const aiClient = createHttpClient({ baseURL: AI_API_BASE })

export const aiApi = {
  chat: (messages: ChatMessage[], viewport?: ViewportSnapshot): Promise<ChatResponse> =>
    aiClient.post('/chat', { messages, viewport }) as Promise<ChatResponse>,
}
