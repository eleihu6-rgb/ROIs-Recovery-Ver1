import { differenceInMinutes, parseISO } from 'date-fns'
import { ROW_HEIGHT, HEADER_HEIGHT, MIN_TASK_WIDTH, TASK_HEIGHT, TASK_PADDING, SEGMENT_FLIGHT_HEIGHT } from './gantt-constants'
import type { RosterItem } from '@/types'
import type { PaneType } from '@/types/pane'
import type { Pairing } from '@/types/pairing'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'

export interface RosterLaneHitLayout {
  laneIndex: number
  laneCount: number
}

/**
 * Normalize a UTC ISO timestamp string to guarantee UTC interpretation.
 * date-fns parseISO and new Date() both treat ISO strings without a timezone
 * indicator as LOCAL time. All timestamps in this app are UTC, so append 'Z'
 * when the indicator is missing.
 * Shared by parseIsoCached (gantt-utils) and timezone-store (toUtcDate).
 */
export const normalizeUtcIso = (s: string): string =>
  s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'

/**
 * R2 性能：ISO 时间戳 → Date 的记忆化解析。
 * 渲染热循环每帧对同一批可见 item 反复 parseISO；同一字符串只解析一次后命中缓存，
 * 渲染循环不再重复解析（PRD R2「数据落库即解析一次」的等价实现：解析结果按字符串缓存）。
 * 缓存键为不可变的 ISO 字符串，值为只读使用的 Date；超过上限时整表清空，内存有界。
 */
const ISO_CACHE_LIMIT = 200_000
const isoDateCache = new Map<string, Date>()
export const parseIsoCached = (iso: string): Date => {
  let d = isoDateCache.get(iso)
  if (d === undefined) {
    if (isoDateCache.size >= ISO_CACHE_LIMIT) isoDateCache.clear()
    d = parseISO(normalizeUtcIso(iso))
    isoDateCache.set(iso, d)
  }
  return d
}

/** P0-3: ISO → epoch-ms（复用 parseIsoCached 的 Date 缓存）。 */
export const parseIsoMs = (iso: string): number => parseIsoCached(iso).getTime()

/**
 * P0-3: UTC 模式下时间戳(epoch-ms) → X 像素，纯算术，避免 Date/date-fns。
 * 与 timeToX 的 'UTC' 分支**逐像素等价**：date-fns differenceInMinutes 截断到整分钟，
 * 这里用 Math.trunc 复刻同样的截断（朝零取整），保证输出完全一致。
 */
export const msToX = (ms: number, rangeStartMs: number, pxPerHour: number): number =>
  (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour

/**
 * Parse a stored "UTC-240" / "UTC+480" / "UTC+0" offset string into minutes.
 * West-of-UTC offsets are negative (e.g. "UTC-240" → -240, UTC-4h).
 */
export const parseUtcOffsetMinutes = (utcOffset: string): number => {
  const m = utcOffset.match(/UTC([+-]?\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

/**
 * Human clock-offset label for a stored "UTC-240" / "UTC+480" / "UTC+0" string:
 * renders as an H:MM offset, e.g. "UTC-240" → "-4:00", "UTC+480" → "+8:00".
 * UTC itself ("UTC+0") renders as "" (nothing shown).
 */
export const formatUtcOffset = (utcOffset: string): string => {
  const m = utcOffset.match(/UTC([+-]?\d+)/)
  if (!m) return utcOffset
  const minutes = parseInt(m[1], 10)
  if (minutes === 0) return ''
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const min = abs % 60
  return `${sign}${h}:${min.toString().padStart(2, '0')}`
}

/**
 * Convert a calendar date string ("YYYY-MM-DD") to the UTC timestamp that
 * represents local midnight (00:00) in the given IANA timezone.
 * DST-aware: uses noon UTC to sample the offset without DST ambiguity.
 *
 * Examples:
 *   "2026-03-01", "America/Toronto" (UTC-5 EST) → 2026-03-01T05:00:00Z
 *   "2026-03-01", "Asia/Shanghai"  (UTC+8)      → 2026-02-28T16:00:00Z
 *   "2026-03-01", "UTC"                          → 2026-03-01T00:00:00Z
 */
export const calendarDateToUtcMidnight = (dateStr: string, timezone: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day))
  }
  const noonUtcMs = Date.UTC(year, month - 1, day, 12)
  const offsetMinutes = getTimezoneOffset(new Date(noonUtcMs), timezone)
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60000)
}

