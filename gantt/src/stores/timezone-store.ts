import { create } from 'zustand'
import { normalizeUtcIso } from '@/components/gantt/gantt-utils'

export interface TzOption {
  airport: string
  airportName: string
  zoneId: string
  utcOffset: string
  isBase: boolean
}

interface TimezoneStore {
  timezone: string
  timezoneAirport: string
  timezoneOptions: TzOption[]
  /** Per-scenario timezone selections keyed by scenarioId */
  scenarioTimezones: Record<number, { timezone: string; timezoneAirport: string }>
  setTimezone: (zoneId: string, airport: string) => void
  setOptions: (options: TzOption[]) => void
  /** Save per-scenario timezone and apply it globally */
  setScenarioTimezone: (scenarioId: number, zoneId: string, airport: string) => void
  /** Apply the saved timezone for a scenario (or UTC if none saved) to the global state */
  applyScenarioTimezone: (scenarioId: number) => void
  /** Restore the Live Gantt timezone from its persisted value (called when switching away from scenario tabs) */
  applyLiveTimezone: () => void
}

const TIMEZONE_STORAGE_KEY = 'gantt-timezone'
const SCENARIO_TZ_STORAGE_KEY = 'gantt-scenario-timezones'

const savedTz = (() => {
  try {
    const raw = localStorage.getItem(TIMEZONE_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { timezone: string; timezoneAirport: string }
  } catch { /* ignore */ }
  return null
})()

const savedScenarioTzs = (() => {
  try {
    const raw = localStorage.getItem(SCENARIO_TZ_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<number, { timezone: string; timezoneAirport: string }>
  } catch { /* ignore */ }
  return {}
})()

export const useTimezoneStore = create<TimezoneStore>((set, get) => ({
  timezone: savedTz?.timezone ?? 'UTC',
  timezoneAirport: savedTz?.timezoneAirport ?? 'UTC',
  timezoneOptions: [
    { airport: 'UTC', airportName: 'Coordinated Universal Time', zoneId: 'UTC', utcOffset: 'UTC+0', isBase: false },
  ],
  scenarioTimezones: savedScenarioTzs,
  setTimezone: (zoneId, airport) => {
    set({ timezone: zoneId, timezoneAirport: airport })
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, JSON.stringify({ timezone: zoneId, timezoneAirport: airport }))
    } catch { /* ignore storage errors */ }
  },
  setOptions: (options) => set({ timezoneOptions: options }),
  setScenarioTimezone: (scenarioId, zoneId, airport) => {
    const nextMap = { ...get().scenarioTimezones, [scenarioId]: { timezone: zoneId, timezoneAirport: airport } }
    set({ scenarioTimezones: nextMap, timezone: zoneId, timezoneAirport: airport })
    try {
      localStorage.setItem(SCENARIO_TZ_STORAGE_KEY, JSON.stringify(nextMap))
    } catch { /* ignore storage errors */ }
  },
  applyScenarioTimezone: (scenarioId) => {
    const saved = get().scenarioTimezones[scenarioId]
    const tz = saved ?? { timezone: 'UTC', timezoneAirport: 'UTC' }
    set({ timezone: tz.timezone, timezoneAirport: tz.timezoneAirport })
  },
  applyLiveTimezone: () => {
    // Re-read from localStorage so we always apply the latest Live selection,
    // even if it was changed in another tab while a scenario was active.
    try {
      const raw = localStorage.getItem(TIMEZONE_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { timezone: string; timezoneAirport: string }
        set({ timezone: saved.timezone, timezoneAirport: saved.timezoneAirport })
        return
      }
    } catch { /* ignore */ }
    set({ timezone: 'UTC', timezoneAirport: 'UTC' })
  },
}))

// P0-4 性能：formatTime 在 Canvas 绘制热路径里被每个 puck 调用多次/每帧。
// 旧实现每次都 new Intl.DateTimeFormat + new Date（构造昂贵）。
// 这里缓存 (1) 按时区复用的 formatter，(2) 纯函数结果（zone|timestamp → "HH:MM"）。
const formatterByZone = new Map<string, Intl.DateTimeFormat>()
const getTimeFormatter = (zoneId: string): Intl.DateTimeFormat => {
  let f = formatterByZone.get(zoneId)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zoneId,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    formatterByZone.set(zoneId, f)
  }
  return f
}

