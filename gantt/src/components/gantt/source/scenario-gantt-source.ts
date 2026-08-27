// gantt/src/components/gantt/source/scenario-gantt-source.ts
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getActiveScenarioGanttVersion, getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getPaneStore } from '@/stores/pane-store'
import { getFilterStore, matchesPairingIdFilter, matchesPairingLabelFilter, pairingCompositionMatchesRank } from '@/stores/filter-store'
import type { CrewFilter, FlightFilter, PairingFilter } from '@/stores/filter-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useColumnStore } from '@/stores/column-store'
import { useUiStore } from '@/stores/ui-store'
import { isCrewBellOnlyRule } from '@/components/gantt/crew-bell-only-rules'
import {
  crewFlyTasksOverlappingWindow,
  crewTasksOverlappingWindow,
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
} from '@/utils/violation-puck-window'
import { getScenarioFlightSelectionStore } from '@/stores/scenario-flight-selection-store'
import { getScenarioPairingSelectionStore } from '@/stores/scenario-pairing-selection-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { rpForTimestamp } from '@/hooks/use-current-rp'
import {
  READ_ONLY_CAPABILITIES,
  type GanttPaneSource,
  type FlightPaneSource,
  type PairingPaneSource,
  type RosterPaneSource,
} from './gantt-pane-source'
import { useScenarioViolationSource } from './scenario-violation-source'
import { useScenarioEditController } from './scenario-edit-controller'
import {
  recheckScenarioLegality,
} from '@/services/scenario-legality-api'
import { notify } from '@/utils/notify'
import type { CrewViolationRow } from '@/components/panes/violation-list-dialog'
import { useCrossPaneDrag } from '@/components/gantt/drag-context'
import type { CrossPaneDragHandler } from '@/components/gantt/interactions/drag-handler'
import type { DragSource } from '@/components/gantt/interactions/drag-handler'
import type { ScenarioDragHandler } from '@/components/scenario-gantt/scenario-drag-provider'
import { buildPairingItems } from '@/utils/scenario-pairing-adapter'
import { getAllEffective } from '@/utils/crew-history'
import { computeValidityBlock } from '@/utils/crew-validity'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { formatBlockMinutes, hitTestTask, hitTestTasksInRect, clampRosterScrollY, buildRosterIndexes, sortPanelRowsByValues, xToTime, yearMonthInTimeZone, calendarDateInTimeZone, calendarDateToUtcMidnight } from '@/components/gantt/gantt-utils'
import { crewMandayDelta, type MandayKpiDelta } from '@/utils/manday-delta'
import type { RosterLaneHitLayout } from '@/components/gantt/gantt-utils'
import { bumpRosterModelBuild } from '@/utils/gantt-test-hook'
import { formatCreditMinutes } from '@/utils/format-credit'
import { formatSeniority } from '@/utils/format-seniority'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
import { formatGroundTaskStatusLine } from '@/utils/format-ground-task-status-line'
import type { HitTestFn, PaneInteractionCallbacks } from '@/components/gantt/interactions/base-interaction'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import type { ColumnConfig } from '@/types/column'
import type { RosterItem } from '@/types'
import type { RuleViolation } from '@/types/rule-check'
import { ALL_COVERAGE, coverageMatches } from '@/utils/pairing-coverage'
import type { CoverageState } from '@/utils/pairing-coverage'
import { pairingCreditedMinutes } from '@/utils/pairing-credit'
import type { PairingItem } from '@/types/pairing'
import type { FlightItem, Flight, FlightComposition, FlightCompositionStatus } from '@/types/flight'
import type {
  ScenarioGanttCrew,
  ScenarioGanttFlight,
  ScenarioGanttData,
  ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'

/** Real scenario computes finish in seconds; 90s is a generous "something's wrong" bar. */
const SCENARIO_RECHECK_STUCK_MS = 90_000

/**
 * True once `computingSince` is more than `thresholdMs` in the past. Ticks every 2s while
 * computing so consumers (the Recheck button + status indicator) recover even though no
 * new poll response has arrived — see
 * docs/superpowers/specs/2026-07-07-legality-recheck-stuck-button-recovery-design.md.
 */
function useStuckAfter(computingSince: number | null, thresholdMs: number): boolean {
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (computingSince == null) return
    const id = setInterval(() => forceTick((n) => n + 1), 2000)
    return () => clearInterval(id)
  }, [computingSince])
  return computingSince != null && Date.now() - computingSince > thresholdMs
}

// ── Flight row helpers (moved here from scenario-flight-pane so they can be
//    reused by the shared FlightPane via the source FlightPaneSource accessor) ──

const scenarioFlightToFlight = (f: ScenarioGanttFlight, airline = ''): Flight => ({
  id: f.id,
  airline,
  fltDt: '',
  fltNum: f.fltNum,
  depArp: f.depArp,
  arvArp: f.arvArp,
  schDepDtUtc: f.schDepDtUtc,
  schArvDtUtc: f.schArvDtUtc,
  actDepDtUtc: f.schDepDtUtc,
  actArvDtUtc: f.schArvDtUtc,
  actDepArp: f.depArp,
  actArvArp: f.arvArp,
  flightFlag: 'S',
  blkMin: 0,
  fleet: f.fleet,
  register: f.register,
  fltType: 'PAX',
  fltSts: null,
  isDeleted: 0,
  isCancelled: false,
})

/** Bin-pack sorted flights into sub-rows with no time overlap, matching Live Flight Pane. */
function packScenarioFlightsIntoRows(sorted: Flight[], chainAware: boolean): Flight[][] {
  const rows: Flight[][] = []

  for (const f of sorted) {
    let bestRow: Flight[] | null = null

    for (const row of rows) {
      const last = row[row.length - 1]
      if (last.schArvDtUtc <= f.schDepDtUtc) {
        if (chainAware && last.arvArp === f.depArp) {
          bestRow = row
          break
        }
        if (!bestRow) bestRow = row
      }
    }

    if (bestRow) bestRow.push(f)
    else rows.push([f])
  }

  return rows
}

/** Group flights by register (priority) or fleet, then bin-pack like Live Flight Pane. */
function groupScenarioFlights(flights: Flight[]): FlightItem[] {
  const registered = new Map<string, Flight[]>()
  const unregistered = new Map<string, Flight[]>()

  for (const f of flights) {
    const reg = f.register?.trim()
    if (reg) {
      const arr = registered.get(reg) ?? []
      arr.push(f)
      registered.set(reg, arr)
    } else {
      const fleet = f.fleet || 'UNKNOWN'
      const arr = unregistered.get(fleet) ?? []
      arr.push(f)
      unregistered.set(fleet, arr)
    }
  }

  const result: FlightItem[] = []

  for (const [reg, flts] of [...registered.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    flts.sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc))
    const subRows = packScenarioFlightsIntoRows(flts, false)
    for (let i = 0; i < subRows.length; i++) {
      result.push({
        registration: i === 0 ? reg : `${reg}#${i + 1}`,
        fleet: subRows[i][0]?.fleet ?? '',
        flights: subRows[i],
        sessionTags: [0],
      })
    }
  }

  for (const [fleet, flts] of [...unregistered.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    flts.sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc))
    const subRows = packScenarioFlightsIntoRows(flts, true)
    for (let i = 0; i < subRows.length; i++) {
      result.push({
        registration: `${fleet}-${i + 1}`,
        fleet,
        flights: subRows[i],
        isFleetGrouped: true,
        sessionTags: [0],
      })
    }
  }

  return result
}

/** Convert scenario flight data into grouped FlightItem rows + compositionStatusMap. */
export function buildScenarioFlightItems(
  data: ScenarioGanttData,
): { flightRows: FlightItem[]; compositionStatusMap: Map<number, FlightCompositionStatus> } {
  const flightAirlineById = new Map<number, string>()
  for (const segment of data.pairingSegments) {
    if (segment.fltId == null || flightAirlineById.has(segment.fltId)) continue
    if (segment.airline) flightAirlineById.set(segment.fltId, segment.airline)
  }

  const compositionStatusMap = new Map<number, FlightCompositionStatus>()
  for (const f of data.flights ?? []) {
    const composition = buildScenarioFlightComposition(f.id, data)
    if (!composition) {
      compositionStatusMap.set(f.id, 'partial')
      continue
    }
    const ranks = Object.values(composition)
    const isFull = ranks.every((r) => r.actual >= r.plan)
    const isPartial = ranks.some((r) => r.actual < r.plan && r.plan > 0)
    compositionStatusMap.set(f.id, isFull ? 'full' : isPartial ? 'partial' : 'cancelled')
  }

  const flights = (data.flights ?? []).map((flight) =>
    scenarioFlightToFlight(flight, flightAirlineById.get(flight.id) ?? ''),
  )
  const flightRows = groupScenarioFlights(flights)

  return { flightRows, compositionStatusMap }
}