/**
 * End of a calendar day ("YYYY-MM-DD") in the given IANA timezone =
 * that timezone's midnight of the NEXT day minus 1 ms, as a UTC Date.
 * Shared by the toolbar DateRangePicker and the AI set_date_range dispatch
 * so both interpret calendar dates identically (display-timezone semantics).
 */
export const endOfCalendarDayUtc = (dateStr: string, timezone: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number)
  // Next calendar day (JS handles month overflow correctly)
  const nextDayStr = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  return new Date(calendarDateToUtcMidnight(nextDayStr, timezone).getTime() - 1)
}

/**
 * Get timezone offset in minutes for a given UTC timestamp using IANA DST rules.
 * Returns positive for timezones ahead of UTC (east), negative for behind (west).
 * E.g., YOW in winter (UTC-5 EST) returns -300, HKG (UTC+8) returns +480.
 */
// F54-P02 性能：Intl.DateTimeFormat 构造非常昂贵，而 formatter 无状态可复用。
// 按 timeZone 缓存——getTimezoneOffset 在渲染热路径上（localDayBoundaries 每天
// 调用一次 × 每帧多个绘制函数 × 多个 pane）。
const tzFormatterCache = new Map<string, Intl.DateTimeFormat>()
const getTzFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let fmt = tzFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    tzFormatterCache.set(timeZone, fmt)
  }
  return fmt
}

/**
 * Calendar year-month (`YYYY-MM`) of a UTC instant AS SEEN in the given IANA timezone.
 * Reuses the cached tz formatter (same parts as `getTzFormatter`). Use this — not
 * `new Date(ms).getMonth()` (which reads the HOST/OS local tz) — whenever a month must
 * match the dates the user sees on the gantt (rendered in the display timezone). Mixing
 * OS-local month with the display tz silently resolves the viewport to the wrong month
 * for users whose OS tz differs from the display tz.
 */
