// Scenario legality freshness predicate (pure — no DB/queue deps, unit-testable).
// Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md §4.2
//
// Stored scenario violations are served iff the legality_status row is READY AND the
// violations reflect the current roster (computed_version === roster_version). Any other
// combination (COMPUTING / STALE / PENDING / FAILED, or a version mismatch) means a
// recompute is needed and stale rows must NOT be served.

export type LegalityStatus =
  | 'PENDING'
  | 'COMPUTING'
  | 'READY'
  | 'STALE'
  | 'FAILED'

export interface LegalityStatusRow {
  status: LegalityStatus
  computed_version: number
  roster_version: number
}

export const isFresh = (r: LegalityStatusRow): boolean =>
  r.status === 'READY' && r.computed_version === r.roster_version