export function buildScenarioFlightComposition(
  flightId: number,
  data: ScenarioGanttData,
): FlightComposition | undefined {
  const pairingIds = new Set(
    data.pairingSegments
      .filter((segment) => segment.fltId === flightId)
      .map((segment) => segment.pairingId),
  )
  if (pairingIds.size === 0) return undefined

  const byRank: FlightComposition = {}
  for (const pairing of data.pairings) {
    if (!pairingIds.has(pairing.pairingId)) continue
    for (const slot of pairing.compositions) {
      const rank = slot.rank
      if (!rank) continue
      const current = byRank[rank] ?? { plan: 0, actual: 0 }
      byRank[rank] = {
        plan: current.plan + slot.plan,
        actual: current.actual + slot.fill,
      }
    }
  }

  return Object.keys(byRank).length > 0 ? byRank : undefined
}

/** Match a FlightItem row against the shared FlightFilter. */
export function scenarioFlightRowMatchesFilter(row: FlightItem, f: FlightFilter): boolean {
  if (f.fleets.length > 0 && !f.fleets.includes(row.fleet)) return false
  if (
    (f.register?.length ?? 0) > 0 &&
    !f.register!.some((r) => {
      const needle = r.toUpperCase()
      return (
        row.registration.toUpperCase() === needle ||
        row.flights.some((fl) => (fl.register ?? '').trim().toUpperCase() === needle)
      )
    })
  ) {
    return false
  }
  if (f.depArps.length > 0) {
    if (!row.flights.some((fl) => f.depArps.includes(fl.depArp.toUpperCase()))) return false
  }
  if (f.arvArps.length > 0) {
    if (!row.flights.some((fl) => f.arvArps.includes(fl.arvArp.toUpperCase()))) return false
  }
  if (f.fltNums.length > 0) {
    if (!row.flights.some((fl) => f.fltNums.some((n) => fl.fltNum.toLowerCase().includes(n.toLowerCase())))) return false
  }
  // statuses: no-op for scenario flights (no composition status string on FlightItem)
  return true
}