export const yearMonthInTimeZone = (utcTime: Date, timezone: string): string => {
  const parts = getTzFormatter(timezone).formatToParts(utcTime)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** Calendar date (`YYYY-MM-DD`) of a UTC instant as seen in the display timezone. */
export const calendarDateInTimeZone = (utcTime: Date, timezone: string): string => {
  const parts = getTzFormatter(timezone).formatToParts(utcTime)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const getTimezoneOffset = (utcTime: Date, timezone: string): number => {
  if (timezone === 'UTC') return 0

  // Format the same moment in both UTC and target timezone (cached formatters)
  const utcFormatter = getTzFormatter('UTC')
  const localFormatter = getTzFormatter(timezone)

  const utcParts = utcFormatter.formatToParts(utcTime)
  const localParts = localFormatter.formatToParts(utcTime)

  const getPart = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find(p => p.type === type)?.value ?? '0')

  const utcDate = new Date(
    getPart(utcParts, 'year'), getPart(utcParts, 'month') - 1, getPart(utcParts, 'day'),
    getPart(utcParts, 'hour'), getPart(utcParts, 'minute')
  )
  const localDate = new Date(
    getPart(localParts, 'year'), getPart(localParts, 'month') - 1, getPart(localParts, 'day'),
    getPart(localParts, 'hour'), getPart(localParts, 'minute')
  )

  return (localDate.getTime() - utcDate.getTime()) / (60 * 1000)
}

/**
 * Compute UTC timestamps for local-day boundaries in [rangeStart, rangeEnd].
 *
 * timezone = IANA timezone ID (e.g. 'America/Toronto', 'UTC').
 * DST-aware: each day's offset is computed independently so spring-forward /
 * fall-back days have the correct local-midnight position in UTC.
 *
 * Algorithm: iterate UTC calendar days; for each UTC midnight compute the IANA
 * offset at that moment (DST transitions at 2 AM never affect midnight), then
 * derive the UTC time of local midnight as: UTC_midnight - offsetMinutes.
 *
 * Returns per-day:
 *   midnightUtcMs — UTC epoch ms when local midnight (00:00) occurs
 *   year/month/date/dow — local calendar fields (month is 0-based)
 */
export interface DayBoundary { midnightUtcMs: number; year: number; month: number; date: number; dow: number }

/**
 * F54-P02 性能：day-boundary 模型按 (rangeStart, rangeEnd, timezone) 记忆化。
 * 该函数被 drawTimelineHeader / drawGridLines / drawWeekendHighlight / drawTodayHighlight
 * 每帧每 pane 重复调用，而入参在滚动/缩放期间不变。结果数组只读使用。
 * 小容量 Map：drawTodayHighlight 的 ±2 天探测窗口键随 now 变化（永远 miss 但计算极小），
 * 用容量上限防止其污染导致无界增长。
 */
const DAY_BOUNDS_CACHE_LIMIT = 16
const dayBoundsCache = new Map<string, DayBoundary[]>()

export const localDayBoundaries = (
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): DayBoundary[] => {
  const cacheKey = `${rangeStart.getTime()}|${rangeEnd.getTime()}|${timezone}`
  const cached = dayBoundsCache.get(cacheKey)
  if (cached) return cached
  const result = computeLocalDayBoundaries(rangeStart, rangeEnd, timezone)
  if (dayBoundsCache.size >= DAY_BOUNDS_CACHE_LIMIT) {
    // Evict oldest entry (first inserted key)
    const oldest = dayBoundsCache.keys().next().value
    if (oldest !== undefined) dayBoundsCache.delete(oldest)
  }
  dayBoundsCache.set(cacheKey, result)
  return result
}

const computeLocalDayBoundaries = (
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): DayBoundary[] => {
  if (timezone === 'UTC') {
    // Fast path: UTC midnight = UTC midnight, no offset computation needed
    let utcMs = Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate())
    const result: Array<{ midnightUtcMs: number; year: number; month: number; date: number; dow: number }> = []
    while (utcMs <= rangeEnd.getTime() + 2 * 86400000) {
      const d = new Date(utcMs)
      result.push({ midnightUtcMs: utcMs, year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), dow: d.getUTCDay() })
      utcMs += 86400000
    }
    return result
  }

  // For IANA timezones: use getTimezoneOffset at UTC midnight of each day to derive
  // the UTC time of local midnight. DST transitions happen at 2 AM local time, so
  // they never affect midnight — the offset at UTC midnight is correct for local midnight.

  // Find the local calendar date that contains rangeStart
  const approxOffset = getTimezoneOffset(rangeStart, timezone)
  const localAtStart = new Date(rangeStart.getTime() + approxOffset * 60000)
  let utcMidnightMs = Date.UTC(localAtStart.getUTCFullYear(), localAtStart.getUTCMonth(), localAtStart.getUTCDate())

  const result: Array<{ midnightUtcMs: number; year: number; month: number; date: number; dow: number }> = []

  while (true) {
    // Offset at this UTC midnight (DST-aware for the timezone)
    const offsetMinutes = getTimezoneOffset(new Date(utcMidnightMs), timezone)
    const midnightUtcMs = utcMidnightMs - offsetMinutes * 60000

    if (midnightUtcMs > rangeEnd.getTime() + 2 * 86400000) break

    // Local calendar fields: apply offset to UTC midnight to get local midnight date
    const localMidnight = new Date(utcMidnightMs) // fake-UTC → local Y/M/D
    result.push({
      midnightUtcMs,
      year: localMidnight.getUTCFullYear(),
      month: localMidnight.getUTCMonth(),
      date: localMidnight.getUTCDate(),
      dow: localMidnight.getUTCDay(),
    })

    utcMidnightMs += 86400000
  }

  return result
}

/**
 * Convert a UTC timestamp to X pixel position relative to the chart origin.
 * @param time - UTC timestamp (ISO string or Date object)
 * @param rangeStart - UTC timestamp representing local 00:00 of the visible range
 * @param pxPerHour - Zoom level (pixels per hour)
 * @param timezone - IANA timezone ID (e.g., 'America/Toronto', 'UTC')
 */
