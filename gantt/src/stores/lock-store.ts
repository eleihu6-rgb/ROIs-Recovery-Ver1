import { create } from 'zustand'
import { lockApi } from '@/services/lock-api'
import type { LockInfo } from '@/services/lock-api'
import { wsClient } from '@/services/ws'
import { rosterApi } from '@/services/roster-api'
import { getLiveViewportRosterPeriod } from '@/utils/viewport-month'
import { useGanttViewStore } from './gantt-view-store'
import { useAuthStore } from './auth-store'
import { useRosterStore } from './roster-store'
import { useCrewStore } from './crew-store'
import { useFilterStore } from './filter-store'
import { usePairingStore } from './pairing-store'
import { useLayoutStore } from './layout-store'

const HEARTBEAT_INTERVAL = 60_000 // 60 seconds

/** Get current user code from auth store */
const getCurrentUser = (): string => useAuthStore.getState().user?.userCode ?? 'anonymous'
const getSchema = (): string | null => useAuthStore.getState().user?.schema ?? null

/**
 * Cross-user live update: another user committed roster changes (server broadcasts
 * `{type:'roster-updated', crewIds}`). Refetch roster + MCred for the affected crews THIS user has
 * loaded, so a viewer sees the new roster and updated monthly credit without a manual refresh.
 * Scoped to already-loaded crew (§First-Paint) and to the viewer's current display-tz viewport
 * month. On error, fall back to a redraw. (The committer also receives its own broadcast — the
 * refetch then just reconciles to the authoritative post-save value, which is harmless.)
 */
const refreshRosterFromBroadcast = async (crewIds: string[], pairingIds: number[] = []): Promise<void> => {
  const pairingOpen = [...useLayoutStore.getState().panes.values()].some((pane) => pane.type === 'pairing')
  const refreshPairingPane = async (): Promise<void> => {
    if (!pairingOpen) return
    const { dateRange, pairing: pairingFilter } = useFilterStore.getState()
    if (pairingIds.length > 0) await usePairingStore.getState().fetchPairings(dateRange, pairingFilter)
  }
  if (crewIds.length === 0) {
    await refreshPairingPane()
    useGanttViewStore.getState().markDirty()
    return
  }
  const loaded = new Set(useCrewStore.getState().selectedCrewIds)
  const ids = crewIds.filter((id) => loaded.has(id))
  if (ids.length === 0) {
    await refreshPairingPane()
    useGanttViewStore.getState().markDirty()
    return
  }
  try {
    const { dateRange } = useFilterStore.getState()
    const start = dateRange.start.toISOString().slice(0, 10)
    const end = dateRange.end.toISOString().slice(0, 10)
    const fresh = await rosterApi.getView(ids, start, end)
    const roster = useRosterStore.getState()
    const nextItems = [
      ...roster.main.rosterItems.filter((item) => !ids.includes(item.crewId)),
      ...fresh,
    ]
    // Reconcile loaded pairing fill from the same authoritative roster payload
    // that updates the roster pane. This avoids reloading the whole pairing list.
    usePairingStore.getState().refreshDraftCoverage(roster.main.baseItems, nextItems)
    usePairingStore.getState().promoteDraftCoverage()
    for (const cid of ids) roster.replaceCrewItems('main', cid, fresh.filter((i) => i.crewId === cid))
    await refreshPairingPane()
  } catch (err) {
    console.error('[lock-store] roster-updated refresh failed:', err)
  } finally {
    useGanttViewStore.getState().markDirty()
  }
}

/**
 * Manday recompute completed for these crews (server broadcasts `manday-updated`).
 * The roster was already refreshed by `roster-updated`; now the authoritative credit is
 * ready, so drop the stale month cache and refetch the month the viewer is looking at.
 */
const refreshCrewStatsFromMandayPush = async (crewIds: string[]): Promise<void> => {
  if (crewIds.length === 0) return
  const loaded = new Set(useCrewStore.getState().selectedCrewIds)
  const ids = crewIds.filter((id) => loaded.has(id))
  if (ids.length === 0) return
  try {
    const crew = useCrewStore.getState()
    crew.clearCrewStatsCache()
    const viewportRosterPeriod = getLiveViewportRosterPeriod()
    if (viewportRosterPeriod) {
      await crew.loadCrewStats(ids, viewportRosterPeriod)
    }
  } catch (err) {
    console.error('[lock-store] manday-updated refresh failed:', err)
  } finally {
    useGanttViewStore.getState().markDirty()
  }
}

