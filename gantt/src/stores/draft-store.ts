import { create } from 'zustand'
import { draftApi, expandDraftOpsForCommit, pairingIdsFromRemoveOp } from '@/services/draft-api'
import type { DraftOp } from '@/services/draft-api'
import { rosterApi } from '@/services/roster-api'
import { pairingApi } from '@/services/pairing-api'
import { useLockStore } from './lock-store'
import { usePairingStore } from './pairing-store'
import { useFilterStore } from './filter-store'
import { usePaneStore } from './pane-store'
import { useRuleCheckStore } from './rule-check-store'
import { useSessionViolationStore } from './session-violation-store'
import { promoteDraftBase, recomputeRosterItems } from './draft-roster-recompute'
import type { RosterItem } from '@/types'
import { notify } from '@/utils/notify'

const fireViolationsUpdated = (groupCode: string): void => {
  window.dispatchEvent(new CustomEvent('violations:updated', {
    detail: { groupCode },
  }))
}

/**
 * Drop draft-preview session hits that would override persisted rule_violation and refetch
 * immediately. The async live-legality recompute signals completion via the
 * `legality-updated` WS push (lock-store dispatches violations:updated), so there is no
 * polling here — the push provides the final fresh refetch.
 */
export const refreshViolationsAfterDraftCommit = (): void => {
  const groupCode = useRuleCheckStore.getState().ruleGroupCode || '103'
  useSessionViolationStore.getState().clearSessionViolations()
  fireViolationsUpdated(groupCode)
}

const markGanttViewDirty = (): void => {
  void import('./gantt-view-store').then(({ useGanttViewStore }) => {
    useGanttViewStore.getState().markDirty()
  })
}

/**
 * Reload the Pairing pane after a draft commit that touched pairings.
 *
 * MUST pass the active pairing filter — reloading without it pulls the FULL
 * unfiltered pairing list while the filter chips keep displaying (e.g. a Cabin
 * pairing surfacing under a Pilot-division filter). Mirrors every other reload
 * path (fetchPaneData / refreshAllPanes / applyGanttFilters), which all pass it.
 * Exported so the e2e regression test exercises this exact code, not a copy.
 */
export const reloadPairingsAfterCommit = async (): Promise<void> => {
  const { dateRange, pairing: pairingFilter } = useFilterStore.getState()
  await usePairingStore.getState().fetchPairings(dateRange, pairingFilter)
}

const applyRemainingRemovePairingOps = (): void => {
  for (const { op } of useDraftStore.getState().operations) {
    for (const pairingId of pairingIdsFromRemoveOp(op)) {
      usePairingStore.getState().removeItem(pairingId)
    }
  }
}

const restorePairingPaneAfterUndo = (op: DraftOp): void => {
  if (op.type !== 'remove-pairing') return
  void reloadPairingsAfterCommit().then(() => {
    applyRemainingRemovePairingOps()
    markGanttViewDirty()
  })
}

const applyPairingPaneAfterRedo = (op: DraftOp): void => {
  for (const pairingId of pairingIdsFromRemoveOp(op)) {
    usePairingStore.getState().removeItem(pairingId)
  }
}

/** A single draft operation with metadata */
export interface DraftOperation {
  id: string
  op: DraftOp
  affectedCrewIds: string[]
  affectedPairingIds: number[]
  timestamp: number
}

interface DraftStore {
  /** Whether draft mode is active */
  active: boolean
  /** Ordered operation log */
  operations: DraftOperation[]
  /** Redo stack (popped ops that can be re-applied) */
  redoStack: DraftOperation[]
  /** Whether a save operation is in progress */
  saving: boolean

  /** Enter draft mode */
  enterDraft: () => void
  /** Exit draft mode (discard all changes + release locks) */
  exitDraft: () => Promise<void>

  /** Add a draft operation; returns the created operation id (for targeted rollback). */
  addOp: (op: DraftOp, affectedCrewIds: string[], affectedPairingIds: number[]) => string
  /** Remove a specific operation by id (optimistic-rollback path); no-op if already gone. */
  removeOp: (opId: string) => void
  /** Undo last operation */
  undoOp: () => DraftOperation | null
  /** Redo last undone operation */
  redoOp: () => DraftOperation | null

