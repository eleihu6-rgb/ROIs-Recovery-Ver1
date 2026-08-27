// gantt/src/stores/scenario-store.ts
import { create } from 'zustand'
import { scenarioApi } from '@/services/scenario-api'
import { notify } from '@/utils/notify'
import type {
  ScenarioItem,
  ScenarioDetail,
  ScenarioResults,
  ScenarioRunProgress,
  ScenarioListQuery,
  ScenarioStatus,
  ScenarioType,
  CreateScenarioInput,
  UpdateScenarioInput,
  RosterAssignment,
} from '@/types'

interface ScenarioStore {
  // List state
  items: ScenarioItem[]
  total: number
  page: number
  pageSize: number
  searchTerm: string
  filterType: ScenarioType | ''
  filterStatus: ScenarioStatus | ''
  listLoading: boolean

  // Detail state
  selectedId: number | null
  detail: ScenarioDetail | null
  results: ScenarioResults
  progress: ScenarioRunProgress | null
  draftDetail: Partial<ScenarioDetail> | null  // pending edits
  isDirty: boolean
  detailLoading: boolean
  saving: boolean

  // Actions — list
  setSearch: (term: string) => void
  setFilterType: (type: ScenarioType | '') => void
  setFilterStatus: (status: ScenarioStatus | '') => void
  setPage: (page: number) => void
  fetchList: () => Promise<void>

  // Actions — detail
  selectScenario: (id: number) => Promise<void>
  refreshDetail: (id: number) => Promise<void>
  clearSelection: () => void
  patchDraft: (patch: Partial<ScenarioDetail>) => void
  saveDetail: () => Promise<void>
  createNew: (data: CreateScenarioInput) => Promise<void>
  renameScenario: (id: number, name: string) => Promise<void>
  removeScenario: (id: number) => Promise<void>
  transitionStatus: (id: number, status: ScenarioStatus, options?: { deleteVersionFiles?: boolean }) => Promise<void>

  // Optimization run + roster read-back + publish
  // runningId: id of the scenario whose poll is currently in-flight; null = idle.
  // This allows per-scenario tracking so navigation away/back works correctly.
  runningId: number | null
  roster: RosterAssignment[] | null
  rosterLoading: boolean
  publishing: boolean
  // Duplicate
  focusNameField: boolean
  duplicateScenario: (id: number) => Promise<void>
  clearFocusNameField: () => void
  runScenario: (id: number) => Promise<void>
  isRunning: (id: number) => boolean
  openScenarioRoster: (id: number) => Promise<void>
  loadRoster: (id: number) => Promise<void>
  publishRoster: (id: number, rosterIds: number[]) => Promise<number>
}

/**
 * Keep the sidebar list dot in sync with a scenario's live status. The list[]
 * row is the SOLE source for the status-dot colour, so any locally-known status
 * change (run start, poll tick, kill / remove) must patch it here — otherwise the
 * dot stays on the old colour for the whole run and only catches up on the next
 * full fetchList (i.e. after the run already ended).
 */
function patchListItemStatus(
  id: number,
  status: ScenarioStatus,
  get: () => ScenarioStore,
  set: (p: Partial<ScenarioStore>) => void,
): void {
  const { items } = get()
  const idx = items.findIndex((it) => it.id === id)
  if (idx === -1 || items[idx].status === status) return
  const next = items.slice()
  next[idx] = { ...next[idx], status }
  set({ items: next })
}

