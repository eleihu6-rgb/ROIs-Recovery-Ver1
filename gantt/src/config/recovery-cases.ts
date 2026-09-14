/**
 * Curated crew-recovery disruption cases surfaced on the Dashboard Overview.
 *
 * Single source of truth for BOTH the "Disruption Cases" dashboard panel AND
 * the "Open in Live gantt" quick-link (which drives the existing global Filters
 * — pairing:id / crew:id / flight:fltNum — then centers + zooms the gantt on the
 * case). Keep this list aligned with the recovery Help topics and the
 * `.agents/skills/14{6,7,8}-recovery-case-*` fixtures.
 *
 * These four are fixed, documented demo incidents (like the Help recovery
 * topics), not runtime-derived state — so a typed const is the correct home,
 * not a business-constant lookup.
 */

export interface RecoveryCaseCrew {
  crewId: string
  rank: string
}

export interface RecoveryCaseResult {
  /** Total options offered (null when the case is measured only by executable count). */
  options: number | null
  executable: number
  filtered: number
}

export interface RecoveryCase {
  id: 'case-1' | 'case-2' | 'case-3' | 'case-4'
  caseNo: number
  /** Rule code that fires, e.g. '1001'. */
  ruleCode: string | null
  /** Short trigger label for the table, e.g. 'Crew sick leave'. */
  trigger: string
  pairingId: number | null
  /** Initial flight for an unpaired-flight incident; never a test pairing ID. */
  anchorFlightId?: number
  /** Candidate crew scope, not already assigned source crew. */
  candidateCrewIds?: string[]
  base: string
  fleet: string
  /** Human date span for the card, e.g. '2026-09-24 → 09-26'. */
  dateLabel: string
  /** Tight ISO window used to zoom the gantt onto the case. */
  windowStartIso: string
  windowEndIso: string
  /** Concerned crew (the recovery source(s) the controller decides on). */
  sourceCrew: RecoveryCaseCrew[]
  /** Flight numbers in the pairing (for display + flight filter float). */
  flights: string[]
  result: RecoveryCaseResult | null
  /** Cost ladder endpoints across the standby callout, e.g. '$0' / '~$2,287'. */
  costLow: string
  costHigh: string
  /** One-line recovery-options brief — short but informative. */
  optionsBrief: string
}

/** Validated recovery cases, in case order. */
export const RECOVERY_CASES: readonly RecoveryCase[] = [
  {
    id: 'case-1',
    caseNo: 1,
    ruleCode: '1001',
    trigger: 'Crew sick leave',
    pairingId: 152056,
    base: 'ADD',
    fleet: '7M8',
    dateLabel: '2026-09-24 → 09-25',
    windowStartIso: '2026-09-23T00:00:00Z',
    windowEndIso: '2026-09-26T00:00:00Z',
    sourceCrew: [{ crewId: 'J4002', rank: 'CA' }],
    flights: ['ET805', 'ET802', 'ET378', 'ET377', 'ET803', 'ET804'],
    result: { options: 9, executable: 9, filtered: 0 },
    costLow: '$0',
    costHigh: '~$2,287',
    optionsBrief:
      'An ILL absence overlaps J4002’s flying duty (Rule 1001). The retained flying duty is kept; recover it with a Standby Crew callout — 9 executable 7M8 CA reserves offered, cost spread $0 → ~$2,287 (some over guarantee hours).',
  },
  {
    id: 'case-2',
    caseNo: 2,
    ruleCode: '3007',
    trigger: 'Flight delay',
    pairingId: 152675,
    base: 'ADD',
    fleet: 'B787',
    dateLabel: '2026-09-29 → 09-30',
    windowStartIso: '2026-09-28T00:00:00Z',
    windowEndIso: '2026-10-01T00:00:00Z',
    sourceCrew: [{ crewId: 'T2001', rank: 'CA' }],
    flights: ['ET2681', 'ET2682', 'ET2683', 'ET2684'],
    result: { options: 8, executable: 8, filtered: 2 },
    costLow: '$0',
    costHigh: '~$2,400',
    optionsBrief:
      'A published departure delay pushes the FDP past limits (Rule 3007). After T2001 rejects the FDP-discretion proposal, the Standby Crew callout offers 8 executable B787 CA reserves ($0 → ~$2,400); 2 reserves are filtered by Rule 8002 (crammed manday) — the “roster must match manday” guard.',
  },
  {
    id: 'case-3',
    caseNo: 3,
    ruleCode: '8004',
    trigger: 'Aircraft fleet change',
    pairingId: 152227,
    base: 'ADD',
    fleet: '7M8',
    dateLabel: '2026-09-18 → 09-19',
    windowStartIso: '2026-09-17T12:00:00Z',
    windowEndIso: '2026-09-19T18:00:00Z',
    sourceCrew: [
      { crewId: 'L3002', rank: 'CA' },
      { crewId: 'L3006', rank: 'FO' },
      { crewId: 'L3007', rank: 'FO' },
    ],
    flights: ['ET452', 'ET453'],
    result: { options: 8, executable: 8, filtered: 0 },
    costLow: '$0',
    costHigh: '~$537',
    optionsBrief:
      'The flights change 788 → 7M8, so the rostered crew are no longer qualified (Rule 8004). The Standby Crew callout is fleet hard-filtered to 7M8: 8 executable reserves offered, cost spread $0 → ~$537.',
  },
  {
    id: 'case-4',
    caseNo: 4,
    ruleCode: null,
    trigger: 'Ad hoc new flight',
    pairingId: null,
    anchorFlightId: 159578,
    candidateCrewIds: Array.from({ length: 20 }, (_, i) => `C${4001 + i}`),
    base: 'ADD',
    fleet: '738',
    dateLabel: '2026-09-17 → 09-25',
    windowStartIso: '2026-09-17T00:00:00Z',
    windowEndIso: '2026-09-19T00:00:00Z',
    sourceCrew: [],
    flights: ['ET895', 'ET894'],
    result: null,
    costLow: '',
    costHigh: '',
    optionsBrief:
      'Ad hoc new flight: start from unpaired ET895 on 17 September (ADD–BJM). Search 17–25 September for a same-airline, same-fleet base-return pairing. Build saves the pairing immediately, then review Standby Crew, Available Crew or Move-up with Cost Library estimates. Roster changes use Preview → Apply → Save. C4001–C4020 are isolated candidates, not assigned crew; Cases 1–3 remain protected.',
  },
] as const
