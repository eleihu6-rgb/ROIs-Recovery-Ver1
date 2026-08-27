export type ImportMaterial = 'crew' | 'flight' | 'pairing' | 'roster' | 'rosterGround'
export type ImportStage = 'fetch' | 'transform' | 'enqueue' | 'write'
export type UiStage = 'fetch' | 'transform' | 'write'

export interface ImportStageCounters {
  processed?: number
  total?: number
  recordsIn?: number
  recordsOut?: number
  added?: number
  updated?: number
  deleted?: number
  success?: number
  failed?: number
  skipped?: number
}

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

export interface ImportProgressState {
  materials: ImportMaterial[]
  startedAt?: string
  done: Record<string, Partial<Record<ImportStage, boolean>>>
  current: Record<string, Partial<Record<ImportStage, {
    status: 'running' | 'done' | 'fail'
    message?: string
    startedAt?: string
    finishedAt?: string
  } & ImportStageCounters>>>
  headline: UiStage
  percent: number
  indeterminate: boolean
  status: 'idle' | 'running' | 'complete' | 'error'
  errorMessage?: string
  result?: unknown
}

const STAGES: readonly ImportStage[] = ['fetch', 'transform', 'enqueue', 'write']

const previousStageFinishedAt = (
  current: ImportProgressState['current'],
  material: ImportMaterial,
  stage: ImportStage,
): string | undefined => {
  const materialState = current[material]
  if (!materialState) return undefined
  if (stage === 'fetch') return undefined
  if (stage === 'transform') return materialState.fetch?.finishedAt
  if (stage === 'enqueue') return materialState.transform?.finishedAt ?? materialState.fetch?.finishedAt
  return materialState.enqueue?.finishedAt ?? materialState.transform?.finishedAt ?? materialState.fetch?.finishedAt
}

const emptyDoneMap = (materials: ImportMaterial[]): Record<string, Partial<Record<ImportStage, boolean>>> =>
  Object.fromEntries(materials.map((material) => [material, {}]))

const emptyCurrentMap = (materials: ImportMaterial[]): ImportProgressState['current'] =>
  Object.fromEntries(materials.map((material) => [material, {}]))

const countCompletedStages = (
  materials: ImportMaterial[],
  done: Record<string, Partial<Record<ImportStage, boolean>>>,
): number => {
  let completed = 0
  for (const material of materials) {
    const materialDone = done[material]
    if (!materialDone) continue
    for (const stage of STAGES) {
      if (materialDone[stage]) completed += 1
    }
  }
  return completed
}

const computePercent = (
  materials: ImportMaterial[],
  done: Record<string, Partial<Record<ImportStage, boolean>>>,
  current: ImportProgressState['current'],
  status: ImportProgressState['status'],
): number => {
  if (status === 'complete') return 100
  if (materials.length === 0) return 0
  const total = materials.length * STAGES.length
  const completed = countCompletedStages(materials, done)
  let partial = 0
  for (const material of materials) {
    for (const stage of STAGES) {
      if (done[material]?.[stage]) continue
      const event = current[material]?.[stage]
      if (event?.status !== 'running') continue
      if (typeof event.total === 'number' && event.total > 0 && typeof event.processed === 'number') {
        partial += Math.max(0, Math.min(0.95, event.processed / event.total))
      } else {
        partial += 0.2
      }
      break
    }
  }
  return Math.min(99, Math.floor((100 * (completed + partial)) / total))
}

const computeHeadline = (
  materials: ImportMaterial[],
  done: Record<string, Partial<Record<ImportStage, boolean>>>,
): UiStage => {
  if (materials.some((material) => !done[material]?.fetch)) return 'fetch'
  if (materials.some((material) => !done[material]?.transform)) return 'transform'
  return 'write'
}

const recompute = (state: ImportProgressState): ImportProgressState => ({
  ...state,
  headline: computeHeadline(state.materials, state.done),
  percent: computePercent(state.materials, state.done, state.current, state.status),
  indeterminate: state.materials.some((material) =>
    STAGES.some((stage) => {
      const event = state.current[material]?.[stage]
      return event?.status === 'running' && !(typeof event.total === 'number' && event.total > 0)
    }),
  ),
})

export const createInitialProgress = (materials: ImportMaterial[]): ImportProgressState =>
  recompute({
    materials,
    done: emptyDoneMap(materials),
    current: emptyCurrentMap(materials),
    headline: 'fetch',
    percent: 0,
    indeterminate: false,
    status: 'running',
  })

export const applyImportProgressEvent = (
  state: ImportProgressState,
  event: ImportProgressEvent,
): ImportProgressState => {
  switch (event.type) {
    case 'started': {
      return recompute({
        ...state,
        materials: event.materials,
        done: emptyDoneMap(event.materials),
        current: emptyCurrentMap(event.materials),
        startedAt: event.at,
        status: 'running',
        errorMessage: undefined,
        result: undefined,
      })
    }
    case 'stage': {
      const previousStageState = state.current[event.material]?.[event.stage]
      const inferredStartedAt = previousStageState?.startedAt
        ?? previousStageFinishedAt(state.current, event.material, event.stage)
        ?? state.startedAt
        ?? event.at
      const stageState = {
        status: event.status,
        message: event.message,
        startedAt: inferredStartedAt,
        finishedAt: event.status === 'done' || event.status === 'fail'
          ? event.at
          : previousStageState?.finishedAt,
        recordsIn: event.recordsIn,
        recordsOut: event.recordsOut,
        processed: event.processed,
        total: event.total,
        added: event.added,
        updated: event.updated,
        deleted: event.deleted,
        success: event.success,
        failed: event.failed,
        skipped: event.skipped,
      }
      const current = {
        ...state.current,
        [event.material]: {
          ...(state.current[event.material] ?? {}),
          [event.stage]: stageState,
        },
      }
      if (event.status === 'fail') {
        return recompute({
          ...state,
          current,
          status: 'error',
          errorMessage: event.message ?? `${event.material} ${event.stage} failed`,
        })
      }
      if (event.status !== 'done') {
        return recompute({
          ...state,
          current,
          status: state.status === 'idle' ? 'running' : state.status,
        })
      }
      const materialDone = {
        ...(state.done[event.material] ?? {}),
        [event.stage]: true,
      }
      return recompute({
        ...state,
        status: state.status === 'idle' ? 'running' : state.status,
        current,
        done: {
          ...state.done,
          [event.material]: materialDone,
        },
      })
    }
    case 'complete': {
      return {
        ...state,
        status: 'complete',
        result: event.result,
        headline: 'write',
        percent: 100,
        indeterminate: false,
        errorMessage: undefined,
      }
    }
    case 'error': {
      return recompute({
        ...state,
        status: 'error',
        errorMessage: event.message,
      })
    }
    default: {
      return state
    }
  }
}