  /** Commit all operations to server */
  commit: () => Promise<boolean>
  /** Discard all operations (but stay in draft mode) */
  discardAll: () => Promise<void>

  /** Get all dirty crew IDs */
  getDirtyCrewIds: () => string[]
  /** Get all dirty pairing IDs */
  getDirtyPairingIds: () => number[]
  /** Operation count */
  opCount: () => number

  /**
   * Apply draft operations to base roster items to produce the "virtual" state.
   * This is what the Gantt should render when draft mode is active.
   */
  applyDraftOps: (baseItems: RosterItem[]) => RosterItem[]
}

let _nextId = 1

/** After undo: drop locks for crews/pairings no longer touched by remaining ops. */
const releaseLocksNoLongerDirty = async (): Promise<void> => {
  const draft = useDraftStore.getState()
  const lockStore = useLockStore.getState()
  if (draft.operations.length === 0) {
    await lockStore.releaseAllLocks()
    return
  }
  const dirtyCrews = new Set(draft.getDirtyCrewIds())
  const dirtyPairings = new Set(draft.getDirtyPairingIds())
  const myCrewIds = [...lockStore.myLockKeys]
    .filter((k) => k.startsWith('crew:'))
    .map((k) => k.slice('crew:'.length))
  const myPairingIds = [...lockStore.myLockKeys]
    .filter((k) => k.startsWith('pairing:'))
    .map((k) => Number(k.slice('pairing:'.length)))
    .filter((id) => Number.isFinite(id))
  const pairingsToRelease = myPairingIds.filter((id) => !dirtyPairings.has(id))
  for (const crewId of myCrewIds) {
    if (dirtyCrews.has(crewId)) continue
    await lockStore.releaseCrewLock(crewId, pairingsToRelease)
  }
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  active: true,  // Always in draft mode — all edits are local until Save
  operations: [],
  redoStack: [],
  saving: false,

  enterDraft: () => {
    set({ active: true, operations: [], redoStack: [] })
  },

  exitDraft: async () => {
    await useLockStore.getState().releaseAllLocks()
    set({ active: true, operations: [], redoStack: [] }) // stay active, just clear ops
    markGanttViewDirty()
  },

  addOp: (op, affectedCrewIds, affectedPairingIds) => {
    const draftOp: DraftOperation = {
      id: `draft-${_nextId++}`,
      op,
      affectedCrewIds,
      affectedPairingIds,
      timestamp: Date.now(),
    }
    set((state) => ({
      operations: [...state.operations, draftOp],
      redoStack: [], // clear redo on new op
    }))
    markGanttViewDirty()
    return draftOp.id
  },

  removeOp: (opId) => {
    const { operations } = get()
    if (!operations.some((o) => o.id === opId)) return
    set((state) => ({
      operations: state.operations.filter((o) => o.id !== opId),
      redoStack: [], // never replay a rolled-back op
    }))
    // Recompute roster from base + remaining ops (same path as undoOp).
    recomputeRosterItems((base) => get().applyDraftOps(base))
    markGanttViewDirty()
    void releaseLocksNoLongerDirty()
  },

  undoOp: () => {
    const { operations } = get()
    if (operations.length === 0) return null

    const last = operations[operations.length - 1]
    set((state) => ({
      operations: state.operations.slice(0, -1),
      redoStack: [last, ...state.redoStack],
    }))
    // Recompute roster from base + remaining ops
    recomputeRosterItems((base) => get().applyDraftOps(base))
    restorePairingPaneAfterUndo(last.op)
    markGanttViewDirty()
    void releaseLocksNoLongerDirty()
    return last
  },

  redoOp: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return null

    const [first, ...rest] = redoStack
    set((state) => ({
      operations: [...state.operations, first],
      redoStack: rest,
    }))
    // Recompute roster from base + restored ops
    recomputeRosterItems((base) => get().applyDraftOps(base))
    applyPairingPaneAfterRedo(first.op)
    markGanttViewDirty()
    void useLockStore.getState()
      .acquireLocks(first.affectedCrewIds, first.affectedPairingIds)
      .catch(() => {})
    return first
  },

  commit: async () => {
    const { operations, saving } = get()
    if (operations.length === 0 || saving) return true

    // Set saving state for UI feedback (button shows "Saving...")
    set({ saving: true })

    const lockStore = useLockStore.getState()
    const { useRosterStore } = await import('./roster-store')
    const rosterStore = useRosterStore.getState()
    const hasLocks = lockStore.myLockKeys.size > 0

    // Collect items for incremental patch (fallback path)
    const patchedItems: RosterItem[] = []
    const removedItemIds: number[] = []
    const crewReplacements: Map<string, RosterItem[]> = new Map()

    try {
      if (hasLocks) {
        // Batch commit via /api/draft/commit (lock-protected)
        const allCrewIds = [...new Set(operations.flatMap((o) => o.affectedCrewIds))]
        const allPairingIds = [...new Set(operations.flatMap((o) => o.affectedPairingIds))]
        const { useLegalityStore } = await import('./legality-store')
        const selectedRulesetId = useLegalityStore.getState().selectedId
        await draftApi.commit({
          operations: expandDraftOpsForCommit(operations.map((o) => o.op)),
          username: lockStore.currentUser,
          affectedCrewIds: allCrewIds,
          affectedPairingIds: allPairingIds,
          ...(selectedRulesetId != null
            && Number.isInteger(selectedRulesetId)
            && selectedRulesetId > 0
            ? { rulesetId: selectedRulesetId }
            : {}),
        })
        await lockStore.releaseAllLocks()
      } else {
        // Fallback: execute operations one by one via roster API (no locks)
        for (const { op } of operations) {
          switch (op.type) {
            case 'move': {
              const updated = await rosterApi.move({ taskId: op.taskId!, targetCrewId: op.toCrewId! })
              patchedItems.push(updated)
              break
            }
            case 'swap': {
              const { taskA, taskB } = await rosterApi.swap({ taskIdA: op.taskIdA!, taskIdB: op.taskIdB! })
              patchedItems.push(taskA, taskB)
              break
            }
            case 'remove':
              await rosterApi.remove(op.taskId!)
              removedItemIds.push(op.taskId!)
              break
            case 'remove-pairing-from-crew':
              await rosterApi.removeByPairingAndCrew(op.pairingId!, op.crewId!)
              // Remove all items matching pairingId + crewId locally
              const paneItems = rosterStore.main.rosterItems
              const toRemove = paneItems.filter((i) => i.pairingId === op.pairingId && i.crewId === op.crewId)
              removedItemIds.push(...toRemove.map((i) => i.id))
              break
            case 'update': {
              const updated = await rosterApi.update(op.taskId!, op.data as never)
              patchedItems.push(updated)
              break
            }
            case 'add': {
              const created = await rosterApi.create(op.task as never)
              patchedItems.push(created)
              break
            }
            case 'add-ground-task':
              if (op.groundTaskData) {
                const created = await rosterApi.createGroundTask(op.groundTaskData)
                patchedItems.push(...created)
              }
              break
            case 'assign-pairing': {
              const created = await rosterApi.assignPairing({ pairingId: op.pairingId!, crewId: op.crewId!, rosterActingRank: op.rosterActingRank ?? '' })
              // Replace all items for this crew (removes placeholders + adds real items)
              crewReplacements.set(op.crewId!, created)
              break
            }
            case 'remove-pairing':
              for (const pairingId of pairingIdsFromRemoveOp(op)) {
                await pairingApi.remove(pairingId)
              }
              break
            case 'add-flight-to-pairing':
              await pairingApi.addSegment(op.pairingId!, op.flightId!)
              break
            case 'create-pairing-from-flights':
              await pairingApi.createFromFlights(op.flightIds!, op.base, op.division)
              break
          }
        }
      }

      // Save dirty crew IDs before clearing operations. Roster row refresh is only needed for
      // the lock-protected batch path; manday stat refresh applies to every successful save path.
      const dirtyCrewIds = [...new Set(operations.flatMap((o) => o.affectedCrewIds))]

      set({ operations: [], redoStack: [] })
      // Promote current rosterItems to baseItems (committed state = new base)
      promoteDraftBase()
      // Pairing fill was already updated optimistically from the draft roster.
      // Promote that value locally; a roster save does not require a list reload.
      usePairingStore.getState().promoteDraftCoverage()

      // Apply incremental patches (fallback path only)
      if (!hasLocks) {
        // Remove deleted items
        for (const id of removedItemIds) {
          rosterStore.removeItemLocally('main', id)
        }
        // Patch updated/created items
        if (patchedItems.length > 0) {
          rosterStore.patchItems('main', patchedItems)
        }
        // Replace crew-level items (assign-pairing case)
        for (const [crewId, items] of crewReplacements) {
          rosterStore.replaceCrewItems('main', crewId, items)
        }
      }

      // For lock-protected path, refresh only dirty crewIds (not all selectedCrewIds)
      // This ensures we get correct data after batch commit
      if (hasLocks && dirtyCrewIds.length > 0) {
        const { dateRange } = useFilterStore.getState()
        // Fetch only dirty crews' data
        const start = dateRange.start.toISOString().slice(0, 10)
        const end = dateRange.end.toISOString().slice(0, 10)
        const freshItems = await rosterApi.getView(dirtyCrewIds, start, end)
        // Replace each dirty crew's items
        for (const crewId of dirtyCrewIds) {
          const crewItems = freshItems.filter((i) => i.crewId === crewId)
          rosterStore.replaceCrewItems('main', crewId, crewItems)
        }
      }

      // Manday credit is recomputed asynchronously now — the authoritative values arrive via
      // the manday-updated WS push (lock-store refreshes crew stats then). Reading the manday
      // tables here would return the still-stale pre-recompute values.
      markGanttViewDirty()
      // Session preview can still show pre-Save 7505 text; recheck finishes async.
      refreshViolationsAfterDraftCommit()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Draft commit failed:', message, err)
      // Roll back optimistic UI state to the pre-save base. Without this the user
      // sees the placeholder roster while the DB never received the write — the
      // pre-check 409 (or any partial-failure response) otherwise leaves a UI/DB
      // mismatch. Operation stack is preserved so the user can inspect / fix.
      recomputeRosterItems((base) => base)
      notify.error(`Save failed: ${message}`)
      throw new Error(message)
    } finally {
      set({ saving: false })
    }
  },

  discardAll: async () => {
    await useLockStore.getState().releaseAllLocks()
    set({ operations: [], redoStack: [] })
    // Revert roster to base items (no ops)
    recomputeRosterItems((base) => base)
    markGanttViewDirty()
  },

  getDirtyCrewIds: () => {
    return [...new Set(get().operations.flatMap((o) => o.affectedCrewIds))]
  },

  getDirtyPairingIds: () => {
    return [...new Set(get().operations.flatMap((o) => o.affectedPairingIds))]
  },

  opCount: () => get().operations.length,

  applyDraftOps: (baseItems) => {
    const { operations } = get()
    if (operations.length === 0) return baseItems

    // Apply each operation sequentially to produce virtual state
    let items = [...baseItems]

    for (const { op } of operations) {
      switch (op.type) {
        case 'move':
          items = items.map((item) =>
            item.id === op.taskId ? { ...item, crewId: op.toCrewId! } : item,
          )
          break

        case 'swap': {
          const a = items.find((i) => i.id === op.taskIdA)
          const b = items.find((i) => i.id === op.taskIdB)
          if (a && b) {
            const aCrewId = a.crewId
            items = items.map((item) => {
              if (item.id === op.taskIdA) return { ...item, crewId: b.crewId }
              if (item.id === op.taskIdB) return { ...item, crewId: aCrewId }
              return item
            })
          }
          break
        }

        case 'add':
          // Add a placeholder item (will get real ID on commit)
          items = [...items, (op.mockItem ?? op.task) as unknown as RosterItem]
          break

        case 'add-ground-task':
          if (op.mockItems) {
            items = [...items, ...(op.mockItems as unknown as RosterItem[])]
          }
          break

        case 'assign-pairing':
          if (op.tasks) {
            items = [...items, ...(op.tasks as unknown as RosterItem[])]
          }
          break

        case 'remove':
          items = items.filter((item) => item.id !== op.taskId)
          break

        case 'remove-pairing-from-crew':
          // Remove all items matching pairingId + crewId
          items = items.filter((item) =>
            item.pairingId !== op.pairingId || item.crewId !== op.crewId,
          )
          break

        case 'update':
          items = items.map((item) =>
            item.id === op.taskId ? { ...item, ...op.data } as RosterItem : item,
          )
          break
      }
    }

    return items
  },
}))
