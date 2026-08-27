// Scope scenario pairings to the divisions actually present among the loaded
// (already division-scoped) crew. Used by both gantt display builders so a
// pilot scenario never surfaces cabin pairings (and vice-versa). Deriving the
// scope from crew keeps the two display paths self-consistent and needs no
// filterParams threading. See spec 2026-06-22-pilot-division-pairing-pane-fixes.

/** Keep pairings whose division is present among the crew's divisions.
 *  No crew division present → return all pairings unchanged (safe fallback). */
export const filterPairingsByCrewDivision = <
  C extends { division: string },
  P extends { division: string },
>(
  crew: C[],
  pairings: P[],
): P[] => {
  const crewDivisions = new Set(crew.map((c) => c.division).filter(Boolean))
  if (crewDivisions.size === 0) return pairings
  return pairings.filter((p) => crewDivisions.has(p.division))
}
