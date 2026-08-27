import { create } from 'zustand'
import { useTimezoneStore } from './timezone-store'
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
import type { CoverageState } from '@/utils/pairing-coverage'
import { createContextStoreRegistry, type GanttContextId } from './create-context-store'
import { useGanttContextId } from '@/components/gantt/context/gantt-context'

const STORAGE_KEY = 'gantt-filter-v2'

// Default planning period = current month + next month, computed on the DISPLAY
// timezone calendar (timezone-store, persisted across sessions). Anchoring to UTC
// month boundaries is wrong for any non-UTC display timezone: 2026-06-01T00:00Z
// reads back as calendar day 2026-05-31 in e.g. America/Edmonton, so the picker
// showed "May 31" and TimezoneSwitcher's reanchorDateRange then baked the wrong
// day into the store. Display-tz midnight keeps picker, store and API window on
// the same calendar day (the API layer's toYmd slice over-fetches at most a few
// hours on either side, never under-fetches).
const pad2 = (n: number): string => String(n).padStart(2, '0')
const displayTz = useTimezoneStore.getState().timezone
// Today's calendar date in the display timezone (en-CA → "YYYY-MM-DD")
const [todayYear, todayMonth] = new Intl.DateTimeFormat('en-CA', { timeZone: displayTz })
  .format(new Date())
  .split('-')
  .map(Number)
// Day 0 of month+2 = last day of next month (pure calendar arithmetic)
const lastOfNextMonth = new Date(Date.UTC(todayYear, todayMonth + 1, 0)).toISOString().slice(0, 10)
const defaultStart = calendarDateToUtcMidnight(`${todayYear}-${pad2(todayMonth)}-01`, displayTz)
const defaultEnd = endOfCalendarDayUtc(lastOfNextMonth, displayTz)

export interface CrewFilter {
  divisions: string[]   // 'P' | 'C'
  bases: string[]
  ranks: string[]
  fleets: string[]
  /** Explicit crew IDs to bring to the TOP of the roster pane (overlay, not a facet filter). */
  crewIds: string[]
}

/** Pairing crewing coverage state (canonical definition lives in utils/pairing-coverage). */
export type { CoverageState } from '@/utils/pairing-coverage'
export { ALL_COVERAGE }

export interface PairingFilter {
  bases: string[]
  fleets: string[]
  divisions: string[]
  /** Required composition ranks to HARD-filter pairings by. */
  ranks: string[]
  depArps: string[]
  /** Coverage states to float to the TOP of the pane (overlay). Default: open + partial. */
  coverage: CoverageState[]
  assignments: string[]
  /** Pairing-label substring to HARD-filter the pane to matching pairings. */
  label: string
  /** Explicit pairing IDs (matches pairing.id) to HARD-filter the pane to. Multi-value; client-side. */
  pairingIds: string[]
}

export interface FlightFilter {
  depArps: string[]
  arvArps: string[]
  fltNums: string[]
  fleets: string[]
  statuses: string[]
  register?: string[]
}

export interface SelectedRosterPeriodRange {
  startMs: number
  endMs: number
}

const DEFAULT_CREW_FILTER: CrewFilter = { divisions: [], bases: [], ranks: [], fleets: [], crewIds: [] }
const DEFAULT_PAIRING_FILTER: PairingFilter = { bases: [], fleets: [], divisions: [], ranks: [], depArps: [], coverage: ['open', 'partial'], assignments: [], label: '', pairingIds: [] }

/**
 * Client-side HARD filter shared by the Live and Scenario pairing panes (§Gantt-Unify:
 * one predicate, both views). Empty list = no filter. Matches the numeric pairing.id.
 */
export const matchesPairingIdFilter = (pairingId: number, pairingIds: string[]): boolean =>
  pairingIds.length === 0 || pairingIds.includes(String(pairingId))
export const matchesPairingLabelFilter = (pairingLabel: string | null | undefined, label: string): boolean => {
  const term = label.trim().toLowerCase()
  return term.length === 0 || (pairingLabel ?? '').toLowerCase().includes(term)
}
export const pairingCompositionMatchesRank = (
  composition: Array<{ rank?: string | null }>,
  ranks: string[],
): boolean => ranks.length === 0 || composition.some((slot) => ranks.includes(slot.rank ?? ''))
const DEFAULT_FLIGHT_FILTER: FlightFilter = { depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [], register: [] }

// ─── Equality helpers (exported for toolbar smart-comparison) ───────────────

const arrEq = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

export const crewFiltersEqual = (a: CrewFilter, b: CrewFilter): boolean =>
  arrEq(a.divisions, b.divisions) && arrEq(a.bases, b.bases) &&
  arrEq(a.ranks, b.ranks) && arrEq(a.fleets, b.fleets)

