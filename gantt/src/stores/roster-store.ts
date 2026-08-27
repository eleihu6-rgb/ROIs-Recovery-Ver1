import { create } from 'zustand'
import { rosterApi } from '@/services/roster-api'
import { legalityPreviewApi } from '@/services/legality-preview-api'
import type { DraftLegalityPreviewResponse } from '@/services/legality-preview-api'
import type { ViolationItem } from '@/services/rule-session-api'
import { useRuleCheckStore } from './rule-check-store'
import { useGanttViewStore } from './gantt-view-store'
import { useHistoryStore } from './history-store'
import { useDraftStore } from './draft-store'
import { setDraftPromoteBaseCallback, setDraftRecomputeCallback } from './draft-roster-recompute'
import { useLockStore } from './lock-store'
import { usePairingStore } from './pairing-store'
import { usePaneStore } from './pane-store'
import { useSessionViolationStore } from './session-violation-store'
import { notify } from '@/utils/notify'
import type { RosterItem, CreateRosterInput, CreateGroundTaskInput, UpdateRosterInput, Crew, DateRange } from '@/types'

export interface RosterPaneState {
  crewList: Crew[]
  /** Base items from server (unmodified by draft ops) */
  baseItems: RosterItem[]
  /** Displayed items = baseItems + draft ops applied */
  rosterItems: RosterItem[]
  sortField: string
  sortDirection: 'asc' | 'desc'
  loading: boolean
  /** Real load progress 0-100; null = not loading (drives PaneLoadingBar). */
  progress: number | null
}

const createEmptyPaneState = (): RosterPaneState => ({
  crewList: [],
  baseItems: [],
  rosterItems: [],
  sortField: 'crewId',
  sortDirection: 'asc',
  loading: false,
  progress: null,
})

type PaneId = 'main' | 'sub'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Push period Min-GDO preview hits into the session layer so crew bell / Alert Center light before Save. */
const syncPeriodGdoSessionViolations = (
  violations: DraftLegalityPreviewResponse['violations'],
): void => {
  const byKey = new Map<string, ViolationItem[]>()
  for (const v of violations) {
    if ((v.ruleCode !== '7505' && v.ruleCode !== '7507') || v.pairingId == null) continue
    const key = `${v.crewId}:${v.pairingId}`
    const list = byKey.get(key) ?? []
    list.push({
      ruleCode: v.ruleCode,
      ruleInstance: v.ruleInstance,
      ruleName: v.ruleInstance ? `${v.ruleCode}/${v.ruleInstance}` : v.ruleCode,
      passed: false,
      severity: v.severity,
      actualValue: 0,
      limitValue: 0,
      unit: '',
      message: v.message,
      startDt: v.startDt,
      endDt: v.endDt,
      windowStartDt: v.startDt,
      windowEndDt: v.endDt,
    })
    byKey.set(key, list)
  }
  const store = useSessionViolationStore.getState()
  for (const [key, items] of byKey) {
    const [crewId, pairingIdRaw] = key.split(':')
    store.setSessionViolations(crewId, Number(pairingIdRaw), items)
  }
}

/**
 * P1-4: roster 加载序号 + 取消控制器，防止过期响应覆盖新状态。
 * 每次 fetchRoster 自增 seq 并 abort 上一个在飞请求；await 后若 seq 已变化则丢弃该响应。
 * appendRoster（后台续传）捕获当前 seq，被新加载取代时同样丢弃。
 */
let rosterLoadSeq = 0
let rosterAbort: AbortController | null = null

/** axios/fetch 取消错误判定（被 AbortController abort）。 */
const isAbort = (err: unknown): boolean => {
  const e = err as { name?: string; code?: string } | null
  return e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED'
}

/** Flag to skip rule pre-check during undo/redo */
let _skipPreCheck = false

/** Temp negative ID counter for draft-mode add operations */
let _tempId = 0

const rulePreCheck = async (
  affectedCrewIds: string[],
  currentItems: RosterItem[],
  simulatedItems: RosterItem[],
): Promise<boolean> => {
  if (_skipPreCheck) return true
  const store = useRuleCheckStore.getState()
  const result = await store.preCheck(affectedCrewIds, simulatedItems, currentItems)
  // Only show dialog when at least one violation is newly introduced by this operation
  const hasNewViolations = result.violations.some((v) => v.isNew)
  if (!hasNewViolations) return true
  return store.showConfirmDialog(result.violations, result.hasBlocking)
}

/** Expand affected crew set with simulated pairing-mates on related pairings (draft COF). */
export const expandAffectedWithPairingMates = (
  affectedCrewIds: string[],
  simulatedItems: RosterItem[],
  relatedPairingIds: Iterable<number>,
): string[] => {
  const pairingIds = new Set(
    [...relatedPairingIds].filter((id) => Number.isFinite(id) && id > 0),
  )
  if (pairingIds.size === 0) return [...new Set(affectedCrewIds.map(String))]
  const expanded = new Set(affectedCrewIds.map(String))
  for (const item of simulatedItems) {
    if (item.pairingId != null && pairingIds.has(item.pairingId) && item.crewId) {
      expanded.add(String(item.crewId))
    }
  }
  return [...expanded]
}