interface LockStore {
  /** All known active locks */
  locks: Map<string, LockInfo>
  /** Lock keys held by current user */
  myLockKeys: Set<string>
  /** Current user ID (derived from auth store) */
  currentUser: string

  /** Initialize WS connection and sync locks */
  init: () => void
  /** Cleanup on unmount */
  cleanup: () => void

  /** Acquire lock for a crew before editing */
  acquireLock: (crewId: string, pairingIds: number[]) => Promise<boolean>
  /** Acquire locks for multiple crews before editing */
  acquireLocks: (crewIds: string[], pairingIds: number[]) => Promise<boolean>
  /** Release all locks held by current user */
  releaseAllLocks: () => Promise<void>
  /** Release locks for a specific crew */
  releaseCrewLock: (crewId: string, pairingIds: number[]) => Promise<void>

  /** Check if a crew/pairing is locked by another user */
  isLockedByOther: (type: 'crew' | 'pairing', id: string) => boolean
  /** Check if a crew/pairing is locked by current user */
  isLockedByMe: (type: 'crew' | 'pairing', id: string) => boolean
  /** Get lock owner for a key */
  getLockOwner: (type: 'crew' | 'pairing', id: string) => string | null

  /** Handle incoming WS message */
  handleWsMessage: (msg: Record<string, unknown>) => void
}

