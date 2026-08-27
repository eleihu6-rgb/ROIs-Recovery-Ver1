import { create } from 'zustand'
import { wsClient } from '@/services/ws'
import { ruleApi } from '@/services/rule-api'
import type { CheckResult } from '@/services/rule-api'
import type { AuthoritativePairingViolation } from '@/services/live-rule-check-api'
import { liveRuleCheckApi } from '@/services/live-rule-check-api'
import { buildCheckInputs } from '@/utils/roster-to-check-input'
import type { CrewQuals } from '@/utils/roster-to-check-input'
import { useCrewStore } from './crew-store'
import { usePaneStore } from './pane-store'
import type { RosterItem } from '@/types'
import type { RosterCheckRequest, RuleViolation, PreCheckResult } from '@/types/rule-check'

// RuleViolation / PreCheckResult now live in @/types/rule-check (shared by Live and
// Scenario + the source adapters). Re-exported here for backward-compat with the many
// existing `import { RuleViolation } from '@/stores/rule-check-store'` callers.
export type { RuleViolation, PreCheckResult }

/** Placeholder until groups are fetched; RuleGroupSelector replaces it with the API default. */
const DEFAULT_RULE_GROUP = ''

interface RuleCheckStore {
  /** Violations keyed by `${targetType}:${targetId}` */
  violations: Map<string, RuleViolation[]>
  /** Whether a check is in progress */
  checking: boolean
  /** Current rule group code */
  ruleGroupCode: string

  /** Confirmation dialog state */
  confirmDialog: {
    open: boolean
    violations: RuleViolation[]
    hasBlocking: boolean
    onConfirm: (() => void) | null
    onCancel: (() => void) | null
  }

  /**
   * Pre-check: run rule check on simulated data BEFORE applying the modification.
   * When currentItems is provided, violations are compared before/after to determine
   * which are newly introduced by this operation (isNew=true). Only new hard violations
   * (canOverride=false) count as blocking.
   */
  preCheck: (
    affectedCrewIds: string[],
    simulatedItems: RosterItem[],
    currentItems?: RosterItem[],
  ) => Promise<PreCheckResult>

  /**
   * Show confirmation dialog with violations. Returns a promise that
   * resolves to true (proceed) or false (cancel).
   */
  showConfirmDialog: (violations: RuleViolation[], hasBlocking: boolean) => Promise<boolean>

  /** Close confirmation dialog */
  closeConfirmDialog: () => void

  /**
   * Post-modification check for all visible crews (background, updates violation markers).
   */
  checkCrews: (crewIds: string[], allItems: RosterItem[]) => Promise<boolean>

  /** Set rule group */
  setRuleGroup: (code: string) => void

  /**
   * Externally toggle the `checking` flag. Used by callers that manage the
   * legality-check lifecycle outside of `preCheck` (e.g. moveTask which
   * optimistically adds the op before the async check, so the toolbar must
   * stay disabled from the moment the user drops the task until the check
   * resolves — including the brief gap between addOp and the first network
   * call that `preCheck` would have managed).
   */
  setChecking: (val: boolean) => void

  /** Get violations for a specific target */
  getViolations: (targetType: string, targetId: string | number) => RuleViolation[]

  /** Check if a target has any violations */
  hasViolations: (targetType: string, targetId: string | number) => boolean

  /** Check if a target has blocking violations */
  hasBlockingViolations: (targetType: string, targetId: string | number) => boolean

  /** Clear all violations */
  clearViolations: () => void

  /**
   * Fire-and-forget roster-level check for a single crew.
   * Merges rosterViolations into the violations map (source: 'roster').
   * Failure is silently warned — never throws.
   */
  checkRosterViolations: (crewId: string, items: RosterItem[]) => Promise<void>

  /** Authoritative violations loaded from live-server DB */
  authoritative: Map<string, AuthoritativePairingViolation>

  /** Load authoritative results from live-server on mount */
  loadAuthoritative: (
    crewIds: string[],
    dateFrom: string,
    dateTo: string,
    ruleGroupCode: string,
  ) => Promise<void>

  /** Apply a WebSocket violation:pairing:updated push to authoritative layer */
  applyWsPairingUpdate: (msg: {
    crewId: string; pairingId: number; passedAll: boolean;
    highestSeverity: number; checkResults: unknown[]; calcResults: unknown[]
  }) => void