export const timeToX = (time: Date | string, rangeStart: Date, pxPerHour: number, timezone: string = 'UTC'): number => {
  const utcDate = typeof time === 'string' ? parseIsoCached(time) : time

  if (timezone === 'UTC') {
    // UTC mode: directly compare timestamps
    const minutesFromStart = differenceInMinutes(utcDate, rangeStart)
    return (minutesFromStart / 60) * pxPerHour
  }

  // Local timezone mode:
  // Get the offset at the task's UTC time
  const offsetMinutes = getTimezoneOffset(utcDate, timezone)

  // Convert UTC to local minutes: localMinutes = utcMinutes + offset
  // For YOW UTC-5: offset = -300
  // UTC 23:30 → local 18:30 (23:30 - 5:00 = 18:30)
  const utcMinutes = utcDate.getTime() / (60 * 1000)
  const localMinutes = utcMinutes + offsetMinutes

  // rangeStart should represent local 00:00 of the visible range
  // We need to compute its position in the same coordinate system
  const rangeStartOffset = getTimezoneOffset(rangeStart, timezone)
  const rangeStartUtcMinutes = rangeStart.getTime() / (60 * 1000)
  const rangeStartLocalMinutes = rangeStartUtcMinutes + rangeStartOffset

  const minutesFromStart = localMinutes - rangeStartLocalMinutes
  return (minutesFromStart / 60) * pxPerHour
}

/**
 * Convert an X pixel position back to a Date.
 */
export const xToTime = (x: number, rangeStart: Date, pxPerHour: number): Date => {
  const minutesFromStart = (x / pxPerHour) * 60
  return new Date(rangeStart.getTime() + minutesFromStart * 60 * 1000)
}

/**
 * Convert a row index to Y pixel position (relative to pane content, below header).
 */
export const rowToY = (rowIndex: number): number => {
  return HEADER_HEIGHT + rowIndex * ROW_HEIGHT
}

/**
 * Convert a Y pixel position (absolute including scroll) to a row index.
 * When frozenRowCount > 0, clicks in the frozen zone map to frozen rows (ignoring scrollY),
 * clicks below map to scrollable rows (adjusted by scrollY).
 */
export const yToRow = (y: number, scrollY = 0, frozenRowCount = 0): number => {
  const frozenZone = frozenRowCount * ROW_HEIGHT
  const relY = y - HEADER_HEIGHT
  if (frozenRowCount > 0 && relY < frozenZone) {
    // In frozen zone
    return Math.floor(relY / ROW_HEIGHT)
  }
  // In scrollable zone
  return Math.floor((relY + scrollY) / ROW_HEIGHT)
}

/**
 * Calculate the total chart width in pixels for a given date range and zoom level.
 */
export const getChartWidth = (rangeStart: Date, rangeEnd: Date, pxPerHour: number): number => {
  const totalMinutes = differenceInMinutes(rangeEnd, rangeStart)
  return (totalMinutes / 60) * pxPerHour
}

/**
 * Calculate the total chart height for a given number of rows.
 */
export const getChartHeight = (rowCount: number): number => {
  return HEADER_HEIGHT + rowCount * ROW_HEIGHT
}

/**
 * Clamp a desired roster vertical scroll offset to [0, maxScroll], where
 * maxScroll = rowCount * ROW_HEIGHT - (containerHeight - HEADER_HEIGHT) (floored at 0).
 * Single source of truth for the roster wheel/scroll clamp shared by the shared
 * roster pane + both source adapters (Live inline onScroll, Scenario closure).
 */
export const clampRosterScrollY = (
  desired: number,
  rowCount: number,
  containerHeight: number,
): number => {
  const maxScroll = Math.max(0, rowCount * ROW_HEIGHT - (containerHeight - HEADER_HEIGHT))
  return Math.max(0, Math.min(maxScroll, desired))
}

/**
 * Build the roster-model lookup indexes in a single pass over the flat item list.
 * Shared by both the Live and Scenario source adapters (one model → one set of
 * indexes for both businesses):
 *   - taskById: O(1) hit-test / click / right-click / hover lookup (replaces linear find)
 *   - itemsByPairingId: O(1) pairing-violation expansion + pairing-group selection
 * itemsByCrew is produced upstream (Live: buildItemsByCrew; Scenario:
 * buildScenarioRosterItems), so it is intentionally NOT rebuilt here.
 */
export const buildRosterIndexes = (
  items: RosterItem[],
): { taskById: Map<number, RosterItem>; itemsByPairingId: Map<number, RosterItem[]> } => {
  const taskById = new Map<number, RosterItem>()
  const itemsByPairingId = new Map<number, RosterItem[]>()
  for (const it of items) {
    taskById.set(it.id, it)
    if (it.pairingId != null) {
      let arr = itemsByPairingId.get(it.pairingId)
      if (!arr) { arr = []; itemsByPairingId.set(it.pairingId, arr) }
      arr.push(it)
    }
  }
  return { taskById, itemsByPairingId }
}

