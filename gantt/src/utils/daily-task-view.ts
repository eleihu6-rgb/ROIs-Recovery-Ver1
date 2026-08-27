import {
  calendarDateInTimeZone,
  calendarDateToUtcMidnight,
  endOfCalendarDayUtc,
  normalizeUtcIso,
} from '@/components/gantt/gantt-utils'
import { formatScheduleMinutes, scheduleLabelForItem } from '@/utils/schedule-details'
import type { RosterItem } from '@/types/roster'

export type DailyTaskStatus = 'flight' | 'reserve' | 'ground' | 'dayoff' | 'open'

export interface DailyTaskRange {
  startDate: string
  endDate: string
  label: string
}

export interface DailyTaskBlock {
  id: number
  label: string
  title: string
  color: string
  status: DailyTaskStatus
  startDate: string
  endDate: string
  sortStartMs: number
  assignment: string
  creditMinutes: number
}

export interface DailyTaskDay {
  date: string
  dayNumber: number
  inRange: boolean
  isToday: boolean
  status: DailyTaskStatus
  tasks: DailyTaskBlock[]
}

export interface DailyTaskStats {
  flightDays: number
  reserveDays: number
  groundDays: number
  dayOffDays: number
  openDays: number
  taskBlocks: number
  totalCreditMinutes: number
  maxConsecutiveWork: number
  maxConsecutiveOffOpen: number
  maxConsecutiveReserve: number
}

export interface DailyTaskCalendarModel {
  days: DailyTaskDay[]
  weeks: DailyTaskDay[][]
  stats: DailyTaskStats
}

const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const compareDate = (a: string, b: string): number => a.localeCompare(b)

const enumerateDates = (startDate: string, endDate: string): string[] => {
  const dates: string[] = []
  for (let d = startDate; compareDate(d, endDate) <= 0; d = addDays(d, 1)) {
    dates.push(d)
  }
  return dates
}

export const buildMonthRange = (yearMonth: string): DailyTaskRange => {
  const [year, month] = yearMonth.split('-').map(Number)
  const startDate = `${yearMonth}-01`
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { startDate, endDate, label: yearMonth }
}

