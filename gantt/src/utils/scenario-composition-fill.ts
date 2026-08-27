// gantt/src/utils/scenario-composition-fill.ts
//
// Local pairing-composition fill derivation for the Scenario Gantt.
//
// The pairing pane previously read `data.pairings[].compositions[].fill` — a value the
// server computed when the gantt data was built. It went stale as soon as roster edits
// were pending (or after save, since applyScenarioPatchesToData only mutates assignments,
// not compositions). This function derives fill from the EFFECTIVE assignments (base
// assignments + pendingChanges applied) at render time, so the pane always shows the
// fill that follows the current roster — matching Live's refreshDraftCoverage semantics.
import type {
  ScenarioGanttAssignment,
  ScenarioGanttPairing,
  ScenarioGanttCrew,
} from '@/types/scenario-gantt'

export interface ScenarioCompositionSlot {
  rank: string
  plan: number
  fill: number
}

/**
 * Count distinct crew per (pairingId, rank) from the effective assignments and map the
 * result back onto each pairing's composition slots. Rank precedence mirrors the server's
 * `recomputeCompositionFill` (`roster_acting_rank ?? rank ?? crewRank`).
 */
export function computeScenarioPairingCompositions(
  effectiveAssignments: ScenarioGanttAssignment[],
  crew: ScenarioGanttCrew[],
  pairings: ScenarioGanttPairing[],
): Map<number, ScenarioCompositionSlot[]> {
  const crewRankById = new Map(crew.map((c) => [c.crewId, c.crewRank ?? c.rank ?? '']))
  // A crew occupies one slot per pairing (pairing-wide roster_acting_rank), so dedup by
  // (crewId, pairingId) before counting toward a slot.
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const a of effectiveAssignments) {
    if (a.pairingId == null) continue
    const crewKey = `${a.crewId}|${a.pairingId}`
    if (seen.has(crewKey)) continue
    seen.add(crewKey)
    const rank = a.rosterActingRank ?? a.rank ?? a.crewRank ?? crewRankById.get(a.crewId) ?? ''
    if (!rank) continue
    const slotKey = `${a.pairingId}:${rank}`
    counts.set(slotKey, (counts.get(slotKey) ?? 0) + 1)
  }

  const out = new Map<number, ScenarioCompositionSlot[]>()
  for (const p of pairings) {
    out.set(
      p.pairingId,
      (p.compositions ?? []).map((slot) => ({
        rank: slot.rank,
        plan: slot.plan,
        fill: Math.min(slot.plan, counts.get(`${p.pairingId}:${slot.rank}`) ?? 0),
      })),
    )
  }
  return out
}
