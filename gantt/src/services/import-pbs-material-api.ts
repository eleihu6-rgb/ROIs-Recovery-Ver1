import { api } from './api'
import {
  applyImportProgressEvent,
  createInitialProgress,
  type ImportMaterial,
  type ImportProgressEvent,
  type ImportProgressState,
} from './import-pbs-progress'

/**
 * Import PBS material is a long-running connector orchestration:
 * NOC fetch + transform + enqueue (+ optional rosterGround DB wait up to 30 min).
 * The default axios client timeout is 30s and will abort crew-only imports
 * with "timeout of 30000ms exceeded" before the connector can finish.
 */
export const IMPORT_PBS_MATERIAL_TIMEOUT_MS = 30 * 60 * 1000

export type {
  ImportMaterial,
  ImportProgressEvent,
  ImportProgressState,
} from './import-pbs-progress'

export interface ImportPbsMaterialScope {
  flight: boolean
  pairing: boolean
  roster: boolean
  rosterGround: boolean
  crew: boolean
}

export interface ImportPbsMaterialInput {
  rosterPeriodId: number
  scope: ImportPbsMaterialScope
}

export interface ImportPbsMaterialTiming {
  material: string
  fetchMs: number
  transformMs: number
  enqueueMs: number
  databaseMs?: number
  totalMs?: number
  recordsIn: number
  recordsOut: number
  rejected: number
}

export interface ImportPbsMaterialConnectorResult {
  connectorCode: string
  syncId: string
  filteredCount: number
  rejectionFile: string | null
  status: 'success' | 'fail'
  timings?: ImportPbsMaterialTiming[]
}

export interface ImportPbsMaterialStats {
  material: ImportMaterial
  status: 'success' | 'partial' | 'failed'
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  rejected: number
  recordsIn: number
  recordsOut: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
  timings: {
    fetchMs: number
    transformMs: number
    enqueueMs: number
    databaseMs: number
    totalMs: number
  }
}

export interface ImportPbsMaterialResult {
  rosterPeriodId: number
  rosterPeriod: string
  startDt: string
  endDt: string
  results: ImportPbsMaterialConnectorResult[]
  materialStats?: ImportPbsMaterialStats[]
}

export interface ImportPbsMaterialStartResult {
  importId: string
  rosterPeriodId: number
  rosterPeriod: string
  startDt: string
  endDt: string
  materials: ImportMaterial[]
}

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}

const asImportPbsMaterialResult = (value: unknown): ImportPbsMaterialResult => {
  if (
    value
    && typeof value === 'object'
    && 'rosterPeriodId' in value
    && 'results' in value
    && Array.isArray((value as ImportPbsMaterialResult).results)
  ) {
    return value as ImportPbsMaterialResult
  }
  throw new Error('Import completed without a valid result payload')
}

export const startImportPbsMaterial = async (
  input: ImportPbsMaterialInput,
): Promise<ImportPbsMaterialStartResult> =>
  api.post('/api/scenario/import-pbs-material', input, {
    timeout: IMPORT_PBS_MATERIAL_TIMEOUT_MS,
  }) as Promise<ImportPbsMaterialStartResult>

export const subscribeImportPbsMaterialProgress = async (
  importId: string,
  onEvent: (event: ImportProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const base = api.defaults.baseURL ?? ''
  const auth = api.defaults.headers.common.Authorization
  const res = await fetch(`${base}/api/scenario/import-pbs-material/${importId}/events`, {
    headers: {
      Accept: 'text/event-stream',
      ...(typeof auth === 'string' ? { Authorization: auth } : {}),
    },
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.split('\n').find((entry) => entry.startsWith('data: '))
        if (!line) continue
        const json = line.slice(6)
        onEvent(JSON.parse(json) as ImportProgressEvent)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Start import and stream SSE progress until complete/error.
 * Resolves with the final result from the complete event.
 */
export const importPbsMaterial = async (
  input: ImportPbsMaterialInput,
  onProgress?: (state: ImportProgressState) => void,
): Promise<ImportPbsMaterialResult> => {
  const start = await startImportPbsMaterial(input)
  let state = createInitialProgress(start.materials)
  onProgress?.(state)

  return await new Promise<ImportPbsMaterialResult>((resolve, reject) => {
    let settled = false
    const ac = new AbortController()

    const settleResolve = (result: ImportPbsMaterialResult): void => {
      if (settled) return
      settled = true
      ac.abort()
      resolve(result)
    }

    const settleReject = (error: unknown): void => {
      if (settled) return
      settled = true
      ac.abort()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    void subscribeImportPbsMaterialProgress(
      start.importId,
      (event) => {
        state = applyImportProgressEvent(state, event)
        onProgress?.(state)

        if (event.type === 'complete') {
          try {
            settleResolve(asImportPbsMaterialResult(event.result))
          } catch (error) {
            settleReject(error)
          }
          return
        }

        if (event.type === 'error') {
          settleReject(new Error(event.message))
        }
      },
      ac.signal,
    ).catch((error: unknown) => {
      // Abort after complete/error is expected; do not reject a settled promise.
      if (settled && isAbortError(error)) return
      if (isAbortError(error) && settled) return
      settleReject(error)
    })
  })
}
