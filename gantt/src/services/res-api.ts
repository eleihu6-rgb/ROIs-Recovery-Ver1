// gantt/src/services/res-api.ts
//
// Dedicated axios instance for the RES Pairing Creator endpoints.
//
// WHY dedicated (not createHttpClient / shared api):
//   The shared http-client unwraps ANY response body that has a top-level `code`
//   field (returning body.data). That is correct for the standard live-server
//   envelope { code: 200, data: T }. However the RES generate route returns
//   { code: 200, data: { created, skipped, summary } } — the inner data object
//   does not have a `code` field, so the shared client would work fine, but the
//   task spec (§13d) requires a dedicated instance here to make the dependency
//   explicit and avoid surprise if the response shape ever changes.
//   See gantt/src/utils/gantt-test-hook.ts for a similar pattern.
//
// Auth: the Bearer token is pulled from the shared `api` instance's defaults at
// request time (an interceptor copies it), matching the auth-store setup in
// auth-store.ts which calls `api.defaults.headers.common['Authorization'] = …`.
import axios from 'axios'
import { LIVE_API_BASE } from '@/config/api-paths'
import { api } from './api'
import type { ResPlannerCell, ResDivision } from '@/stores/res-planner-store'

export type ConflictPolicy = 'skip' | 'overwrite' | 'add'

export interface ResSummaryRow {
  base: string
  rank: string
  assignment: string
  days: number
  slots: number
}

export interface GenerateResult {
  created: number
  skipped: number
  summary: ResSummaryRow[]
}

export interface GenerateInput {
  division: ResDivision
  conflictPolicy: ConflictPolicy
  cells: ResPlannerCell[]
  dryRun?: boolean
}

export interface BatchUpdateInput {
  ids: number[]
  plan?: { rank: string; value: number }[]
  window?: { start: string; end: string }
}

export interface BatchUpdateResult {
  updated: number
}

export interface BatchDeleteInput {
  ids: number[]
}

export interface BatchDeleteResult {
  deleted: number
  blocked: { id: number; reason: string }[]
}

// Create a dedicated instance that does NOT auto-unwrap envelopes.
// The auth interceptor forwards the Bearer token from the shared `api` instance.
const resClient = axios.create({
  baseURL: LIVE_API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

resClient.interceptors.request.use((config) => {
  const auth = api.defaults.headers.common['Authorization']
  if (auth) config.headers['Authorization'] = auth
  return config
})

// Response interceptor: unwrap { code: 200, data: T } → T; reject on errors.
resClient.interceptors.response.use(
  (response) => {
    const body = response.data as { code: number; data: unknown; message?: string }
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 200) return body.data as never
      return Promise.reject(new Error(body.message ?? 'API Error'))
    }
    return response.data
  },
  (err: unknown) => {
    const anyErr = err as { response?: { data?: { message?: string } }; message?: string }
    const message = anyErr.response?.data?.message ?? anyErr.message ?? 'Network Error'
    return Promise.reject(new Error(message))
  },
)

export const resApi = {
  /** Generate RES pairings from a set of cells. */
  generate: (input: GenerateInput): Promise<GenerateResult> =>
    resClient.post('/api/res-pairing/generate', input) as Promise<GenerateResult>,

  /** Update plan/window for a batch of existing RES pairing IDs. */
  batchUpdate: (input: BatchUpdateInput): Promise<BatchUpdateResult> =>
    resClient.patch('/api/res-pairing/batch', input) as Promise<BatchUpdateResult>,

  /** Delete a batch of RES pairing IDs. */
  batchDelete: (input: BatchDeleteInput): Promise<BatchDeleteResult> =>
    resClient.post('/api/res-pairing/batch-delete', input) as Promise<BatchDeleteResult>,
}
