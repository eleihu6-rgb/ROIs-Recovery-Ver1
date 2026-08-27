import { calendarDateInTimeZone, xToTime } from '@/components/gantt/gantt-utils'
import { rpForTimestamp } from '@/hooks/use-current-rp'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { normalizeUtcIso } from '@/components/gantt/gantt-utils'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import type { RosterItem } from '@/types/roster'

export interface ScheduleDetailRow {
  id: number
  type: string
  start: string
  end: string
  credit: string
  label: string
  pairing: string
  source: string
}

export interface ScheduleCrewOption {
  crewId: string
  label: string
}

export const formatScheduleMinutes = (raw: string | number | null | undefined): string => {
  if (raw == null || raw === '') return '-'
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

export const formatScheduleDateTime = (utc: string | null | undefined, zoneId: string): string => {
  if (!utc) return '-'
  const dt = new Date(normalizeUtcIso(utc))
  if (Number.isNaN(dt.getTime())) return '-'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt)
}

/**
 * Merge schedule sources without duplicating tasks.
 * Live Schedule Details combines the pane roster (which already holds the loaded
 * date-range buffer around the current RP) with a per-RP server fetch. When the
 * selected RP's start predates the loaded range, the same roster row appears in
 * both arrays; keep the FIRST occurrence so draft-applied pane items win.
 */