  /** Apply a WebSocket violation:roster:updated push */
  applyWsRosterUpdate: (msg: {
    crewId: string; resultMonth: string; passedAll: boolean;
    highestSeverity: number; violations: unknown[]
  }) => void

  /** Get the highest severity to display for a pairing (authoritative wins over draft) */
  getHighestSeverityForPairing: (pairingId: number, crewId: string) => number
}

const makeKey = (targetType: string, targetId: string | number): string =>
  `${targetType}:${targetId}`

/**
 * Run rule engine checks via batch API (single HTTP request).
 * Fetches crew qualifications first, then converts to CheckInput with real quals.
 */
const runChecks = async (
  crewIds: string[],
  items: RosterItem[],
  ruleGroupCode: string,
): Promise<{ violations: RuleViolation[]; hasBlocking: boolean }> => {
  // Build quals map from crew list inline data
  const crewStore = useCrewStore.getState()
  const qualsMap = new Map<string, CrewQuals>()
  for (const cid of crewIds) {
    const q = crewStore.getQuals(cid)
    if (q) qualsMap.set(cid, q)
  }

  // Build all check inputs and a pairingId → crewId mapping
  const allCheckInputs = crewIds.flatMap((crewId) =>
    buildCheckInputs(crewId, items, ruleGroupCode, qualsMap),
  )

  if (allCheckInputs.length === 0) {
    if (import.meta.env.DEV) console.debug('[RuleCheck] No check inputs (0 pairings with flights)')
    return { violations: [], hasBlocking: false }
  }
  if (import.meta.env.DEV) console.debug(`[RuleCheck] Checking ${allCheckInputs.length} pairings for ${crewIds.length} crews`)

  // Build pairingId → crewIds mapping for result association
  const pairingToCrewIds = new Map<number, string[]>()
  for (const input of allCheckInputs) {
    if (input.crew?.crewId) {
      const arr = pairingToCrewIds.get(input.pairing.pairingId) ?? []
      arr.push(input.crew.crewId)
      pairingToCrewIds.set(input.pairing.pairingId, arr)
    }
  }

  // Build batch request
  const batchItems = allCheckInputs.map((input) => ({
    pairing: input.pairing,
    crew: input.crew,
  }))

  const response = await ruleApi.batchCheck(ruleGroupCode, batchItems)

  const violations: RuleViolation[] = []
  let hasBlocking = false

  for (const { id: pairingId, result: engineResult } of response.items) {
    const crewIds = pairingToCrewIds.get(pairingId) ?? []

    for (const cr of engineResult.checkResults) {
      if (cr.passed) continue

      const violation: RuleViolation = {
        ruleCode: cr.ruleCode,
        ruleName: cr.ruleName,
        severity: cr.severity,
        canOverride: cr.overridable ?? cr.severity < 3,
        message: cr.message,
        targetId: pairingId,
        targetType: 'pairing',
        source: 'pairing',
      }
      violations.push(violation)

      for (const crewId of crewIds) {
        violations.push({
          ...violation,
          targetType: 'crew',
          targetId: crewId,
        })
      }

      if (!violation.canOverride) hasBlocking = true
    }
  }

  return { violations, hasBlocking }
}