/** Expand affected crews with draft mates sharing the same physical fltId (8030 COF).
 *  When focusPairingIds is non-empty, seed fltIds only from items on those pairings
 *  (not from mates' full-period duties). Empty/omitted focus keeps legacy seeding. */
export const expandAffectedWithFlightMates = (
  affectedCrewIds: string[],
  simulatedItems: RosterItem[],
  focusPairingIds?: Iterable<number>,
): string[] => {
  const expanded = new Set(affectedCrewIds.map(String))
  const focus = new Set(
    [...(focusPairingIds ?? [])].filter((id) => Number.isFinite(id) && id > 0),
  )
  const seedFltIds = new Set<number>()
  for (const item of simulatedItems) {
    const fltId = item.fltId == null ? null : Number(item.fltId)
    if (fltId == null || !Number.isFinite(fltId) || fltId <= 0) continue
    if (focus.size > 0) {
      if (item.pairingId != null && focus.has(item.pairingId)) seedFltIds.add(fltId)
      continue
    }
    if (expanded.has(String(item.crewId))) seedFltIds.add(fltId)
  }
  if (seedFltIds.size === 0) return [...expanded]
  for (const item of simulatedItems) {
    const fltId = item.fltId == null ? null : Number(item.fltId)
    if (fltId != null && seedFltIds.has(fltId) && item.crewId) {
      expanded.add(String(item.crewId))
    }
  }
  return [...expanded]
}

/** Chronological prev/next FLY pairing ids for draft spacing relatedness (7504/8056). */
export const expandRelatedWithNeighborFlyPairings = (
  relatedPairingIds: Iterable<number>,
  afterItems: RosterItem[],
): Set<number> => {
  const seed = new Set(
    [...relatedPairingIds].filter((id) => Number.isFinite(id) && id > 0),
  )
  const out = new Set(seed)
  if (seed.size === 0) return out

  const crews = new Set<string>()
  for (const item of afterItems) {
    if (item.pairingId != null && seed.has(item.pairingId) && item.crewId) {
      crews.add(String(item.crewId))
    }
  }

  for (const crewId of crews) {
    const earliestByPairing = new Map<number, number>()
    for (const item of afterItems) {
      if (String(item.crewId) !== crewId) continue
      if (item.assignmentGroup !== 'FLY' || item.pairingId == null) continue
      const t = item.schStrDtUtc ? new Date(item.schStrDtUtc).getTime() : NaN
      if (!Number.isFinite(t)) continue
      const prev = earliestByPairing.get(item.pairingId)
      if (prev == null || t < prev) earliestByPairing.set(item.pairingId, t)
    }
    const ordered = [...earliestByPairing.entries()]
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .map(([id]) => id)
    for (let i = 0; i < ordered.length; i++) {
      if (!seed.has(ordered[i])) continue
      if (i > 0) out.add(ordered[i - 1])
      if (i + 1 < ordered.length) out.add(ordered[i + 1])
    }
  }
  return out
}