export const pairingFiltersEqual = (a: PairingFilter, b: PairingFilter): boolean =>
  arrEq(a.bases, b.bases) && arrEq(a.fleets, b.fleets) &&
  arrEq(a.divisions, b.divisions) && arrEq(a.ranks, b.ranks) &&
  arrEq(a.depArps, b.depArps) &&
  arrEq(a.assignments, b.assignments) &&
  a.label.trim() === b.label.trim()

export const flightFiltersEqual = (a: FlightFilter, b: FlightFilter): boolean =>
  arrEq(a.depArps, b.depArps) && arrEq(a.arvArps, b.arvArps) &&
  arrEq(a.fltNums, b.fltNums) && arrEq(a.fleets, b.fleets) &&
  arrEq(a.statuses, b.statuses) && arrEq(a.register ?? [], b.register ?? [])

/** Overlay (bring-to-top) comparisons — separate from facet equality so they
 *  trigger the bring-to-top post-step without forcing a base data reload. */
export const crewIdsEqual = (a: CrewFilter, b: CrewFilter): boolean => arrEq(a.crewIds, b.crewIds)
export const pairingLabelEqual = (a: PairingFilter, b: PairingFilter): boolean =>
  a.label.trim() === b.label.trim()
export const pairingCoverageEqual = (a: PairingFilter, b: PairingFilter): boolean =>
  arrEq([...a.coverage].sort(), [...b.coverage].sort())
export const pairingIdsEqual = (a: PairingFilter, b: PairingFilter): boolean =>
  arrEq(a.pairingIds, b.pairingIds)

// ─── "Any value set" helpers (shared by apply-filters and pane count badges) ─

export const hasCrewFilterValues = (f: CrewFilter): boolean =>
  f.divisions.length > 0 || f.bases.length > 0 || f.ranks.length > 0 || f.fleets.length > 0

export const hasPairingFilterValues = (f: PairingFilter): boolean =>
  f.bases.length > 0 || f.fleets.length > 0 ||
  f.ranks.length > 0 || f.depArps.length > 0 || f.assignments.length > 0 ||
  f.label.trim().length > 0

export const hasFlightFilterValues = (f: FlightFilter): boolean =>
  f.depArps.length > 0 || f.arvArps.length > 0 || f.fltNums.length > 0 ||
  f.fleets.length > 0 || f.statuses.length > 0 || (f.register?.length ?? 0) > 0

