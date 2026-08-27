import { useEffect, useState } from 'react'
import { useTimezoneStore } from '@/stores/timezone-store'
import { timezoneApi } from '@/services/timezone-api'
import { aiHintsApi, type AiHints } from '@/services/ai-hints-api'

/**
 * Client-specific example values for help articles.
 *
 * Help text must never hardcode an airport/airline (e.g. "BKK", "Asia/Bangkok") — the
 * examples should reflect the logged-in client.
 * Source of truth is the `/api/ai/hints` endpoint (prime base / rank / fleet / crew id),
 * plus the base timezone options for the IANA zone and a second base airport for
 * route / two-airport examples.
 */
export interface HelpExamples {
  /** Client's prime base airport, e.g. 'YVR'. */
  base: string
  /** IANA zone for the base, e.g. 'America/Vancouver' (null until options load). */
  baseTz: string | null
  /** A second, different base airport for route / two-airport examples, e.g. 'YYC'. */
  second: string
  rank: string
  fleet: string
  crewId: string
}

// Conservative fallbacks for the rare case the hints/options requests both fail.
const FALLBACK_BASE = 'YVR'
const FALLBACK_SECOND = 'YYC'
const EMPTY_HINTS: AiHints = { base: null, rank: null, fleet: null, crewId: null }
const HINTS_STORAGE_KEY = 'help.examples.v1'
const HINTS_TTL_MS = 24 * 60 * 60 * 1000

interface CachedHints {
  data: AiHints
  fetchedAt: number
}

const readHintsCache = (): CachedHints | null => {
  try {
    const raw = window.localStorage.getItem(HINTS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedHints>
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.data) return null
    return { data: { ...EMPTY_HINTS, ...parsed.data }, fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

const writeHintsCache = (data: AiHints): void => {
  try {
    window.localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }))
  } catch {
    // localStorage can be unavailable; Help falls back to generic examples.
  }
}

export const useHelpExamples = (): HelpExamples => {
  const [hints, setHints] = useState<AiHints>(() => readHintsCache()?.data ?? EMPTY_HINTS)
  const options = useTimezoneStore((s) => s.timezoneOptions)
  const setOptions = useTimezoneStore((s) => s.setOptions)

  useEffect(() => {
    const cached = readHintsCache()
    if (cached && Date.now() - cached.fetchedAt < HINTS_TTL_MS) {
      setHints(cached.data)
      return
    }
    let cancelled = false
    void aiHintsApi
      .get()
      .then((data) => {
        if (cancelled) return
        setHints(data)
        writeHintsCache(data)
      })
      .catch(() => { /* keep fallbacks */ })
    return () => { cancelled = true }
  }, [])

  // Help can be opened without first visiting Live (where the TimezoneSwitcher loads these),
  // so ensure the base timezone options are present. >1 means more than the default UTC entry.
  useEffect(() => {
    if (options.length > 1) return
    let cancelled = false
    timezoneApi.getOptions()
      .then((opts) => { if (!cancelled && opts.length) setOptions(opts) })
      .catch(() => { /* keep fallbacks */ })
    return () => { cancelled = true }
  }, [options.length, setOptions])

  const bases = options.filter((o) => o.isBase)
  const base = hints.base ?? bases[0]?.airport ?? FALLBACK_BASE
  const baseTz = options.find((o) => o.airport === base)?.zoneId ?? null
  const second = bases.find((o) => o.airport !== base)?.airport
    ?? options.find((o) => o.airport !== base && o.airport !== 'UTC')?.airport
    ?? FALLBACK_SECOND

  return {
    base,
    baseTz,
    second,
    rank: hints.rank ?? 'CA',
    fleet: hints.fleet ?? '737',
    crewId: hints.crewId ?? '0227',
  }
}