const FORMATTED_TIME_CACHE_LIMIT = 200_000
const formattedTimeCache = new Map<string, string>()

/**
 * Guarantee UTC interpretation for a timestamp string before passing to new Date().
 * new Date() treats ISO strings without a timezone indicator as local time, which
 * would produce wrong results for non-UTC hosts. Shared by formatTime and isCrossDayLocal.
 * Note: Z-normalizes missing-timezone inputs (stricter than the old inline cross-day check).
 */
const toUtcDate = (utcTimestamp: string): Date => new Date(normalizeUtcIso(utcTimestamp))

/**
 * Format a UTC timestamp as HH:MM in the display timezone using IANA DST rules.
 * zoneId is an IANA timezone string (e.g. 'America/Toronto', 'UTC').
 * Memoized by `${zoneId}|${utcTimestamp}` so repeated per-frame draws hit the cache.
 */
export function formatTime(utcTimestamp: string, zoneId: string): string {
  const key = `${zoneId}|${utcTimestamp}`
  let v = formattedTimeCache.get(key)
  if (v === undefined) {
    if (formattedTimeCache.size >= FORMATTED_TIME_CACHE_LIMIT) formattedTimeCache.clear()
    v = getTimeFormatter(zoneId).format(toUtcDate(utcTimestamp))
    formattedTimeCache.set(key, v)
  }
  return v
}

// V4-P04: 跨天(+1)判断 — 与 formatTime 同款缓存策略。
// 旧实现每个 full-width 航班每帧 new Intl.DateTimeFormat('en-CA') + 2×new Date。
const dateFormatterByZone = new Map<string, Intl.DateTimeFormat>()
const getLocalDateFormatter = (zoneId: string): Intl.DateTimeFormat => {
  let f = dateFormatterByZone.get(zoneId)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zoneId, year: 'numeric', month: '2-digit', day: '2-digit' })
    dateFormatterByZone.set(zoneId, f)
  }
  return f
}

const CROSS_DAY_CACHE_LIMIT = 200_000
const crossDayCache = new Map<string, boolean>()

/**
 * Whether arrival falls on a different local calendar day than departure in
 * the display timezone (IANA DST-aware). Memoized by zone|dep|arv.
 * Note: inputs are Z-normalized via toUtcDate → normalizeUtcIso before parsing
 * (stricter than the old inline check — missing-timezone strings are treated as UTC,
 * not local time). Same strictness contract as toUtcDate / formatTime.
 */
export function isCrossDayLocal(depUtc: string, arvUtc: string, zoneId: string): boolean {
  const key = `${zoneId}|${depUtc}|${arvUtc}`
  let v = crossDayCache.get(key)
  if (v === undefined) {
    if (crossDayCache.size >= CROSS_DAY_CACHE_LIMIT) crossDayCache.clear()
    const fmt = getLocalDateFormatter(zoneId)
    v = fmt.format(toUtcDate(depUtc)) !== fmt.format(toUtcDate(arvUtc))
    crossDayCache.set(key, v)
  }
  return v
}

// Short numeric calendar date (e.g. "6/10" = M/D) in a display timezone, IANA DST-aware.
const shortDateFormatterByZone = new Map<string, Intl.DateTimeFormat>()
const getShortDateFormatter = (zoneId: string): Intl.DateTimeFormat => {
  let f = shortDateFormatterByZone.get(zoneId)
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zoneId, month: 'numeric', day: 'numeric' })
    shortDateFormatterByZone.set(zoneId, f)
  }
  return f
}

const SHORT_DATE_CACHE_LIMIT = 200_000
const shortDateCache = new Map<string, string>()
/**
 * Format a UTC timestamp as a short numeric date (e.g. "6/10" = month/day) in the
 * display timezone. Same Z-normalization + memoization contract as formatTime.
 */
export function formatDateShort(utcTimestamp: string, zoneId: string): string {
  const key = `${zoneId}|${utcTimestamp}`
  let v = shortDateCache.get(key)
  if (v === undefined) {
    if (shortDateCache.size >= SHORT_DATE_CACHE_LIMIT) shortDateCache.clear()
    v = getShortDateFormatter(zoneId).format(toUtcDate(utcTimestamp))
    shortDateCache.set(key, v)
  }
  return v
}