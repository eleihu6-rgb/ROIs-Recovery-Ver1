// gantt/src/stores/scenario-violation-store.ts
import { create } from 'zustand'
import { runRuleBatch } from '@/utils/run-rule-batch'
import { useCrewStore } from './crew-store'
import { useRuleCheckStore } from './rule-check-store'
import type { ScenarioViolationDto, ScenarioLegalityResponse } from '@/services/scenario-legality-api'
import type { CrewQuals } from '@/utils/roster-to-check-input'
import type { RuleViolation, PreCheckResult } from '@/types/rule-check'
import type { RosterItem } from '@/types'

export type ScenarioLegalityStatus = 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED'

/**
 * Per-scenario violation store (registry pattern, mirrors getScenarioGanttStore).
 *
 * Scenario-only — Live's rule-check-store is untouched. This reuses the SAME rule
 * engine batch-check (ruleApi.batchCheck → POST /check/batch) via the shared pure
 * helper runRuleBatch. The active ruleGroupCode is read from the Live rule-check-store
 * (same selection as Live; the engine is mode-agnostic).
 *
 * runPreCheck mirrors rule-check-store.preCheck semantics: when currentItems is
 * provided, before/after results are compared by ruleCode to flag newly introduced
 * violations (isNew), and only NEW non-overridable (hard) violations are blocking.
 */
interface ScenarioViolationStore {
  /** Violations keyed by `${targetType}:${targetId}` */
  violations: Map<string, RuleViolation[]>
  /** True while a pending roster edit is being checked by the rule engine. */
  checking: boolean

  /** Status of the persisted (at-rest) legality pass for this scenario. */
  legalityStatus: ScenarioLegalityStatus | null

  /** Last successful compute time (ISO), null until the first READY. Drives the alert
   *  dialog's "Last checked" line (mirrors LegalityRecheckIndicator's Live equivalent). */
  computedAt: string | null

  /** Set when legalityStatus is 'FAILED' — the compute error message, for the alert dialog. */
  errorText: string | null

  /**
   * True when the stored legality is outdated due to a rule-parameter change since the
   * last check (out-of-window scenarios are flagged rather than auto-recomputed). Drives
   * the scenario legality view's "outdated" hint. Cleared by a forced recheck.
   */
  paramsStale: boolean

  /**
   * Epoch ms when the current COMPUTING/PENDING run was first observed, or null when not
   * computing. Lets the Recheck button + status indicator detect a stuck run (a compute
   * that died without ever flipping legality_status out of COMPUTING) and recover — see
   * docs/superpowers/specs/2026-07-07-legality-recheck-stuck-button-recovery-design.md.
   */
  computingSince: number | null

  /** Raw persisted violation rows (with crew_id) — drives the scenario Alert Center list. */
  persistedRaw: ScenarioViolationDto[]

  /**
   * Apply a server legality response (Rust-computed, stored in scenario.rule_violation).
   * Sets the status, and on 'READY' populates the violations map so the gantt bells render.
   * The fetch itself lives in the view (keeps this store free of the api import).
   */
  applyPersisted: (res: ScenarioLegalityResponse) => void

  /**
   * Force-reset computingSince to "now" and optimistically flip legalityStatus to
   * COMPUTING. Called when the user manually clicks Recheck — without this, clicking
   * Recheck while a run is ALREADY (stuck) COMPUTING would not reset the stuck-timer,
   * since applyPersisted only stamps computingSince on a genuine status transition.
   */
  markRecheckTriggered: () => void

  /** Mark a user-triggered recheck as failed when the client cannot read a settled result. */
  markRecheckFailed: (errorText: string) => void

  /**
   * Rebuild the keyed `violations` map from the persisted at-rest rows (persistedRaw)
   * WITHOUT wiping them. Used when no edits are pending so the gutter/puck bells reflect
   * the stored legality. `clear()` (empty map) would hide the at-rest violations — the
   * scenario shows a non-zero Alert Center count but no per-row bells.
   */
  resetToPersisted: () => void

  /**
   * Pre-check simulated roster items before applying an edit.
   * Writes the resulting violations map into state (subscribers re-render) and
   * returns a PreCheckResult ({ allowed, violations, hasBlocking }).
   */
  runPreCheck: (
    affectedCrewIds: string[],
    simulatedItems: RosterItem[],
    currentItems?: RosterItem[],
  ) => Promise<PreCheckResult>

  /** Get violations for a specific target. */
  getViolations: (targetType: string, targetId: string) => RuleViolation[]

  /** Clear all violations. */
  clear: () => void
}

const makeKey = (targetType: string, targetId: string | number): string =>
  `${targetType}:${targetId}`

/** Build crewId → quals from the crew-store cache (shared with Live). */
const buildQualsMap = (crewIds: string[]): Map<string, CrewQuals> => {
  const crewStore = useCrewStore.getState()
  const qualsMap = new Map<string, CrewQuals>()
  for (const cid of crewIds) {
    const q = crewStore.getQuals(cid)
    if (q) qualsMap.set(cid, q)
  }
  return qualsMap
}

/** Map a persisted DB row to the gantt's RuleViolation (pairing-level → puck; roster-level → crew). */
const toPersistedViolation = (r: ScenarioViolationDto): RuleViolation => {
  const isPairing = r.pairing_id != null
  return {
    ruleCode: r.rule_code,
    ruleName: r.rule_instance ? `${r.rule_code}/${r.rule_instance}` : r.rule_code,
    severity: r.severity,
    canOverride: r.severity < 3, // hard (3) violations are not overridable
    message: r.message,
    targetType: isPairing ? 'pairing' : 'crew',
    targetId: isPairing ? Number(r.pairing_id) : r.crew_id,
    crewId: r.crew_id,
    anchorPairingId: r.pairing_id,
    windowStartDt: r.window_start_dt ?? r.start_dt ?? null,
    windowEndDt: r.window_end_dt ?? r.end_dt ?? null,
    source: isPairing ? 'pairing' : 'roster',
  }
}