export const useRuleCheckStore = create<RuleCheckStore>((set, get) => ({
  violations: new Map(),
  checking: false,
  ruleGroupCode: DEFAULT_RULE_GROUP,
  confirmDialog: {
    open: false,
    violations: [],
    hasBlocking: false,
    onConfirm: null,
    onCancel: null,
  },

  preCheck: async (affectedCrewIds, simulatedItems, currentItems) => {
    const { ruleGroupCode } = get()
    set({ checking: true })
    try {
      const afterResult = await runChecks(affectedCrewIds, simulatedItems, ruleGroupCode)

      let violations: RuleViolation[]
      let hasBlocking: boolean

      if (currentItems) {
        // Compare before/after to identify violations introduced by this operation.
        // Key by ruleCode only (not by pairingId / targetId): a rule already violated
        // on ANY pairing counts as pre-existing and must not block the current operation.
        // This prevents violations on unrelated pairings from being mis-attributed.
        const beforeResult = await runChecks(affectedCrewIds, currentItems, ruleGroupCode)
        const beforeRuleCodes = new Set(beforeResult.violations.map((v) => v.ruleCode))
        violations = afterResult.violations.map((v) => ({
          ...v,
          isNew: !beforeRuleCodes.has(v.ruleCode),
        }))
        // Only block on violations that are newly introduced AND non-overridable (硬性法规)
        hasBlocking = violations.some((v) => v.isNew && !v.canOverride)
      } else {
        violations = afterResult.violations.map((v) => ({ ...v, isNew: true }))
        hasBlocking = afterResult.hasBlocking
      }

      set({ checking: false })
      return { allowed: !hasBlocking, violations, hasBlocking }
    } catch {
      set({ checking: false })
      return { allowed: true, violations: [], hasBlocking: false }
    }
  },

  showConfirmDialog: (violations, hasBlocking) => {
    return new Promise<boolean>((resolve) => {
      set({
        // Keep draft mutations locked while the user decides. Save/undo/redo must
        // not race the pending legality confirmation.
        checking: true,
        confirmDialog: {
          open: true,
          violations,
          hasBlocking,
          onConfirm: () => {
            set({ checking: false, confirmDialog: { ...get().confirmDialog, open: false, onConfirm: null, onCancel: null } })
            resolve(true)
          },
          onCancel: () => {
            set({ checking: false, confirmDialog: { ...get().confirmDialog, open: false, onConfirm: null, onCancel: null } })
            resolve(false)
          },
        },
      })
    })
  },

  closeConfirmDialog: () => {
    const { confirmDialog } = get()
    confirmDialog.onCancel?.()
  },

  checkCrews: async (crewIds, allItems) => {
    const { ruleGroupCode, violations: existing } = get()
    set({ checking: true })
    try {
      const result = await runChecks(crewIds, allItems, ruleGroupCode)

      // Incremental merge: start from existing violations,
      // remove all entries for the checked crews, then add fresh results.
      const checkedCrewSet = new Set(crewIds)
      const merged = new Map<string, RuleViolation[]>()

      // Keep violations for crews NOT in this check batch
      for (const [key, vs] of existing) {
        const keepAll = vs.filter((v) => {
          if (v.targetType === 'crew') return !checkedCrewSet.has(String(v.targetId))
          // For pairing violations, check if any checked crew owns this pairing
          const pairingItems = allItems.filter((i) => i.pairingId === v.targetId)
          return !pairingItems.some((i) => checkedCrewSet.has(i.crewId))
        })
        if (keepAll.length > 0) merged.set(key, keepAll)
      }

      // Add fresh violations from this batch
      for (const v of result.violations) {
        const key = makeKey(v.targetType, v.targetId)
        const arr = merged.get(key) ?? []
        arr.push(v)
        merged.set(key, arr)
      }

      set({ violations: merged, checking: false })

      // Roster violations are checked fire-and-forget — `checking` flag is intentionally
      // cleared before roster checks complete. This keeps the UI responsive while
      // background roster-level checks populate asynchronously.
      for (const crewId of crewIds) {
        void get().checkRosterViolations(crewId, allItems)
      }

      return !result.hasBlocking
    } catch (err) {
      console.error('Rule check failed:', err)
      set({ checking: false })
      return true
    }
  },

  setRuleGroup: (code) => {
    wsClient.send({ type: 'set_rule_group', groupCode: code })
    set({ ruleGroupCode: code, violations: new Map() })
  },

  setChecking: (val) => {
    set({ checking: val })
  },

  getViolations: (targetType, targetId: string | number) => {
    return get().violations.get(makeKey(targetType, targetId)) ?? []
  },

  hasViolations: (targetType, targetId: string | number) => {
    const v = get().violations.get(makeKey(targetType, targetId))
    return v !== undefined && v.length > 0
  },

  hasBlockingViolations: (targetType, targetId: string | number) => {
    const v = get().violations.get(makeKey(targetType, targetId))
    if (!v) return false
    return v.some((violation) => !violation.canOverride)
  },

  clearViolations: () => set({ violations: new Map() }),

  checkRosterViolations: async (crewId, items) => {
    const { ruleGroupCode } = get()

    // Build check inputs to extract pairings and crew info
    const crewStore = useCrewStore.getState()
    const quals = crewStore.getQuals(crewId)
    const qualsMap = new Map<string, CrewQuals>()
    if (quals) qualsMap.set(crewId, quals)

    const checkInputs = buildCheckInputs(crewId, items, ruleGroupCode, qualsMap)
    if (checkInputs.length === 0) return

    const pairings = checkInputs.map((i) => i.pairing)
    const crew = checkInputs[0].crew
    if (!crew) return

    const { dateRange } = usePaneStore.getState()
    const request: RosterCheckRequest = {
      ruleGroupCode,
      crew,
      pairings,
      periodStart: dateRange.start.toISOString(),
      periodEnd: dateRange.end.toISOString(),
    }

    try {
      const response = await ruleApi.checkRoster(request)

      set((state) => {
        const merged = new Map(state.violations)
        const key = makeKey('crew', crewId)

        // Evict stale roster violations for this crew — keep pairing violations
        const existing = (merged.get(key) ?? []).filter((v) => v.source !== 'roster')
        const fresh: RuleViolation[] = []

        for (const cr of response.rosterViolations) {
          if (cr.passed) continue
          fresh.push({
            ruleCode: cr.ruleCode,
            ruleName: cr.ruleName,
            severity: cr.severity,
            canOverride: cr.overridable ?? cr.severity < 3,
            message: cr.message,
            targetId: crewId,
            targetType: 'crew',
            source: 'roster',
          })
        }

        if (existing.length === 0 && fresh.length === 0) {
          merged.delete(key)
        } else {
          merged.set(key, [...existing, ...fresh])
        }
        return { violations: merged }
      })
    } catch (err) {
      console.warn('[RuleCheck] roster check failed for crew', crewId, err)
    }
  },

  authoritative: new Map<string, AuthoritativePairingViolation>(),

  loadAuthoritative: async (crewIds, dateFrom, dateTo, ruleGroupCode) => {
    try {
      const result = await liveRuleCheckApi.getPairingResults(crewIds, dateFrom, dateTo, ruleGroupCode)
      // The endpoint returns {} (not {byPairing, missing}) when the real-time check cache
      // is empty for this group — guard so Object.entries() doesn't throw on undefined.
      const byPairing = result?.byPairing ?? {}
      const missing = result?.missing ?? []
      const newMap = new Map<string, AuthoritativePairingViolation>()
      for (const [pairingId, v] of Object.entries(byPairing)) {
        newMap.set(`${v.crewId}:${pairingId}`, v)
      }
      set({ authoritative: newMap })

      // Trigger on-demand check for any missing pairings
      if (missing.length > 0) {
        const byCrewId = new Map<string, number[]>()
        for (const m of missing) {
          const arr = byCrewId.get(m.crewId) ?? []
          arr.push(m.pairingId)
          byCrewId.set(m.crewId, arr)
        }
        for (const [crewId, pairingIds] of byCrewId) {
          void liveRuleCheckApi.triggerOnDemand(crewId, pairingIds, ruleGroupCode)
        }
      }
    } catch (err) {
      console.warn('[RuleCheck] loadAuthoritative failed:', err)
    }
  },

  applyWsPairingUpdate: (msg) => {
    set((state) => {
      const updated = new Map(state.authoritative)
      const key = `${msg.crewId}:${msg.pairingId}`
      // Convert calcResults from array [{ ruleCode, value, unit }] to Record<ruleCode, { value, unit }>
      const calcResults: Record<string, { value: number; unit: string }> = {}
      if (Array.isArray(msg.calcResults)) {
        for (const cr of msg.calcResults as Array<{ ruleCode: string; value: number; unit: string }>) {
          calcResults[cr.ruleCode] = { value: cr.value, unit: cr.unit }
        }
      }
      updated.set(key, {
        crewId: msg.crewId,
        pairingId: msg.pairingId,
        passedAll: msg.passedAll,
        highestSeverity: msg.highestSeverity,
        checkResults: msg.checkResults as AuthoritativePairingViolation['checkResults'],
        calcResults,
        checkedAt: new Date().toISOString(),
      })
      return { authoritative: updated }
    })
  },

  applyWsRosterUpdate: (_msg) => {
    // roster-level violations are displayed on crew row; store update reserved for future
  },

  getHighestSeverityForPairing: (pairingId, crewId): number => {
    const { authoritative, violations } = get()
    const authKey = `${crewId}:${pairingId}`
    const authResult = authoritative.get(authKey)
    const draftViolations = violations.get(`pairing:${pairingId}`) ?? []
    const draftMax = draftViolations.reduce((m, v) => Math.max(m, v.severity), 0)
    const authMax = authResult?.highestSeverity ?? 0
    return Math.max(draftMax, authMax)
  },
}))
