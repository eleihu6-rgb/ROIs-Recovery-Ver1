import { useEffect, useMemo, useState } from 'react'
import {
  AppDialog,
  Button,
} from '@rois/ui'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { RosterCrewSearchSelect, RosterPeriodStepper } from '@/components/roster/roster-dialog-controls'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { crewApi } from '@/services/crew-api'
import { rosterApi } from '@/services/roster-api'
import { useAssignmentStore } from '@/stores/assignment-store'
import { usePaneStore } from '@/stores/pane-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useRosterStore } from '@/stores/roster-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useCrewStore } from '@/stores/crew-store'
import { useUiStore } from '@/stores/ui-store'
import {
  buildDailyTaskCalendarModel,
  buildRpRange,
  formatDailyTaskCredit,
  type DailyTaskRange,
} from '@/utils/daily-task-view'
import {
  crewOptionsFromRoster,
  dedupeRosterItems,
  getViewportRosterPeriodId,
  resolveCrewDisplayTimezone,
  type ScheduleCrewOption,
} from '@/utils/schedule-details'
import { selectRosterTaskFromDialog } from '@/utils/roster-dialog-selection'
import type { RosterItem } from '@/types/roster'

type TimeMode = 'display' | 'utc'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const crewName = (firstName?: string | null, lastName?: string | null, preferredName?: string | null): string => {
  const name = preferredName || [firstName, lastName].filter(Boolean).join(' ')
  return name.trim()
}

const rangeWithinLiveLoadedDateRange = (range: DailyTaskRange): boolean => {
  const loaded = usePaneStore.getState().dateRange
  const startMs = Date.parse(`${range.startDate}T00:00:00.000Z`)
  const endMs = Date.parse(`${range.endDate}T23:59:59.999Z`)
  return startMs >= loaded.start.getTime() && endMs <= loaded.end.getTime()
}

const resolveScenarioRange = (
  scenarioId: number | null,
  periods: Array<{ rpStart: string; rpEnd: string; rosterPeriod: string }>,
): DailyTaskRange | null => {
  if (scenarioId == null) return null
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return null
  const startDate = data.scenarioStrDt.slice(0, 10)
  const endDate = data.scenarioEndDt.slice(0, 10)
  const rp = periods.find((period) => period.rpStart <= startDate && period.rpEnd >= endDate)
    ?? periods.find((period) => period.rpStart <= endDate && period.rpEnd >= startDate)
  return buildRpRange(startDate, endDate, rp ? rp.rosterPeriod : 'Scenario RP')
}

const resolveScenarioStatsKey = (
  statsByPeriod: Record<string, { mcred?: number; credit?: number }>,
  range: DailyTaskRange | null,
): string | null => {
  if (range?.label && statsByPeriod[range.label]) return range.label
  const rangeStart = range?.startDate.slice(0, 7)
  if (rangeStart && statsByPeriod[rangeStart]) return rangeStart
  const rpLikeKey = Object.keys(statsByPeriod).find((key) => /^\d{4}RP\d{2}$/i.test(key))
  return rpLikeKey ?? Object.keys(statsByPeriod)[0] ?? null
}

