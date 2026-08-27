import { api } from './api'

/**
 * Representative reference values (client-specific) used to seed R'Bot's example
 * prompts. Sourced from /api/ai/hints — the airline's prime base, a crew rank, a
 * fleet, and a sample crew id — so suggestions reflect the ACTUAL setup instead of
 * a hardcoded placeholder. Any field may be null when the underlying table is empty.
 */
export interface AiHints {
  base: string | null
  rank: string | null
  fleet: string | null
  crewId: string | null
}

export const aiHintsApi = {
  async get(): Promise<AiHints> {
    return api.get('/api/ai/hints') as Promise<AiHints>
  },
}
