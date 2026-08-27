import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'
import type { Crew } from '@/types/crew'
import type { RosterItem } from '@/types/roster'
import type { Pairing, PairingSegment } from '@/types/pairing'

export type DayStatCategory = 'crew' | 'assignment' | 'layover' | 'open-pairing' | 'no-assignment'

export interface DayStatRow {
  id: string
  category: DayStatCategory
  crewId: string | null
  rank: string | null
  base: string | null
  assignmentGroup: string | null
  assignment: string | null
  pairingId: number | null
  pairingLabel: string | null
  startUtc: string | null
  endUtc: string | null
  source: 'Roster' | 'Layover' | 'Pairing'
  targetIds: {
    crewIds: string[]
    rosterTaskIds: number[]
    pairingIds: number[]
  }
}

export interface DayStatNode {
  id: string
  label: string
  count: number
  category: DayStatCategory
  rows: DayStatRow[]
  children: DayStatNode[]
}

export interface GanttDayStatisticsModel {
  date: string
  nodes: DayStatNode[]
  rows: DayStatRow[]
}

export interface GanttDayStatisticsInput {
  date: string
  timezone: string
  crews: readonly Crew[]
  rosterItems: readonly RosterItem[]
  pairings: readonly Pairing[]
  pairingSegments: readonly PairingSegment[]
  scenarioCrew?: ReadonlyArray<{ crewId: string; rank?: string | null; crewRank?: string | null; base?: string | null }>
}

const validText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const effectiveRank = (crew: Crew): string | null => validText(crew.panelRank) ?? validText(crew.ranks?.[0]?.rank)
const effectiveBase = (crew: Crew): string | null => validText(crew.panelBase) ?? validText(crew.bases?.[0]?.base)

const intersects = (start: number, end: number, dayStart: number, dayEnd: number): boolean =>
  Number.isFinite(start) && Number.isFinite(end) && start < dayEnd && end > dayStart

const interval = (
  actualStart: string | null | undefined,
  actualEnd: string | null | undefined,
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
): [string, string] | null => {
  const start = validText(actualStart) && validText(actualEnd) ? actualStart! : scheduledStart
  const end = validText(actualStart) && validText(actualEnd) ? actualEnd! : scheduledEnd
  return start && end ? [start, end] : null
}

const row = (
  category: DayStatCategory,
  values: Omit<DayStatRow, 'id' | 'category'>,
): DayStatRow => ({
  id: `${category}:${values.crewId ?? ''}:${values.pairingId ?? ''}:${values.targetIds.rosterTaskIds.join(',')}:${values.startUtc ?? ''}`,
  category,
  ...values,
})

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]

const node = (
  id: string,
  label: string,
  category: DayStatCategory,
  rows: DayStatRow[],
  children: DayStatNode[] = [],
): DayStatNode => ({
  id,
  label,
  category,
  count: rows.length,
  rows,
  children,
})