export const checkLiveDraftLegality = async (
  affectedCrewIds: string[],
  currentItems: RosterItem[],
  simulatedItems: RosterItem[],
  options?: {
    relatedItems?: RosterItem[]
    relatedPairingIds?: number[]
    /** Draft preview context; defaults to live. Scenario assign/remove/reassign pass 'scenario'. */
    contextType?: 'live' | 'scenario'
    scenarioId?: number
  },
): Promise<boolean> => {
  if (_skipPreCheck) return true
  try {
    const contextType = options?.contextType ?? 'live'
    const relatedPairingIds = new Set([
      ...(options?.relatedPairingIds ?? []),
      ...(options?.relatedItems ?? [])
        .map((item) => item.pairingId)
        .filter((id): id is number => id != null),
    ])
    const focusPairingIds = [...relatedPairingIds]
      .filter((id) => Number.isFinite(id) && id > 0)
    const primaryCrewIds = new Set(affectedCrewIds.map(String))
    const previewCrewIds = expandAffectedWithFlightMates(
      expandAffectedWithPairingMates(
        affectedCrewIds,
        simulatedItems,
        relatedPairingIds,
      ),
      simulatedItems,
      focusPairingIds,
    )
    const affected = new Set(previewCrewIds)
    const beforeItems = currentItems.filter((item) => affected.has(item.crewId))
    const afterItems = simulatedItems.filter((item) => affected.has(item.crewId))
    const spacingRelatedPairingIds = expandRelatedWithNeighborFlyPairings(
      relatedPairingIds,
      afterItems,
    )
    const spacingRelatedRules = new Set(['7504', '8056'])
    const draftContext = {
      contextType,
      ...(contextType === 'scenario' && options?.scenarioId != null
        ? { scenarioId: options.scenarioId }
        : {}),
    } as const
    // Fast path: run only the after-state preview first. A legal drop (zero violations) is
    // done in a single checkDraft — the before-state baseline, needed only to diff violations
    // NEWLY introduced by this edit, is deferred until the after-state actually shows hits.
    const afterResult = await legalityPreviewApi.checkDraft({
      ...draftContext,
      affectedCrewIds: previewCrewIds,
      afterItems,
      focusPairingIds,
    })
    if (afterResult.violations.length === 0) return true

    // Light crew bell / Alert Center immediately from draft preview (7505 is crew-bell-only).
    syncPeriodGdoSessionViolations(afterResult.violations)

    // Fresh assign/add onto a pairing the before-roster does not already carry: every
    // after-hit on that focus pairing is new — skip the second preview round-trip.
    const beforeHasFocusedPairing = focusPairingIds.some((pid) =>
      beforeItems.some((item) => item.pairingId === pid),
    )
    const skipBeforeBaseline =
      beforeItems.length === 0
      || (focusPairingIds.length > 0 && !beforeHasFocusedPairing)
    const beforeResult = skipBeforeBaseline
      ? { allowed: true, violations: [] as DraftLegalityPreviewResponse['violations'] }
      : await legalityPreviewApi.checkDraft({
          ...draftContext,
          affectedCrewIds: previewCrewIds,
          afterItems: beforeItems,
          focusPairingIds,
        })

    const relatedWindows = (options?.relatedItems ?? [])
      .map((item) => ({
        start: item.schStrDtUtc ? new Date(item.schStrDtUtc).getTime() : null,
        end: item.schEndDtUtc ? new Date(item.schEndDtUtc).getTime() : null,
      }))
      .filter((w): w is { start: number; end: number } =>
        w.start != null && w.end != null && Number.isFinite(w.start) && Number.isFinite(w.end))

    const violationKey = (v: typeof afterResult.violations[number]): string =>
      `${v.crewId}|${v.pairingId ?? ''}|${v.dutySeq ?? ''}|${v.ruleCode}|${v.ruleInstance}|${v.scopeKey}|${v.message}`
    const beforeKeys = new Set(beforeResult.violations.map(violationKey))
    const overlapsRelatedWindow = (startDt: string | null, endDt: string | null): boolean => {
      // No duty windows from the edit → do not treat every violation as related.
      if (relatedWindows.length === 0 || !startDt || !endDt) return false
      const start = new Date(startDt).getTime()
      const end = new Date(endDt).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false
      return relatedWindows.some((w) => start < w.end && end > w.start)
    }
    const isRelated = (v: typeof afterResult.violations[number]): boolean => {
      // Period Min-GDO anchors on an RP pairing, not necessarily the edited one.
      // Only warn for crews this edit actually moved/assigned/removed — not pairing mates.
      if (v.ruleCode === '7505' || v.ruleCode === '7507') {
        return primaryCrewIds.has(String(v.crewId))
      }
      // Spacing anchored on a ground duty (kernel pairing_id 0 / null): FLY-neighbor
      // expansion cannot see it. Related iff this edit's primary crew.
      if (spacingRelatedRules.has(v.ruleCode) && (v.pairingId == null || v.pairingId === 0)) {
        return primaryCrewIds.has(String(v.crewId))
      }
      if (relatedPairingIds.size === 0 && relatedWindows.length === 0) return true
      const pairingSet = spacingRelatedRules.has(v.ruleCode)
        ? spacingRelatedPairingIds
        : relatedPairingIds
      if (v.pairingId != null && pairingSet.has(v.pairingId)) return true
      // 8071 Unit=RP windows span the whole roster period — time-overlap would mark every
      // period property hit as "related" to any assign in that RP. Require pairing match.
      if (v.ruleCode === '8071') return false
      return overlapsRelatedWindow(v.startDt, v.endDt)
    }

    const relevantNewViolations = afterResult.violations.filter((v) => {
      // Period Min-GDO: always surface when present after the edit. beforeKeys would hide
      // them when the crew was already under Min DO (common for 7505), so assign never warned.
      if (v.ruleCode === '7505' || v.ruleCode === '7507') return isRelated(v)
      return !beforeKeys.has(violationKey(v)) && isRelated(v)
    })
    if (relevantNewViolations.length === 0) return true

    const ruleViolations = legalityPreviewApi.toRuleViolations(relevantNewViolations)
    const hasBlocking = ruleViolations.some((v) => !v.canOverride)
    const proceed = await useRuleCheckStore.getState().showConfirmDialog(ruleViolations, hasBlocking)
    return !hasBlocking && proceed
  } catch (err) {
    notify.error(`Legality preview failed: ${(err as Error).message}`)
    return false
  }
}

const pushHistory = (
  type: 'move' | 'swap' | 'add' | 'remove' | 'update',
  description: string,
  undoFn: () => Promise<void>,
  redoFn: () => Promise<void>,
) => {
  useHistoryStore.getState().push({
    id: `${type}-${Date.now()}`,
    type,
    timestamp: Date.now(),
    description,
    undo: async () => {
      _skipPreCheck = true
      try { await undoFn() } finally { _skipPreCheck = false }
    },
    redo: async () => {
      _skipPreCheck = true
      try { await redoFn() } finally { _skipPreCheck = false }
    },
  })
}

interface RosterStore {
  main: RosterPaneState
  sub: RosterPaneState

  fetchRoster: (paneId: PaneId, crewIds: string[], dateRange: DateRange) => Promise<void>
  /** R5: 增量加载——仅拉取新增机组的排班并合并，避免 loadMore 时全量重拉。 */
  appendRoster: (paneId: PaneId, crewIds: string[], dateRange: DateRange) => Promise<void>
  /** 首屏 bootstrap：直接落首屏窗口 roster 到 main（不发 HTTP），并刷新加载序号。 */
  setMainRoster: (items: RosterItem[]) => void
  setCrewList: (paneId: PaneId, crews: Crew[]) => void
  setSort: (paneId: PaneId, field: string, direction: 'asc' | 'desc') => void