export const DailyTaskCalendarDialog = () => {
  const open = useUiStore((s) => s.dailyTaskCalendarOpen)
  const initialCrewId = useUiStore((s) => s.dailyTaskCalendarCrewId)
  const scenarioId = useUiStore((s) => s.dailyTaskCalendarScenarioId)
  const sourcePane = useUiStore((s) => s.dailyTaskCalendarPane)
  const close = useUiStore((s) => s.closeDailyTaskCalendarDialog)

  const liveMainItems = useRosterStore((s) => s.main.rosterItems)
  const liveSubItems = useRosterStore((s) => s.sub.rosterItems)
  const liveMainCrew = useRosterStore((s) => s.main.crewList)
  const liveSubCrew = useRosterStore((s) => s.sub.crewList)
  const displayZone = useTimezoneStore((s) => s.timezone)
  const displayAirport = useTimezoneStore((s) => s.timezoneAirport)
  const timezoneOptions = useTimezoneStore((s) => s.timezoneOptions)
  const getAssignmentColor = useAssignmentStore((s) => s.getAssignmentColor)
  const periods = useRosterPeriodStore((s) => s.items)
  const loadRosterPeriods = useRosterPeriodStore((s) => s.loadRosterPeriods)

  const [crewId, setCrewId] = useState('')
  const [timeMode, setTimeMode] = useState<TimeMode>('display')
  const [periodId, setPeriodId] = useState('')
  const [fetchedByKey, setFetchedByKey] = useState<Map<string, RosterItem[]>>(new Map())
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rpCreditMinutes, setRpCreditMinutes] = useState<number | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [selectedDialogIds, setSelectedDialogIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) void loadRosterPeriods()
  }, [loadRosterPeriods, open])

  const scenarioSnapshot = useMemo(() => {
    if (!open || scenarioId == null) return null
    const store = getScenarioGanttStore(scenarioId).getState()
    const data = store.data
    if (!data) return null
    const pairingMap = new Map(data.pairings.map((pairing) => [pairing.pairingId, pairing]))
    const built = buildScenarioRosterItems({
      crew: data.crew,
      pairingMap,
      assignments: data.assignments,
      pairingSegments: data.pairingSegments,
      groundItems: data.groundItems,
      pendingChanges: store.pendingChanges,
    })
    const crewOptions = data.crew
      .map((crew): ScheduleCrewOption => ({
        crewId: crew.crewId,
        label: crew.crewName ? `${crew.crewName} (${crew.crewId})` : crew.crewId,
      }))
      .sort((a, b) => a.crewId.localeCompare(b.crewId, undefined, { numeric: true }))
    const crewBaseById = new Map<string, string | null>(data.crew.map((crew) => [crew.crewId, crew.base || null]))
    return { items: built.items, crewOptions, crewBaseById, range: resolveScenarioRange(scenarioId, periods) }
  }, [open, periods, scenarioId])

  const liveSnapshot = useMemo(() => {
    const paneItems = sourcePane === 'roster-sub' ? liveSubItems : liveMainItems
    const paneCrew = sourcePane === 'roster-sub' ? liveSubCrew : liveMainCrew
    const names = new Map<string, string>()
    for (const crew of paneCrew) {
      const name = crewName(crew.firstName, crew.lastName, crew.preferredName)
      if (name) names.set(crew.crewId, name)
    }
    return { items: paneItems, crewOptions: crewOptionsFromRoster(paneItems, names) }
  }, [liveMainCrew, liveMainItems, liveSubCrew, liveSubItems, sourcePane])

  const liveCrewItems = useCrewStore((s) => s.items)
  const liveCrewBaseById = useMemo(() => {
    const bases = new Map<string, string | null>()
    for (const entry of liveCrewItems) {
      const crew = entry.crew
      bases.set(crew.crewId, crew.panelBase ?? crew.bases?.[0]?.base ?? null)
    }
    return bases
  }, [liveCrewItems])

  const crewOptions = scenarioId == null ? liveSnapshot.crewOptions : (scenarioSnapshot?.crewOptions ?? [])
  const crewBase = (scenarioId == null ? liveCrewBaseById : (scenarioSnapshot?.crewBaseById ?? new Map<string, string | null>()))
    .get(crewId) ?? null
  const displayTz = resolveCrewDisplayTimezone(crewBase, timezoneOptions, { zoneId: displayZone, airport: displayAirport })
  const zoneId = timeMode === 'utc' ? 'UTC' : displayTz.zoneId
  const selectedRp = useMemo(
    () => periods.find((rp) => String(rp.id) === periodId) ?? null,
    [periodId, periods],
  )
  const liveRange = useMemo(
    () => selectedRp ? buildRpRange(selectedRp.rpStart, selectedRp.rpEnd, `${selectedRp.name} · ${selectedRp.rosterPeriod}`) : null,
    [selectedRp],
  )
  const range = scenarioId == null ? liveRange : (scenarioSnapshot?.range ?? null)
  const fetchKey = crewId && selectedRp ? `${crewId}|${selectedRp.rosterPeriod}` : ''
  const fetchedItems = fetchKey ? (fetchedByKey.get(fetchKey) ?? []) : []
  const items = scenarioId == null ? dedupeRosterItems([...liveSnapshot.items, ...fetchedItems]) : (scenarioSnapshot?.items ?? [])

  useEffect(() => {
    if (!open) return
    setTimeMode('display')
    setCrewId(initialCrewId ?? crewOptions[0]?.crewId ?? '')
    setPeriodId(getViewportRosterPeriodId(scenarioId))
    setLoadError(null)
    setRpCreditMinutes(null)
    setSelectedDialogIds(new Set())
  }, [open, initialCrewId, scenarioId])

  useEffect(() => {
    if (!open || crewId) return
    setCrewId(initialCrewId ?? crewOptions[0]?.crewId ?? '')
  }, [open, crewId, initialCrewId, crewOptions])

  useEffect(() => {
    if (!open || periodId || periods.length === 0) return
    setPeriodId(getViewportRosterPeriodId(scenarioId) || String(periods.find((rp) => rp.isCurrent)?.id ?? periods[0]?.id ?? ''))
  }, [open, periodId, periods, scenarioId])

  useEffect(() => {
    if (!open || scenarioId != null || !crewId || !liveRange || !selectedRp) return
    if (rangeWithinLiveLoadedDateRange(liveRange) || fetchedByKey.has(fetchKey)) return
    const controller = new AbortController()
    setLoadingKey(fetchKey)
    setLoadError(null)
    rosterApi.getView([crewId], selectedRp.rpStart, selectedRp.rpEnd, controller.signal)
      .then((rows) => {
        setFetchedByKey((current) => {
          const next = new Map(current)
          next.set(fetchKey, rows)
          return next
        })
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'CanceledError') return
        setLoadError('Unable to load this month.')
      })
      .finally(() => setLoadingKey((current) => current === fetchKey ? null : current))
    return () => controller.abort()
  }, [crewId, fetchedByKey, fetchKey, liveRange, open, scenarioId, selectedRp])

  useEffect(() => {
    if (!open || !crewId) return
    if (scenarioId == null) {
      if (!selectedRp) return
      let cancelled = false
      setStatsLoading(true)
      crewApi.getCrewStats([crewId], selectedRp.rosterPeriod)
        .then((stats) => { if (!cancelled) setRpCreditMinutes(stats[crewId]?.mcred ?? null) })
        .catch(() => { if (!cancelled) setRpCreditMinutes(null) })
        .finally(() => { if (!cancelled) setStatsLoading(false) })
      return () => { cancelled = true }
    }
    const data = getScenarioGanttStore(scenarioId).getState().data
    const statsByPeriod = data?.crewStats?.[crewId] ?? {}
    const key = resolveScenarioStatsKey(statsByPeriod, range)
    const stats = key ? statsByPeriod[key] : undefined
    setRpCreditMinutes(stats != null ? Math.round(stats.mcred ?? stats.credit ?? 0) : null)
    setStatsLoading(false)
  }, [crewId, open, range?.label, scenarioId, selectedRp])

  const model = useMemo(() => {
    if (!range || !crewId) return null
    return buildDailyTaskCalendarModel(items, crewId, range, zoneId, (item) => getAssignmentColor(item.assignment, item.assignmentGroup))
  }, [crewId, getAssignmentColor, items, range, zoneId])

  const title = crewId ? `Daily Task Calendar - ${crewId}` : 'Daily Task Calendar'
  const timezoneLabel = displayTz.airport === 'UTC' ? 'Gantt TZ' : displayTz.airport
  const isLive = scenarioId == null
  const handleSelectTask = (taskId: number) => {
    const ids = selectRosterTaskFromDialog(items, taskId, scenarioId)
    setSelectedDialogIds(new Set(ids))
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) close() }}
      data-testid="daily-task-calendar-dialog"
      className="max-h-[calc(100vh-72px)] w-[calc(100vw-2rem)] sm:max-w-[1120px]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      resizable
      icon={<CalendarDays className="h-4 w-4" />}
      title={title}
      description={range ? `${range.label} · ${range.startDate} to ${range.endDate}` : undefined}
      footer={<Button variant="ghost" onClick={close} data-testid="daily-task-calendar-close">Close</Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={['grid shrink-0 grid-cols-1 items-end gap-3 border-b border-border bg-muted/20 px-4 py-3', isLive ? 'sm:grid-cols-[180px_180px_auto_1fr]' : 'sm:grid-cols-[180px_auto_1fr]'].join(' ')}>
          <div className="space-y-1">
            <div className="text-2xs font-medium text-muted-foreground">Crew</div>
            <RosterCrewSearchSelect
              value={crewId}
              options={crewOptions}
              onValueChange={setCrewId}
              testId="daily-task-calendar-crew"
            />
          </div>

          {isLive && (
            <div className="space-y-1">
              <div className="text-2xs font-medium text-muted-foreground">RP Date</div>
              <RosterPeriodStepper
                periods={periods}
                selectedPeriod={selectedRp}
                onValueChange={setPeriodId}
                testId="daily-task-calendar-month"
                navTestIdPrefix="daily-task-calendar"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="text-2xs font-medium text-muted-foreground">Timezone</div>
            <div className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-background text-xs" role="group" aria-label="Daily task calendar timezone">
              <button
                type="button"
                className={['px-2 transition-colors', timeMode === 'display' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'].join(' ')}
                onClick={() => setTimeMode('display')}
                data-testid="daily-task-calendar-tz-display"
                title={displayTz.zoneId}
              >
                {timezoneLabel}
              </button>
              <button
                type="button"
                className={['border-l border-border px-2 transition-colors', timeMode === 'utc' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'].join(' ')}
                onClick={() => setTimeMode('utc')}
                data-testid="daily-task-calendar-tz-utc"
              >
                UTC
              </button>
            </div>
          </div>

          <div className="flex h-7 items-center justify-end gap-1 text-2xs text-muted-foreground">
            {(loadingKey || statsLoading) && <RefreshCw className="h-3 w-3 animate-spin" />}
            <span>{model?.stats.taskBlocks ?? 0} tasks</span>
          </div>
        </div>

        {loadError && (
          <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive" data-testid="daily-task-calendar-error">
            {loadError}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_230px]">
          <div className="min-h-0 overflow-auto p-3">
            <div className="grid grid-cols-7 border-l border-t border-border bg-muted/70 text-2xs font-semibold uppercase tracking-normal text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <div key={day} className="border-b border-r border-border px-2 py-1.5 text-center">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l border-border" data-testid="daily-task-calendar-grid">
              {model?.weeks.flat().map((day) => (
                <div
                  key={day.date}
                  className={[
                    'min-h-[96px] border-b border-r border-border p-1.5',
                    day.inRange ? 'bg-background' : 'bg-muted/20 text-muted-foreground/60',
                    day.isToday ? 'ring-1 ring-inset ring-primary/40' : '',
                  ].join(' ')}
                  data-testid="daily-task-calendar-day"
                  data-status={day.status}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="font-mono text-2xs tabular-nums">{day.dayNumber}</span>
                    {day.inRange && day.tasks.length === 0 && <span className="text-2xs text-muted-foreground/55">Open</span>}
                  </div>
                  <div className="space-y-1">
                    {day.tasks.slice(0, 3).map((task) => (
                      <button
                        type="button"
                        key={`${day.date}-${task.id}`}
                        data-task-id={task.id}
                        className={[
                          'block w-full cursor-pointer truncate rounded-sm px-1 py-0.5 text-left text-2xs leading-tight text-white shadow-sm outline-none transition-transform hover:brightness-110 focus:ring-1 focus:ring-ring',
                          selectedDialogIds.has(task.id) ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : '',
                        ].join(' ')}
                        style={{ backgroundColor: task.color }}
                        title={task.title}
                        data-testid="daily-task-calendar-task"
                        data-selected={selectedDialogIds.has(task.id) ? 'true' : 'false'}
                        onClick={() => handleSelectTask(task.id)}
                      >
                        {task.label}
                      </button>
                    ))}
                    {day.tasks.length > 3 && (
                      <div className="text-2xs text-muted-foreground" data-testid="daily-task-calendar-overflow">
                        +{day.tasks.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!model && (
                <div className="col-span-7 px-3 py-8 text-center text-xs text-muted-foreground" data-testid="daily-task-calendar-empty">
                  No calendar data.
                </div>
              )}
            </div>
          </div>

          <aside className="min-h-0 overflow-auto border-t border-border bg-muted/10 p-3 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2 text-xs font-semibold">
              <span>Statistics</span>
              {(loadingKey || statsLoading) && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="space-y-1 text-xs" data-testid="daily-task-calendar-stats">
              <Stat label="RpCred" value={rpCreditMinutes == null ? '-' : formatDailyTaskCredit(rpCreditMinutes)} strong />
              <Stat label="Flight" value={model?.stats.flightDays ?? 0} />
              <Stat label="Reserve" value={model?.stats.reserveDays ?? 0} />
              <Stat label="Ground" value={model?.stats.groundDays ?? 0} />
              <Stat label="Day Off" value={model?.stats.dayOffDays ?? 0} />
              <Stat label="Open" value={model?.stats.openDays ?? 0} />
              <Stat label="Tasks" value={model?.stats.taskBlocks ?? 0} />
              <Stat label="Max Work" value={model?.stats.maxConsecutiveWork ?? 0} />
              <Stat label="Max Off/Open" value={model?.stats.maxConsecutiveOffOpen ?? 0} />
              <Stat label="Max Reserve" value={model?.stats.maxConsecutiveReserve ?? 0} />
            </div>
          </aside>
        </div>
      </div>
    </AppDialog>
  )
}

const Stat = ({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) => (
  <div className={['flex items-center justify-between border-b border-border/50 px-1 py-1.5 last:border-0', strong ? 'text-foreground' : ''].join(' ')}>
    <div className="text-2xs text-muted-foreground">{label}</div>
    <div className={['font-mono tabular-nums', strong ? 'text-base font-semibold' : 'text-xs'].join(' ')}>{value}</div>
  </div>
)
