// gantt/src/services/composition-api.ts
import { api } from './api'
import type {
  Composition, CompositionRank, CompositionLoad,
  CreateCompositionData, CreateLoadData, CreateRankData,
} from '@/types/composition'

export const compositionApi = {
  // ── Composition ──────────────────────────────────────────────
  /** List all compositions */
  listCompositions: (): Promise<Composition[]> =>
    api.get('/api/composition') as Promise<Composition[]>,

  /** Create a new composition */
  createComposition: (data: CreateCompositionData): Promise<Composition> =>
    api.post('/api/composition', data) as Promise<Composition>,

  /** Update an existing composition */
  updateComposition: (id: number, data: Partial<CreateCompositionData>): Promise<Composition> =>
    api.put(`/api/composition/${id}`, data) as Promise<Composition>,

  /** Delete a composition by ID */
  deleteComposition: (id: number): Promise<void> =>
    api.delete(`/api/composition/${id}`) as Promise<void>,

  // ── Composition Load ─────────────────────────────────────────
  /** List all composition load rules */
  listLoads: (): Promise<CompositionLoad[]> =>
    api.get('/api/composition/load') as Promise<CompositionLoad[]>,

  /** Create a new composition load rule */
  createLoad: (data: CreateLoadData): Promise<CompositionLoad> =>
    api.post('/api/composition/load', data) as Promise<CompositionLoad>,

  /** Update an existing composition load rule */
  updateLoad: (id: number, data: Partial<CreateLoadData>): Promise<CompositionLoad> =>
    api.put(`/api/composition/load/${id}`, data) as Promise<CompositionLoad>,

  /** Delete a composition load rule by ID */
  deleteLoad: (id: number): Promise<void> =>
    api.delete(`/api/composition/load/${id}`) as Promise<void>,

  // ── Composition Rank ─────────────────────────────────────────
  /** Get all composition ranks for a given composition ID */
  getRanksByCompId: (compId: number): Promise<CompositionRank[]> =>
    api.get(`/api/composition/rank/comp/${compId}`) as Promise<CompositionRank[]>,

  /** Create a new composition rank entry */
  createRank: (data: CreateRankData): Promise<CompositionRank> =>
    api.post('/api/composition/rank', data) as Promise<CompositionRank>,

  /** Update the planValue of a composition rank */
  updateRank: (id: number, data: { planValue: number }): Promise<CompositionRank> =>
    api.put(`/api/composition/rank/${id}`, data) as Promise<CompositionRank>,

  /** Delete a composition rank by ID */
  deleteRank: (id: number): Promise<void> =>
    api.delete(`/api/composition/rank/${id}`) as Promise<void>,
}