export const dedupeRosterItems = (items: readonly RosterItem[]): RosterItem[] => {
  const seen = new Set<number>()
  const out: RosterItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export interface TzResolution {
  zoneId: string
  airport: string
}

/**
 * Resolve the display timezone for a crew schedule dialog: prefer the crew's
 * base-airport timezone (matched against the timezone-options list), falling
 * back to the toolbar selection only when the base is unknown or not listed.
 */
export const resolveCrewDisplayTimezone = (
  crewBase: string | null | undefined,
  timezoneOptions: ReadonlyArray<{ airport: string; zoneId: string }>,
  fallback: TzResolution,
): TzResolution => {
  if (crewBase) {
    const match = timezoneOptions.find((opt) => opt.airport === crewBase)
    if (match?.zoneId) return { zoneId: match.zoneId, airport: match.airport }
  }
  return fallback
}

export const rosterItemStartsInRp = (item: RosterItem, rp: RosterPeriodOption | null, zoneId: string): boolean => {
  if (!rp || !item.schStrDtUtc) return true
  const start = new Date(normalizeUtcIso(item.schStrDtUtc))
  if (!Number.isFinite(start.getTime())) return false
  const startDate = calendarDateInTimeZone(start, zoneId)
  return startDate >= rp.rpStart && startDate <= rp.rpEnd
}

export const rosterItemOverlapsRp = (item: RosterItem, rp: RosterPeriodOption | null, zoneId = 'UTC'): boolean =>
  rosterItemStartsInRp(item, rp, zoneId)

export const scheduleTypeForItem = (item: RosterItem): string =>
  item.assignmentGroup || item.label || item.assignment || 'Task'

export const scheduleLabelForItem = (item: RosterItem): string => {
  const base = item.label || item.assignment || item.assignmentGroup || ''
  if (item.pairingId != null && item.pairingLabel && base) return `${base} · ${item.pairingLabel}`
  if (item.pairingId != null && item.pairingLabel) return item.pairingLabel
  return base || '-'
}

/** Minutes of a single item's credit, duty-level source first (matches per-row display). */
const dutyCreditMinutes = (item: RosterItem): number => {
  const raw = item.dutyActCreditedMinutes ?? item.actCreditedMinutes ?? item.schCreditedMinutes
  const n = raw != null && raw !== '' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : 0
}

const utcMs = (utc: string | null | undefined): number => (utc ? new Date(normalizeUtcIso(utc)).getTime() : NaN)

/** "id · interfaceId" for a pairing row, or "-" for standalone rows. */
const pairingCell = (item: RosterItem): string => {
  if (item.pairingId == null) return '-'
  return item.pairingInterfaceId ? `${item.pairingId} · ${item.pairingInterfaceId}` : String(item.pairingId)
}

/** Internal draft row used while grouping pairing items. */
interface ScheduleRowDraft {
  id: number
  type: string
  startUtc: string | null
  endUtc: string | null
  creditMinutes: number
  label: string
  pairing: string
  source: string
  duties: Set<string>
}

export const scheduleRowsForCrew = (
  items: readonly RosterItem[],
  crewId: string,
  rp: RosterPeriodOption | null,
  zoneId: string,
): ScheduleDetailRow[] => {
  const inScope = items.filter(
    (item) => item.id > 0 && item.crewId === crewId && rosterItemStartsInRp(item, rp, zoneId),
  )

  // Group pairing items into ONE row per pairing; standalone (DO/ground) items stay as rows.
  const pairingByPid = new Map<number, ScheduleRowDraft>()
  const singles: ScheduleRowDraft[] = []

  for (const item of inScope) {
    if (item.pairingId != null) {
      const dutyKey = `${item.pairingId}:${item.dutySeq ?? ''}`
      const existing = pairingByPid.get(item.pairingId)
      if (!existing) {
        pairingByPid.set(item.pairingId, {
          id: item.id,
          type: scheduleTypeForItem(item),
          startUtc: item.schStrDtUtc,
          endUtc: item.schEndDtUtc,
          creditMinutes: dutyCreditMinutes(item),
          label: item.pairingLabel || scheduleLabelForItem(item),
          pairing: pairingCell(item),
          source: item.source || '-',
          duties: new Set([dutyKey]),
        })
      } else {
        const sMs = utcMs(item.schStrDtUtc)
        const eMs = utcMs(item.schEndDtUtc)
        if (Number.isFinite(sMs) && (!existing.startUtc || sMs < utcMs(existing.startUtc))) existing.startUtc = item.schStrDtUtc
        if (Number.isFinite(eMs) && (!existing.endUtc || eMs > utcMs(existing.endUtc))) existing.endUtc = item.schEndDtUtc
        if (!existing.duties.has(dutyKey)) {
          existing.duties.add(dutyKey)
          existing.creditMinutes += dutyCreditMinutes(item)
        }
      }
    } else {
      singles.push({
        id: item.id,
        type: scheduleTypeForItem(item),
        startUtc: item.schStrDtUtc,
        endUtc: item.schEndDtUtc,
        creditMinutes: dutyCreditMinutes(item),
        label: scheduleLabelForItem(item),
        pairing: '-',
        source: item.source || '-',
        duties: new Set(),
      })
    }
  }

  return [...pairingByPid.values(), ...singles]
    .slice()
    .sort((a, b) => (utcMs(a.startUtc) || 0) - (utcMs(b.startUtc) || 0) || a.id - b.id)
    .map((row) => ({
      id: row.id,
      type: row.type,
      start: formatScheduleDateTime(row.startUtc, zoneId),
      end: formatScheduleDateTime(row.endUtc, zoneId),
      credit: formatScheduleMinutes(row.creditMinutes),
      label: row.label,
      pairing: row.pairing,
      source: row.source,
    }))
}

export const crewOptionsFromRoster = (
  items: readonly RosterItem[],
  crewNames?: ReadonlyMap<string, string>,
): ScheduleCrewOption[] => {
  const seen = new Set<string>()
  const options: ScheduleCrewOption[] = []
  for (const item of items) {
    if (!item.crewId || seen.has(item.crewId)) continue
    seen.add(item.crewId)
    const name = crewNames?.get(item.crewId)
    options.push({ crewId: item.crewId, label: name ? `${name} (${item.crewId})` : item.crewId })
  }
  return options.sort((a, b) => a.crewId.localeCompare(b.crewId, undefined, { numeric: true }))
}

export const getViewportRosterPeriodId = (scenarioId?: number | null): string => {
  const periods = useRosterPeriodStore.getState().items
  if (periods.length === 0) return ''
  if (scenarioId != null) {
    const st = getScenarioGanttStore(scenarioId).getState()
    if (!st.data) return ''
    const ms = xToTime(st.scrollX, new Date(st.data.strDtLoc), st.pxPerHour || 7).getTime()
    return String(rpForTimestamp(periods, ms)?.id ?? '')
  }
  const { scrollX, pxPerHour } = useGanttViewStore.getState()
  const rangeStart = usePaneStore.getState().dateRange.start
  const ms = xToTime(scrollX, rangeStart, pxPerHour || 7).getTime()
  return String(rpForTimestamp(periods, ms)?.id ?? '')
}
