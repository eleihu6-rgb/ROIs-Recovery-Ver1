import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AppDialog, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@rois/ui'
import { ChevronLeft, ChevronRight, ListTree } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { usePairingStore } from '@/stores/pairing-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getPaneStore, usePaneStore } from '@/stores/pane-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { calendarDateInTimeZone } from '@/components/gantt/gantt-utils'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { buildPairingItems } from '@/utils/scenario-pairing-adapter'
import { buildGanttDayStatistics, mergeTargetIds, type DayStatNode, type DayStatRow } from '@/utils/gantt-day-statistics'
import { formatScheduleDateTime } from '@/utils/schedule-details'
import { bringCrewIdsToTop, bringPairingIdToTop } from '@/utils/bring-matches-to-top'

const shiftDate = (date: string, delta: number): string => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10)
}

const formatDay = (date: string): string => new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`))

const displayDateTime = (value: string | null, timezone: string): string =>
  value ? formatScheduleDateTime(value, timezone) : '—'

const nodeRows = (node: DayStatNode): DayStatRow[] => node.rows

const sortDetailRows = (rows: readonly DayStatRow[]): DayStatRow[] =>
  [...rows].sort((a, b) => {
    if (a.crewId == null && b.crewId != null) return 1
    if (a.crewId != null && b.crewId == null) return -1
    const crewOrder = (a.crewId ?? '').localeCompare(b.crewId ?? '', undefined, { numeric: true })
    if (crewOrder !== 0) return crewOrder
    return (a.startUtc ?? '').localeCompare(b.startUtc ?? '')
  })

export const GanttDayStatisticsDialog = () => {
  const open = useUiStore((s) => s.ganttDayStatisticsOpen)
  const initialDate = useUiStore((s) => s.ganttDayStatisticsDate)
  const scenarioId = useUiStore((s) => s.ganttDayStatisticsScenarioId)
  const close = useUiStore((s) => s.closeGanttDayStatistics)
  const timezone = useTimezoneStore((s) => s.timezone)
  const liveMainRoster = useRosterStore((s) => s.main.rosterItems)
  const liveSubRoster = useRosterStore((s) => s.sub.rosterItems)
  const liveCrewItems = useCrewStore((s) => s.items)
  const liveSelectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
  const livePairings = usePairingStore((s) => s.items)
  const liveRange = usePaneStore((s) => s.dateRange)
  const [date, setDate] = useState(initialDate ?? '')
  const [detailRows, setDetailRows] = useState<DayStatRow[]>([])
  const [detailTitle, setDetailTitle] = useState('Daily Statistics Details')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['crew', 'assignment']))
  const liveRoster = useMemo(() => [...liveMainRoster, ...liveSubRoster], [liveMainRoster, liveSubRoster])
  const liveCrews = useMemo(() => {
    const selected = new Set(liveSelectedCrewIds)
    return liveCrewItems
      .map((item) => item.crew)
      .filter((crew) => selected.has(crew.crewId))
  }, [liveCrewItems, liveSelectedCrewIds])

  useEffect(() => {
    if (open && initialDate) setDate(initialDate)
  }, [initialDate, open])

  const scenarioSnapshot = useMemo(() => {
    if (scenarioId == null) return null
    const store = getScenarioGanttStore(scenarioId).getState()
    const data = store.data
    if (!data) return null
    const pairingItems = buildPairingItems(data.pairings, data.pairingSegments, data.assignments, data.flights)
    const pairingMap = new Map(data.pairings.map((pairing) => [pairing.pairingId, pairing]))
    const built = buildScenarioRosterItems({
      crew: data.crew,
      pairingMap,
      assignments: data.assignments,
      pairingSegments: data.pairingSegments,
      groundItems: data.groundItems,
      pendingChanges: store.pendingChanges,
    })
    return {
      crews: [],
      scenarioCrew: data.crew,
      roster: built.items,
      pairings: pairingItems.map((item) => item.pairing),
      segments: pairingItems.flatMap((item) => item.segments),
      range: { start: new Date(data.strDtLoc), end: new Date(data.endDtLoc) },
    }
  }, [scenarioId, open])

  const liveSnapshot = useMemo(() => ({
    crews: liveCrews,
    scenarioCrew: undefined,
    roster: liveRoster,
    pairings: livePairings.map((item) => item.pairing),
    segments: livePairings.flatMap((item) => item.segments),
    range: liveRange,
  }), [liveCrews, liveRoster, livePairings, liveRange])

  const snapshot = scenarioId == null ? liveSnapshot : scenarioSnapshot

  const model = useMemo(() => {
    if (!date || !snapshot) return null
    return buildGanttDayStatistics({
      date,
      timezone,
      crews: snapshot.crews,
      scenarioCrew: snapshot.scenarioCrew,
      rosterItems: snapshot.roster,
      pairings: snapshot.pairings,
      pairingSegments: snapshot.segments,
    })
  }, [date, snapshot, timezone])

  useEffect(() => {
    if (!model) return
    const assignmentGroupIds = model.nodes
      .filter((item) => item.category === 'assignment')
      .map((item) => item.id)
    if (assignmentGroupIds.length === 0) return
    setExpanded((current) => {
      const next = new Set(current)
      let changed = false
      for (const id of assignmentGroupIds) {
        if (next.has(id)) continue
        next.add(id)
        changed = true
      }
      return changed ? next : current
    })
  }, [model])

  const rangeStartDate = snapshot ? calendarDateInTimeZone(snapshot.range.start, timezone) : ''
  const rangeEndDate = snapshot ? calendarDateInTimeZone(snapshot.range.end, timezone) : ''
  const canPrev = Boolean(rangeStartDate && date > rangeStartDate)
  const canNext = Boolean(rangeEndDate && date < rangeEndDate)

  const locate = (rows: readonly DayStatRow[]) => {
    const targets = mergeTargetIds(rows)
    if (scenarioId != null) {
      const rosterSelection = getScenarioRosterSelectionStore(scenarioId).getState()
      if (targets.rosterTaskIds.length > 0) {
        rosterSelection.setTasks(new Set(targets.rosterTaskIds), (ids) => {
          const crewIds = new Set<string>()
          for (const item of snapshot?.roster ?? []) if (ids.has(item.id)) crewIds.add(item.crewId)
          return crewIds
        })
      } else if (targets.crewIds.length > 0) {
        rosterSelection.selectCrewRow(targets.crewIds[0], 'single', targets.crewIds)
        for (const crewId of targets.crewIds.slice(1)) rosterSelection.selectCrewRow(crewId, 'toggle', targets.crewIds)
      }
      if (targets.pairingIds.length > 0) {
        const pairingStore = getPaneStore(scenarioId).getState()
        pairingStore.selectRow('scenario-pairing', String(targets.pairingIds[0]))
        for (const pairingId of targets.pairingIds.slice(1)) pairingStore.toggleRowSelection('scenario-pairing', String(pairingId))
        if (targets.crewIds.length === 0) pinPairingIds(targets.pairingIds)
      }
      return
    }
    if (targets.rosterTaskIds.length > 0) useGanttViewStore.getState().selectTasks(targets.rosterTaskIds)
    if (targets.crewIds.length > 0) {
      const pane = liveRoster.some((item) => item.crewId === targets.crewIds[0]) ? 'roster-main' : 'roster-main'
      const paneStore = usePaneStore.getState()
      paneStore.selectRow(pane, targets.crewIds[0])
      for (const crewId of targets.crewIds.slice(1)) paneStore.toggleRowSelection(pane, crewId)
      void bringCrewIdsToTop(targets.crewIds, 'main')
    }
    if (targets.pairingIds.length > 0) {
      const pairingStore = usePaneStore.getState()
      pairingStore.selectRow('pairing', String(targets.pairingIds[0]))
      for (const pairingId of targets.pairingIds.slice(1)) pairingStore.toggleRowSelection('pairing', String(pairingId))
      if (targets.crewIds.length === 0) pinPairingIds(targets.pairingIds)
    }
  }

  const toggle = (nodeId: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    return next
  })

  const pinRows = (rows: readonly DayStatRow[]) => {
    const targets = mergeTargetIds(rows)
    if (targets.crewIds.length === 0) {
      pinPairingIds(targets.pairingIds)
      return
    }
    const crewIds = targets.crewIds
    if (scenarioId != null) {
      const layout = getScenarioLayoutStore(scenarioId).getState()
      const paneId = layout.findPaneIdByType('roster')
      if (paneId) {
        layout.setFoundCrewIds(paneId, crewIds)
        layout.setScrollY(paneId, 0)
      }
      return
    }
    void bringCrewIdsToTop(crewIds, 'main', 'replace')
  }

  const pinPairingIds = (pairingIds: readonly number[]) => {
    const ids = [...new Set(pairingIds)]
    if (ids.length === 0) return
    if (scenarioId != null) {
      const layout = getScenarioLayoutStore(scenarioId).getState()
      const paneId = layout.findPaneIdByType('pairing')
      if (paneId) {
        layout.setFoundCrewIds(paneId, ids.map(String))
        layout.setScrollY(paneId, 0)
      }
      return
    }
    void Promise.all(ids.map((id) => bringPairingIdToTop(id)))
  }

  const openDetails = (item: DayStatNode) => {
    setDetailRows(sortDetailRows(item.rows))
    setDetailTitle(`${item.label} · ${formatDay(date)}`)
  }

  const openDetailsAndPin = (item: DayStatNode) => {
    openDetails(item)
    pinRows(sortDetailRows(item.rows))
  }

  const renderNode = (item: DayStatNode, depth = 0): ReactElement => (
    <div key={item.id}>
      <div
        className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-xs hover:bg-accent/50"
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        onClick={() => openDetailsAndPin(item)}
        onDoubleClick={() => locate(nodeRows(item))}
        title="Double-click to locate in Gantt"
      >
        {item.children.length > 0 ? (
          <button type="button" className="text-muted-foreground" onClick={(event) => { event.stopPropagation(); toggle(item.id) }} aria-label={`Toggle ${item.label}`}>
            {expanded.has(item.id) ? '▾' : '▸'}
          </button>
        ) : <span className="w-3" />}
        <button
          type="button"
          className={[
            'min-w-0 flex-1 truncate text-left',
            item.rows.some((row) => row.targetIds.crewIds.length > 0)
              ? 'cursor-pointer text-foreground hover:text-primary hover:underline'
              : 'cursor-default text-foreground',
          ].join(' ')}
          onClick={(event) => {
            event.stopPropagation()
            openDetailsAndPin(item)
          }}
          title={item.rows.some((row) => row.targetIds.crewIds.length > 0)
            ? 'Click to show details and pin these crews to the top of the roster'
            : 'Click to show details'}
        >
          {item.label}
        </button>
        <button
          type="button"
          className="font-mono tabular-nums text-primary hover:underline"
          onClick={(event) => {
            event.stopPropagation()
            openDetailsAndPin(item)
          }}
          aria-label={`View ${item.label} details`}
          title="Click to open details and pin related crews"
        >
          {item.count}
        </button>
      </div>
      {expanded.has(item.id) && item.children.map((child) => renderNode(child, depth + 1))}
    </div>
  )

  if (!initialDate || !snapshot || !model) return null

  return (
    <>
      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => { if (!nextOpen) close() }}
        data-testid="gantt-day-statistics-dialog"
        className="max-h-[calc(100vh-72px)] w-[calc(100vw-2rem)] sm:max-w-[1180px]"
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
        resizable
        icon={<ListTree className="h-4 w-4" />}
        title="Daily Gantt Statistics"
        description={`${formatDay(date)} · ${timezone}`}
        footer={<Button variant="ghost" onClick={close}>Close</Button>}
      >
        <div className="flex shrink-0 items-center border-b border-border bg-muted/20 px-4 py-2">
          <div className="inline-flex h-7 w-[220px] items-center overflow-hidden rounded-md border border-border bg-background">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-none" disabled={!canPrev} onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 whitespace-nowrap border-x border-border px-2 text-center text-xs font-medium">{formatDay(date)}</div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-none" disabled={!canNext} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border md:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.8fr)] md:divide-x md:divide-y-0">
          <div className="min-h-0 overflow-auto py-2">
            {model.nodes.map((item) => renderNode(item))}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
              <div className="min-w-0 truncate text-xs font-semibold text-foreground">{detailRows.length > 0 ? detailTitle : 'Statistic Details'}</div>
              <div className="shrink-0 pl-3 text-2xs text-muted-foreground">
                {detailRows.length > 0 ? `${detailRows.length} rows` : 'No details selected'}
              </div>
            </div>
            {detailRows.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      {['Category', 'Crew', 'Rank', 'Base', 'Assignment Group', 'Assignment', 'Pairing', 'Start', 'End'].map((label) => <TableHead key={label} className="h-8 whitespace-nowrap px-2 py-1 text-2xs">{label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((item) => (
                      <TableRow
                        key={item.id}
                        className={item.targetIds.crewIds.length > 0 ? 'cursor-pointer text-xs hover:bg-accent/50' : 'cursor-default text-xs'}
                        onClick={() => pinRows([item])}
                        onDoubleClick={() => locate([item])}
                        title={item.targetIds.crewIds.length > 0 ? 'Click to pin crew; double-click to locate' : 'Double-click to locate'}
                      >
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.category}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 font-mono">{item.crewId ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.rank ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.base ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.assignmentGroup ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.assignment ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1">{item.pairingId ?? '—'} {item.pairingLabel ?? ''}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 font-mono">{displayDateTime(item.startUtc, timezone)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-1 font-mono">{displayDateTime(item.endUtc, timezone)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
                No details selected
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  )
}