export const useLockStore = create<LockStore>((set, get) => {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let wsUnsubscribe: (() => void) | null = null

  return {
    locks: new Map(),
    myLockKeys: new Set(),
    currentUser: 'anonymous',

    init: () => {
      const user = getCurrentUser()
      const schema = getSchema()
      const token = useAuthStore.getState().token
      set({ currentUser: user })

      // Connect WebSocket
      if (token && schema) {
        wsClient.connect(schema, user, token)
      }
      wsUnsubscribe = wsClient.onMessage((msg) => get().handleWsMessage(msg))

      // Sync initial locks
      lockApi.getAll().then((locks) => {
        const lockMap = new Map<string, LockInfo>()
        const myKeys = new Set<string>()
        for (const l of locks) {
          const key = `${l.lockType}:${l.lockId}`
          lockMap.set(key, l)
          if (l.userId === user) myKeys.add(key)
        }
        set({ locks: lockMap, myLockKeys: myKeys })
        useGanttViewStore.getState().markDirty()
      }).catch(() => { /* ignore sync failure */ })

      // Start heartbeat
      heartbeatTimer = setInterval(async () => {
        const { myLockKeys } = get()
        if (myLockKeys.size === 0) return
        const keys = [...myLockKeys].map((k) => `lock:${k}`)
        await lockApi.heartbeat(keys, getCurrentUser()).catch(() => {})
      }, HEARTBEAT_INTERVAL)
    },

    cleanup: () => {
      wsClient.disconnect()
      if (wsUnsubscribe) wsUnsubscribe()
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },

    acquireLock: async (crewId, pairingIds) => {
      const user = getCurrentUser()
      try {
        await lockApi.acquire(crewId, pairingIds, user)

        set((state) => {
          const locks = new Map(state.locks)
          const myKeys = new Set(state.myLockKeys)
          const now = Date.now()
          const expiresAt = now + 300_000

          const crewLock: LockInfo = { lockType: 'crew', lockId: crewId, userId: user, acquiredAt: now, expiresAt }
          locks.set(`crew:${crewId}`, crewLock)
          myKeys.add(`crew:${crewId}`)

          for (const pid of pairingIds) {
            const pLock: LockInfo = { lockType: 'pairing', lockId: String(pid), userId: user, acquiredAt: now, expiresAt }
            locks.set(`pairing:${pid}`, pLock)
            myKeys.add(`pairing:${pid}`)
          }

          return { locks, myLockKeys: myKeys }
        })

        useGanttViewStore.getState().markDirty()
        return true
      } catch {
        return false
      }
    },

    acquireLocks: async (crewIds, pairingIds) => {
      const user = getCurrentUser()
      try {
        // Acquire locks for all crews in parallel
        await Promise.all(crewIds.map((crewId) => lockApi.acquire(crewId, pairingIds, user)))

        set((state) => {
          const locks = new Map(state.locks)
          const myKeys = new Set(state.myLockKeys)
          const now = Date.now()
          const expiresAt = now + 300_000

          for (const crewId of crewIds) {
            const crewLock: LockInfo = { lockType: 'crew', lockId: crewId, userId: user, acquiredAt: now, expiresAt }
            locks.set(`crew:${crewId}`, crewLock)
            myKeys.add(`crew:${crewId}`)
          }

          for (const pid of pairingIds) {
            const pLock: LockInfo = { lockType: 'pairing', lockId: String(pid), userId: user, acquiredAt: now, expiresAt }
            locks.set(`pairing:${pid}`, pLock)
            myKeys.add(`pairing:${pid}`)
          }

          return { locks, myLockKeys: myKeys }
        })

        useGanttViewStore.getState().markDirty()
        return true
      } catch {
        return false
      }
    },

    releaseAllLocks: async () => {
      const user = getCurrentUser()
      const { myLockKeys } = get()
      const crewKeys = [...myLockKeys].filter((k) => k.startsWith('crew:'))
      const pairingKeys = [...myLockKeys].filter((k) => k.startsWith('pairing:'))

      for (const ck of crewKeys) {
        const crewId = ck.split(':')[1]
        const pairingIds = pairingKeys.map((pk) => Number(pk.split(':')[1]))
        await lockApi.release(crewId, pairingIds, user).catch(() => {})
      }

      set((state) => {
        const locks = new Map(state.locks)
        for (const key of state.myLockKeys) {
          locks.delete(key)
        }
        return { locks, myLockKeys: new Set() }
      })

      useGanttViewStore.getState().markDirty()
    },

    releaseCrewLock: async (crewId, pairingIds) => {
      await lockApi.release(crewId, pairingIds, getCurrentUser()).catch(() => {})

      set((state) => {
        const locks = new Map(state.locks)
        const myKeys = new Set(state.myLockKeys)

        locks.delete(`crew:${crewId}`)
        myKeys.delete(`crew:${crewId}`)
        for (const pid of pairingIds) {
          locks.delete(`pairing:${pid}`)
          myKeys.delete(`pairing:${pid}`)
        }

        return { locks, myLockKeys: myKeys }
      })

      useGanttViewStore.getState().markDirty()
    },

    isLockedByOther: (type, id) => {
      const lock = get().locks.get(`${type}:${id}`)
      return lock !== undefined && lock.userId !== getCurrentUser()
    },

    isLockedByMe: (type, id) => {
      return get().myLockKeys.has(`${type}:${id}`)
    },

    getLockOwner: (type, id) => {
      const lock = get().locks.get(`${type}:${id}`)
      return lock?.userId ?? null
    },

    handleWsMessage: (msg) => {
      const type = msg.type as string

      if (type === 'lock-acquired') {
        const crewId = msg.crewId as string
        const pairingIds = (msg.pairingIds as number[]) ?? []
        const userId = msg.userId as string
        const expiresAt = msg.expiresAt as number
        const now = Date.now()

        set((state) => {
          const locks = new Map(state.locks)
          locks.set(`crew:${crewId}`, { lockType: 'crew', lockId: crewId, userId, acquiredAt: now, expiresAt })
          for (const pid of pairingIds) {
            locks.set(`pairing:${pid}`, { lockType: 'pairing', lockId: String(pid), userId, acquiredAt: now, expiresAt })
          }
          return { locks }
        })
        useGanttViewStore.getState().markDirty()
      }

      if (type === 'lock-released') {
        const crewId = msg.crewId as string
        const pairingIds = (msg.pairingIds as number[]) ?? []

        set((state) => {
          const locks = new Map(state.locks)
          locks.delete(`crew:${crewId}`)
          for (const pid of pairingIds) {
            locks.delete(`pairing:${pid}`)
          }
          return { locks }
        })
        useGanttViewStore.getState().markDirty()
      }

      if (type === 'locks-snapshot') {
        const snapLocks = msg.locks as LockInfo[]
        const lockMap = new Map<string, LockInfo>()
        for (const l of snapLocks) {
          lockMap.set(`${l.lockType}:${l.lockId}`, l)
        }
        set({ locks: lockMap })
        useGanttViewStore.getState().markDirty()
      }

      if (type === 'roster-updated') {
        void refreshRosterFromBroadcast((msg.crewIds as string[]) ?? [], (msg.pairingIds as number[]) ?? [])
      }

      if (type === 'manday-updated') {
        // Async manday recompute finished — refresh authoritative credit for the affected crews.
        void refreshCrewStatsFromMandayPush((msg.crewIds as string[]) ?? [])
      }

      if (type === 'legality-updated') {
        // Async live legality recompute finished — refetch persisted violations for the group.
        const groupCode = typeof msg.groupCode === 'string' ? msg.groupCode : ''
        if (groupCode) {
          window.dispatchEvent(new CustomEvent('violations:updated', { detail: { groupCode } }))
        }
      }
    },
  }
})