export const dateRangesEqual = (
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean =>
  a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AppliedFilters {
  dateRange: { start: Date; end: Date }
  /** RP selection snapshot at last apply — lets the toolbar distinguish "never applied"
   *  from "RP changed since last Apply" (dateRange also shifts on timezone re-anchor,
   *  which must NOT trigger an "RP Date changed" reminder). */
  selectedRosterPeriodIds: string[]
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter
}

interface FilterStore {
  dateRange: { start: Date; end: Date }
  selectedRosterPeriodIds: string[]
  selectedRosterPeriodRange: SelectedRosterPeriodRange | null
  ruleSetCode: string
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter

  /** Snapshot of filters last successfully applied to all panes. null = never applied. */
  appliedFilters: AppliedFilters | null

  setDateRange: (start: Date, end: Date) => void
  setSelectedRosterPeriodSelection: (ids: string[], range: SelectedRosterPeriodRange | null) => void
  setRuleSetCode: (code: string) => void
  setCrewFilter: (filter: Partial<CrewFilter>) => void
  setPairingFilter: (filter: Partial<PairingFilter>) => void
  setFlightFilter: (filter: Partial<FlightFilter>) => void
  resetFilters: () => void
  loadFromStorage: () => void
  saveToStorage: () => void

  /** Save current filter state as the last-applied snapshot (call after successful data load) */
  markApplied: () => void

  /** Total number of active filter selections across all tiers */
  activeFilterCount: () => number
}

interface StoredFilters {
  ruleSetCode: string
  crew: CrewFilter
  pairing: PairingFilter
  flight: FlightFilter
}

// ─── Factory + registry ────────────────────────────────────────────────────

const makeFilterStore = (id: GanttContextId) => {
  const storageKey = id === 'live' ? STORAGE_KEY : `${STORAGE_KEY}-${id}`
  return create<FilterStore>((set, get) => ({
    dateRange: { start: defaultStart, end: defaultEnd },
    selectedRosterPeriodIds: [],
    selectedRosterPeriodRange: null,
    ruleSetCode: '',
    crew: DEFAULT_CREW_FILTER,
    pairing: DEFAULT_PAIRING_FILTER,
    flight: DEFAULT_FLIGHT_FILTER,
    appliedFilters: null,

    setDateRange: (start, end) => {
      set({ dateRange: { start, end } })
      get().saveToStorage()
    },

    setSelectedRosterPeriodSelection: (ids, range) => {
      set({ selectedRosterPeriodIds: ids, selectedRosterPeriodRange: range })
    },

    setRuleSetCode: (code) => {
      set({ ruleSetCode: code })
      get().saveToStorage()
    },

    setCrewFilter: (filter) => {
      set((s) => {
        const next: CrewFilter = { ...s.crew, ...filter }
        const nextPairing: PairingFilter = { ...s.pairing, divisions: next.divisions }
        if (crewFiltersEqual(s.crew, next) && crewIdsEqual(s.crew, next) &&
          pairingFiltersEqual(s.pairing, nextPairing)) return {}
        return { crew: next, pairing: nextPairing }
      })
      get().saveToStorage()
    },

    setPairingFilter: (filter) => {
      set((s) => {
        // Division is owned by Crew. Pairing queries consume this mirrored value
        // so the two panes cannot drift apart.
        const next: PairingFilter = { ...s.pairing, ...filter, divisions: s.crew.divisions }
        if (pairingFiltersEqual(s.pairing, next) && pairingLabelEqual(s.pairing, next) && pairingCoverageEqual(s.pairing, next) && pairingIdsEqual(s.pairing, next)) return {}
        return { pairing: next }
      })
      get().saveToStorage()
    },

    setFlightFilter: (filter) => {
      set((s) => {
        const next: FlightFilter = { ...s.flight, ...filter }
        if (flightFiltersEqual(s.flight, next)) return {}
        return { flight: next }
      })
      get().saveToStorage()
    },

    resetFilters: () => {
      set({
        crew: DEFAULT_CREW_FILTER,
        pairing: DEFAULT_PAIRING_FILTER,
        flight: DEFAULT_FLIGHT_FILTER,
      })
      get().saveToStorage()
    },

    markApplied: () => {
      const s = get()
      set({
        appliedFilters: {
          dateRange: { start: s.dateRange.start, end: s.dateRange.end },
          selectedRosterPeriodIds: [...s.selectedRosterPeriodIds],
          crew: { ...s.crew },
          pairing: { ...s.pairing },
          flight: { ...s.flight },
        },
      })
    },

    activeFilterCount: () => {
      const { crew, pairing, flight } = get()
      let count = 0
      count += crew.divisions.length + crew.bases.length + crew.ranks.length + crew.fleets.length
      if (crew.crewIds.length) count++
      count += pairing.bases.length + pairing.fleets.length + pairing.ranks.length + pairing.depArps.length + pairing.assignments.length
      // Coverage counts as active when it narrows (not all three selected) and is non-empty.
      if (pairing.coverage.length > 0 && pairing.coverage.length < ALL_COVERAGE.length) count++
      if (pairing.label.trim()) count++
      if (pairing.pairingIds.length) count++
      count += flight.depArps.length + flight.arvArps.length + flight.fltNums.length + flight.fleets.length + flight.statuses.length
      return count
    },

    loadFromStorage: () => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const stored: StoredFilters = JSON.parse(raw)
        // dateRange deliberately NOT restored: every fresh session starts at the
        // default planning period (current month + next month). Filter values are
        // restored so the dialog prefills the user's last selections.
        set({
          ruleSetCode: stored.ruleSetCode ?? '',
          crew: { ...DEFAULT_CREW_FILTER, ...(stored.crew ?? {}) },
          pairing: { ...DEFAULT_PAIRING_FILTER, ...(stored.pairing ?? {}) },
          flight: { ...DEFAULT_FLIGHT_FILTER, ...(stored.flight ?? {}) },
        })
      } catch {
        // ignore corrupt data
      }
    },

    saveToStorage: () => {
      try {
        const s = get()
        const stored: StoredFilters = {
          ruleSetCode: s.ruleSetCode,
          crew: s.crew,
          pairing: s.pairing,
          flight: s.flight,
        }
        localStorage.setItem(storageKey, JSON.stringify(stored))
      } catch {
        // ignore storage full
      }
    },
  }))
}

const registry = createContextStoreRegistry<ReturnType<typeof makeFilterStore>>(makeFilterStore)

export const getFilterStore = (id: GanttContextId) => registry.get(id)
export const destroyFilterStore = (id: GanttContextId) => registry.destroy(id)

/** Compatibility shim: existing Live imports keep working unchanged. */
export const useFilterStore = getFilterStore('live')

/** For shared wrappers: resolves the right filter-store instance from <GanttContextProvider>. */
export const useFilterStoreForContext = () => getFilterStore(useGanttContextId())
