export type ImportMaterial = 'crew' | 'flight' | 'pairing' | 'roster' | 'rosterGround'
export type ImportStage = 'fetch' | 'transform' | 'enqueue' | 'write'

export type ImportProgressEvent =
  | {
      type: 'started'
      importId: string
      rosterPeriodId: number
      rosterPeriod: string
      startDt: string
      endDt: string
      materials: ImportMaterial[]
      at: string
    }
  | {
      type: 'stage'
      importId: string
      material: ImportMaterial
      stage: ImportStage
      status: 'running' | 'done' | 'fail'
      message?: string
      recordsIn?: number
      recordsOut?: number
      processed?: number
      total?: number
      added?: number
      updated?: number
      deleted?: number
      success?: number
      failed?: number
      skipped?: number
      at: string
    }
  | {
      type: 'complete'
      importId: string
      result: unknown
      at: string
    }
  | {
      type: 'error'
      importId: string
      message: string
      at: string
    }

export const importProgressChannel = (importId: string): string =>
  `import:progress:${importId}`

export const importProgressStateKey = (importId: string): string =>
  `import:state:${importId}`

export const importProgressHistoryKey = (importId: string): string =>
  `import:history:${importId}`

export const IMPORT_PROGRESS_STATE_TTL_SEC = 60 * 60
export const IMPORT_PROGRESS_HISTORY_MAX_EVENTS = 200
