/**
 * Shared rule-batch core: build check inputs → ruleApi.batchCheck → parse engine
 * results into RuleViolation[] keyed by `${targetType}:${targetId}`.
 *
 * This is a PURE function (no store access): callers pass the qualsMap so this
 * stays decoupled from crew-store. It mirrors the pairing→crew violation mapping
 * in rule-check-store.runChecks. The Live store keeps its own runChecks (its
 * critical path is intentionally left untouched); the Scenario violation store
 * uses this helper so the build→batch→parse logic is not duplicated by hand.
 */
import { ruleApi } from '@/services/rule-api'
import { buildCheckInputs } from '@/utils/roster-to-check-input'
import type { CrewQuals } from '@/utils/roster-to-check-input'
import type { RuleViolation } from '@/types/rule-check'
import type { RosterItem } from '@/types'

const makeKey = (targetType: string, targetId: string | number): string =>
  `${targetType}:${targetId}`

export interface RunRuleBatchResult {
  /** Violations keyed by `${targetType}:${targetId}` (for the store's violations map). */
  violations: Map<string, RuleViolation[]>
  /** Flat list of all violations (pairing + crew duplicates), in discovery order. */
  flat: RuleViolation[]
  /** true if any violation is non-overridable (hard rule). */
  hasBlocking: boolean
}

/**
 * Run the rule engine batch check for the given crews over the given roster items.
 *
 * @param ruleGroupCode active rule group (same selection as Live; engine is mode-agnostic)
 * @param crewIds        crews whose pairings should be checked
 * @param items          roster items (flat rows) for those crews
 * @param qualsMap       crewId → quals (passed in to keep this pure / store-free)
 */
export const runRuleBatch = async (
  ruleGroupCode: string,
  crewIds: string[],
  items: RosterItem[],
  qualsMap: Map<string, CrewQuals>,
): Promise<RunRuleBatchResult> => {
  const allCheckInputs = crewIds.flatMap((crewId) =>
    buildCheckInputs(crewId, items, ruleGroupCode, qualsMap),
  )

  if (allCheckInputs.length === 0) {
    return { violations: new Map(), flat: [], hasBlocking: false }
  }

  // pairingId → crewIds, for associating engine results back to crews.
  const pairingToCrewIds = new Map<number, string[]>()
  for (const input of allCheckInputs) {
    if (input.crew?.crewId) {
      const arr = pairingToCrewIds.get(input.pairing.pairingId) ?? []
      arr.push(input.crew.crewId)
      pairingToCrewIds.set(input.pairing.pairingId, arr)
    }
  }

  const batchItems = allCheckInputs.map((input) => ({
    pairing: input.pairing,
    crew: input.crew,
  }))

  const response = await ruleApi.batchCheck(ruleGroupCode, batchItems)

  const flat: RuleViolation[] = []
  const violations = new Map<string, RuleViolation[]>()
  let hasBlocking = false

  const push = (v: RuleViolation): void => {
    flat.push(v)
    const key = makeKey(v.targetType, v.targetId)
    const arr = violations.get(key) ?? []
    arr.push(v)
    violations.set(key, arr)
  }

  for (const { id: pairingId, result: engineResult } of response.items) {
    const owners = pairingToCrewIds.get(pairingId) ?? []

    for (const cr of engineResult.checkResults) {
      if (cr.passed) continue

      const base: RuleViolation = {
        ruleCode: cr.ruleCode,
        ruleName: cr.ruleName,
        severity: cr.severity,
        canOverride: cr.overridable ?? cr.severity < 3,
        message: cr.message,
        targetId: pairingId,
        targetType: 'pairing',
        anchorPairingId: pairingId,
        source: 'pairing',
      }
      push(base)

      for (const crewId of owners) {
        push({ ...base, targetType: 'crew', targetId: crewId })
      }

      if (!base.canOverride) hasBlocking = true
    }
  }

  return { violations, flat, hasBlocking }
}