/**
 * Multi-key sort of roster left-panel rows by their DISPLAYED `values[column]`.
 *
 * The single sort comparator shared by BOTH the Live and Scenario roster sources (§Gantt-Unify):
 * sorting operates on the panel-row values the user actually sees, so EVERY column — including
 * computed stats like MCred / MDO that live only on the built panel row, not on the raw crew
 * record — sorts identically in Live and Scenario. A column is compared numerically when both
 * values parse as numbers or HH:MM durations, otherwise by locale string compare. Ties fall through to `defaultCmp`
 * (each context supplies its own baseline order: Live = rank order, Scenario = seniority).
 * Returns a new array; does not mutate the input.
 */
export const sortPanelRowsByValues = (
  rows: PanelRowData[],
  criteria: ReadonlyArray<{ column: string; direction: 'asc' | 'desc' }>,
  defaultCmp: (a: PanelRowData, b: PanelRowData) => number,
): PanelRowData[] => {
  if (criteria.length === 0) return [...rows].sort(defaultCmp)
  return [...rows].sort((a, b) => {
    for (const { column, direction } of criteria) {
      const va = String(a.values[column] ?? '')
      const vb = String(b.values[column] ?? '')
      const na = panelSortNumber(va), nb = panelSortNumber(vb)
      const numeric = na != null && nb != null
      const cmp = numeric ? na - nb : va.localeCompare(vb)
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
    }
    return defaultCmp(a, b)
  })
}

const panelSortNumber = (value: string): number | null => {
  if (value === '') return null
  const numeric = Number(value)
  if (!Number.isNaN(numeric)) return numeric
  const duration = /^(\d+):([0-5]\d)$/.exec(value)
  if (!duration) return null
  return Number(duration[1]) * 60 + Number(duration[2])
}

/**
 * Get the visible row range for virtual rendering.
 */
export const getVisibleRowRange = (
  scrollY: number,
  canvasHeight: number,
  totalRows: number,
  rowHeight = ROW_HEIGHT,
): { first: number; last: number } => {
  const first = Math.max(0, Math.floor(scrollY / rowHeight))
  const last = Math.min(totalRows - 1, Math.ceil((scrollY + canvasHeight - HEADER_HEIGHT) / rowHeight))
  return { first, last }
}

const rosterLaneBand = (
  rowIndex: number,
  scrollY: number,
  frozenRowCount: number,
  laneIndex: number,
  laneCount: number,
): { y: number; height: number } => {
  const rowCanvasY =
    rowIndex < frozenRowCount
      ? HEADER_HEIGHT + rowIndex * ROW_HEIGHT
      : HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY

  if (laneCount <= 1) {
    return {
      y: rowCanvasY + Math.floor(ROW_HEIGHT / 2) - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2),
      height: SEGMENT_FLIGHT_HEIGHT,
    }
  }

  const gap = laneCount >= 4 ? 1 : 2
  const topPadding = 3
  const availableHeight = ROW_HEIGHT - topPadding * 2 - gap * (laneCount - 1)
  const laneHeight = Math.max(6, Math.floor(availableHeight / laneCount))
  return {
    y: rowCanvasY + topPadding + laneIndex * (laneHeight + gap),
    height: laneHeight,
  }
}

/**
 * Hit-test: find which task is at a given pixel coordinate.
 * Returns the task item or null.
 */
