import { useEffect, useMemo, useState } from 'react'
import { AppDialog } from '@rois/ui'
import { Navigation } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useFilterStore } from '@/stores/filter-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { findPairingsByFlight } from '@/utils/bring-matches-to-top'
import { findCrewToTop } from '@/utils/find-crew'
import { scenarioFindPairingByFlight, scenarioFindCrewByFlight } from '@/utils/scenario-find-helpers'
import { FlightNaviFilterBar } from './flight-navi-filter-bar'
import { FlightNaviTable } from './flight-navi-table'
import { useFlightNaviData } from './use-flight-navi-data'
import { buildScenarioNaviRows } from './scenario-navi-data'
import { applyNaviFilters, type NaviFilters, type NaviRow } from './flight-navi-filters'
import type { Flight } from '@/types'

const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)

const EMPTY_FILTERS: NaviFilters = {
  coverage: 'all',
  toggles: { dhd: false, rc: false, pc: false, cnl: false },
}

/**
 * Default filters. Live pre-sets the date range to the Gantt's current open period; a Scenario
 * payload is already range-scoped, so it starts with no date sub-filter.
 */
const defaultFilters = (scenarioId: number | null): NaviFilters => {
  if (scenarioId != null) return { ...EMPTY_FILTERS }
  const { dateRange } = useFilterStore.getState()
  return { ...EMPTY_FILTERS, dateStart: fmtDate(dateRange.start), dateEnd: fmtDate(dateRange.end) }
}

/**
 * Flight Navi — a table navigator over the flights loaded for the Gantt date range. Filters the
 * flights client-side and navigates from a flight to its pairings (PTNs), its crew (Roster), or
 * its detail card (COF), bringing the targets to the top of the relevant pane. The window stays
 * open during navigation.
 *
 * One dialog drives BOTH Live and Scenario (§Gantt-Unify), keyed by `flightNaviScenarioId`
 * (mirrors FlightDetailDialog / PairingInfoDialog): Live rows come from the API-backed
 * useFlightNaviData; Scenario rows are derived client-side from the loaded scenario data
 * (no API). The table, filter bar and filter logic are shared verbatim. Navigation routes to
 * the Live find helpers or the per-scenario find helpers accordingly. Scenario data is loaded
 * via getState() in an effect (not a conditional store hook) so the single mounted dialog never
 * varies its hook calls as the active context changes.
 */
export const FlightNaviDialog = (): React.ReactElement | null => {
  const open = useUiStore((s) => s.flightNaviOpen)
  const scenarioId = useUiStore((s) => s.flightNaviScenarioId)
  const closeFlightNavi = useUiStore((s) => s.closeFlightNavi)
  const [filters, setFilters] = useState<NaviFilters>(EMPTY_FILTERS)

  // Each time the dialog opens (or its context changes), reset the filters for that context.
  useEffect(() => {
    if (open) setFilters(defaultFilters(scenarioId))
  }, [open, scenarioId])

  // Live navi data — the hook is ALWAYS called (rules-of-hooks), but only fetches when the dialog
  // is open AND in Live context; in a Scenario it stays idle (no live /api/flight call).
  const live = useFlightNaviData(open && scenarioId == null)

  // Scenario navi rows — derived client-side from the loaded scenario data on open / id change.
  const [scnRows, setScnRows] = useState<NaviRow[]>([])
  useEffect(() => {
    if (!open || scenarioId == null) { setScnRows([]); return }
    const data = getScenarioGanttStore(scenarioId).getState().data
    setScnRows(data ? buildScenarioNaviRows(data) : [])
  }, [open, scenarioId])

  const rows = scenarioId != null ? scnRows : live.rows
  const loading = scenarioId != null ? false : live.loading
  const homeAirline = scenarioId != null ? '' : live.homeAirline

  const registers = useMemo(
    () => [...new Set(rows.map((r) => r.flight.register).filter((r): r is string => !!r))].sort(),
    [rows],
  )
  const filtered = useMemo(
    () => applyNaviFilters(rows, filters, homeAirline),
    [rows, filters, homeAirline],
  )

  const handlePtns = (f: Flight): void => {
    if (scenarioId != null) scenarioFindPairingByFlight(scenarioId, f.id)
    else void findPairingsByFlight(f.id)
  }
  const handleRoster = (f: Flight): void => {
    if (scenarioId != null) scenarioFindCrewByFlight(scenarioId, f.id)
    else void findCrewToTop('flight', f.id, 'main')
  }
  const handleCof = (f: Flight): void => { useUiStore.getState().openFlightDetail(f.id, scenarioId ?? undefined) }

  if (!open) return null

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) closeFlightNavi() }}
      data-testid="flight-navi-dialog"
      // Navigator: non-modal so the roster/pairing panes stay visible & update live as
      // the user clicks navi cells; non-dismissable so clicking a pane doesn't close it.
      modal={false}
      dismissable={false}
      className="sm:max-w-[1200px]"
      bodyClassName="flex h-[70vh] flex-col gap-0 p-0"
      icon={<Navigation className="h-4 w-4" />}
      title="Flight Navi"
    >
      <FlightNaviFilterBar filters={filters} onChange={setFilters} registers={registers} />
      <FlightNaviTable
        rows={filtered}
        onPtnsClick={handlePtns}
        onRosterClick={handleRoster}
        onCofClick={handleCof}
      />
      <div className="flex h-8 shrink-0 items-center border-t border-border px-3 text-2xs text-muted-foreground" data-testid="flight-navi-count">
        {loading ? 'Loading flights…' : `${filtered.length} of ${rows.length} flights`}
      </div>
    </AppDialog>
  )
}
