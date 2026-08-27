export interface CompositionSlot {
  actingRank: string
  plan: number
  fill: number
}

export interface CrewInput {
  id: string
  division: string
  rank: string
}

export interface PairingInput {
  id: number
  division: string
  composition: CompositionSlot[]
}

export type RankActingMap = Map<string, Set<string>>

export type PrecheckFailureReason =
  | 'DIVISION_MISMATCH'
  | 'NO_OPEN_POSITION'
  | 'RANK_ACTING_DISALLOWED'

export type PrecheckResult =
  | { ok: true; actingRank: string }
  | { ok: false; reason: PrecheckFailureReason; message: string }

/**
 * Pure pre-check for crew ↔ pairing assignments.
 *
 * Rules (all hard-blockers; the spec defines no override):
 *   1. crew.division must equal pairing.division.
 *   2. pairing must have at least one open slot (plan > fill).
 *   3. Crew's rank must match an open slot's actingRank,
 *      OR rank_acting must allow the cross-rank downgrade.
 *
 * Shared by gantt (frontend drag-drop + Scenario refactor)
 * and live-server (backend `assign-pairing` defense-in-depth).
 */
export function validateAssignment(
  crew: CrewInput,
  pairing: PairingInput,
  rankActing: RankActingMap,
): PrecheckResult {
  // 1. Division
  if (crew.division !== pairing.division) {
    return {
      ok: false,
      reason: 'DIVISION_MISMATCH',
      message: `Crew division ${crew.division} does not match pairing division ${pairing.division}`,
    }
  }

  // 2. Open positions
  const openSlots = pairing.composition.filter((s) => s.plan > s.fill)
  if (openSlots.length === 0) {
    return {
      ok: false,
      reason: 'NO_OPEN_POSITION',
      message: 'This pairing has no open positions',
    }
  }

  // 3a. Exact rank match
  const exact = openSlots.find((s) => s.actingRank === crew.rank)
  if (exact) return { ok: true, actingRank: exact.actingRank }

  // 3b. Cross-rank via rank_acting
  const allowed = rankActing.get(crew.rank) ?? new Set<string>()
  const downgrade = openSlots.find((s) => allowed.has(s.actingRank))
  if (downgrade) return { ok: true, actingRank: downgrade.actingRank }

  return {
    ok: false,
    reason: 'RANK_ACTING_DISALLOWED',
    message:
      `Crew rank ${crew.rank} cannot fill any open rank ` +
      `(${openSlots.map((s) => s.actingRank).join(', ')}) on this pairing`,
  }
}