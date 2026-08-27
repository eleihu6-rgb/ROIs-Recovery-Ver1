import { api } from './api'
import type { CrewMemo, CrewMemoInput, PaRemovalResult } from '@/types/crew-memo'

export const crewMemoApi = {
  /** Visible memos for a crew set over a date range (loaded after first paint). */
  list: (crewIds: string[], from: string, to: string): Promise<CrewMemo[]> =>
    api.get(
      `/api/crew-memo?crewIds=${encodeURIComponent(crewIds.join(','))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ) as Promise<CrewMemo[]>,

  /** Insert or update a memo. */
  save: (input: CrewMemoInput): Promise<CrewMemo> =>
    api.post('/api/crew-memo', input) as Promise<CrewMemo>,

  /** Soft-delete a memo (status='N'). */
  remove: (id: number): Promise<{ id: number }> =>
    api.delete(`/api/crew-memo/${id}`) as Promise<{ id: number }>,

  /** Stage 1 — analyze and write the bot PA-removal plan as type=3 memos. */
  preparePaRemoval: (
    input: { bases?: string[]; ranks?: string[]; crewIds?: string[]; from: string; to: string },
  ): Promise<PaRemovalResult> =>
    api.post('/api/crew-memo/pa-removal', input) as Promise<PaRemovalResult>,

  /** Stage 3 — execute: soft-delete the approved rosters. Explicit order only. */
  executePaRemoval: (
    input: { crewIds?: string[]; from: string; to: string },
  ): Promise<{ deassigned: number; byCrew: Record<string, number> }> =>
    api.post('/api/crew-memo/pa-removal/execute', input) as Promise<{ deassigned: number; byCrew: Record<string, number> }>,
}
