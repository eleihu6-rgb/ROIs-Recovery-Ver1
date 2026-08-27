// gantt/src/stores/scenario-gantt-store.ts
import { create } from 'zustand'
import { scenarioGanttApi } from '@/services/scenario-gantt-api'
import { refreshScenarioLegality } from '@/services/scenario-legality-api'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { notify } from '@/utils/notify'
import type { ScenarioGanttData, AssignmentPatch, LockStatus } from '@/types/scenario-gantt'
import { calendarDateToUtcMidnight } from '@/components/gantt/gantt-utils'
import { useTimezoneStore } from '@/stores/timezone-store'

export const ZOOM_STEP = 2
const MONTH_VIEWPORT_ANCHOR_BIAS_MS = 60_000
const HOUR_MS = 3_600_000

interface ScenarioGanttStore {
  // Data
  data: ScenarioGanttData | null
  loading: boolean
  error: string | null
  /** Monotonic data replacement signal for canvas consumers after load/save. */
  dataRevision: number
  /** Monotonic repaint signal for row reordering/selection changes that do not replace data. */
  renderRevision: number

  // Edit state
  pendingChanges: AssignmentPatch[]
  redoStack: AssignmentPatch[]
  isDirty: boolean
  saving: boolean

  // Lock
  lockStatus: LockStatus | null
  acquiringLock: boolean

  // View state (per-instance, independent across tabs)
  pxPerHour: number
  zoomMin: number
  zoomMax: number
  scrollX: number
  scrollWindowStartX: number
  scrollWindowEndX: number | null
  viewportWidth: number
  leftPanelWidth: number

  // Actions
  loadData: (scenarioId: number, version?: string) => Promise<void>
  reloadData: (scenarioId: number, version?: string) => Promise<void>
  acquireLock: (scenarioId: number) => Promise<void>
  releaseLock: (scenarioId: number) => Promise<void>
  refreshLock: (scenarioId: number) => Promise<void>
  addPatch: (patch: AssignmentPatch) => void
  /** Roll back a specific optimistic patch (by reference). Used by the background legality
   *  check when a drop must be reverted. No-op if the patch was already popped by undo. */
  removePatch: (patch: AssignmentPatch) => void
  undo: () => AssignmentPatch | null
  redo: () => AssignmentPatch | null
  canUndo: () => boolean
  canRedo: () => boolean
  clearPatches: () => void
  save: (scenarioId: number) => Promise<void>
  setZoom: (pxPerHour: number) => void
  zoomIn: (viewportWidth: number) => void
  zoomOut: (viewportWidth: number) => void
  setScrollX: (x: number) => void
  setScrollWindow: (startX: number, endX: number | null) => void
  clearScrollWindow: () => void
  setViewportWidth: (width: number) => void
  zoomToMonth: (year: number, month: number, rangeStart: Date, viewportWidth?: number) => void
  zoomToRp: (rpStartMs: number, rpEndMs: number, rangeStart: Date, viewportWidth?: number) => void
  setLeftPanelWidth: (w: number) => void
  setZoomBounds: (min: number, max: number) => void
  markDirty: () => void
}

const contentHoursFor = (data: ScenarioGanttData | null): number => {
  if (!data) return 0
  return Math.max(1, (new Date(data.endDtLoc).getTime() - new Date(data.strDtLoc).getTime()) / 3_600_000)
}

const minScrollXFor = (state: Pick<ScenarioGanttStore, 'scrollWindowStartX'>): number => Math.max(0, state.scrollWindowStartX)

const maxScrollXFor = (state: Pick<ScenarioGanttStore, 'data' | 'pxPerHour' | 'viewportWidth' | 'scrollWindowStartX' | 'scrollWindowEndX'>): number => {
  const hours = contentHoursFor(state.data)
  if (hours <= 0 || state.viewportWidth <= 0) return Number.POSITIVE_INFINITY
  const contentMax = Math.max(0, hours * state.pxPerHour - state.viewportWidth)
  const windowMax = state.scrollWindowEndX != null ? Math.max(0, state.scrollWindowEndX - state.viewportWidth) : contentMax
  return Math.max(minScrollXFor(state), Math.min(contentMax, windowMax))
}

