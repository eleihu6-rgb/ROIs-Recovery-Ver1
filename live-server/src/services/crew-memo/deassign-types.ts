/**
 * Types for the read-only PBS de-assignment classifier.
 *
 * A `Duty` is a normalized roster item: a flying pairing collapsed to one entry
 * (all its segments folded together), or a single ground row (DO/VAC/SIM/...).
 * The classifier decides which duties should be cleared to make room for the
 * solver (`DE_ASSIGN`) vs. left alone (`NO_TOUCH`). It never mutates anything.
 */

/** A normalized roster item. `start`/`end` are ISO-8601 UTC strings. */
export interface Duty {
  kind: 'FLY' | 'GRD'
  /** assignment code: 'FLY', 'DO', 'VAC', 'RES', 'SIM', 'GRD', 'ILL', ... */
  assignment: string
  /** pairing id for flying duties; null for ground rows */
  pairingId: number | null
  /** pairing label (e.g. 'V4110', 'F8601'); null for ground rows */
  pairingLabel: string | null
  /** number of flight segments in the pairing (0 for ground) */
  segCount: number
  /** roster_flight row ids this duty maps to (all segments for a pairing) */
  rosterIds: number[]
  start: string
  end: string
}

export type Disposition = 'DE_ASSIGN' | 'NO_TOUCH'

export interface ClassifiedDuty extends Duty {
  disposition: Disposition
  /** why this disposition was chosen (e.g. 'flying', 'sim-commute', 'vac-adjacent') */
  reason: string
}