/** Poll scenario status until it leaves RUNNING (DONE/FAILED), capped ~10 min. */
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 200
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function pollUntilDone(
  id: number,
  get: () => ScenarioStore,
  set: (p: Partial<ScenarioStore>) => void,
): Promise<void> {
  let finished = false
  try {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS)
      // Stop if another scenario has taken over as the active poll (e.g. user navigated away
      // and that scenario also started optimizing), or if no poll should be running at all.
      if (get().runningId !== id) return
      let detail
      try {
        detail = await scenarioApi.getById(id)
      } catch {
        // Transient network error — skip this cycle and retry on the next tick.
        continue
      }
      try {
        const progress = await scenarioApi.getProgress(id)
        if (get().selectedId === id) set({ progress })
      } catch {
        // Keep the last good progress frame during transient engine failures.
      }
      if (get().selectedId === id) set({ detail, draftDetail: { ...detail } })
      // Track the dot live even if the user has navigated to a different scenario.
      patchListItemStatus(id, detail.status, get, set)
      if (detail.status === 'DONE') {
        notify.success('Optimization complete — result ready')
        finished = true
        break
      }
      if (detail.status === 'FAILED') {
        notify.error('Optimization failed — check engine-server logs')
        finished = true
        break
      }
    }
    if (!finished) notify.warning('Optimization timed out — check engine-server status')
  } finally {
    // Only clear runningId if WE are still the registered poll (prevents a newer
    // poll from being cancelled by an older one that exited late).
    if (get().runningId === id) {
      set({ runningId: null })
      // Always refresh list and detail on poll exit to prevent stuck RUNNING state.
      get().fetchList()
      if (get().selectedId === id) {
        Promise.all([
          scenarioApi.getById(id),
          scenarioApi.getResults(id).catch(() => ({ kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null })),
          scenarioApi.getProgress(id).catch(() => null),
        ])
          .then(([detail, results, progress]) => {
            if (get().selectedId === id) set({ detail, draftDetail: { ...detail }, results, progress })
          })
          .catch(() => {/* ignore — list was already refreshed */})
      }
    }
  }
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  searchTerm: '',
  filterType: '',
  filterStatus: '',
  listLoading: false,

  selectedId: null,
  detail: null,
  results: { kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null },
  progress: null,
  draftDetail: null,
  isDirty: false,
  detailLoading: false,
  saving: false,

  runningId: null,
  roster: null,
  rosterLoading: false,
  publishing: false,
  focusNameField: false,

  setSearch: (term) => {
    set({ searchTerm: term, page: 1 })
    get().fetchList()
  },

  setFilterType: (type) => {
    set({ filterType: type, page: 1 })
    get().fetchList()
  },

  setFilterStatus: (status) => {
    set({ filterStatus: status, page: 1 })
    get().fetchList()
  },

  setPage: (page) => {
    set({ page })
    get().fetchList()
  },

  fetchList: async () => {
    const { page, pageSize, searchTerm, filterType, filterStatus } = get()
    set({ listLoading: true })
    try {
      const query: ScenarioListQuery = { page, pageSize }
      if (searchTerm) query.search = searchTerm
      if (filterType) query.fileType = filterType
      if (filterStatus) query.status = filterStatus
      const res = await scenarioApi.list(query)
      set({ items: res.items, total: res.total, listLoading: false })
    } catch {
      set({ listLoading: false })
    }
  },

  selectScenario: async (id) => {
    const current = get()
    // Allow re-selection when the current status is RUNNING so the user can force-refresh
    // a scenario that is stuck in running state (e.g. poll missed the DONE transition).
    if (current.selectedId === id && current.detail?.status !== 'RUNNING') return
    set({
      selectedId: id,
      detailLoading: true,
      detail: null,
      results: { kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null },
      progress: null,
      draftDetail: null,
      isDirty: false,
    })
    try {
      const [detail, results, progress] = await Promise.all([
        scenarioApi.getById(id),
        scenarioApi.getResults(id).catch(() => ({ kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null })),
        scenarioApi.getProgress(id).catch(() => null),
      ])
      set({ detail, draftDetail: { ...detail }, results, progress, detailLoading: false })
      // Resume polling if scenario is already RUNNING (e.g. after page reload or navigation).
      if (detail.status === 'RUNNING') {
        if (get().runningId !== id) {
          // No active poll for this scenario — start one.
          set({ runningId: id })
          pollUntilDone(id, get, set)
        }
      } else {
        // Non-running scenario: clear any stale runningId from a previous poll
        // (e.g. user navigated away during a run and the poll exited without clearing).
        if (get().runningId === id) set({ runningId: null })
      }
    } catch {
      set({ detailLoading: false })
    }
  },

  refreshDetail: async (id) => {
    try {
      const [detail, results, progress] = await Promise.all([
        scenarioApi.getById(id),
        scenarioApi.getResults(id).catch(() => ({ kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null })),
        scenarioApi.getProgress(id).catch(() => null),
      ])
      if (get().selectedId !== id) return
      set({ detail, draftDetail: { ...detail }, results, progress })
      if (detail.status !== 'RUNNING' && get().runningId === id) set({ runningId: null })
    } catch { /* ignore */ }
  },

  clearSelection: () => {
    set({
      selectedId: null,
      detail: null,
      results: { kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null },
      progress: null,
      draftDetail: null,
      isDirty: false,
    })
  },

  patchDraft: (patch) => {
    const draft = get().draftDetail
    if (!draft) return
    set({ draftDetail: { ...draft, ...patch }, isDirty: true })
  },

  saveDetail: async () => {
    const { selectedId, draftDetail, detail } = get()
    if (!selectedId || !draftDetail || !detail) return
    set({ saving: true })
    try {
      const updateData: UpdateScenarioInput = {
        name: draftDetail.name,
        division: draftDetail.division ?? null,
        strDtLoc: draftDetail.strDtLoc,
        endDtLoc: draftDetail.endDtLoc,
        leadinLive: 1,
        worksetId: draftDetail.worksetId ?? null,
        rulesetId: draftDetail.rulesetId ?? null,
        pairingScenarioId: draftDetail.pairingScenarioId ?? null,
        filterParams: draftDetail.filterParams ?? null,
        comments: draftDetail.comments ?? null,
        algorithmParameters: draftDetail.algorithmParameters,
      }
      const updated = await scenarioApi.update(selectedId, updateData)
      // Normalize the PUT response before storing it:
      // 1. strDtLoc / endDtLoc come back as ISO datetime strings (e.g.
      //    "2026-06-01T00:00:00.000Z") from Drizzle's timestamp columns —
      //    slice to YYYY-MM-DD so the store stays consistent with date-picker
      //    values and what the type comments promise.
      // 2. Raw .returning() omits updatedByName (JOIN-only field in the list
      //    query) — preserve the current value so the detail panel doesn't
      //    silently lose the display name on save.
      const saved: ScenarioDetail = {
        ...updated,
        strDtLoc: updated.strDtLoc.slice(0, 10),
        endDtLoc: updated.endDtLoc.slice(0, 10),
        updatedByName: updated.updatedByName ?? detail.updatedByName,
      }
      set({ detail: saved, draftDetail: { ...saved }, isDirty: false, saving: false })
      notify.success('Scenario saved')
      get().fetchList()
    } catch (err) {
      set({ saving: false })
      notify.error(err instanceof Error ? err.message : 'Failed to save scenario')
    }
  },

  createNew: async (data) => {
    set({ saving: true })
    try {
      const created = await scenarioApi.create(data)
      await get().fetchList()
      await get().selectScenario(created.id)
    } finally {
      set({ saving: false })
    }
  },

  renameScenario: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set({ saving: true })
    try {
      const updated = await scenarioApi.update(id, { name: trimmed })
      // Keep the open detail panel in sync if the renamed scenario is selected.
      if (get().selectedId === id) {
        set({ detail: updated, draftDetail: { ...updated }, isDirty: false })
      }
      await get().fetchList()
      notify.success('Scenario renamed')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to rename scenario')
    } finally {
      set({ saving: false })
    }
  },

  removeScenario: async (id) => {
    set({ saving: true })
    try {
      await scenarioApi.remove(id)
      if (get().selectedId === id) get().clearSelection()
      await get().fetchList()
    } finally {
      set({ saving: false })
    }
  },

  transitionStatus: async (id, status, options) => {
    set({ saving: true })
    try {
      const updated = await scenarioApi.transition(id, status, options)
      // Sync the sidebar dot immediately (Kill → FAILED, Remove → DRAFT) rather than
      // waiting for the fetchList round-trip below.
      patchListItemStatus(id, updated.status, get, set)
      if (get().selectedId === id) {
        const draft = get().draftDetail
        // A status transition only changes server-owned state (status, result
        // counters, modifier). Keep the user's pending field edits and refresh the
        // server-owned fields into the draft, so "Remove result" doesn't discard
        // unsaved edits while the panel still reflects the new status/count.
        set({
          detail: updated,
          draftDetail: draft
            ? {
                ...updated,
                name: draft.name,
                division: draft.division,
                strDtLoc: draft.strDtLoc,
                endDtLoc: draft.endDtLoc,
                leadinLive: draft.leadinLive,
                rulesetId: draft.rulesetId,
                pairingScenarioId: draft.pairingScenarioId,
                filterParams: draft.filterParams,
                comments: draft.comments,
                algorithmParameters: draft.algorithmParameters,
              }
            : { ...updated },
          saving: false,
        })
      } else {
        set({ saving: false })
      }
      if (status === 'DRAFT') notify.success('Optimization result removed')
      get().fetchList()
    } catch (err) {
      set({ saving: false })
      notify.error(err instanceof Error ? err.message : 'Operation failed')
    }
  },

  runScenario: async (id) => {
    set({
      runningId: id,
      roster: null,
      progress: {
        scenarioId: id,
        taskId: null,
        status: 'RUNNING',
        phase: 'starting',
        percent: 0,
        stageLabel: 'Starting optimization',
        detail: null,
        stageIndex: null,
        stageTotal: null,
        stepIndex: null,
        stepTotal: null,
        elapsedSec: null,
        progressAgeSec: null,
        error: null,
      },
    })
    // The live-server start request may spend minutes building ro_input before
    // it returns a task id. Reflect RUNNING immediately so the progress panel
    // can show the starting/input phases during that hand-off.
    const current = get().detail
    const prevStatus = current?.status ?? 'DRAFT'
    if (get().selectedId === id && current) {
      const asRunning = { ...current, status: 'RUNNING' as const }
      set({ detail: asRunning, draftDetail: { ...asRunning } })
    }
    patchListItemStatus(id, 'RUNNING', get, set)
    const pollPromise = pollUntilDone(id, get, set)
    try {
      await scenarioApi.run(id)
      scenarioApi.getProgress(id).then((progress) => {
        if (get().selectedId === id) set({ progress })
      }).catch(() => {/* poll will retry */})
      notify.success('Optimization started successfully')
      await pollPromise
    } catch (err) {
      // The start request itself failed (e.g. no crew matched the scenario scope, or the
      // roster period is not configured). The scenario never reached RUNNING, so undo the
      // optimistic RUNNING state now and surface the real error immediately — instead of
      // spinning the progress panel through the whole ~10 min poll window. Clearing
      // runningId also makes the poll exit on its next tick, so the await below resolves fast.
      if (get().runningId === id) set({ runningId: null })
      notify.error(err instanceof Error ? err.message : 'Failed to start optimization')
      // Restore the true server state: the start failed before RUNNING (server keeps the
      // prior status) or right after it (server marks FAILED). Re-fetch rather than guess.
      scenarioApi
        .getById(id)
        .then((fresh) => {
          if (get().selectedId === id) set({ detail: fresh, draftDetail: { ...fresh } })
          patchListItemStatus(id, fresh.status, get, set)
        })
        .catch(() => {
          const cur = get().detail
          if (get().selectedId === id && cur) {
            const restored = { ...cur, status: prevStatus }
            set({ detail: restored, draftDetail: { ...restored } })
          }
          patchListItemStatus(id, prevStatus, get, set)
        })
      await pollPromise.catch(() => {/* the original start error is more useful */})
    }
  },

  isRunning: (id) => get().runningId === id,

  openScenarioRoster: async (id) => {
    const { assignments } = await scenarioApi.getRoster(id)
    set({ roster: assignments })
  },

  loadRoster: async (id) => {
    set({ rosterLoading: true, roster: null })
    try {
      const { assignments } = await scenarioApi.getRoster(id)
      set({ roster: assignments, rosterLoading: false })
    } catch (err) {
      set({ rosterLoading: false })
      notify.error(err instanceof Error ? err.message : 'Failed to load roster')
    }
  },

  publishRoster: async (id, rosterIds) => {
    set({ publishing: true })
    try {
      const result = await scenarioApi.publishRoster(id, rosterIds)
      // Transition scenario to PUBLISHED
      const updated = await scenarioApi.transition(id, 'PUBLISHED')
      if (get().selectedId === id) {
        set({ detail: updated, draftDetail: { ...updated }, isDirty: false })
      }
      const publishedIds = new Set(rosterIds)
      const currentRoster = get().roster
      if (currentRoster) {
        set({
          roster: currentRoster.map((assignment) => (
            assignment.rosterIds.some((rosterId) => publishedIds.has(rosterId))
              ? { ...assignment, status: 'PUBLISHED', published: true, publishable: false }
              : assignment
          )),
        })
      }
      get().fetchList()
      notify.success(`Imported ${result.published} assignment(s) to Live roster`)
      set({ publishing: false })
      return result.published
    } catch (err) {
      set({ publishing: false })
      notify.error(err instanceof Error ? err.message : 'Failed to import roster to Live')
      throw err
    }
  },

  duplicateScenario: async (id) => {
    set({ saving: true })
    try {
      const created = await scenarioApi.duplicate(id)
      // Select the copy FIRST so the original immediately loses its highlight
      // and the detail panel starts loading the copy's data. fetchList runs
      // after so the copy appears in the list already highlighted.
      await get().selectScenario(created.id)
      set({ focusNameField: true })
      await get().fetchList()
      notify.success('Scenario duplicated')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to duplicate scenario')
    } finally {
      set({ saving: false })
    }
  },

  clearFocusNameField: () => set({ focusNameField: false }),
}))
