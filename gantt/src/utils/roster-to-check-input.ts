/**
 * Transform flat RosterItem[] for a crew into the CheckInput structure
 * expected by the rule engine API.
 *
 * RosterItem is a flat row (one per flight segment or ground task).
 * Rule engine expects a hierarchical pairing → duty → segment structure.
 */
import type { RosterItem } from '@/types'

/** Rule engine input types (mirrors rule-engine/src/types/input.ts) */

export interface FlightSegment {
  fltNo: string
  depPort: string
  arrPort: string
  stdUtc: string
  staUtc: string
  blockMinutes: number
  isNight: boolean
  fleetCode?: string
  isDeadhead?: boolean
}

export interface DutyPeriod {
  dutySeq: number
  reportUtc: string
  releaseUtc: string
  segments: FlightSegment[]
  restAfterMinutes?: number
}

export interface PairingInput {
  pairingId: number
  crewBase: string
  duties: DutyPeriod[]
  seatPosition?: string | null
}

export interface CheckInput {
  ruleGroupCode: string
  pairing: PairingInput
  crew?: {
    crewId: string
    division: string
    rank: string
    fleetQuals: string[]
    airportQuals: string[]
    recentFlightHours: {
      last24h: number
      last7d: number
      last28d: number
      last90d: number
      last365d: number
    }
  }
}

/** Crew qualification data (from crew-store cache) */
export interface CrewQuals {
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
}

/**
 * Group a crew's roster items by pairingId → dutySeq → segments,
 * then produce one CheckInput per pairing.
 *
 * @param qualsMap — optional map of crewId → quals from crew-store cache
 */
export const buildCheckInputs = (
  crewId: string,
  items: RosterItem[],
  ruleGroupCode: string,
  qualsMap?: Map<string, CrewQuals>,
): CheckInput[] => {
  const crewItems = items.filter((i) => i.crewId === crewId)
  if (crewItems.length === 0) return []

  // Only check items that belong to a real pairing (pairingId IS NOT NULL)
  // and contain at least one flight segment (FLT/DHD).
  // Ground-only tasks (OFF, SL, SBY, etc.) are not subject to FDP/duty rules.
  const flightItems = crewItems.filter(
    (i): i is typeof i & { pairingId: number } => i.pairingId != null && !!i.schStrDtUtc && !!i.schEndDtUtc,
  )

  // Group by pairingId
  const pairingMap = new Map<number, RosterItem[]>()
  for (const item of flightItems) {
    const arr = pairingMap.get(item.pairingId) ?? []
    arr.push(item)
    pairingMap.set(item.pairingId, arr)
  }

  const inputs: CheckInput[] = []
  const base = crewItems[0]?.base ?? ''

  for (const [pairingId, pItems] of pairingMap) {
    // Must have at least one flight segment to be worth checking
    const hasFlights = pItems.some((i) => i.assignmentGroup === 'FLT' || i.assignmentGroup === 'DHD')
    if (!hasFlights) continue

    // Group by dutySeq
    const dutyMap = new Map<number, RosterItem[]>()
    for (const item of pItems) {
      const seq = item.dutySeq ?? 1
      const arr = dutyMap.get(seq) ?? []
      arr.push(item)
      dutyMap.set(seq, arr)
    }

    const duties: DutyPeriod[] = []
    const sortedDutySeqs = [...dutyMap.keys()].sort((a, b) => a - b)

    for (const dutySeq of sortedDutySeqs) {
      const dutyItems = dutyMap.get(dutySeq)!
      // Sort segments by start time
      dutyItems.sort((a, b) => {
        const ta = new Date(a.schStrDtUtc!).getTime()
        const tb = new Date(b.schStrDtUtc!).getTime()
        return ta - tb
      })

      // Duty report = first segment start, release = last segment end
      const reportUtc = dutyItems[0].schStrDtUtc!
      const releaseUtc = dutyItems[dutyItems.length - 1].schEndDtUtc!

      // Build flight segments (only FLT/DHD assignment groups)
      const segments: FlightSegment[] = dutyItems
        .filter((i) => i.assignmentGroup === 'FLT' || i.assignmentGroup === 'DHD')
        .map((i) => {
          const startMs = new Date(i.schStrDtUtc!).getTime()
          const endMs = new Date(i.schEndDtUtc!).getTime()
          const blockMinutes = Math.round((endMs - startMs) / 60000)

          // Parse label for flight info: "CA1234 PEK-SHA" pattern
          const label = i.label ?? ''
          const parts = label.split(' ')
          const fltNo = parts[0] || i.assignment || ''
          const routeParts = (parts[1] || '').split('-')

          return {
            fltNo,
            depPort: routeParts[0] || '',
            arrPort: routeParts[1] || '',
            stdUtc: i.schStrDtUtc!,
            staUtc: i.schEndDtUtc!,
            blockMinutes,
            isNight: false,
            isDeadhead: i.assignmentGroup === 'DHD',
          }
        })

      duties.push({
        dutySeq,
        reportUtc,
        releaseUtc,
        segments,
      })
    }

    // Calculate rest between duties
    for (let i = 0; i < duties.length - 1; i++) {
      const releaseMs = new Date(duties[i].releaseUtc).getTime()
      const nextReportMs = new Date(duties[i + 1].reportUtc).getTime()
      duties[i].restAfterMinutes = Math.round((nextReportMs - releaseMs) / 60000)
    }

    if (duties.length > 0) {
      const quals = qualsMap?.get(crewId)
      // seatPosition = the acting rank for this crew on this pairing
      const seatPosition = pItems.find((i) => i.assignmentGroup === 'FLT' || i.assignmentGroup === 'DHD')?.flightActingRank ?? null

      inputs.push({
        ruleGroupCode,
        pairing: {
          pairingId,
          crewBase: base,
          duties,
          seatPosition,
        },
        crew: {
          crewId,
          division: quals?.division ?? crewItems[0]?.division ?? 'P',
          rank: quals?.rank ?? crewItems[0]?.flightActingRank ?? 'FO',
          fleetQuals: quals?.fleetQuals ?? [],
          airportQuals: quals?.airportQuals ?? [],
          recentFlightHours: {
            last24h: 0,
            last7d: 0,
            last28d: 0,
            last90d: 0,
            last365d: 0,
          },
        },
      })
    }
  }

  return inputs
}