export const shiftYearMonth = (yearMonth: string, deltaMonths: number): string => {
  const [year, month] = yearMonth.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const buildRpRange = (startDate: string, endDate: string, label: string): DailyTaskRange => ({
  startDate: startDate.slice(0, 10),
  endDate: endDate.slice(0, 10),
  label,
})

export const getRangeFetchBoundsUtc = (range: DailyTaskRange, timezone: string): { startDate: string; endDate: string } => ({
  startDate: calendarDateToUtcMidnight(range.startDate, timezone).toISOString(),
  endDate: endOfCalendarDayUtc(range.endDate, timezone).toISOString(),
})

export const getRangeFetchDateParams = (range: DailyTaskRange): { startDate: string; endDate: string } => ({
  startDate: range.startDate,
  endDate: range.endDate,
})

const parseCreditMinutes = (item: RosterItem): number => {
  const raw = item.dutyActCreditedMinutes ?? item.actCreditedMinutes ?? item.schCreditedMinutes
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

export const statusForRosterItem = (item: RosterItem): DailyTaskStatus => {
  const group = item.assignmentGroup?.toUpperCase() ?? ''
  const assignment = item.assignment?.toUpperCase() ?? ''
  const label = item.label?.toUpperCase() ?? ''
  if (item.pairingId != null || group === 'FLT' || group === 'DHD') return 'flight'
  if (['RES', 'SBY', 'ASBY', 'SSB'].some((code) => assignment === code || label.includes(code))) return 'reserve'
  if (['DO', 'OFF', 'OFFD'].some((code) => assignment === code || label === code) || group === 'LVE') return 'dayoff'
  return 'ground'
}

const statusRank: Record<DailyTaskStatus, number> = {
  flight: 5,
  reserve: 4,
  ground: 3,
  dayoff: 2,
  open: 1,
}

const primaryStatus = (tasks: readonly DailyTaskBlock[]): DailyTaskStatus => {
  let best: DailyTaskStatus = 'open'
  for (const task of tasks) {
    if (statusRank[task.status] > statusRank[best]) best = task.status
  }
  return best
}

const taskSortStartMs = (item: RosterItem, scheduledStart: Date): number => {
  if (!item.actStrDtUtc) return scheduledStart.getTime()
  const actualStart = new Date(normalizeUtcIso(item.actStrDtUtc))
  return Number.isFinite(actualStart.getTime()) ? actualStart.getTime() : scheduledStart.getTime()
}

const compareTaskBlocks = (a: DailyTaskBlock, b: DailyTaskBlock): number => {
  const byStart = a.sortStartMs - b.sortStartMs
  if (byStart !== 0) return byStart
  const aAssignment = a.assignment.toUpperCase()
  const bAssignment = b.assignment.toUpperCase()
  if (aAssignment === 'FLY' && bAssignment !== 'FLY') return -1
  if (bAssignment === 'FLY' && aAssignment !== 'FLY') return 1
  return aAssignment.localeCompare(bAssignment) || a.id - b.id
}

export const buildDailyTaskCalendarModel = (
  items: readonly RosterItem[],
  crewId: string,
  range: DailyTaskRange,
  timezone: string,
  colorForItem: (item: RosterItem) => string,
): DailyTaskCalendarModel => {
  const dates = enumerateDates(range.startDate, range.endDate)
  const byDate = new Map<string, DailyTaskBlock[]>()
  for (const date of dates) byDate.set(date, [])

  for (const item of items) {
    if (item.id <= 0 || item.crewId !== crewId || !item.schStrDtUtc || !item.schEndDtUtc) continue
    const start = new Date(normalizeUtcIso(item.schStrDtUtc))
    const end = new Date(normalizeUtcIso(item.schEndDtUtc))
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue
    const itemStartDate = calendarDateInTimeZone(start, timezone)
    const itemEndDate = calendarDateInTimeZone(end, timezone)
    if (compareDate(itemStartDate, range.startDate) < 0 || compareDate(itemStartDate, range.endDate) > 0) continue

    const block: DailyTaskBlock = {
      id: item.id,
      label: compactTaskLabel(item),
      title: `${scheduleLabelForItem(item)} · ${itemStartDate} to ${itemEndDate}`,
      color: colorForItem(item),
      status: statusForRosterItem(item),
      startDate: itemStartDate,
      endDate: itemEndDate,
      sortStartMs: taskSortStartMs(item, start),
      assignment: item.assignment ?? '~~~',
      creditMinutes: parseCreditMinutes(item),
    }
    byDate.get(itemStartDate)?.push(block)
  }

  const today = calendarDateInTimeZone(new Date(), timezone)
  const rangeDays = dates.map((date): DailyTaskDay => {
    const tasks = (byDate.get(date) ?? []).slice().sort(compareTaskBlocks)
    return {
      date,
      dayNumber: Number(date.slice(8, 10)),
      inRange: true,
      isToday: date === today,
      status: primaryStatus(tasks),
      tasks,
    }
  })
  const weeks = buildCalendarWeeks(rangeDays, range.startDate, range.endDate, timezone)
  return { days: rangeDays, weeks, stats: buildStats(rangeDays) }
}

export const compactTaskLabel = (item: RosterItem): string => {
  if (item.pairingId != null) {
    const base = item.label || `Pairing ${item.pairingId}`
    return item.assignment?.toUpperCase() === 'DHD' ? `DHD ${base}` : base
  }
  return item.label || item.assignment || item.assignmentGroup || 'Task'
}

const buildCalendarWeeks = (
  rangeDays: readonly DailyTaskDay[],
  startDate: string,
  endDate: string,
  timezone: string,
): DailyTaskDay[][] => {
  const firstDow = new Date(`${startDate}T12:00:00Z`).getUTCDay()
  const leading = (firstDow + 6) % 7
  const lastDow = new Date(`${endDate}T12:00:00Z`).getUTCDay()
  const trailing = (7 - ((lastDow + 6) % 7) - 1 + 7) % 7
  const cells: DailyTaskDay[] = []
  for (let i = leading; i > 0; i -= 1) cells.push(blankDay(addDays(startDate, -i), timezone))
  cells.push(...rangeDays)
  for (let i = 1; i <= trailing; i += 1) cells.push(blankDay(addDays(endDate, i), timezone))
  const weeks: DailyTaskDay[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const blankDay = (date: string, timezone: string): DailyTaskDay => ({
  date,
  dayNumber: Number(date.slice(8, 10)),
  inRange: false,
  isToday: date === calendarDateInTimeZone(new Date(), timezone),
  status: 'open',
  tasks: [],
})

const buildStats = (days: readonly DailyTaskDay[]): DailyTaskStats => {
  let maxWork = 0
  let maxOffOpen = 0
  let maxReserve = 0
  let workRun = 0
  let offOpenRun = 0
  let reserveRun = 0
  const uniqueTasks = new Map<number, DailyTaskBlock>()
  const stats: DailyTaskStats = {
    flightDays: 0,
    reserveDays: 0,
    groundDays: 0,
    dayOffDays: 0,
    openDays: 0,
    taskBlocks: 0,
    totalCreditMinutes: 0,
    maxConsecutiveWork: 0,
    maxConsecutiveOffOpen: 0,
    maxConsecutiveReserve: 0,
  }

  for (const day of days) {
    for (const task of day.tasks) uniqueTasks.set(task.id, task)
    if (day.status === 'flight') stats.flightDays += 1
    if (day.status === 'reserve') stats.reserveDays += 1
    if (day.status === 'ground') stats.groundDays += 1
    if (day.status === 'dayoff') stats.dayOffDays += 1
    if (day.status === 'open') stats.openDays += 1

    const isWork = day.status === 'flight' || day.status === 'reserve' || day.status === 'ground'
    workRun = isWork ? workRun + 1 : 0
    offOpenRun = day.status === 'dayoff' || day.status === 'open' ? offOpenRun + 1 : 0
    reserveRun = day.status === 'reserve' ? reserveRun + 1 : 0
    maxWork = Math.max(maxWork, workRun)
    maxOffOpen = Math.max(maxOffOpen, offOpenRun)
    maxReserve = Math.max(maxReserve, reserveRun)
  }

  stats.taskBlocks = uniqueTasks.size
  stats.totalCreditMinutes = Array.from(uniqueTasks.values()).reduce((sum, task) => sum + task.creditMinutes, 0)
  stats.maxConsecutiveWork = maxWork
  stats.maxConsecutiveOffOpen = maxOffOpen
  stats.maxConsecutiveReserve = maxReserve
  return stats
}

export const formatDailyTaskCredit = (minutes: number): string => formatScheduleMinutes(minutes)