export const buildGanttDayStatistics = (input: GanttDayStatisticsInput): GanttDayStatisticsModel => {
  const dayStart = calendarDateToUtcMidnight(input.date, input.timezone).getTime()
  const dayEnd = endOfCalendarDayUtc(input.date, input.timezone).getTime() + 1

  const crewInfo = new Map<string, { rank: string; base: string; crewId: string }>()
  for (const crew of input.crews) {
    const rank = effectiveRank(crew)
    const base = effectiveBase(crew)
    if (rank && base) crewInfo.set(crew.crewId, { crewId: crew.crewId, rank, base })
  }
  for (const crew of input.scenarioCrew ?? []) {
    const rank = validText(crew.crewRank) ?? validText(crew.rank)
    const base = validText(crew.base)
    if (rank && base) crewInfo.set(crew.crewId, { crewId: crew.crewId, rank, base })
  }
  const rosterRows = input.rosterItems.flatMap((item) => {
    const times = interval(item.actStrDtUtc, item.actEndDtUtc, item.schStrDtUtc, item.schEndDtUtc)
    if (!times || !intersects(Date.parse(times[0]), Date.parse(times[1]), dayStart, dayEnd)) return []
    const owner = crewInfo.get(item.crewId)
    return [row('assignment', {
      crewId: item.crewId,
      rank: owner?.rank ?? item.activeRank ?? item.rosterActingRank ?? null,
      base: owner?.base ?? item.base ?? null,
      assignmentGroup: item.assignmentGroup,
      assignment: item.assignment,
      pairingId: item.pairingId,
      pairingLabel: item.pairingLabel ?? item.label,
      startUtc: times[0],
      endUtc: times[1],
      source: 'Roster',
      targetIds: { crewIds: [item.crewId], rosterTaskIds: [item.id], pairingIds: item.pairingId == null ? [] : [item.pairingId] },
    })]
  })

  const validCrewRows = [...crewInfo.values()].map((info) => row('crew', {
    crewId: info.crewId,
    rank: info.rank,
    base: info.base,
    assignmentGroup: null,
    assignment: null,
    pairingId: null,
    pairingLabel: null,
    startUtc: null,
    endUtc: null,
    source: 'Roster',
    targetIds: { crewIds: [info.crewId], rosterTaskIds: [], pairingIds: [] },
  }))

  const assignmentGroups = new Map<string, DayStatRow[]>()
  for (const item of rosterRows) {
    const group = item.assignmentGroup ?? '(blank)'
    assignmentGroups.set(group, [...(assignmentGroups.get(group) ?? []), item])
  }
  const assignmentNode = node('assignment', 'AssignmentGroup', 'assignment', rosterRows, [...assignmentGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => {
      const assignments = new Map<string, DayStatRow[]>()
      for (const item of rows) {
        const key = item.assignment ?? '(blank)'
        assignments.set(key, [...(assignments.get(key) ?? []), item])
      }
      return node(`assignment-group:${group}`, group, 'assignment', rows, [...assignments.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([assignment, children]) => node(`assignment:${group}:${assignment}`, assignment, 'assignment', children)))
    }))

  const rankGroups = new Map<string, DayStatRow[]>()
  for (const item of validCrewRows) {
    const rank = item.rank ?? '(blank)'
    rankGroups.set(rank, [...(rankGroups.get(rank) ?? []), item])
  }
  const crewNode = node('crew', 'Total Crew', 'crew', validCrewRows, [...rankGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rank, rows]) => node(`rank:${rank}`, rank, 'crew', rows)))

  const pairingById = new Map(input.pairings.map((pairing) => [pairing.id, pairing]))
  const assignedCrewByPairing = new Map<number, Map<string, RosterItem>>()
  for (const item of input.rosterItems) {
    if (item.pairingId == null) continue
    const byCrew = assignedCrewByPairing.get(item.pairingId) ?? new Map<string, RosterItem>()
    if (!byCrew.has(item.crewId)) byCrew.set(item.crewId, item)
    assignedCrewByPairing.set(item.pairingId, byCrew)
  }
  const layoverRows: DayStatRow[] = []
  const layoverKeys = new Set<string>()
  const dutiesByPairing = new Map<number, Map<number, { startUtc: string; endUtc: string }>>()
  for (const segment of input.pairingSegments) {
    const duties = dutiesByPairing.get(segment.pairingId) ?? new Map<number, { startUtc: string; endUtc: string }>()
    if (!duties.has(segment.dutySeq)) {
      duties.set(segment.dutySeq, {
        startUtc: segment.dutySchStrDtUtc,
        endUtc: segment.dutySchEndDtUtc,
      })
    }
    dutiesByPairing.set(segment.pairingId, duties)
  }

  for (const [pairingId, duties] of dutiesByPairing) {
    const orderedDuties = [...duties.entries()].sort(([a], [b]) => a - b)
    const pairing = pairingById.get(pairingId)
    // A layover exists only inside a multi-duty pairing. A single-duty pairing's
    // trailing REST is not an inter-duty layover and must never be reported here.
    if (!pairing || pairing.dutyCount <= 1 || orderedDuties.length <= 1) continue
    for (let index = 0; index < orderedDuties.length - 1; index++) {
      const [dutySeq, currentDuty] = orderedDuties[index]
      const nextDuty = orderedDuties[index + 1]?.[1]
      if (!nextDuty) continue
      const start = currentDuty.endUtc
      const end = nextDuty.startUtc
      const key = `${pairingId}:${dutySeq}`
      if (layoverKeys.has(key) || !intersects(Date.parse(start), Date.parse(end), dayStart, dayEnd)) continue
      layoverKeys.add(key)
      const assigned = [...(assignedCrewByPairing.get(pairingId)?.entries() ?? [])]
      const crewRows = assigned.length > 0 ? assigned : [[null, null] as const]
      for (const [crewId, assignedItem] of crewRows) {
        const owner = crewId == null ? undefined : crewInfo.get(crewId)
        layoverRows.push(row('layover', {
          crewId,
          rank: owner?.rank ?? assignedItem?.activeRank ?? assignedItem?.rosterActingRank ?? null,
          base: owner?.base ?? assignedItem?.base ?? null,
          assignmentGroup: pairing?.assignmentGroup ?? null,
          assignment: pairing?.assignment ?? null,
          pairingId,
          pairingLabel: pairing?.pairingLabel ?? null,
          startUtc: start,
          endUtc: end,
          source: 'Layover',
          targetIds: { crewIds: crewId == null ? [] : [crewId], rosterTaskIds: [], pairingIds: [pairingId] },
        }))
      }
    }
  }

  const assignedOnDay = new Set([
    ...rosterRows.map((item) => item.crewId).filter((id): id is string => id != null),
    ...layoverRows.map((item) => item.crewId).filter((id): id is string => id != null),
  ])
  const noAssignmentRows = validCrewRows
    .filter((item) => item.crewId != null && !assignedOnDay.has(item.crewId))
    .map((item) => ({
      ...item,
      category: 'no-assignment' as const,
      id: `no-assignment:${item.crewId}`,
    }))

  const openPairingRows = input.pairings.flatMap((pairing) => {
    const times = interval(pairing.actStrDtUtc, pairing.actEndDtUtc, pairing.schStrDtUtc, pairing.schEndDtUtc)
    const isOpen = pairing.composition.some((slot) => slot.plan - slot.fill > 0)
    if (!times || !isOpen || !intersects(Date.parse(times[0]), Date.parse(times[1]), dayStart, dayEnd)) return []
    return [row('open-pairing', {
      crewId: null,
      rank: null,
      base: null,
      assignmentGroup: pairing.assignmentGroup,
      assignment: pairing.assignment,
      pairingId: pairing.id,
      pairingLabel: pairing.pairingLabel,
      startUtc: times[0],
      endUtc: times[1],
      source: 'Pairing',
      targetIds: { crewIds: [], rosterTaskIds: [], pairingIds: [pairing.id] },
    })]
  })

  const layoverNode = node('layover', 'Layover', 'layover', layoverRows)
  const noAssignmentNode = node('no-assignment', 'No Assignment', 'no-assignment', noAssignmentRows)
  const openNode = node('open-pairing', 'Open Pairing', 'open-pairing', openPairingRows)
  const rows = [...validCrewRows, ...rosterRows, ...layoverRows, ...noAssignmentRows, ...openPairingRows]
  // The assignment-group node is a data grouping helper, not a user-facing
  // level. Show its two useful levels directly: group, then assignment.
  return { date: input.date, nodes: [crewNode, ...assignmentNode.children, layoverNode, noAssignmentNode, openNode], rows }
}

export const mergeTargetIds = (rows: readonly DayStatRow[]) => ({
  crewIds: unique(rows.flatMap((item) => item.targetIds.crewIds)),
  rosterTaskIds: unique(rows.flatMap((item) => item.targetIds.rosterTaskIds)),
  pairingIds: unique(rows.flatMap((item) => item.targetIds.pairingIds)),
})