export const hitTestTask = (
  x: number,
  y: number,
  scrollX: number,
  scrollY: number,
  items: RosterItem[],
  crewIds: string[],
  rangeStart: Date,
  pxPerHour: number,
  frozenRowCount = 0,
  // QW4: 提供按 crewId 预分桶的索引时，仅取该行的桶，避免每次命中测试 O(总数) 过滤。
  itemsByCrew?: Map<string, RosterItem[]>,
  laneLayoutByTaskId?: Map<number, RosterLaneHitLayout>,
): RosterItem | null => {
  const absoluteX = x + scrollX

  const rowIndex = yToRow(y, scrollY, frozenRowCount)
  if (rowIndex < 0 || rowIndex >= crewIds.length) return null

  const crewId = crewIds[rowIndex]
  const crewTasks = itemsByCrew ? (itemsByCrew.get(crewId) ?? []) : items.filter((item) => item.crewId === crewId)

  let firstTimeMatch: RosterItem | null = null
  for (const task of crewTasks) {
    if (!task.schStrDtUtc || !task.schEndDtUtc) continue

    const taskStart = parseIsoCached(task.schStrDtUtc)
    const taskEnd = parseIsoCached(task.schEndDtUtc)
    const taskX = timeToX(taskStart, rangeStart, pxPerHour)
    const taskEndX = timeToX(taskEnd, rangeStart, pxPerHour)
    const taskWidth = Math.max(taskEndX - taskX, MIN_TASK_WIDTH)

    if (absoluteX >= taskX && absoluteX <= taskX + taskWidth) {
      if (!laneLayoutByTaskId) return task
      firstTimeMatch ??= task
      const lane = laneLayoutByTaskId.get(task.id)
      if (!lane) continue
      const band = rosterLaneBand(rowIndex, scrollY, frozenRowCount, lane.laneIndex, lane.laneCount)
      if (y >= band.y && y <= band.y + band.height) return task
    }
  }

  return laneLayoutByTaskId ? null : firstTimeMatch
}

/**
 * Find all RosterItems that visually intersect a rubber-band rectangle.
 * All coordinates are canvas-local (pixels from the canvas element's top-left corner).
 * The function converts X to absolute (time-based) internally using scrollX.
 */
export const hitTestTasksInRect = (
  rectX1: number,
  rectY1: number,
  rectX2: number,
  rectY2: number,
  scrollX: number,
  scrollY: number,
  items: RosterItem[],
  crewIds: string[],
  rangeStart: Date,
  pxPerHour: number,
  frozenRowCount = 0,
  // P2-1（ver3）：提供按 crewId 预分桶时，仅遍历落在矩形 Y 区间内的行的桶，
  // 避免旧实现对全部 item 逐个 crewIds.indexOf（O(items×crews)）。
  itemsByCrew?: Map<string, RosterItem[]>,
): RosterItem[] => {
  const minX = Math.min(rectX1, rectX2)
  const maxX = Math.max(rectX1, rectX2)
  const minY = Math.min(rectY1, rectY2)
  const maxY = Math.max(rectY1, rectY2)

  // Convert canvas-local X to absolute (time-axis) X
  const absMinX = minX + scrollX
  const absMaxX = maxX + scrollX

  const result: RosterItem[] = []

  // 先按行遍历：跳过 Y 区间外的行（O(1)），只对落入区间的行取该行的 item。
  for (let rowIndex = 0; rowIndex < crewIds.length; rowIndex++) {
    const rowCanvasY =
      rowIndex < frozenRowCount
        ? HEADER_HEIGHT + rowIndex * ROW_HEIGHT
        : HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY
    const taskY = rowCanvasY + TASK_PADDING
    const taskYEnd = taskY + TASK_HEIGHT
    if (minY > taskYEnd || maxY < taskY) continue // 行不在矩形内

    const crewId = crewIds[rowIndex]
    const rowItems = itemsByCrew
      ? (itemsByCrew.get(crewId) ?? [])
      : items.filter((i) => i.crewId === crewId)

    for (const item of rowItems) {
      if (!item.schStrDtUtc || !item.schEndDtUtc) continue
      const taskX = timeToX(item.schStrDtUtc, rangeStart, pxPerHour)
      const rawEndX = timeToX(item.schEndDtUtc, rangeStart, pxPerHour)
      const taskEndX = Math.max(rawEndX, taskX + MIN_TASK_WIDTH)
      if (absMinX > taskEndX || absMaxX < taskX) continue
      result.push(item)
    }
  }

  return result
}

/**
 * Get the bounding rect of a task block in absolute chart coordinates.
 */