const clampScrollXFor = (
  state: Pick<ScenarioGanttStore, 'data' | 'pxPerHour' | 'viewportWidth' | 'scrollWindowStartX' | 'scrollWindowEndX'>,
  x: number,
): number => Math.min(maxScrollXFor(state), Math.max(minScrollXFor(state), x))

function createStore(scenarioId: number) {
  return create<ScenarioGanttStore>((set, get) => ({
    data: null,
    loading: false,
    error: null,
    dataRevision: 0,
    renderRevision: 0,
    pendingChanges: [],
    redoStack: [],
    isDirty: false,
    saving: false,
    lockStatus: null,
    acquiringLock: false,

    pxPerHour: 7,
    zoomMin: 2,
    zoomMax: 200,
    scrollX: 0,
    scrollWindowStartX: 0,
    scrollWindowEndX: null,
    viewportWidth: 0,
    leftPanelWidth: 210,

    loadData: async (_scenarioId, version) => {
      set({ loading: true, error: null })
      try {
        const data = await scenarioGanttApi.getGanttData(scenarioId, version)
        set((state) => ({
          data,
          loading: false,
          dataRevision: state.dataRevision + 1,
          pendingChanges: state.isDirty ? state.pendingChanges : [],
          redoStack: state.isDirty ? state.redoStack : [],
          isDirty: state.isDirty,
        }))
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    reloadData: async (_scenarioId, version) => {
      const data = await scenarioGanttApi.getGanttData(scenarioId, version)
      set((state) => ({
        data,
        dataRevision: state.dataRevision + 1,
      }))
    },

    acquireLock: async () => {
      set({ acquiringLock: true })
      try {
        const result = await scenarioGanttApi.acquireLock(scenarioId)
        if (result.acquired) {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
        } else {
          const status = await scenarioGanttApi.getLockStatus(scenarioId)
          set({ lockStatus: status, acquiringLock: false })
          notify.error(`Lock held by ${status.owner ?? 'another user'}`)
        }
      } catch (err) {
        set({ acquiringLock: false })
        notify.error((err as Error).message)
      }
    },

    releaseLock: async () => {
      try {
        await scenarioGanttApi.releaseLock(scenarioId)
        set({ lockStatus: { locked: false, owner: null, ttl: null, isOwner: false }, pendingChanges: [], redoStack: [], isDirty: false })
      } catch (err) {
        notify.error((err as Error).message)
      }
    },

    refreshLock: async () => {
      try {
        const status = await scenarioGanttApi.getLockStatus(scenarioId)
        set({ lockStatus: status })
      } catch { /* silent */ }
    },

    addPatch: (patch) => {
      set((s) => ({ pendingChanges: [...s.pendingChanges, patch], redoStack: [], isDirty: true }))
    },

    removePatch: (patch) => {
      set((s) => {
        const next = s.pendingChanges.filter((p) => p !== patch)
        if (next.length === s.pendingChanges.length) return {} // not present → no-op (undo may already have popped it)
        // Clear redoStack like addPatch does — never replay a reverted patch.
        return { pendingChanges: next, redoStack: [], isDirty: next.length > 0 }
      })
    },

    undo: () => {
      const { pendingChanges } = get()
      const patch = pendingChanges.at(-1) ?? null
      if (!patch) return null
      set((s) => ({
        pendingChanges: s.pendingChanges.slice(0, -1),
        redoStack: [...s.redoStack, patch],
        isDirty: s.pendingChanges.length > 1,
      }))
      return patch
    },

    redo: () => {
      const { redoStack } = get()
      const patch = redoStack.at(-1) ?? null
      if (!patch) return null
      set((s) => ({
        pendingChanges: [...s.pendingChanges, patch],
        redoStack: s.redoStack.slice(0, -1),
        isDirty: true,
      }))
      return patch
    },

    canUndo: () => get().pendingChanges.length > 0,
    canRedo: () => get().redoStack.length > 0,

    clearPatches: () => set({ pendingChanges: [], redoStack: [], isDirty: false }),

    save: async () => {
      const { pendingChanges } = get()
      if (pendingChanges.length === 0) return
      set({ saving: true })
      try {
        await scenarioGanttApi.patchOutput(scenarioId, pendingChanges)
        set({ pendingChanges: [], redoStack: [], isDirty: false })
        await get().reloadData(scenarioId, activeVersions.get(scenarioId))
        // Patch bumps roster_version and kicks ensureLegality; apply the COMPUTING/READY
        // response now so Alert Center does not keep a pre-save snapshot until WS arrives.
        await refreshScenarioLegality(scenarioId).catch(() => { /* WS push retries */ })
        // Draft preview syncs period Min-GDO into the Live session store; clear those so
        // crew-bell tooltips do not keep days-off(11) after persisted legality says clear.
        useSessionViolationStore.getState().clearSessionViolationsByRuleCodes(['7505', '7507'])
        set({ saving: false })
        notify.success('Scenario adjustments saved')
      } catch (err) {
        set({ saving: false })
        notify.error((err as Error).message)
      }
    },

    setZoom: (pxPerHour) => {
      const { zoomMin, zoomMax } = get()
      const next = Math.max(zoomMin, Math.min(zoomMax, pxPerHour))
      set((s) => ({ pxPerHour: next, scrollX: clampScrollXFor({ ...s, pxPerHour: next }, s.scrollX) }))
    },

    zoomIn: (viewportWidth: number) => {
      const { pxPerHour, scrollX, zoomMax } = get()
      const next = Math.min(zoomMax, pxPerHour * ZOOM_STEP)
      const ratio = next / pxPerHour
      const viewCenter = scrollX + viewportWidth / 2
      const newScrollX = clampScrollXFor({ ...get(), pxPerHour: next, viewportWidth }, viewCenter * ratio - viewportWidth / 2)
      set({ pxPerHour: next, scrollX: newScrollX })
    },

    zoomOut: (viewportWidth: number) => {
      const { pxPerHour, scrollX, zoomMin } = get()
      let next = pxPerHour / ZOOM_STEP
      if (next < zoomMin * 1.05) next = zoomMin
      if (next <= zoomMin * 1.01) {
        set((s) => ({ pxPerHour: next, scrollX: minScrollXFor(s) }))
      } else {
        const ratio = next / pxPerHour
        const viewCenter = scrollX + viewportWidth / 2
        const newScrollX = clampScrollXFor({ ...get(), pxPerHour: next, viewportWidth }, viewCenter * ratio - viewportWidth / 2)
        set({ pxPerHour: next, scrollX: newScrollX })
      }
    },

    setScrollX: (x) => set((s) => ({ scrollX: clampScrollXFor(s, x) })),
    setScrollWindow: (startX, endX) => {
      set((s) => {
        const next = {
          ...s,
          scrollWindowStartX: Math.max(0, startX),
          scrollWindowEndX: endX == null ? null : Math.max(Math.max(0, startX), endX),
        }
        return {
          scrollWindowStartX: next.scrollWindowStartX,
          scrollWindowEndX: next.scrollWindowEndX,
          scrollX: clampScrollXFor(next, s.scrollX),
        }
      })
    },
    clearScrollWindow: () => {
      set((s) => ({
        scrollWindowStartX: 0,
        scrollWindowEndX: null,
        scrollX: clampScrollXFor({ ...s, scrollWindowStartX: 0, scrollWindowEndX: null }, s.scrollX),
      }))
    },
    setViewportWidth: (width) => {
      const w = Math.max(0, width)
      set((s) => ({
        viewportWidth: w,
        scrollX: clampScrollXFor({ ...s, viewportWidth: w }, s.scrollX),
      }))
    },
    setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(120, Math.min(400, w)) }),

    setZoomBounds: (min, max) => {
      const { pxPerHour, zoomMin: oldMin, zoomMax: oldMax } = get()
      const isFirstCall = oldMin === 2 && oldMax === 200
      const atMin = pxPerHour <= oldMin * 1.01
      const shouldSnap = isFirstCall ? false : atMin
      const clamped = shouldSnap ? min : Math.max(min, Math.min(max, pxPerHour))
      set((s) => ({
        zoomMin: min,
        zoomMax: max,
        pxPerHour: clamped,
        scrollX: clampScrollXFor({ ...s, pxPerHour: clamped }, s.scrollX),
      }))
    },

    markDirty: () => set((s) => ({ renderRevision: s.renderRevision + 1 })),

    zoomToMonth: (year, month, rangeStart, viewportWidth) => {
      const { zoomMin, zoomMax, leftPanelWidth, data } = get()
      const tz = useTimezoneStore.getState().timezone
      const pad2 = (n: number): string => String(n).padStart(2, '0')
      // Use timezone-aware month boundaries — matches live gantt behavior
      const monthStart = calendarDateToUtcMidnight(`${year}-${pad2(month + 1)}-01`, tz)
      const nextFirst = month === 11 ? `${year + 1}-01-01` : `${year}-${pad2(month + 2)}-01`
      const monthEnd = calendarDateToUtcMidnight(nextFirst, tz)
      const anchorMs = monthStart.getTime() + MONTH_VIEWPORT_ANCHOR_BIAS_MS
      const hours = Math.max(1, (monthEnd.getTime() - anchorMs) / 3_600_000)
      const width = Math.max(1, viewportWidth ?? window.innerWidth - leftPanelWidth - 14)
      const newPxPerHour = Math.max(zoomMin, Math.min(zoomMax, width / hours))
      const offsetMs = Math.max(0, anchorMs - rangeStart.getTime())
      const windowStartX = (offsetMs / 3_600_000) * newPxPerHour
      const windowEndX = windowStartX + hours * newPxPerHour
      const newScrollX = clampScrollXFor({
        ...get(),
        pxPerHour: newPxPerHour,
        viewportWidth: width,
        scrollWindowStartX: windowStartX,
        scrollWindowEndX: windowEndX,
      }, windowStartX)
      set({ pxPerHour: newPxPerHour, scrollX: newScrollX, scrollWindowStartX: windowStartX, scrollWindowEndX: windowEndX })
    },

    // Zoom to the intersection of the RP and the already-loaded scenario range.
    // The scrollbar continues to represent the complete loaded scenario range.
    zoomToRp: (rpStartMs, rpEndMs, rangeStart, viewportWidth) => {
      const { zoomMin, zoomMax, leftPanelWidth, data } = get()
      const rangeStartMs = rangeStart.getTime()
      const loadedEndMs = data ? new Date(data.endDtLoc).getTime() : rpEndMs
      const visibleStartMs = Math.max(rpStartMs, rangeStartMs)
      const visibleEndMs = Math.min(rpEndMs, loadedEndMs)
      const anchorMs = visibleStartMs
      const hours = Math.max(1, (visibleEndMs - visibleStartMs) / HOUR_MS)
      const width = Math.max(1, viewportWidth ?? window.innerWidth - leftPanelWidth - 14)
      const newPxPerHour = Math.max(zoomMin, Math.min(zoomMax, width / hours))
      const anchorX = Math.max(0, (anchorMs - rangeStartMs) / HOUR_MS) * newPxPerHour
      const loadedHours = Math.max(0, (loadedEndMs - rangeStartMs) / HOUR_MS)
      const scrollWindowStartX = 0
      const scrollWindowEndX = loadedHours > 0 ? loadedHours * newPxPerHour : null
      const newScrollX = clampScrollXFor({
        ...get(),
        pxPerHour: newPxPerHour,
        viewportWidth: width,
        scrollWindowStartX,
        scrollWindowEndX,
      }, anchorX)
      set({ pxPerHour: newPxPerHour, scrollX: newScrollX, scrollWindowStartX, scrollWindowEndX })
    },
  }))
}

const registry = new Map<string, ReturnType<typeof createStore>>()
const activeVersions = new Map<number, string | undefined>()

const storeKey = (scenarioId: number, version?: string): string =>
  `${scenarioId}@${version ?? 'current'}`

export function setActiveScenarioGanttVersion(scenarioId: number, version?: string): void {
  activeVersions.set(scenarioId, version)
}

export function getActiveScenarioGanttVersion(scenarioId: number): string | undefined {
  return activeVersions.get(scenarioId)
}

export function getScenarioGanttStore(scenarioId: number, version?: string) {
  const resolvedVersion = version ?? activeVersions.get(scenarioId)
  const key = storeKey(scenarioId, resolvedVersion)
  if (!registry.has(key)) {
    registry.set(key, createStore(scenarioId))
  }
  return registry.get(key)!
}

export function destroyScenarioGanttStore(scenarioId: number, version?: string): void {
  const resolvedVersion = version ?? activeVersions.get(scenarioId)
  registry.delete(storeKey(scenarioId, resolvedVersion))
  if (version === undefined) activeVersions.delete(scenarioId)
}