/** Build the keyed `${targetType}:${targetId}` → RuleViolation[] map from persisted raw rows. */
const buildKeyedFromRaw = (raw: ScenarioViolationDto[]): Map<string, RuleViolation[]> => {
  const violations = new Map<string, RuleViolation[]>()
  for (const row of raw) {
    const v = toPersistedViolation(row)
    const key = makeKey(v.targetType, v.targetId)
    const arr = violations.get(key) ?? []
    arr.push(v)
    violations.set(key, arr)
  }
  return violations
}

function createStore() {
  // Bumped on reset/apply READY and at each runPreCheck start so late async precheck
  // results cannot overwrite the persisted map after Save cleared pending edits.
  let preCheckGeneration = 0
  return create<ScenarioViolationStore>((set, get) => ({
    violations: new Map(),
    checking: false,
    legalityStatus: null,
    computedAt: null,
    errorText: null,
    paramsStale: false,
    computingSince: null,
    persistedRaw: [],

    applyPersisted: (res) => {
      const prevStatus = get().legalityStatus
      const prevComputingSince = get().computingSince
      const wasComputing = prevStatus === 'COMPUTING' || prevStatus === 'PENDING'
      const isComputing = res.status === 'COMPUTING' || res.status === 'PENDING'
      // Non-READY means stored rows are stale / in flight — never keep the prior READY
      // snapshot in bells / Alert Center (e.g. cleared 7505 after a roster save).
      if (res.status !== 'READY') {
        set({
          legalityStatus: res.status,
          paramsStale: res.paramsStale === true,
          computedAt: res.computedAt ?? null,
          errorText: res.errorText ?? null,
          computingSince: isComputing ? (wasComputing ? prevComputingSince : Date.now()) : null,
          persistedRaw: [],
          violations: new Map(),
        })
        return
      }
      preCheckGeneration += 1
      set({
        legalityStatus: res.status,
        paramsStale: res.paramsStale === true,
        computedAt: res.computedAt ?? null,
        errorText: res.errorText ?? null,
        computingSince: null,
        persistedRaw: res.violations,
        violations: buildKeyedFromRaw(res.violations),
      })
    },

    markRecheckTriggered: () => set({ computingSince: Date.now(), legalityStatus: 'COMPUTING' }),

    markRecheckFailed: (errorText) =>
      set({
        legalityStatus: 'FAILED',
        errorText,
        computingSince: null,
      }),

    resetToPersisted: () => {
      preCheckGeneration += 1
      set({ violations: buildKeyedFromRaw(get().persistedRaw), checking: false })
    },

    runPreCheck: async (affectedCrewIds, simulatedItems, currentItems) => {
      const gen = ++preCheckGeneration
      set({ checking: true })
      // Same rule-group selection as Live; engine is mode-agnostic.
      const ruleGroupCode = useRuleCheckStore.getState().ruleGroupCode
      const qualsMap = buildQualsMap(affectedCrewIds)

      try {
        const after = await runRuleBatch(ruleGroupCode, affectedCrewIds, simulatedItems, qualsMap)
        if (gen !== preCheckGeneration) {
          return { allowed: true, violations: [], hasBlocking: false }
        }

        let flat: RuleViolation[]
        let hasBlocking: boolean

        if (currentItems) {
          // Compare before/after by ruleCode only (not by pairingId/targetId):
          // a rule already violated on ANY pairing counts as pre-existing and must
          // not block this operation — mirrors rule-check-store.preCheck.
          const before = await runRuleBatch(ruleGroupCode, affectedCrewIds, currentItems, qualsMap)
          if (gen !== preCheckGeneration) {
            return { allowed: true, violations: [], hasBlocking: false }
          }
          const beforeRuleCodes = new Set(before.flat.map((v) => v.ruleCode))
          flat = after.flat.map((v) => ({ ...v, isNew: !beforeRuleCodes.has(v.ruleCode) }))
          // Only NEW non-overridable (硬性法规) violations are blocking.
          hasBlocking = flat.some((v) => v.isNew && !v.canOverride)
        } else {
          flat = after.flat.map((v) => ({ ...v, isNew: true }))
          hasBlocking = after.hasBlocking
        }

        // Rebuild the keyed map from the (isNew-annotated) flat list.
        const violations = new Map<string, RuleViolation[]>()
        for (const v of flat) {
          const key = makeKey(v.targetType, v.targetId)
          const arr = violations.get(key) ?? []
          arr.push(v)
          violations.set(key, arr)
        }

        if (gen !== preCheckGeneration) {
          return { allowed: !hasBlocking, violations: flat, hasBlocking }
        }
        set({ violations, checking: false })
        return { allowed: !hasBlocking, violations: flat, hasBlocking }
      } catch {
        // On engine/network failure, fail open (allow) — matches Live's preCheck.
        if (gen === preCheckGeneration) set({ checking: false })
        return { allowed: true, violations: [], hasBlocking: false }
      }
    },

    getViolations: (targetType, targetId) => {
      return get().violations.get(makeKey(targetType, targetId)) ?? []
    },

    clear: () => set({ violations: new Map() }),
  }))
}

const registry = new Map<number, ReturnType<typeof createStore>>()

export function getScenarioViolationStore(scenarioId: number) {
  if (!registry.has(scenarioId)) {
    registry.set(scenarioId, createStore())
  }
  return registry.get(scenarioId)!
}

export function destroyScenarioViolationStore(scenarioId: number) {
  registry.delete(scenarioId)
}