export const getTaskRect = (
  task: RosterItem,
  crewIds: string[],
  rangeStart: Date,
  pxPerHour: number,
): { x: number; y: number; width: number; height: number } | null => {
  if (!task.schStrDtUtc || !task.schEndDtUtc) return null

  const rowIndex = crewIds.indexOf(task.crewId)
  if (rowIndex === -1) return null

  const taskStart = parseIsoCached(task.schStrDtUtc)
  const taskEnd = parseIsoCached(task.schEndDtUtc)
  const x = timeToX(taskStart, rangeStart, pxPerHour)
  const endX = timeToX(taskEnd, rangeStart, pxPerHour)
  const width = Math.max(endX - x, MIN_TASK_WIDTH)
  const y = rowToY(rowIndex) + 4

  return { x, y, width, height: ROW_HEIGHT - 8 }
}

/**
 * Draw a rounded rectangle path on a canvas context.
 */
export const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
}

/**
 * Fill a rounded rectangle with a vertical gradient (top color -> bottom color).
 * Use for task block backgrounds to create depth.
 */
export const gradientFill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colorTop: string,
  colorBottom: string,
  radius = 3,
): void => {
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, colorTop)
  grad.addColorStop(1, colorBottom)
  ctx.fillStyle = grad
  ctx.beginPath()
  roundedRect(ctx, x, y, w, h, radius)
  ctx.fill()
}

/**
 * Draw text with ellipsis truncation when it exceeds maxWidth.
 * More efficient than clip-based approach for single-line text.
 */
export const drawEllipsisText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void => {
  if (maxWidth <= 0) return
  const measured = ctx.measureText(text)
  if (measured.width <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  // Binary search for the right truncation point
  const ellipsis = '\u2026'
  const ellipsisWidth = ctx.measureText(ellipsis).width
  const available = maxWidth - ellipsisWidth
  if (available <= 0) {
    ctx.fillText(ellipsis, x, y)
    return
  }
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid)).width <= available) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  ctx.fillText(text.slice(0, lo) + ellipsis, x, y)
}

/**
 * Determine whether to use white or black text on a given background color.
 * Uses relative luminance (WCAG formula).
 */
