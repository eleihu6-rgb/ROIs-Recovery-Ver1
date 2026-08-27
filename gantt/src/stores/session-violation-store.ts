import { create } from 'zustand'
import type { ViolationItem } from '@/services/rule-session-api'

export interface DisplayViolation extends ViolationItem {
  source: 'persisted' | 'session'
  crewId?: string
  pairingId: number
  windowStartDt?: string | null
  windowEndDt?: string | null
  startDt?: string | null
  endDt?: string | null
}

interface SessionViolationStore {
  /** Violations from rule_violation table (shared, all users see) */
  persistedViolations: Map<string, ViolationItem[]>

  /** Violations from current user session (undo/redo, not persisted) */
  sessionViolations: Map<string, ViolationItem[]>

  /** Merged violations for display: session overrides persisted per pairing */
  displayViolations: Map<number, DisplayViolation[]>

  /** Set persisted violations for a crew-owned pairing */
  setPersistedViolations: (crewId: string, pairingId: number, violations: ViolationItem[]) => void

  /**
   * Replace the entire persisted map from one GET /api/violations result.
   * Upsert-only writes leave out-of-window pairings after the toolbar date range changes.
   */
  replacePersistedViolations: (
    entries: Array<{ crewId: string; pairingId: number; violations: ViolationItem[] }>,
  ) => void

  /** Set session violations for a crew-owned pairing (from checkSession response) */
  setSessionViolations: (crewId: string, pairingId: number, violations: ViolationItem[]) => void

  /** Clear session violations (called on commit or discard) */
  clearSessionViolations: () => void

  /**
   * Drop session rows whose ruleCode is in `ruleCodes` (e.g. period Min-GDO 7505/7507
   * injected by draft preview). Used when a scenario save restores persisted legality so
   * crew-bell tooltips do not keep a stale preview soft hit.
   */
  clearSessionViolationsByRuleCodes: (ruleCodes: string[]) => void

  /** Clear session violations for a specific pairing */
  clearSessionViolationsForPairing: (pairingId: number) => void

  /** Get highest severity for a pairing (from displayViolations) */
  getHighestSeverity: (pairingId: number) => number

  /** Internal: recompute displayViolations */
  _recompute: () => void
}

const mergeViolations = (
  persisted: Map<string, ViolationItem[]>,
  session: Map<string, ViolationItem[]>,
): Map<number, DisplayViolation[]> => {
  const merged = new Map<number, DisplayViolation[]>()

  const parseKey = (key: string): { crewId: string; pairingId: number } | null => {
    const [crewId, pairingIdRaw] = key.split(':')
    const pairingId = Number(pairingIdRaw)
    if (!crewId || !Number.isFinite(pairingId)) return null
    return { crewId, pairingId }
  }

  for (const [key, viols] of persisted) {
    const parsed = parseKey(key)
    if (!parsed) continue
    const { crewId, pairingId } = parsed
    const existing = merged.get(pairingId) ?? []
    merged.set(pairingId, [
      ...existing,
      ...viols.map(v => ({ ...v, source: 'persisted' as const, crewId, pairingId })),
    ])
  }

  // Session overrides persisted for the same crew+pairing only (including empty array = "fixed").
  for (const [key, viols] of session) {
    const parsed = parseKey(key)
    if (!parsed) continue
    const { crewId, pairingId } = parsed
    const existing = (merged.get(pairingId) ?? []).filter((v) => v.crewId !== crewId)
    merged.set(pairingId, [
      ...existing,
      ...viols.map(v => ({ ...v, source: 'session' as const, crewId, pairingId })),
    ])
  }

  return merged
}

export const useSessionViolationStore = create<SessionViolationStore>((set, get) => ({
  persistedViolations: new Map(),
  sessionViolations: new Map(),
  displayViolations: new Map(),

  setPersistedViolations: (crewId, pairingId, violations) => {
    set((state) => {
      const next = new Map(state.persistedViolations)
      next.set(`${crewId}:${pairingId}`, violations)
      return { persistedViolations: next }
    })
    get()._recompute()
  },

  replacePersistedViolations: (entries) => {
    const next = new Map<string, ViolationItem[]>()
    for (const { crewId, pairingId, violations } of entries) {
      next.set(`${crewId}:${pairingId}`, violations)
    }
    set({ persistedViolations: next })
    get()._recompute()
  },

  setSessionViolations: (crewId, pairingId, violations) => {
    set((state) => {
      const next = new Map(state.sessionViolations)
      next.set(`${crewId}:${pairingId}`, violations)
      return { sessionViolations: next }
    })
    get()._recompute()
  },

  clearSessionViolations: () => {
    set({ sessionViolations: new Map() })
    get()._recompute()
  },

  clearSessionViolationsByRuleCodes: (ruleCodes) => {
    const drop = new Set(ruleCodes)
    set((state) => {
      const next = new Map<string, ViolationItem[]>()
      for (const [key, viols] of state.sessionViolations) {
        const kept = viols.filter((v) => !drop.has(v.ruleCode))
        if (kept.length > 0) next.set(key, kept)
      }
      return { sessionViolations: next }
    })
    get()._recompute()
  },

  clearSessionViolationsForPairing: (pairingId) => {
    set((state) => {
      const next = new Map(state.sessionViolations)
      for (const key of next.keys()) {
        if (key.endsWith(`:${pairingId}`)) next.delete(key)
      }
      return { sessionViolations: next }
    })
    get()._recompute()
  },

  getHighestSeverity: (pairingId) => {
    const { displayViolations } = get()
    const viols = displayViolations.get(pairingId) ?? []
    return viols
      .filter(v => !v.passed)
      .reduce((max, v) => Math.max(max, v.severity), 0)
  },

  _recompute: () => {
    const { persistedViolations, sessionViolations } = get()
    set({ displayViolations: mergeViolations(persistedViolations, sessionViolations) })
  },
}))