  addTask: (paneId: PaneId, task: CreateRosterInput) => Promise<RosterItem | null>
  addGroundTask: (paneId: PaneId, data: CreateGroundTaskInput) => Promise<RosterItem[] | null>
  updateTask: (paneId: PaneId, id: number, data: UpdateRosterInput) => Promise<RosterItem | null>
  removeTask: (paneId: PaneId, id: number) => Promise<void>
  removeTasksByPairingAndCrew: (paneId: PaneId, pairingId: number, crewId: string) => Promise<void>
  swapTasks: (paneId: PaneId, taskIdA: number, taskIdB: number) => Promise<boolean>
  moveTask: (paneId: PaneId, taskId: number, toCrewId: string) => Promise<RosterItem | null>

  patchItems: (paneId: PaneId, items: RosterItem[]) => void
  /** Replace all items for a specific crew (removes old + adds new) */
  replaceCrewItems: (paneId: PaneId, crewId: string, newItems: RosterItem[]) => void
  removeItemLocally: (paneId: PaneId, itemId: number) => void
  /** Recompute displayed draft roster from committed baseItems + current draft ops. */
  recomputeDraftPane: (paneId: PaneId) => void
  clearPane: (paneId: PaneId) => void
}

export const useRosterStore = create<RosterStore>((set, get) => ({
  main: createEmptyPaneState(),
  sub: createEmptyPaneState(),

  fetchRoster: async (paneId, crewIds, dateRange) => {
    if (crewIds.length === 0) {
      set((state) => ({ [paneId]: { ...state[paneId], rosterItems: [], loading: false } }))
      return
    }
    // P1-4: 新一轮加载——自增序号 + 取消上一在飞请求。
    const seq = ++rosterLoadSeq
    rosterAbort?.abort()
    const ac = new AbortController()
    rosterAbort = ac
    set((state) => ({ [paneId]: { ...state[paneId], loading: true } }))
    try {
      const items = await rosterApi.getView(crewIds, formatDate(dateRange.start), formatDate(dateRange.end), ac.signal)
      if (seq !== rosterLoadSeq) return // 被更新的加载取代，丢弃过期响应
      const draftState = useDraftStore.getState()
      const displayed = draftState.active ? draftState.applyDraftOps(items) : items
      set((state) => ({ [paneId]: { ...state[paneId], baseItems: items, rosterItems: displayed, loading: false } }))
      // One-time "found crew to top" is cleared on a full roster refresh.
      usePaneStore.getState().clearFoundCrewIds(paneId === 'main' ? 'roster-main' : 'roster-sub')
    } catch (err) {
      if (isAbort(err)) return // 主动取消，静默忽略
      console.error('[RosterStore] fetch error:', err)
      if (seq === rosterLoadSeq) set((state) => ({ [paneId]: { ...state[paneId], loading: false } }))
    }
  },

  appendRoster: async (paneId, crewIds, dateRange) => {
    if (crewIds.length === 0) return
    // 后台增量合并：不切换主 loading 标志（首屏对象已呈现，append 在后台进行）。
    // P1-4: 绑定当前加载序号/取消信号；被新加载取代时丢弃。
    const seq = rosterLoadSeq
    const signal = rosterAbort?.signal
    try {
      const newItems = await rosterApi.getView(crewIds, formatDate(dateRange.start), formatDate(dateRange.end), signal)
      if (seq !== rosterLoadSeq) return
      set((state) => {
        const existing = state[paneId].baseItems
        const existingIds = new Set(existing.map((i) => i.id))
        const mergedBase = [...existing, ...newItems.filter((i) => !existingIds.has(i.id))]
        const draftState = useDraftStore.getState()
        const displayed = draftState.active ? draftState.applyDraftOps(mergedBase) : mergedBase
        return { [paneId]: { ...state[paneId], baseItems: mergedBase, rosterItems: displayed } }
      })
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      if (isAbort(err)) return
      console.error('[RosterStore] append error:', err)
    }
  },

  setMainRoster: (items) => {
    // bootstrap 首屏窗口直接落库；刷新加载序号 + 重置取消信号，使随后的后台 appendRoster
    // 绑定到这次加载（被新一轮加载取代时按序号丢弃）。
    ++rosterLoadSeq
    rosterAbort?.abort()
    rosterAbort = new AbortController()
    const draftState = useDraftStore.getState()
    const displayed = draftState.active ? draftState.applyDraftOps(items) : items
    set((state) => ({ main: { ...state.main, baseItems: items, rosterItems: displayed, loading: false } }))
  },

  setCrewList: (paneId, crews) => {
    set((state) => ({ [paneId]: { ...state[paneId], crewList: crews } }))
  },

  setSort: (paneId, field, direction) => {
    set((state) => ({ [paneId]: { ...state[paneId], sortField: field, sortDirection: direction } }))
  },

  recomputeDraftPane: (paneId) => {
    const base = get()[paneId].baseItems
    const displayed = useDraftStore.getState().applyDraftOps(base)
    set((state) => ({ [paneId]: { ...state[paneId], rosterItems: displayed } }))
    if (paneId === 'main') {
      usePairingStore.getState().refreshDraftCoverage(base, displayed)
    }
  },

  moveTask: async (paneId, taskId, toCrewId) => {
    const items = get()[paneId].rosterItems
    const task = items.find((i) => i.id === taskId)
    if (!task) return null

    const fromCrewId = task.crewId
    if (fromCrewId === toCrewId) return null

    const draft = useDraftStore.getState()

    // ── Draft mode: optimistic local operation + background legality + try lock (non-blocking) ──
    if (draft.active) {
      const pairingIds = task.pairingId != null ? [task.pairingId] : []
      const beforeItems = items
      // Lock the toolbar BEFORE the optimistic addOp so undo/save stay disabled
      // through the 1-2s legality check (moveTask runs the check AFTER addOp, so
      // preCheck's own setChecking wouldn't cover the gap between addOp and the
      // first network call). showConfirmDialog manages its own flag while open;
      // we clear at the success / revert branches below.
      useRuleCheckStore.getState().setChecking(true)
      // Apply the move optimistically so the drop updates the roster instantly.
      const opId = draft.addOp(
        { type: 'move', taskId, toCrewId },
        [fromCrewId, toCrewId],
        pairingIds,
      )
      get().recomputeDraftPane(paneId)
      // Try to acquire locks — failure doesn't block the operation (single-user graceful degradation)
      void useLockStore.getState().acquireLock(fromCrewId, pairingIds).catch(() => {})
      void useLockStore.getState().acquireLock(toCrewId, pairingIds).catch(() => {})

      // Legality preview runs after the optimistic apply; roll back if it does not approve.
      const allowed = await checkLiveDraftLegality(
        [fromCrewId, toCrewId],
        beforeItems,
        get()[paneId].rosterItems,
        { relatedItems: [task], relatedPairingIds: pairingIds },
      )
      if (!allowed) {
        useDraftStore.getState().removeOp(opId)
        get().recomputeDraftPane(paneId)
        notify.warning('Assignment reverted — legality check did not approve')
        // If the confirm dialog is open, it owns `checking`; otherwise the check
        // rejected without a dialog (rare) — release the lock ourselves.
        if (!useRuleCheckStore.getState().confirmDialog.open) {
          useRuleCheckStore.getState().setChecking(false)
        }
        return null
      }
      // Check passed — clear the flag the move-task optimistic-apply set above.
      useRuleCheckStore.getState().setChecking(false)
      return { ...task, crewId: toCrewId }
    }

    // ── Direct mode: API call + undo/redo ──
    const simulated = items.map((i) => i.id === taskId ? { ...i, crewId: toCrewId } : i)
    const allowed = await rulePreCheck([fromCrewId, toCrewId], items, simulated)
    if (!allowed) return null

    const moved = await rosterApi.move({ taskId, targetCrewId: toCrewId })
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.map((item) => item.id === taskId ? moved : item),
      },
    }))

    pushHistory('move', `Move task to ${toCrewId}`,
      async () => {
        const reverted = await rosterApi.move({ taskId, targetCrewId: fromCrewId })
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => item.id === taskId ? reverted : item),
          },
        }))
      },
      async () => {
        const redone = await rosterApi.move({ taskId, targetCrewId: toCrewId })
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => item.id === taskId ? redone : item),
          },
        }))
      },
    )

    return moved
  },

  swapTasks: async (paneId, taskIdA, taskIdB) => {
    const items = get()[paneId].rosterItems
    const taskA = items.find((i) => i.id === taskIdA)
    const taskB = items.find((i) => i.id === taskIdB)
    if (!taskA || !taskB) return false

    const draft = useDraftStore.getState()

    // ── Draft mode ──
    if (draft.active) {
      const simulated = items.map((i) => {
        if (i.id === taskIdA) return { ...i, crewId: taskB.crewId }
        if (i.id === taskIdB) return { ...i, crewId: taskA.crewId }
        return i
      })
      const pairingIds = [...new Set([taskA.pairingId, taskB.pairingId].filter((p): p is number => p != null))]
      const allowed = await checkLiveDraftLegality(
        [taskA.crewId, taskB.crewId],
        items,
        simulated,
        { relatedItems: [taskA, taskB], relatedPairingIds: pairingIds },
      )
      if (!allowed) return false
      await useLockStore.getState().acquireLock(taskA.crewId, pairingIds).catch(() => {})
      await useLockStore.getState().acquireLock(taskB.crewId, pairingIds).catch(() => {})

      draft.addOp(
        { type: 'swap', taskIdA, taskIdB },
        [taskA.crewId, taskB.crewId],
        pairingIds,
      )
      get().recomputeDraftPane(paneId)
      return true
    }

    // ── Direct mode ──
    const simulated = items.map((i) => {
      if (i.id === taskIdA) return { ...i, crewId: taskB.crewId }
      if (i.id === taskIdB) return { ...i, crewId: taskA.crewId }
      return i
    })
    const allowed = await rulePreCheck([taskA.crewId, taskB.crewId], items, simulated)
    if (!allowed) return false

    const result = await rosterApi.swap({ taskIdA, taskIdB })
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.map((item) => {
          if (item.id === taskIdA) return result.taskA
          if (item.id === taskIdB) return result.taskB
          return item
        }),
      },
    }))

    // Undo = swap again (swap is self-inverse)
    pushHistory('swap', `Swap tasks #${taskIdA} ↔ #${taskIdB}`,
      async () => {
        const rev = await rosterApi.swap({ taskIdA, taskIdB })
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => {
              if (item.id === taskIdA) return rev.taskA
              if (item.id === taskIdB) return rev.taskB
              return item
            }),
          },
        }))
      },
      async () => {
        const re = await rosterApi.swap({ taskIdA, taskIdB })
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => {
              if (item.id === taskIdA) return re.taskA
              if (item.id === taskIdB) return re.taskB
              return item
            }),
          },
        }))
      },
    )

    return true
  },

  addTask: async (paneId, task) => {
    const mockItem: RosterItem = {
      id: --_tempId, crewId: task.crewId, pairingId: task.pairingId ?? null, ver: 0,
      base: task.base, label: task.label ?? null, assignmentGroup: task.assignmentGroup,
      assignment: task.assignment ?? null, role: task.role ?? null, subRole: null,
      source: null, isRequested: 0, isSwapped: 0, preference: null,
      comments: task.comments ?? null, score: null, workingHour: null,
      schStrDtUtc: task.schStrDtUtc, schEndDtUtc: task.schEndDtUtc,
      actStrDtUtc: null, actEndDtUtc: null,
      fltId: task.fltId ?? null, fltDt: task.fltDt ?? null,
      dutySeq: null, segSeq: null, division: null,
      flightActingRank: task.flightActingRank, rosterActingRank: null, activeRank: null, position: null,
      schCreditedMinutes: null, actCreditedMinutes: null,
      tagSet: null, exceptionCode: null,
      ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
    }

    const draft = useDraftStore.getState()

    // ── Draft mode ──
    if (draft.active) {
      const items = get()[paneId].rosterItems
      const simulated = [...items, mockItem]
      const allowed = await checkLiveDraftLegality(
        [task.crewId],
        items,
        simulated,
        { relatedItems: [mockItem], relatedPairingIds: mockItem.pairingId == null ? [] : [mockItem.pairingId] },
      )
      if (!allowed) return null
      await useLockStore.getState().acquireLock(task.crewId, []).catch(() => {})
      draft.addOp(
        {
          type: 'add',
          task: task as unknown as Record<string, unknown>,
          mockItem: mockItem as unknown as Record<string, unknown>,
        },
        [task.crewId],
        [],
      )
      get().recomputeDraftPane(paneId)
      return mockItem
    }

    // ── Direct mode ──
    const items = get()[paneId].rosterItems
    const simulated = [...items, mockItem]
    const allowed = await rulePreCheck([task.crewId], items, simulated)
    if (!allowed) return null

    const created = await rosterApi.create(task)
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        baseItems: [...state[paneId].baseItems, created],
        rosterItems: [...state[paneId].rosterItems, created],
      },
    }))

    const createdId = created.id
    pushHistory('add', `Add task for ${task.crewId}`,
      async () => {
        await rosterApi.remove(createdId)
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.filter((i) => i.id !== createdId),
          },
        }))
      },
      async () => {
        const recreated = await rosterApi.create(task)
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: [...state[paneId].rosterItems, recreated],
          },
        }))
      },
    )

    return created
  },

  addGroundTask: async (paneId, data) => {
    const draft = useDraftStore.getState()
    let _tempId = -Date.now() // unique negative IDs for mock items
    const creditSource = data.creditMin ?? data.fixedCreditMin
    const fixedCredit = creditSource != null && Number.isFinite(Number(creditSource))
      ? String(Math.max(0, Math.round(Number(creditSource))))
      : null

    // Build mock items (one per crew) for immediate Gantt rendering
    const mockItems: RosterItem[] = data.crewIds.map((crewId) => ({
      id: --_tempId,
      crewId,
      pairingId: null,
      ver: 0,
      base: data.depArp,
      depArp: data.depArp,
      arvArp: data.arvArp,
      label: null,
      assignmentGroup: '', // will be resolved by server; empty for draft
      assignment: data.assignment,
      role: null,
      subRole: null,
      source: 'MA',
      isRequested: 0,
      isSwapped: 0,
      preference: null,
      comments: data.comments ?? null,
      score: null,
      workingHour: null,
      schStrDtUtc: data.startDtUtc,
      schEndDtUtc: data.endDtUtc,
      actStrDtUtc: null,
      actEndDtUtc: null,
      fltId: null,
      fltDt: null,
      dutySeq: null,
      segSeq: null,
      division: null,
      flightActingRank: '',
      rosterActingRank: null,
      activeRank: null,
      position: null,
      schCreditedMinutes: fixedCredit,
      actCreditedMinutes: fixedCredit,
      dpMin: data.dpMin ?? null,
      tagSet: null,
      exceptionCode: null,
      actRestMin: null,
      ybh: null,
      mbh: null,
      yal: null,
      mal: null,
      ydo: null,
      mdo: null,
      mcred: null,
    }))

    if (draft.active) {
      const items = get()[paneId].rosterItems
      const simulated = [...items, ...mockItems]
      const allowed = await checkLiveDraftLegality(
        data.crewIds,
        items,
        simulated,
        { relatedItems: mockItems },
      )
      if (!allowed) return null
      // Acquire locks for all affected crew
      for (const crewId of data.crewIds) {
        await useLockStore.getState().acquireLock(crewId, []).catch(() => {})
      }
      draft.addOp(
        {
          type: 'add-ground-task',
          groundTaskData: data,
          mockItems: mockItems as unknown as Record<string, unknown>[],
        },
        data.crewIds,
        [],
      )
      get().recomputeDraftPane(paneId)
      return mockItems
    }

    // Direct mode (no draft): call API immediately
    const created = await rosterApi.createGroundTask(data)
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        baseItems: [...state[paneId].baseItems, ...created],
        rosterItems: [...state[paneId].rosterItems, ...created],
      },
    }))
    return created
  },

  updateTask: async (paneId, id, data) => {
    const items = get()[paneId].rosterItems
    const task = items.find((i) => i.id === id)
    if (!task) return null

    const draft = useDraftStore.getState()

    // ── Draft mode ──
    if (draft.active) {
      await useLockStore.getState().acquireLock(task.crewId, []).catch(() => {})
      draft.addOp(
        { type: 'update', taskId: id, data: data as Record<string, unknown> },
        [task.crewId],
        task.pairingId != null ? [task.pairingId] : [],
      )
      get().recomputeDraftPane(paneId)
      return { ...task, ...data } as RosterItem
    }

    // ── Direct mode ──
    const originalData: UpdateRosterInput = {}
    const taskRecord = task as unknown as Record<string, unknown>
    for (const key of Object.keys(data) as (keyof UpdateRosterInput)[]) {
      (originalData as Record<string, unknown>)[key] = taskRecord[key]
    }

    const simulated = items.map((i) => i.id === id ? { ...i, ...data } as RosterItem : i)
    const allowed = await rulePreCheck([task.crewId], items, simulated)
    if (!allowed) return null

    const updated = await rosterApi.update(id, data)
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.map((item) => item.id === id ? updated : item),
      },
    }))

    pushHistory('update', `Update task #${id}`,
      async () => {
        const reverted = await rosterApi.update(id, originalData)
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => item.id === id ? reverted : item),
          },
        }))
      },
      async () => {
        const redone = await rosterApi.update(id, data)
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.map((item) => item.id === id ? redone : item),
          },
        }))
      },
    )

    return updated
  },

  removeTask: async (paneId, id) => {
    const items = get()[paneId].rosterItems
    const task = items.find((i) => i.id === id)

    const draft = useDraftStore.getState()

    // ── Draft mode ──
    if (draft.active) {
      if (task) {
        // If the task is a draft placeholder (pending assign-pairing/add with a negative
        // temp id), deleting it must CANCEL the creating op — emitting a remove-by-temp-id
        // would commit as a silent no-op (rosterService.remove updates 0 rows) and leave the
        // task behind (same bug class as the Scenario pending-add cancel).
        const createdBy = useDraftStore.getState().operations.find((o) =>
          (o.op.type === 'assign-pairing' && (o.op.tasks as RosterItem[] | undefined)?.some((t) => t.id === id)) ||
          (o.op.type === 'add' && (o.op.mockItem as RosterItem | undefined)?.id === id) ||
          (o.op.type === 'add-ground-task' && (o.op.mockItems as RosterItem[] | undefined)?.some((t) => t.id === id)),
        )
        if (createdBy) {
          useDraftStore.getState().removeOp(createdBy.id)
          get().recomputeDraftPane(paneId)
          return
        }
        const pairingIds = task.pairingId != null ? [task.pairingId] : []
        await useLockStore.getState().acquireLock(task.crewId, pairingIds).catch(() => {})
        draft.addOp({ type: 'remove', taskId: id }, [task.crewId], pairingIds)
      }
      get().recomputeDraftPane(paneId)
      return
    }

    // ── Direct mode ──
    try {
      await rosterApi.remove(id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete task'
      notify.error(msg)
      return
    }
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.filter((item) => item.id !== id),
      },
    }))

    if (task) {
      // Build CreateRosterInput from the deleted task for undo (re-create)
      const createInput: CreateRosterInput = {
        crewId: task.crewId,
        pairingId: task.pairingId ?? undefined,
        base: task.base,
        label: task.label ?? undefined,
        assignmentGroup: task.assignmentGroup,
        assignment: task.assignment ?? undefined,
        role: task.role ?? undefined,
        flightActingRank: task.flightActingRank,
        schStrDtUtc: task.schStrDtUtc ?? '',
        schEndDtUtc: task.schEndDtUtc ?? '',
        fltId: task.fltId ?? undefined,
        fltDt: task.fltDt ?? undefined,
        comments: task.comments ?? undefined,
      }

      pushHistory('remove', `Delete task #${id}`,
        async () => {
          const recreated = await rosterApi.create(createInput)
          set((state) => ({
            [paneId]: {
              ...state[paneId],
              rosterItems: [...state[paneId].rosterItems, recreated],
            },
          }))
        },
        async () => {
          const current = get()[paneId].rosterItems.find((i) =>
            i.crewId === task.crewId && i.schStrDtUtc === task.schStrDtUtc && i.assignmentGroup === task.assignmentGroup,
          )
          if (current) {
            await rosterApi.remove(current.id)
            set((state) => ({
              [paneId]: {
                ...state[paneId],
                rosterItems: state[paneId].rosterItems.filter((i) => i.id !== current.id),
              },
            }))
          }
        },
      )
    }
  },

  removeTasksByPairingAndCrew: async (paneId, pairingId, crewId) => {
    const items = get()[paneId].rosterItems
    // Filter by BOTH pairingId AND crewId - only delete segments for this specific crew's pairing
    const pairingTasks = items.filter((i) => i.pairingId === pairingId && i.crewId === crewId)
    if (pairingTasks.length === 0) return

    const draft = useDraftStore.getState()

    // ── Draft mode: single batch op for entire pairing+crew ──
    if (draft.active) {
      await useLockStore.getState().acquireLock(crewId, [pairingId]).catch(() => {})
      // Add ONE batch op instead of multiple single-task ops - triggers only ONE markDirty()
      draft.addOp(
        { type: 'remove-pairing-from-crew', pairingId, crewId },
        [crewId],
        [pairingId],
      )
      get().recomputeDraftPane(paneId)
      return
    }

    // ── Direct mode ──
    // Delete all tasks in the pairing for this crew
    try {
      await rosterApi.removeByPairingAndCrew(pairingId, crewId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete pairing tasks'
      notify.error(msg)
      return
    }

    const deletedIds = new Set(pairingTasks.map((t) => t.id))
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.filter((item) => !deletedIds.has(item.id)),
      },
    }))

    // Build undo info: all tasks that were deleted
    pushHistory('remove', `Delete pairing #${pairingId} for ${crewId} (${pairingTasks.length} tasks)`,
      async () => {
        // Undo: re-create all tasks
        const recreated: RosterItem[] = []
        for (const task of pairingTasks) {
          const input: CreateRosterInput = {
            crewId: task.crewId,
            pairingId: task.pairingId ?? undefined,
            base: task.base,
            label: task.label ?? undefined,
            assignmentGroup: task.assignmentGroup,
            assignment: task.assignment ?? undefined,
            role: task.role ?? undefined,
            flightActingRank: task.flightActingRank,
            schStrDtUtc: task.schStrDtUtc ?? '',
            schEndDtUtc: task.schEndDtUtc ?? '',
            fltId: task.fltId ?? undefined,
            fltDt: task.fltDt ?? undefined,
            comments: task.comments ?? undefined,
          }
          const item = await rosterApi.create(input)
          recreated.push(item)
        }
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: [...state[paneId].rosterItems, ...recreated],
          },
        }))
      },
      async () => {
        // Redo: delete again
        await rosterApi.removeByPairingAndCrew(pairingId, crewId)
        set((state) => ({
          [paneId]: {
            ...state[paneId],
            rosterItems: state[paneId].rosterItems.filter((i) => i.pairingId !== pairingId || i.crewId !== crewId),
          },
        }))
      },
    )
  },

  patchItems: (paneId, items) => {
    set((state) => {
      const existingIds = new Set(items.map((i) => i.id))
      const keptBase = state[paneId].baseItems.filter((i) => !existingIds.has(i.id))
      const keptDisplay = state[paneId].rosterItems.filter((i) => !existingIds.has(i.id))
      return {
        [paneId]: {
          ...state[paneId],
          baseItems: [...keptBase, ...items],
          rosterItems: [...keptDisplay, ...items],
        },
      }
    })
    // Trigger Canvas redraw
    useGanttViewStore.getState().markDirty()
  },

  replaceCrewItems: (paneId, crewId, newItems) => {
    set((state) => {
      const filteredBase = state[paneId].baseItems.filter((i) => i.crewId !== crewId)
      const filteredDisplay = state[paneId].rosterItems.filter((i) => i.crewId !== crewId)
      return {
        [paneId]: {
          ...state[paneId],
          baseItems: [...filteredBase, ...newItems],
          rosterItems: [...filteredDisplay, ...newItems],
        },
      }
    })
    // Trigger Canvas redraw
    useGanttViewStore.getState().markDirty()
  },

  removeItemLocally: (paneId, itemId) => {
    set((state) => ({
      [paneId]: {
        ...state[paneId],
        rosterItems: state[paneId].rosterItems.filter((i) => i.id !== itemId),
      },
    }))
  },

  clearPane: (paneId) => {
    set({ [paneId]: createEmptyPaneState() })
  },
}))

const registerDraftCallbacks = (): void => {
  // Register callback for draft-store undo/redo/discard to recompute roster items.
  setDraftRecomputeCallback((applyFn) => {
    const state = useRosterStore.getState()
    for (const paneId of ['main', 'sub'] as const) {
      const base = state[paneId].baseItems
      if (base.length > 0) {
        const displayed = applyFn(base)
        useRosterStore.setState((s) => ({
          [paneId]: { ...s[paneId], rosterItems: displayed },
        }))
        if (paneId === 'main') {
          usePairingStore.getState().refreshDraftCoverage(base, displayed)
        }
      }
    }
  })

  // Register callback for draft-store commit to promote rosterItems → baseItems.
  // Unconditional: must also promote when rosterItems is empty (e.g., all assignments deleted),
  // otherwise stale baseItems re-appears on the next applyDraftOps call.
  setDraftPromoteBaseCallback(() => {
    const state = useRosterStore.getState()
    for (const paneId of ['main', 'sub'] as const) {
      const current = state[paneId].rosterItems
      useRosterStore.setState((s) => ({
        [paneId]: { ...s[paneId], baseItems: current },
      }))
    }
  })
}

registerDraftCallbacks()