export const getContrastTextColor = (bgColor: string): string => {
  const hex = bgColor.replace('#', '')
  if (hex.length < 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  // sRGB -> linear
  const toLinear = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.4 ? '#1f2937' : '#ffffff'
}

/**
 * Lighten a hex color by a percentage (0-1). Used for gradient top highlight.
 */
export const lightenColor = (hex: string, amount: number): string => {
  const c = hex.replace('#', '')
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + Math.round(255 * amount))
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + Math.round(255 * amount))
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + Math.round(255 * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Darken a hex color by a percentage (0-1). Used for borders.
 */
export const darkenColor = (hex: string, amount: number): string => {
  const c = hex.replace('#', '')
  const r = Math.max(0, parseInt(c.slice(0, 2), 16) - Math.round(255 * amount))
  const g = Math.max(0, parseInt(c.slice(2, 4), 16) - Math.round(255 * amount))
  const b = Math.max(0, parseInt(c.slice(4, 6), 16) - Math.round(255 * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Determine if a drag operation is allowed between two pane types.
 */
export const isDragAllowed = (sourcePaneType: PaneType, targetPaneType: PaneType): boolean => {
  const isRosterPane = (paneType: PaneType): boolean =>
    paneType.startsWith('roster') || paneType === 'scenario-roster'
  const isPairingPane = (paneType: PaneType): boolean =>
    paneType === 'pairing' || paneType === 'scenario-pairing'

  // Roster <-> Roster (Live main/sub and Scenario)
  if (isRosterPane(sourcePaneType) && isRosterPane(targetPaneType)) return true
  // Pairing -> Roster
  if (isPairingPane(sourcePaneType) && isRosterPane(targetPaneType)) return true
  // Flight -> Roster
  if (sourcePaneType === 'flight' && isRosterPane(targetPaneType)) return true
  // Flight -> Pairing is Live-only; Scenario Pairing Pane is read-only for pairing definitions.
  if (sourcePaneType === 'flight' && targetPaneType === 'pairing') return true
  return false
}

/**
 * Format block minutes to HH:MM display string.
 */
export const formatBlockMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Per-slot composition display segment for mixed-color rendering */
export interface CompositionSegment {
  text: string
  isRed: boolean
}

/**
 * Build per-slot composition segments for the Pairing Pane second row.
 * Each slot is evaluated independently: fill===plan → normal color; fill<plan → red.
 * Full slot: "RANK(plan)" — no ratio, no red.
 * Partial slot: "RANK(plan:fill)" — shown in red.
 *
 * When `rankOrder` is provided (rank.display_order lookup), slots are sorted so
 * higher ranks (lower display_order) appear first — e.g. CA before FO. Without a
 * map, input array order is preserved (backward compatible).
 */
export const buildCompositionSegments = (
  pairing: Pairing,
  rankOrder?: ReadonlyMap<string, number>,
): CompositionSegment[] => {
  if (!pairing.composition || !Array.isArray(pairing.composition)) {
    return [{ text: '-', isRed: false }]
  }
  const slots = rankOrder
    ? [...pairing.composition].sort((a, b) => {
        const oa = rankOrder.get(a.rank) ?? Number.MAX_SAFE_INTEGER
        const ob = rankOrder.get(b.rank) ?? Number.MAX_SAFE_INTEGER
        if (oa !== ob) return oa - ob
        return a.rank.localeCompare(b.rank)
      })
    : pairing.composition
  return slots.map((slot): CompositionSegment => {
    if (slot.fill === slot.plan) {
      return { text: `${slot.rank}(${slot.plan})`, isRed: false }
    }
    return { text: `${slot.rank}(${slot.plan}:${slot.fill})`, isRed: true }
  })
}

/**
 * Build the composition display string for a pairing (used for sorting).
 * Full: "FCN(2)FFO(2)"
 * Partial: "FCN(1:0)FFO(1:0)"
 */
export const buildCompositionString = (
  pairing: Pairing,
  rankOrder?: ReadonlyMap<string, number>,
): string => {
  return buildCompositionSegments(pairing, rankOrder).map((s) => s.text).join('')
}

/**
 * Flight pane row sort — single source of truth shared by flight-pane and the test-hook probe.
 * Sorts a copy of `items` by `sortColumn` ('regNo' | 'fleet') and `sortDirection`.
 * Returns the original array reference when `sortColumn` is null (no copy).
 */
export const sortFlightRows = <T extends { registration: string; fleet: string }>(
  items: T[],
  sortColumn: string | null,
  sortDirection: 'asc' | 'desc',
): T[] => {
  if (!sortColumn) return items
  return [...items].sort((a, b) => {
    let va: string
    let vb: string
    switch (sortColumn) {
      case 'regNo': va = a.registration; vb = b.registration; break
      case 'fleet': va = a.fleet; vb = b.fleet; break
      default: va = ''; vb = ''; break
    }
    const cmp = va.localeCompare(vb)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

/**
 * Pairing pane row sort — single source of truth shared by pairing-pane and the test-hook probe.
 * Sorts a copy of `items` by `sortColumn` ('fleet' | 'blh' | 'composition') and `sortDirection`.
 * Returns the original array reference when `sortColumn` is null/undefined (no copy).
 * Numeric columns (blh) compare numerically; string columns use localeCompare.
 */
export const sortPairingRows = <T extends { pairing: Pairing }>(
  items: T[],
  sortColumn: string | null | undefined,
  sortDirection: 'asc' | 'desc',
): T[] => {
  if (!sortColumn) return items
  return [...items].sort((a, b) => {
    const getVal = (item: T): string => {
      const p = item.pairing
      switch (sortColumn) {
        case 'fleet': return p.fleet ?? ''
        case 'blh': return String(p.blockMinutes ?? 0)
        case 'composition': return buildCompositionString(p)
        default: return ''
      }
    }
    const va = getVal(a), vb = getVal(b)
    const na = Number(va), nb = Number(vb)
    const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

/**
 * Frozen-first reorder — single source of truth shared by flight-pane and the test-hook probe.
 * Partitions `rows` into frozen (in `frozenIds`) and nonFrozen, returning both segments
 * so callers can concatenate and/or co-partition sibling arrays.
 */
export const reorderFrozenFirst = <T extends { registration: string }>(
  rows: T[],
  frozenIds: Set<string> | string[],
): { frozen: T[]; nonFrozen: T[] } => {
  const frozenSet = frozenIds instanceof Set ? frozenIds : new Set(frozenIds)
  const frozen: T[] = []
  const nonFrozen: T[] = []
  for (const row of rows) {
    if (frozenSet.has(row.registration)) frozen.push(row)
    else nonFrozen.push(row)
  }
  return { frozen, nonFrozen }
}