/** Build the scenario FlightPaneSource accessor. Called inside useScenarioGanttSource. */
function makeScenarioFlightPaneSource(scenarioId: number): FlightPaneSource {
  const useStore = getScenarioGanttStore(scenarioId)
  const useScenarioFilterStore = getFilterStore(scenarioId)
  const usePaneStore = getPaneStore(scenarioId)
  const useSelectionStore = getScenarioFlightSelectionStore(scenarioId)
  return {
    useRows: () => {
      const data = useStore((s) => s.data)
      const flightFilter = useScenarioFilterStore((s) => s.flight)
      const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds('scenario-flight'))
      const useLayoutStore = getScenarioLayoutStore(scenarioId)
      const foundFlightIds = useLayoutStore((s) => {
        const paneId = s.findPaneIdByType('flight')
        return paneId ? (s.panes.get(paneId)?.foundCrewIds ?? []) : []
      })
      if (!data) return { rows: [], compositionStatusMap: new Map() }
      const { flightRows, compositionStatusMap } = buildScenarioFlightItems(data)
      const hasFilter =
        flightFilter.depArps.length > 0 ||
        flightFilter.arvArps.length > 0 ||
        flightFilter.fltNums.length > 0 ||
        flightFilter.fleets.length > 0 ||
        flightFilter.statuses.length > 0 ||
        (flightFilter.register?.length ?? 0) > 0
      const foundSet = new Set(foundFlightIds)
      const filtered = hasFilter
        ? flightRows.filter((row) =>
            foundSet.size > 0 && row.flights.some((f) => foundSet.has(String(f.id)))
              ? true
              : scenarioFlightRowMatchesFilter(row, flightFilter))
        : flightRows

      let floated = filtered
      if (foundSet.size > 0) {
        const foundRows: typeof filtered = []
        const rest: typeof filtered = []
        const seen = new Set<string>()
        for (const id of foundFlightIds) {
          const row = filtered.find((r) => r.flights.some((f) => String(f.id) === id))
          if (row && !seen.has(row.registration)) {
            foundRows.push(row)
            seen.add(row.registration)
          }
        }
        for (const row of filtered) {
          if (!seen.has(row.registration)) rest.push(row)
        }
        floated = foundRows.length > 0 ? [...foundRows, ...rest] : filtered
      }

      if (frozenRowIds.length === 0) return { rows: floated, compositionStatusMap }
      const frozenSet = new Set(frozenRowIds)
      const frozen = floated.filter((row) => frozenSet.has(row.registration))
      const nonFrozen = floated.filter((row) => !frozenSet.has(row.registration))
      return { rows: [...frozen, ...nonFrozen], compositionStatusMap }
    },
    capabilities: { canDrag: false, canRubberBand: true, tracksHover: false, lazyLoads: false },

    // Selection — backed by per-scenario registry store
    useSelectedIds: () => useSelectionStore((s) => s.selectedIds),
    select: (id, mode) => {
      const st = getScenarioFlightSelectionStore(scenarioId).getState()
      if (mode === 'set') st.set(id)
      else if (mode === 'toggle') st.toggle(id)
      else st.clear()
    },
    selectMany: (ids) => getScenarioFlightSelectionStore(scenarioId).getState().selectMany(ids),

    // Hover — scenario flight pane has no hover tracking
    useHoveredId: () => null,
    setHovered: () => {},

    // Geometry — read from per-scenario store at event time (no subscription)
    getPxPerHour: () => getScenarioGanttStore(scenarioId).getState().pxPerHour,
    getRangeStart: () => {
      const data = getScenarioGanttStore(scenarioId).getState().data
      return data ? new Date(data.strDtLoc) : new Date()
    },
    formatStatusLine: (flightId) => {
      const data = getScenarioGanttStore(scenarioId).getState().data
      const scenarioFlight = data?.flights.find((flight) => flight.id === flightId)
      if (!data || !scenarioFlight) return ''

      const segment = data.pairingSegments.find((item) => item.fltId === flightId)
      const flight = scenarioFlightToFlight(scenarioFlight, segment?.airline ?? '')
      const tzStore = useAirportTzStore.getState()
      const ganttZoneId = useTimezoneStore.getState().timezone

      return formatFlightStatusLine({
        flight,
        ganttZoneId,
        depLocalZoneId: tzStore.zoneIdFor(flight.depArp),
        arvLocalZoneId: tzStore.zoneIdFor(flight.arvArp),
        composition: buildScenarioFlightComposition(flightId, data),
      })
    },

    // No drag or lazy-load for scenario
    startDragToRoster: undefined,
    loadMore: undefined,

    // Row selection / pinning — backed by per-scenario pane-store.
    useSelectedRowIds: () => {
      const ids = usePaneStore((s) => s.getSelectedRowIds('scenario-flight'))
      return useMemo(() => new Set(ids), [ids.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
    },
    useFrozenRowCount: () => {
      const ids = usePaneStore((s) => s.getFrozenRowIds('scenario-flight'))
      return ids.length
    },
    selectRow: (rowId) => getPaneStore(scenarioId).getState().selectRow('scenario-flight', rowId),
    toggleRowSelection: (rowId) => getPaneStore(scenarioId).getState().toggleRowSelection('scenario-flight', rowId),
    selectRowRange: (rowId, allRowIds) => getPaneStore(scenarioId).getState().selectRowRange('scenario-flight', rowId, allRowIds),
    unfreezeRow: (rowId) => getPaneStore(scenarioId).getState().unfreezeRow('scenario-flight', rowId),
    markDirty: () => {},
  }
}

// ── Pairing row helpers (moved here from scenario-pairing-pane so they can be
//    reused by the shared PairingPane via the source PairingPaneSource accessor) ──

/** Coverage is an active filter when a strict subset of all coverage states is selected. */
export const pairingCoverageNarrowed = (cov: CoverageState[]): boolean =>
  cov.length > 0 && cov.length < ALL_COVERAGE.length

/**
 * Check whether a pairing item matches the shared PairingFilter.
 * - label: substring match on pairingLabel
 * - divisions/bases/fleets: exact match on the matching pairing field
 * - assignments: maps to old `types` — exact match on p.assignment
 * - depArps: any segment dep airport in set
 * - ranks: any pairing composition rank in set
 * - coverage: computed from composition fill (only when narrowed)
 */
export function pairingMatchesSharedFilter(item: PairingItem, f: PairingFilter): boolean {
  const p = item.pairing
  if (!matchesPairingIdFilter(p.id, f.pairingIds)) return false
  if (!matchesPairingLabelFilter(p.pairingLabel, f.label)) return false
  if (f.divisions.length > 0 && !f.divisions.includes(p.division)) return false
  if (f.bases.length > 0 && !f.bases.includes(p.base)) return false
  if (f.fleets.length > 0 && !f.fleets.includes(p.fleet)) return false
  if (f.assignments.length > 0 && !f.assignments.includes(p.assignment ?? '')) return false
  if (!pairingCompositionMatchesRank(p.composition ?? [], f.ranks)) return false
  if (f.depArps.length > 0) {
    const segArps = new Set((item.segments ?? []).map((s) => s.depArp))
    if (!f.depArps.some((a) => segArps.has(a))) return false
  }
  if (!coverageMatches(f.coverage, p.composition ?? [], f.ranks)) return false
  return true
}

/**
 * Scenario pairing-pane filter with Live-parity overlays: found (Locate Pairing /
 * label search) and frozen rows survive coverage narrowing so a fully-crewed
 * located pairing still floats to the top under the default open+partial filter.
 */
export function pairingMatchesSharedFilterWithOverlays(
  item: PairingItem,
  f: PairingFilter,
  overlayIds: ReadonlySet<string>,
): boolean {
  if (!hasActivePairingFilter(f)) return true
  if (overlayIds.has(String(item.pairing.id))) {
    return pairingMatchesSharedFilter(item, { ...f, coverage: [...ALL_COVERAGE] })
  }
  return pairingMatchesSharedFilter(item, f)
}

export function hasActivePairingFilter(f: PairingFilter): boolean {
  return f.label !== '' || f.pairingIds.length > 0 || f.divisions.length > 0 || f.bases.length > 0
    || f.fleets.length > 0 || f.ranks.length > 0 || f.assignments.length > 0 || f.depArps.length > 0 || pairingCoverageNarrowed(f.coverage)
}

/**
 * Build the scenario PairingPaneSource accessor. Called inside useScenarioGanttSource.
 * Sort state lives in the per-scenario pane-store under paneType 'scenario-pairing'
 * (persists across tab suspend, uniform with other panes).
 *
 * NOTE — setSort & found-float: scenario "found" pairings live in scenario-layout-store
 * keyed by paneId, while setSort here is paneId-agnostic. So setSort ONLY sets the sort;
 * clearing the found-float on a header sort click is done by the shared component (which
 * knows paneId/contextId), mirroring the old component-local handleSort.
 */
function makeScenarioPairingPaneSource(scenarioId: number, crossPaneDrag: CrossPaneDragHandler | null): PairingPaneSource {
  const useGanttStore = getScenarioGanttStore(scenarioId)
  const usePairingFilterStore = getFilterStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)
  const usePaneStore = getPaneStore(scenarioId)
  const useSelectionStore = getScenarioPairingSelectionStore(scenarioId)

  return {
    useRows: () => {
      const data = useGanttStore((s) => s.data)
      const pendingChanges = useGanttStore((s) => s.pendingChanges)
      const pairingFilter = usePairingFilterStore((s) => s.pairing)
      const sortColumn = usePaneStore((s) => s.getSortColumn('scenario-pairing'))
      const sortDirection = usePaneStore((s) => s.getSortDirection('scenario-pairing'))
      const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds('scenario-pairing'))
      // Found-floated pairing ids live across ALL panes of this type; the pairing
      // pane is seeded as 'pairing-1' / DEFAULT_PAIRING_ID. We union every pane's
      // found ids so the float survives regardless of the concrete paneId.
      // useShallow: the selector builds a fresh array each call, so without a shallow
      // compare Zustand v5 (useSyncExternalStore) would see a new snapshot every render
      // and loop ("Maximum update depth exceeded").
      const foundPairingIds = useLayoutStore(
        useShallow((s) => {
          const all: string[] = []
          for (const pane of s.panes.values()) {
            if (pane.type === 'pairing' && pane.foundCrewIds.length > 0) all.push(...pane.foundCrewIds)
          }
          return all
        }),
      )

      if (!data) return { rows: [] }
      const allItems = buildPairingItems(data.pairings, data.pairingSegments, data.assignments, data.flights, data.crew, pendingChanges)
      // Found + frozen overlays must remain visible under coverage narrowing (Live parity).
      const overlayIds = new Set<string>([...foundPairingIds, ...frozenRowIds.map(String)])
      const filtered = hasActivePairingFilter(pairingFilter)
        ? allItems.filter((it) => pairingMatchesSharedFilterWithOverlays(it, pairingFilter, overlayIds))
        : allItems

      const tierRows = (rows: PairingItem[]): PairingItem[] => {
        const frozenSet = new Set(frozenRowIds)
        const frozen = rows.filter((pi) => frozenSet.has(String(pi.pairing.id)))
        const rest = rows.filter((pi) => !frozenSet.has(String(pi.pairing.id)))
        if (foundPairingIds.length === 0) return [...frozen, ...rest]
        const foundSet = new Set(foundPairingIds)
        const rowById = new Map(rest.map((pi) => [String(pi.pairing.id), pi]))
        const found = foundPairingIds
          .map((id) => rowById.get(id))
          .filter((pi): pi is PairingItem => pi != null && foundSet.has(String(pi.pairing.id)))
        if (found.length === 0) return [...frozen, ...rest]
        const notFound = rest.filter((pi) => !foundSet.has(String(pi.pairing.id)))
        return [...frozen, ...found, ...notFound]
      }

      if (!sortColumn) return { rows: tierRows(filtered) }
      const sorted = [...filtered].sort((a, b) => {
        const pa = a.pairing, pb = b.pairing
        if (sortColumn === 'cred') {
          const cmp = pairingCreditedMinutes(a) - pairingCreditedMinutes(b)
          return sortDirection === 'asc' ? cmp : -cmp
        }
        const va = sortColumn === 'pairingId' ? (pa.pairingLabel ?? `P${pa.id}`)
          : sortColumn === 'type' ? (pa.assignment?.substring(0, 3) || 'DOM')
            : sortColumn === 'fleet' ? (pa.fleet ?? '')
              : ''
        const vb = sortColumn === 'pairingId' ? (pb.pairingLabel ?? `P${pb.id}`)
          : sortColumn === 'type' ? (pb.assignment?.substring(0, 3) || 'DOM')
            : sortColumn === 'fleet' ? (pb.fleet ?? '')
              : ''
        const cmp = va.localeCompare(vb)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      return { rows: tierRows(sorted) }
    },
    get capabilities() {
      const st = getScenarioGanttStore(scenarioId).getState()
      const canAssignRoster = !!st.lockStatus?.isOwner && !!st.data?.capabilities?.roster.canAssign
      return { canDrag: canAssignRoster, canRubberBand: true, tracksHover: false, lazyLoads: false }
    },

    // Selection — backed by per-scenario registry store (SEGMENT ids)
    useSelectedIds: () => useSelectionStore((s) => s.selectedIds),
    select: (id, mode) => {
      const st = getScenarioPairingSelectionStore(scenarioId).getState()
      if (mode === 'set') st.set(id)
      else if (mode === 'toggle') st.toggle(id)
      else st.clear()
    },
    selectMany: (ids) => getScenarioPairingSelectionStore(scenarioId).getState().selectMany(ids),

    // Hover — scenario pairing pane has no hover tracking
    useHoveredId: () => null,
    setHovered: () => {},

    // Geometry — read from per-scenario store at event time (no subscription)
    getPxPerHour: () => getScenarioGanttStore(scenarioId).getState().pxPerHour,
    getRangeStart: () => {
      const data = getScenarioGanttStore(scenarioId).getState().data
      return data ? new Date(data.strDtLoc) : new Date()
    },

    // Sort — persisted in the per-scenario pane-store under 'scenario-pairing'
    useSortColumn: () => usePaneStore((s) => s.getSortColumn('scenario-pairing')),
    useSortDirection: () => usePaneStore((s) => s.getSortDirection('scenario-pairing')),
    setSort: (column) => getPaneStore(scenarioId).getState().setSortColumn('scenario-pairing', column),

    // Horizontal pan by drag — preserve the old pairing-pane behavior (setScrollX on dx).
    scrollByX: (dx) => {
      const st = getScenarioGanttStore(scenarioId).getState()
      st.setScrollX(Math.max(0, st.scrollX + dx))
    },
    // Zoom by drag — preserve the old pairing-pane behavior (pxPerHour ±10%).
    zoomIn: () => {
      const st = getScenarioGanttStore(scenarioId).getState()
      st.setZoom(st.pxPerHour * 1.1)
    },
    zoomOut: () => {
      const st = getScenarioGanttStore(scenarioId).getState()
      st.setZoom(st.pxPerHour * 0.9)
    },

    // Assign-pairing drag — defined only when a DragProvider supplied a handler
    startDrag: crossPaneDrag
      ? (src) => crossPaneDrag.startDrag({ ...src, paneType: 'scenario-pairing' })
      : undefined,

    // Row selection — backed by per-scenario pane-store under 'scenario-pairing'
    useSelectedRowIds: () => {
      const ids = usePaneStore((s) => s.getSelectedRowIds('scenario-pairing'))
      return useMemo(() => new Set(ids), [ids.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
    },
    useFrozenRowCount: () => {
      const ids = usePaneStore((s) => s.getFrozenRowIds('scenario-pairing'))
      return ids.length
    },
    selectRow: (rowId) => getPaneStore(scenarioId).getState().selectRow('scenario-pairing', rowId),
    toggleRowSelection: (rowId) => getPaneStore(scenarioId).getState().toggleRowSelection('scenario-pairing', rowId),
    selectRowRange: (rowId, allRowIds) => getPaneStore(scenarioId).getState().selectRowRange('scenario-pairing', rowId, allRowIds),
    unfreezeRow: (rowId) => getPaneStore(scenarioId).getState().unfreezeRow('scenario-pairing', rowId),
    markDirty: () => {},
  }
}

// ── Roster row helpers (lifted from scenario-roster-pane so they can be reused by
//    the shared RosterPane via the source RosterPaneSource accessor) ──

/**
 * Date-effective crew identity for the roster header: resolve rank/base from the crew's
 * dated history (crew.ranks / crew.bases) at `viewportLeftDate`, joining multiple active
 * records with ` | ` — mirroring Live's buildPanelRows. Falls back to the static single
 * value when no history is present.
 */
export const buildScenarioCrewIdentity = (
  c: ScenarioGanttCrew,
  viewportLeftDate: Date,
): { rank: string; base: string } => ({
  rank: c.ranks?.length
    ? (getAllEffective(c.ranks, viewportLeftDate).map((r) => r.rank).join(' | ')) || (c.crewRank ?? c.rank)
    : (c.crewRank ?? c.rank),
  base: c.bases?.length
    ? getAllEffective(c.bases, viewportLeftDate).map((b) => b.base).join(' | ') || c.base
    : c.base,
})

/** Structural + text crew filter (verbatim from the old scenario-roster-pane matchesCrew). */
function matchesCrew(c: ScenarioGanttCrew, text: string, filter: CrewFilter): boolean {
  if (filter.divisions.length > 0 && !filter.divisions.includes(c.division)) return false
  if (filter.bases.length > 0 && !filter.bases.includes(c.base)) return false
  if (filter.ranks.length > 0 && !filter.ranks.includes(c.rank)) return false
  if ((filter.crewIds?.length ?? 0) > 0 &&
      !filter.crewIds!.some((id) => c.crewId.toLowerCase().includes(id.toLowerCase()))) return false
  // fleets: scenario crew has no fleet field → not applicable (no-op)
  if (!text) return true
  const q = text.toLowerCase()
  return (
    c.crewId.toLowerCase().includes(q) ||
    c.base.toLowerCase().includes(q) ||
    c.rank.toLowerCase().includes(q) ||
    (c.crewName?.toLowerCase().includes(q) ?? false)
  )
}

/**
 * Scenario baseline (no-explicit-sort) order: seniority asc, then crewId. Mirrors the old
 * crew-list defaultSort but reads the PANEL ROW values, since sorting now runs on panel rows
 * (so computed-stat columns like MCred sort too — the §Gantt-Unify fix that aligns Scenario
 * with Live, which has always sorted its panel rows).
 */
function scenarioRowDefaultCmp(a: PanelRowData, b: PanelRowData): number {
  const sa = String(a.values.seniority ?? '')
  const sb = String(b.values.seniority ?? '')
  const na = sa !== '' ? Number(sa) : Infinity
  const nb = sb !== '' ? Number(sb) : Infinity
  if (na !== nb) return na - nb
  return String(a.values.crewId ?? '').localeCompare(String(b.values.crewId ?? ''))
}

/**
 * Build the scenario RosterPaneSource accessor — lifts the crew filtering/ordering,
 * roster item build, panel-rows-with-violations, violationMap, hit-test, selection,
 * and read-only interaction callbacks out of the old ScenarioRosterPane.
 *
 * The optional Live-only members (useLockMap / useSessionTags / showSessionTags) are
 * omitted — scenario carries no locks/session tags, so the shared component renders
 * the canvas with the EMPTY_* singletons it owns.
 *
 * Bound to a concrete `paneId` (the roster pane is single-instance per scenario but
 * its layout-grid paneId varies); paneId scopes the scrollY read, frozen/found tiers,
 * and the cross-pane drop registration.
 */
function makeScenarioRosterPaneSource(
  scenarioId: number,
  paneId: string,
  crossPaneDrag: CrossPaneDragHandler | null,
): RosterPaneSource {
  const useGanttStore  = getScenarioGanttStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)
  const usePaneStore   = getPaneStore(scenarioId)
  const useCrewFilterStore  = getFilterStore(scenarioId)
  const useViolationStore = getScenarioViolationStore(scenarioId)
  const useSelectionStore = getScenarioRosterSelectionStore(scenarioId)

  // ── Crew filter (structural + text); sorting now runs on the built PANEL ROWS, not the
  //    crew list, so computed-stat columns (MCred / MDO) sort too — see useRosterModel. ──
  const filterCrew = (crew: ScenarioGanttCrew[], search: string, crewFilter: CrewFilter): ScenarioGanttCrew[] =>
    crew.filter((c) => matchesCrew(c, search, crewFilter))

  // ── Tier the SORTED panel rows: frozen → found → rest (by rowId = crewId). ──
  const tierRows = (
    rows: PanelRowData[],
    frozenSet: Set<string>,
    foundCrewIds: string[],
  ): PanelRowData[] => {
    const foundSet = new Set(foundCrewIds)
    const frozen = rows.filter((r) => frozenSet.has(r.rowId))
    const rest   = rows.filter((r) => !frozenSet.has(r.rowId))
    if (foundSet.size === 0) return [...frozen, ...rest]
    const rowById = new Map(rest.map((row) => [row.rowId, row]))
    const found    = foundCrewIds
      .map((crewId) => rowById.get(crewId))
      .filter((row): row is PanelRowData => row != null && foundSet.has(row.rowId))
    const notFound = rest.filter((r) => !foundSet.has(r.rowId))
    return [...frozen, ...found, ...notFound]
  }

  // Read-fresh refs (event-time hit-test / drop): updated by useRosterModel on each render.
  const crewIdsRef = { current: [] as string[] }
  const itemsByCrewRef = { current: new Map<string, RosterItem[]>() }
  const itemsRef = { current: [] as RosterItem[] }
  const laneLayoutByTaskIdRef = { current: undefined as Map<number, RosterLaneHitLayout> | undefined }
  const taskByIdRef = { current: new Map<number, RosterItem>() }
  const frozenRowCountRef = { current: 0 }
  const canvasRef = { current: null as HTMLCanvasElement | null }

  const clampScrollY = (desired: number): number => {
    const containerHeight = canvasRef.current?.clientHeight ?? 600
    return clampRosterScrollY(desired, crewIdsRef.current.length, containerHeight)
  }

  return {
    // P0: one memoized model (ordered crew + roster items + panel rows + violation map +
    // indexes) built once per dependency change — was previously rebuilt 3× across
    // useRows / usePanelRows / useViolationMap (buildScenarioRosterItems ran 3×).
    useRosterModel: () => {
      const data = useGanttStore((s) => s.data)
      const pendingChanges = useGanttStore((s) => s.pendingChanges)
      const crewFilter = useCrewFilterStore((s) => s.crew)
      const search = useSelectionStore((s) => s.search)
      const sortCriteria = usePaneStore((s) => s.getSortCriteria('scenario-roster'))
      const frozenCrewIds = useLayoutStore((s) => s.panes.get(paneId)?.frozenCrewIds ?? [])
      const foundCrewIds  = useLayoutStore((s) => s.panes.get(paneId)?.foundCrewIds ?? [])
      const violationsByKey = useViolationStore((s) => s.violations)
      const timezone = useTimezoneStore((s) => s.timezone)
      const rpItems = useRosterPeriodStore((s) => s.items)
      const viewportLeftMs = useGanttStore((s) => {
        if (!s.data) return null
        return xToTime(s.scrollX, new Date(s.data.strDtLoc), s.pxPerHour).getTime()
      })
      const viewportPeriod = useMemo(() => {
        if (viewportLeftMs == null) return null
        return {
          rosterPeriod: rpForTimestamp(rpItems, viewportLeftMs)?.rosterPeriod ?? null,
          yearMonth: yearMonthInTimeZone(new Date(viewportLeftMs), timezone),
        }
      }, [rpItems, timezone, viewportLeftMs])
      // Leftmost visible calendar day — the roster header resolves each crew's effective
      // rank/base at THIS date (Live parity: live-gantt-source buildPanelRows).
      const viewportLeftDate = useMemo(() => {
        if (viewportLeftMs == null) return null
        const leftmost = new Date(viewportLeftMs)
        const calendarDate = calendarDateInTimeZone(leftmost, timezone)
        return calendarDateToUtcMidnight(calendarDate, timezone)
      }, [viewportLeftMs, timezone])

      // Tier-1 optimistic RP Credit delta (aligned with Live): while patches are pending,
      // compute the per-crew manday delta between the base roster and the patched roster and
      // add it to the server-authoritative stats so the editor sees RP Credit move instantly.
      // The authoritative values replace it when the async manday recompute pushes back.
      const mandayDelta = useMemo<Map<string, MandayKpiDelta>>(() => {
        if (!data || pendingChanges.length === 0 || !viewportPeriod?.rosterPeriod) return new Map()
        const pairingMap = new Map(data.pairings.map((p) => [p.pairingId, p]))
        const base = buildScenarioRosterItems({
          crew: data.crew ?? [],
          pairingMap,
          assignments: data.assignments ?? [],
          pairingSegments: data.pairingSegments ?? [],
          groundItems: data.groundItems ?? [],
          pendingChanges: [],
        })
        const virtual = buildScenarioRosterItems({
          crew: data.crew ?? [],
          pairingMap,
          assignments: data.assignments ?? [],
          pairingSegments: data.pairingSegments ?? [],
          groundItems: data.groundItems ?? [],
          pendingChanges,
        })
        return crewMandayDelta(base.items, virtual.items, viewportPeriod.rosterPeriod, rpItems)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [data?.crew, data?.pairings, data?.assignments, data?.pairingSegments, data?.groundItems,
          pendingChanges, viewportPeriod?.rosterPeriod, rpItems])

      const result = useMemo(() => {
        bumpRosterModelBuild('scenario-roster')
        const frozenSet = new Set(frozenCrewIds)
        const foundSet  = new Set(foundCrewIds)

        // 1) Filter the crew (sorting happens later, on the built panel rows).
        const filtered = filterCrew(data?.crew ?? [], search, crewFilter)

        // 2) Build items — order-independent (itemsByCrew is keyed by crewId; the canvas renders
        //    by the final crewIds order + buckets, so item-list order does not matter here).
        const pairingMap = new Map((data?.pairings ?? []).map((p) => [p.pairingId, p]))
        const built = buildScenarioRosterItems({
          crew: filtered,
          pairingMap,
          assignments: data?.assignments ?? [],
          pairingSegments: data?.pairingSegments ?? [],
          groundItems: data?.groundItems ?? [],
          pendingChanges,
        })
        const { taskById, itemsByPairingId } = buildRosterIndexes(built.items)
        const violationMap = buildViolationMap(violationsByKey, built.itemsByCrew, itemsByPairingId)
        const crewViolationSeverityMap = buildScenarioCrewViolationSeverityMap(violationsByKey)

        // 3) Build UNSORTED panel rows (carry mcred / mdo etc. + max violation severity).
        const crewStats = data?.crewStats ?? {}
        const unsortedRows: PanelRowData[] = filtered.map((c) => {
          const statsByPeriod = crewStats[c.crewId] ?? {}
          const monthStats = viewportPeriod?.rosterPeriod
            ? statsByPeriod[viewportPeriod.rosterPeriod] ?? statsByPeriod[viewportPeriod.yearMonth]
            : viewportPeriod?.yearMonth
              ? statsByPeriod[viewportPeriod.yearMonth]
              : undefined
          // Tier-1 optimistic delta: add the pending-edit delta to the authoritative stats.
          const d = mandayDelta.get(c.crewId)
          const nz = (n: number): number => (n < 0 ? 0 : n)
          // Date-effective rank/base at the viewport's leftmost day (Live parity).
          const identity = viewportLeftDate
            ? buildScenarioCrewIdentity(c, viewportLeftDate)
            : { rank: c.crewRank ?? c.rank, base: c.base }
          const row: PanelRowData = {
            rowId: c.crewId,
            values: {
              crewId:    c.crewId,
              rank:      identity.rank,
              base:      identity.base,
              seniority: formatSeniority(c.seniorityNum),
              ybh:       monthStats?.ybh != null ? formatBlockMinutes(Math.round(monthStats.ybh + (d?.ybh ?? 0))) : '',
              fleet:     '',
              mcred:     monthStats != null ? formatBlockMinutes(Math.round((monthStats.mcred ?? monthStats.credit) + (d?.mcred ?? 0))) : '',
              mbh:       monthStats?.mbh != null ? formatBlockMinutes(Math.round(monthStats.mbh + (d?.mbh ?? 0))) : '',
              yal:       monthStats?.yal != null ? String(nz(monthStats.yal + (d?.yal ?? 0))) : '',
              mal:       monthStats?.mal != null ? String(nz(monthStats.mal + (d?.mal ?? 0))) : '',
              ydo:       monthStats?.ydo != null ? String(nz(monthStats.ydo + (d?.ydo ?? 0))) : '',
              mdo:       monthStats != null ? String(nz((monthStats.mdo ?? monthStats.dayOffCount) + (d?.mdo ?? 0))) : '',
              crewName:  c.crewName ?? '',
            },
          }
          // Inject per-crew max violation severity (the value the left-gutter bell draws from).
          if (violationMap.size > 0 || crewViolationSeverityMap.size > 0) {
            let maxSev = 0
            for (const it of built.itemsByCrew.get(c.crewId) ?? []) {
              const s = violationMap.get(it.id) ?? 0
              if (s > maxSev) maxSev = s
            }
            maxSev = Math.max(maxSev, crewViolationSeverityMap.get(c.crewId) ?? 0)
            if (maxSev > 0) row.maxViolationSeverity = maxSev
          }
          return row
        })

        // 4) Sort the panel rows with the SAME shared comparator Live uses (so MCred / MDO and
        //    every other column sort identically), then 5) tier frozen → found → rest.
        const sortedRows = sortPanelRowsByValues(unsortedRows, sortCriteria, scenarioRowDefaultCmp)
        const panelRows = tierRows(sortedRows, frozenSet, foundCrewIds)

        const crewIds = panelRows.map((r) => r.rowId)
        const frozenRowCount = panelRows.filter((r) => frozenSet.has(r.rowId)).length

        // 失效红线（与 Live 一致）：rank/base 覆盖断档点（scenario 自身 strDtLoc..endDtLoc 窗口）。
        const crewValidityBlock = new Map<string, number>()
        const winStartMs = data?.strDtLoc ? new Date(data.strDtLoc).getTime() : null
        const winEndMs = data?.endDtLoc ? new Date(data.endDtLoc).getTime() : null
        if (winStartMs != null && winEndMs != null) {
          for (const c of filtered) {
            const block = computeValidityBlock(c.ranks ?? [], c.bases ?? [], winStartMs, winEndMs)
            if (block !== null) crewValidityBlock.set(c.crewId, block)
          }
        }

        return {
          crewIds, items: built.items, itemsByCrew: built.itemsByCrew,
          panelRows, violationMap, crewViolationSeverityMap, frozenRowCount, taskById, itemsByPairingId,
          crewValidityBlock,
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [data?.crew, search, crewFilter, sortCriteria, frozenCrewIds, foundCrewIds,
          data?.pairings, data?.assignments, data?.pairingSegments, data?.groundItems,
          data?.crewStats, pendingChanges, violationsByKey, viewportPeriod, viewportLeftDate,
          data?.strDtLoc, data?.endDtLoc])

      // Keep event-time refs fresh (hit-test + cross-pane drop read these).
      crewIdsRef.current = result.crewIds
      itemsByCrewRef.current = result.itemsByCrew
      itemsRef.current = result.items
      taskByIdRef.current = result.taskById
      frozenRowCountRef.current = result.frozenRowCount

      return result
    },

    useColumns: (): ColumnConfig[] => useColumnStore((s) => s.getVisibleColumns('scenario-roster')),

    // ── Legality Alert Center (shared bell + dialog; was the standalone ScenarioAlertCenter) ──
    // Rows come from the same current violation map used by the roster header bells. This is
    // important while a draft pre-check is active: runPreCheck updates `violations`, but the
    // persisted DB rows remain unchanged until the scenario is saved/recomputed.
    useAlertCenter: () => {
      const violationsByKey = useViolationStore((s) => s.violations)
      const crew = useGanttStore((s) => s.data?.crew)
      const status = useViolationStore((s) => s.legalityStatus)
      const computedAt = useViolationStore((s) => s.computedAt)
      const errorText = useViolationStore((s) => s.errorText)
      const paramsStale = useViolationStore((s) => s.paramsStale)
      const computingSince = useViolationStore((s) => s.computingSince)
      const stuck = useStuckAfter(computingSince, SCENARIO_RECHECK_STUCK_MS)
      const rows = useMemo<CrewViolationRow[]>(() => {
        const meta = new Map((crew ?? []).map((c) => [c.crewId, { base: c.base, rank: c.rank }]))
        const seen = new Set<string>()
        const result: CrewViolationRow[] = []
        for (const [, violations] of violationsByKey) {
          for (const v of violations) {
            const crewId = v.crewId ?? (v.targetType === 'crew' ? String(v.targetId) : '')
            if (!crewId) continue
            const prefix = `${v.ruleCode}/`
            const ruleInstance = v.ruleName.startsWith(prefix)
              ? v.ruleName.slice(prefix.length)
              : null
            // runRuleBatch exposes both pairing and crew anchors for one rule result.
            // Collapse those two display entries, but retain separate pairing instances.
            const anchor = v.anchorPairingId ?? (v.targetType === 'pairing' ? v.targetId : '')
            const key = [
              crewId,
              v.ruleCode,
              ruleInstance ?? '',
              v.message,
              String(anchor),
            ].join('|')
            if (seen.has(key)) continue
            seen.add(key)
            result.push({
              crewId,
              base: meta.get(crewId)?.base ?? '',
              rank: meta.get(crewId)?.rank ?? '',
              ruleCode: v.ruleCode,
              ruleInstance,
              severity: v.severity,
              message: v.message,
            })
          }
        }
        return result
      }, [violationsByKey, crew])
      return {
        rows,
        onScan: () => {
          // Refresh must recompute and persist scenario.rule_violation. A plain GET only
          // re-reads the old persisted rows and cannot repair a stale Alert Center snapshot.
          // Completion arrives via the scenario-legality-updated WS push (no polling).
          void recheckScenarioLegality(scenarioId)
            .catch(() => notify.error('Failed to refresh legality'))
        },
        recheckInfo: { type: 'scenario', status, computedAt, errorText, paramsStale, stuck },
      }
    },

    // ── Quality Analyzer (scenario only) — thin pass-through; dialog owns params + recompute. ──
    useQualityAnalysis: () => {
      const data = useGanttStore((s) => s.data)
      return { data }
    },

    // ── Legality Recheck (pane-toolbar button, next to the bell; §Pane-Toolbar-Home) ──
    // Force a server-side recompute, then poll the persisted legality back into the violation
    // store (same poll the view runs on mount). `computing` reflects the at-rest status so the
    // button disables/spins; `paramsStale` tints the button + shows the outdated dot.
    useLegalityRecheck: () => {
      const status = useViolationStore((s) => s.legalityStatus)
      const paramsStale = useViolationStore((s) => s.paramsStale)
      const computingSince = useViolationStore((s) => s.computingSince)
      const computing = status === 'COMPUTING' || status === 'PENDING'
      const stuck = useStuckAfter(computingSince, SCENARIO_RECHECK_STUCK_MS)
      const onRecheck = useCallback(() => {
        getScenarioViolationStore(scenarioId).getState().markRecheckTriggered()
        // Completion arrives via the scenario-legality-updated WS push (no polling); the
        // push refetches persisted legality and refreshes violations + the alert bell.
        void recheckScenarioLegality(scenarioId)
          .catch(() => notify.error('Failed to recheck legality'))
      }, [])
      return { onRecheck, computing, paramsStale, stuck }
    },

    get capabilities() {
      const caps = getScenarioGanttStore(scenarioId).getState().data?.capabilities ?? READ_ONLY_CAPABILITIES
      const isOwner = getScenarioGanttStore(scenarioId).getState().lockStatus?.isOwner ?? false
      return {
        canAssign: isOwner && caps.roster.canAssign,
        canRemove: isOwner && caps.roster.canRemove,
        canReassign: isOwner && caps.roster.canReassign,
      }
    },

    // ── Selection ─────────────────────────────────────────────────────────────
    useSelectedCrewIds: () => useSelectionStore((s) => s.selectedCrewIds),
    useSelectedTaskIds: () => useSelectionStore((s) => s.selectedTaskIds),
    selectCrewRow: (crewId, mode, orderedIds) =>
      getScenarioRosterSelectionStore(scenarioId).getState().selectCrewRow(crewId, mode, orderedIds),
    // Float the crew to the top of this roster pane: set it as the only found id (the scenario
    // tierRows order found crew first, after frozen) and scroll the pane to the top.
    bringCrewToTop: (crewId) => {
      const st = getScenarioLayoutStore(scenarioId).getState()
      st.setFoundCrewIds(paneId, [crewId])
      st.setScrollY(paneId, 0)
    },

    // ── Interaction (canvas) ────────────────────────────────────────────────────
    getHitTest: (): HitTestFn => (canvasX, canvasY) => {
      const sX = getScenarioGanttStore(scenarioId).getState().scrollX
      const sY = getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.scrollY ?? 0
      const store = getScenarioGanttStore(scenarioId).getState()
      const pph = store.pxPerHour
      const drStart = store.data ? new Date(store.data.strDtLoc) : new Date()
      const task = hitTestTask(
        canvasX, canvasY, sX, sY,
        itemsRef.current, crewIdsRef.current, drStart, pph, frozenRowCountRef.current, itemsByCrewRef.current,
        laneLayoutByTaskIdRef.current,
      )
      if (task) {
        return {
          type: 'roster-task',
          itemId: task.id,
          rowIndex: crewIdsRef.current.indexOf(task.crewId),
          rowId: task.crewId,
          pairingId: task.pairingId ?? undefined,
        }
      }
      return { type: 'background', itemId: null, rowIndex: -1, rowId: null }
    },

    useInteractionCallbacks: (): PaneInteractionCallbacks => {
      // Subscribe to selection so the click-toggle logic reads the current set.
      const selectedTaskIds = useSelectionStore((s) => s.selectedTaskIds)
      const setStatusBarText = useUiStore((s) => s.setStatusBarText)
      const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)
      const loadAirportTz = useAirportTzStore((s) => s.load)
      // capabilities are read fresh (getter) inside drag-start so we avoid stale closures.

      useEffect(() => { void loadAirportTz() }, [loadAirportTz])

      const deriveCrewIdsForTasks = (taskIds: Set<number>): Set<string> => {
        const crewIds = new Set<string>()
        for (const [crewId, items] of itemsByCrewRef.current) {
          if (items.some((it) => taskIds.has(it.id))) crewIds.add(crewId)
        }
        return crewIds
      }

      const handleSelectTasks = (ids: Set<number>) => {
        getScenarioRosterSelectionStore(scenarioId).getState().setTasks(ids, deriveCrewIdsForTasks)
      }

      return {
        onItemClick: (hit, ctrlKey) => {
          if (hit.itemId == null) { handleSelectTasks(new Set()); return }
          const item = taskByIdRef.current.get(hit.itemId)
          if (!item) { handleSelectTasks(new Set()); return }

          // Ctrl+click toggles the single task puck in/out of the selection (Live parity).
          if (ctrlKey) {
            getScenarioRosterSelectionStore(scenarioId).getState()
              .toggleTask(hit.itemId, deriveCrewIdsForTasks)
            return
          }

          const crewBucket = itemsByCrewRef.current.get(item.crewId) ?? []
          let groupIds: number[]
          if (item.pairingId != null) {
            groupIds = crewBucket.filter((it) => it.pairingId === item.pairingId).map((it) => it.id)
          } else {
            groupIds = [item.id]
          }
          const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedTaskIds.has(id))
          handleSelectTasks(allSelected ? new Set() : new Set(groupIds))
        },
        onItemDoubleClick: (hit) => {
          if (hit.itemId == null) return
          const task = taskByIdRef.current.get(hit.itemId)
          if (!task) return
          if (task.pairingId === null) useUiStore.getState().openGroundTaskEdit(task, scenarioId)
          else useUiStore.getState().openPairingInfo(task.pairingId, scenarioId, task.crewId)
        },
        onItemRightClick: (hit, clientX, clientY) => {
          if (hit.itemId == null) return
          if (hit.rowId) {
            const paneStore = getPaneStore(scenarioId).getState()
            const selectedRows = paneStore.getSelectedRowIds('scenario-roster')
            if (!selectedRows.includes(hit.rowId)) paneStore.selectRow('scenario-roster', hit.rowId)
          }
          const item = taskByIdRef.current.get(hit.itemId)
          const mockTask = {
            id: hit.itemId,
            pairingId: hit.pairingId ?? null,
            crewId: hit.rowId ?? undefined,
            findFltId: item?.fltId ?? null,
            source: item?.source ?? null,
            schStrDtUtc: item?.schStrDtUtc ?? null,
            schEndDtUtc: item?.schEndDtUtc ?? null,
            assignmentGroup: item?.assignmentGroup ?? '',
            assignment: item?.assignment ?? null,
          } as never
          useUiStore.getState().openContextMenu(clientX, clientY, mockTask, 'scenario-roster', hit.rowIndex, scenarioId)
        },
        onItemHover: (hit, clientX, clientY) => {
          if (hit?.itemId == null) {
            useGanttViewStore.getState().setHoveredTask(null, clientX, clientY)
            setStatusBarText('')
            return
          }
          const item = taskByIdRef.current.get(hit.itemId)
          if (!item) {
            useGanttViewStore.getState().setHoveredTask(null, clientX, clientY)
            setStatusBarText('')
            return
          }
          useGanttViewStore.getState().setHoveredTask(hit.itemId, clientX, clientY)
          const time = item.schStrDtUtc && item.schEndDtUtc
            ? `${item.schStrDtUtc.slice(5, 16)} ~ ${item.schEndDtUtc.slice(11, 16)}`
            : ''
          const pairSeg = item.pairingId != null
            ? `Pairing #${item.pairingId}${item.segSeq != null ? `  Seg #${item.segSeq}` : ''}`
            : ''
          const crewPart = item.pairingId == null ? `${item.crewId} #${item.id}` : item.crewId
          const credit = formatCreditMinutes(item.actCreditedMinutes) || formatCreditMinutes(item.schCreditedMinutes)
          if (item.pairingId == null) {
            setStatusBarText(formatGroundTaskStatusLine(item, { zoneIdForBase: zoneIdFor }))
          } else {
            setStatusBarText([crewPart, pairSeg, item.assignment ?? item.assignmentGroup, time, credit ? `Credit ${credit}` : ''].filter(Boolean).join('  ·  '))
          }
        },
        onDragStart: (hit, clientX, clientY) => {
          // Reassign: drag a pairing roster task to another crew row (capability + lock gated).
          const st = getScenarioGanttStore(scenarioId).getState()
          const caps = st.data?.capabilities
          const isOwner = st.lockStatus?.isOwner ?? false
          const canReassign = isOwner && !!caps?.roster.canReassign
          if (!canReassign || !crossPaneDrag) return
          if (hit.itemId == null || hit.pairingId == null || hit.rowId == null) return
          const canvas = canvasRef.current
          if (!canvas) return
          const dragSource: DragSource = {
            paneType: 'scenario-roster',
            itemId: hit.itemId,
            itemType: 'roster-task',
            sourceRowId: hit.rowId,
            startClientX: clientX,
            startClientY: clientY,
            sourceCanvasRect: canvas.getBoundingClientRect(),
          }
          crossPaneDrag.startDrag(dragSource)
        },
        onDragMove: () => {},
        onDragEnd: () => {},
        onBackgroundClick: () => { handleSelectTasks(new Set()) },
        onRubberBandSelect: (x1, y1, x2, y2, additive) => {
          const sX = getScenarioGanttStore(scenarioId).getState().scrollX
          const sY = getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.scrollY ?? 0
          const store = getScenarioGanttStore(scenarioId).getState()
          const pph = store.pxPerHour
          const drStart = store.data ? new Date(store.data.strDtLoc) : new Date()
          const matched = hitTestTasksInRect(
            x1, y1, x2, y2, sX, sY,
            itemsRef.current, crewIdsRef.current, drStart, pph, frozenRowCountRef.current, itemsByCrewRef.current,
          )
          const ids = matched.map((i) => i.id)
          if (additive) {
            const existing = getScenarioRosterSelectionStore(scenarioId).getState().selectedTaskIds
            handleSelectTasks(new Set([...existing, ...ids]))
          } else {
            handleSelectTasks(new Set(ids))
          }
        },
        onScroll: (dx, dy) => {
          const st = getScenarioGanttStore(scenarioId).getState()
          if (dx !== 0) st.setScrollX(Math.max(0, st.scrollX + dx))
          if (dy !== 0) {
            const cur = getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.scrollY ?? 0
            getScenarioLayoutStore(scenarioId).getState().setScrollY(paneId, clampScrollY(cur + dy))
          }
        },
        onZoom: (dir) => {
          const st = getScenarioGanttStore(scenarioId).getState()
          st.setZoom(st.pxPerHour * (dir === 'in' ? 1.1 : 0.9))
        },
      }
    },

    // ── Cross-pane drop registration (reassign within roster, assign from pairing) ──
    // The shared component supplies the full registration (canvas accessor + scrollY +
    // row count/id). The source captures the canvas element for its own onDragStart
    // hit-rect, forwards the registration tagged 'scenario-roster', and exposes the
    // task→pairing resolver so move-task drops can resolve a pairingId for reassign.
    registerPane: crossPaneDrag
      ? (reg) => {
          canvasRef.current = reg.getCanvasElement()
          crossPaneDrag.registerPane({ paneType: 'scenario-roster', ...reg })
          ;(crossPaneDrag as ScenarioDragHandler).registerTaskPairingResolver?.(
            (taskId) => taskByIdRef.current.get(taskId)?.pairingId ?? null,
          )
        }
      : undefined,
    unregisterPane: crossPaneDrag
      ? () => {
          canvasRef.current = null
          crossPaneDrag.unregisterPane('scenario-roster')
        }
      : undefined,

    setRenderedRows: ({ crewIds, items, itemsByCrew, frozenRowCount, laneLayoutByTaskId }) => {
      crewIdsRef.current = crewIds
      itemsRef.current = items
      itemsByCrewRef.current = itemsByCrew
      frozenRowCountRef.current = frozenRowCount
      laneLayoutByTaskIdRef.current = laneLayoutByTaskId
    },
  }
}

/**
 * Build violationMap (taskId → max severity) from the keyed violation map.
 * Index-backed (P1): pairing-violation expansion reads itemsByPairingId instead of
 * scanning all items per pairing key (was O(V×N), now O(V + affected tasks)). Same
 * taskId → max-severity result as the old full-scan version.
 */
function buildViolationMap(
  violationsByKey: Map<string, RuleViolation[]>,
  itemsByCrew: Map<string, RosterItem[]>,
  itemsByPairingId: Map<number, RosterItem[]>,
): Map<number, number> {
  const map = new Map<number, number>()
  if (violationsByKey.size === 0) return map
  const bump = (taskId: number, sev: number) => {
    const cur = map.get(taskId) ?? 0
    if (sev > cur) map.set(taskId, sev)
  }
  for (const [key, viols] of violationsByKey) {
    const [targetType, targetId] = key.split(':') as [string, string]
    if (targetType === 'crew') {
      // Exclude crew-bell-only rules from task bumps (pucks); severity still on crew map.
      // When a paint window is present (e.g. 7305 consecutive span), only overlapping tasks
      // get badges — otherwise a null pairing_id crew finding lights the whole month.
      for (const v of viols) {
        if (isCrewBellOnlyRule(v.ruleCode) || v.severity <= 0) continue
        for (const it of itemsByCrew.get(targetId) ?? []) {
          if (!pairingTasksOverlapViolationWindow([it], v)) continue
          bump(it.id, v.severity)
        }
      }
    } else if (targetType === 'pairing') {
      const pairingId = Number(targetId)
      // Match Live persisted path: only paint tasks belonging to the violation's crewId
      // so a shared pairing does not light another crew's gutter bell / pucks.
      for (const v of viols) {
        if (isCrewBellOnlyRule(v.ruleCode) || v.severity <= 0) continue
        if (v.crewId) {
          for (const it of itemsByCrew.get(v.crewId) ?? []) {
            if (it.pairingId !== pairingId) continue
            if (!pairingTasksOverlapViolationWindow([it], v)) continue
            bump(it.id, v.severity)
          }
        } else {
          for (const it of itemsByPairingId.get(pairingId) ?? []) {
            if (!pairingTasksOverlapViolationWindow([it], v)) continue
            bump(it.id, v.severity)
          }
        }
        if (v.ruleCode === '7501' && v.crewId && resolveViolationPaintWindow(v)) {
          for (const it of crewFlyTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(it.id, v.severity)
          }
        }
        if (v.ruleCode === '7305' && v.crewId && resolveViolationPaintWindow(v)) {
          for (const it of crewTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(it.id, v.severity)
          }
        }
      }
    } else if (targetType === 'roster') {
      const maxSev = viols
        .filter((v) => !isCrewBellOnlyRule(v.ruleCode))
        .reduce((m, v) => Math.max(m, v.severity), 0)
      if (maxSev === 0) continue
      bump(Number(targetId), maxSev)
    }
  }
  return map
}

function buildScenarioCrewViolationSeverityMap(
  violationsByKey: Map<string, RuleViolation[]>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const [, viols] of violationsByKey) {
    for (const v of viols) {
      const crewId = v.crewId
      if (!crewId) continue
      const current = map.get(crewId) ?? 0
      if (v.severity > current) map.set(crewId, v.severity)
    }
  }
  return map
}

export const buildScenarioViolationMapForTest = buildViolationMap
export const buildScenarioCrewViolationSeverityMapForTest = buildScenarioCrewViolationSeverityMap

/**
 * Scenario 数据源：适配 per-scenario 注册表 store。
 * viewport：scrollX/pxPerHour/range 来自 scenario-gantt-store；per-pane scrollY 来自 scenario-layout-store。
 * dirtySignal：用 scrollX + pxPerHour 组合，确保横向滚动/缩放触发 PaneCanvas 边沿重绘
 * （数据变化经消费组件 render 身份变化触发）。
 *
 * 注意：scenario-layout-store 的 per-pane scrollY 写入动作名为 `setScrollY`（不是草案里的
 * `setPaneScrollY`），且 `panes` 是 Map，故按 `.get(paneId)?.scrollY` 访问。
 */
export const useScenarioGanttSource = (scenarioId: number, rosterPaneId?: string): GanttPaneSource => {
  // Edit + violations are ALWAYS present (never conditional) — capability gating happens
  // inside edit.execute, and violations rendering is always-on (read-only scenarios simply
  // have no violations until an edit triggers pre-check). Both are per-scenario stable.
  const violations = useScenarioViolationSource(scenarioId)
  const edit = useScenarioEditController(scenarioId)
  // Cross-pane drag handler from the scenario DragProvider (null outside a provider —
  // safe). Used by the pairing + roster sources to enable assign / reassign drag.
  const crossPaneDrag = useCrossPaneDrag()
  return useMemo<GanttPaneSource>(() => {
    const useStore = getScenarioGanttStore(scenarioId)
    const useLayout = getScenarioLayoutStore(scenarioId)
    const flight = makeScenarioFlightPaneSource(scenarioId)
    const pairing = makeScenarioPairingPaneSource(scenarioId, crossPaneDrag)
    // The roster source is paneId-bound (scrollY / frozen-found tiers / drop registration
    // are scoped to the concrete pane). Only the roster wrapper passes rosterPaneId; the
    // flight/pairing wrappers call without it (they never read source.roster).
    const roster = rosterPaneId
      ? makeScenarioRosterPaneSource(scenarioId, rosterPaneId, crossPaneDrag)
      : undefined
    return {
      mode: 'scenario',
      useScrollX: () => useStore((s) => s.scrollX),
      useScrollY: (paneId: string) => useLayout((s) => s.panes.get(paneId)?.scrollY ?? 0),
      setScrollY: (paneId: string, n: number) =>
        getScenarioLayoutStore(scenarioId).getState().setScrollY(paneId, n),
      getScrollX: () => getScenarioGanttStore(scenarioId).getState().scrollX,
      getScrollY: (paneId: string) =>
        getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.scrollY ?? 0,
      usePxPerHour: () => useStore((s) => s.pxPerHour),
      useRange: () => {
        const data = useStore((s) => s.data)
        const start = data ? new Date(data.strDtLoc) : new Date(0)
        const end = data ? new Date(data.endDtLoc) : new Date(0)
        return { start, end }
      },
      useTimezone: () => useTimezoneStore((s) => s.timezone),
      useRosterPeriods: () => useRosterPeriodStore((s) => s.items),
      useDirtySignal: () => useStore((s) =>
        s.dataRevision * 1_000_000_000
        + s.renderRevision * 1_000_000
        + Math.round(s.scrollX)
        + Math.round(s.pxPerHour * 1000),
      ),
      markClean: () => {},
      // capabilities 是 getter：data 异步加载，静态捕获会变陈旧。getter 每次读取最新 store。
      get capabilities() {
        return getScenarioGanttStore(scenarioId).getState().data?.capabilities ?? READ_ONLY_CAPABILITIES
      },
      edit,
      violations,
      flight,
      pairing,
      roster,
    } as GanttPaneSource
  }, [scenarioId, rosterPaneId, edit, violations, crossPaneDrag])
}
