import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { rpForLeftmost } from '@/hooks/use-current-rp'
import type { RosterPeriodOption } from '@/services/roster-period-api'

/** Presentational RP color block. */
const RpIndicatorView = ({ rp }: { rp: RosterPeriodOption | null }) => {
  if (!rp) return null
  return (
    <div
      data-testid="roster-header-rp"
      className="inline-flex items-center rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-2xs font-semibold tabular-nums text-primary"
      title={`Roster period ${rp.rosterPeriod} (${rp.name})`}
    >
      {rp.rosterPeriod}
    </div>
  )
}

/**
 * Roster-header RP indicator: shows the roster period of the leftmost visible
 * gantt day, updating on horizontal pan and RP-nav. Each variant subscribes to
 * its own scroll store so only this component re-renders on scroll — the host
 * PaneToolbar stays scroll-independent (memoized).
 */
export function LiveRpIndicator() {
  const items = useRosterPeriodStore((s) => s.items)
  const scrollX = useGanttViewStore((s) => s.scrollX)
  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const rangeStart = usePaneStore((s) => s.dateRange.start)
  const rp = rpForLeftmost(items, { scrollX, pxPerHour, rangeStartMs: rangeStart.getTime() })
  return <RpIndicatorView rp={rp} />
}

export function ScenarioRpIndicator({ scenarioId }: { scenarioId: number }) {
  const items = useRosterPeriodStore((s) => s.items)
  const useScenarioStore = getScenarioGanttStore(scenarioId)
  const scrollX = useScenarioStore((s) => s.scrollX)
  const pxPerHour = useScenarioStore((s) => s.pxPerHour)
  const strDtLoc = useScenarioStore((s) => s.data?.strDtLoc)
  const rangeStartMs = strDtLoc ? new Date(strDtLoc).getTime() : 0
  const rp = rpForLeftmost(items, { scrollX, pxPerHour, rangeStartMs })
  return <RpIndicatorView rp={rp} />
}
