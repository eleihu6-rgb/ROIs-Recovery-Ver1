import { useEffect, useMemo, useState } from 'react'
import {
  AppDialog,
  Button,
} from '@rois/ui'
import { CalendarDays } from 'lucide-react'
import { RosterCrewSearchSelect, RosterPeriodStepper } from '@/components/roster/roster-dialog-controls'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { rosterApi } from '@/services/roster-api'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { usePaneStore } from '@/stores/pane-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useCrewStore } from '@/stores/crew-store'
import { selectRosterTaskFromDialog } from '@/utils/roster-dialog-selection'
import {
  crewOptionsFromRoster,
  dedupeRosterItems,
  getViewportRosterPeriodId,
  resolveCrewDisplayTimezone,
  scheduleRowsForCrew,
  type ScheduleCrewOption,
} from '@/utils/schedule-details'
import type { RosterItem } from '@/types/roster'

type TimeMode = 'display' | 'utc'

const crewName = (firstName?: string | null, lastName?: string | null, preferredName?: string | null): string => {
  const name = preferredName || [firstName, lastName].filter(Boolean).join(' ')
  return name.trim()
}

export const ScheduleDetailsDialog = () => {
  const open = useUiStore((s) => s.scheduleDetailsOpen)
  const initialCrewId = useUiStore((s) => s.scheduleDetailsCrewId)
  const scenarioId = useUiStore((s) => s.scheduleDetailsScenarioId)
  const sourcePane = useUiStore((s) => s.scheduleDetailsPane)
  const close = useUiStore((s) => s.closeScheduleDetailsDialog)

  const liveMainItems = useRosterStore((s) => s.main.rosterItems)
  const liveSubItems = useRosterStore((s) => s.sub.rosterItems)
  const liveMainCrew = useRosterStore((s) => s.main.crewList)
  const liveSubCrew = useRosterStore((s) => s.sub.crewList)
  const periods = useRosterPeriodStore((s) => s.items)
  const displayZone = useTimezoneStore((s) => s.timezone)
  const displayAirport = useTimezoneStore((s) => s.timezoneAirport)
  const timezoneOptions = useTimezoneStore((s) => s.timezoneOptions)

  const [crewId, setCrewId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [timeMode, setTimeMode] = useState<TimeMode>('display')
  const [fetchedByKey, setFetchedByKey] = useState<Map<string, RosterItem[]>>(new Map())
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedDialogIds, setSelectedDialogIds] = useState<Set<number>>(new Set())

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
    return { items: built.items, crewOptions, crewBaseById }
  }, [open, scenarioId])

  const liveSnapshot = useMemo(() => {
    const paneItems = sourcePane === 'roster-sub' ? liveSubItems : liveMainItems
    const paneCrew = sourcePane === 'roster-sub' ? liveSubCrew : liveMainCrew
    const names = new Map<string, string>()
    for (const crew of paneCrew) {
      const name = crewName(crew.firstName, crew.lastName, crew.preferredName)
      if (name) names.set(crew.crewId, name)
    }
    return {
      items: paneItems,
      crewOptions: crewOptionsFromRoster(paneItems, names),
    }
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

  const crewOptions = scenarioId == null
    ? liveSnapshot.crewOptions
    : (scenarioSnapshot?.crewOptions ?? [])

  useEffect(() => {
    if (!open) return
    setTimeMode('display')
    setCrewId(initialCrewId ?? crewOptions[0]?.crewId ?? '')
    setPeriodId(getViewportRosterPeriodId(scenarioId))
    setLoadError(null)
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

  const selectedRp = useMemo(
    () => periods.find((rp) => String(rp.id) === periodId) ?? null,
    [periodId, periods],
  )
  const crewBase = (scenarioId == null ? liveCrewBaseById : (scenarioSnapshot?.crewBaseById ?? new Map<string, string | null>()))
    .get(crewId) ?? null
  const displayTz = resolveCrewDisplayTimezone(crewBase, timezoneOptions, { zoneId: displayZone, airport: displayAirport })
  const zoneId = timeMode === 'utc' ? 'UTC' : displayTz.zoneId
  const fetchKey = scenarioId == null && selectedRp && crewId ? `${crewId}|${selectedRp.rosterPeriod}` : ''
  const fetchedItems = fetchKey ? (fetchedByKey.get(fetchKey) ?? []) : []
  const items: readonly RosterItem[] = scenarioId == null
    ? dedupeRosterItems([...liveSnapshot.items, ...fetchedItems])
    : (scenarioSnapshot?.items ?? [])

  useEffect(() => {
    if (!open || scenarioId != null || !selectedRp || !crewId || fetchedByKey.has(fetchKey)) return
    const loaded = usePaneStore.getState().dateRange
    const rpStartMs = Date.parse(`${selectedRp.rpStart}T00:00:00.000Z`)
    const rpEndMs = Date.parse(`${selectedRp.rpEnd}T23:59:59.999Z`)
    if (rpStartMs >= loaded.start.getTime() && rpEndMs <= loaded.end.getTime()) return
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
        setLoadError('Unable to load this RP.')
      })
      .finally(() => setLoadingKey((current) => current === fetchKey ? null : current))
    return () => controller.abort()
  }, [crewId, fetchedByKey, fetchKey, open, scenarioId, selectedRp])

  const rows = useMemo(
    () => scheduleRowsForCrew(items, crewId, selectedRp, zoneId),
    [items, crewId, selectedRp, zoneId],
  )

  const title = crewId ? `Schedule Details - ${crewId}` : 'Schedule Details'
  const timezoneLabel = displayTz.airport === 'UTC' ? 'Gantt TZ' : displayTz.airport
  const isLive = scenarioId == null
  const handleSelectRow = (taskId: number) => {
    const ids = selectRosterTaskFromDialog(items, taskId, scenarioId)
    setSelectedDialogIds(new Set(ids))
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) close() }}
      data-testid="schedule-details-dialog"
      className="max-h-[calc(100vh-72px)] w-[calc(100vw-2rem)] sm:max-w-[1040px]"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      resizable
      icon={<CalendarDays className="h-4 w-4" />}
      title={title}
      description={selectedRp ? `${selectedRp.rosterPeriod} · ${selectedRp.rpStart} to ${selectedRp.rpEnd}` : undefined}
      footer={<Button variant="ghost" onClick={close} data-testid="schedule-details-close">Close</Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={['grid shrink-0 grid-cols-1 items-end gap-3 border-b border-border bg-muted/20 px-4 py-3', isLive ? 'sm:grid-cols-[180px_180px_auto_1fr]' : 'sm:grid-cols-[180px_auto_1fr]'].join(' ')}>
          <div className="space-y-1">
            <div className="text-2xs font-medium text-muted-foreground">Crew</div>
            <RosterCrewSearchSelect
              value={crewId}
              options={crewOptions}
              onValueChange={setCrewId}
              testId="schedule-details-crew"
            />
          </div>

          {isLive && (
            <div className="space-y-1">
              <div className="text-2xs font-medium text-muted-foreground">RP Date</div>
              <RosterPeriodStepper
                periods={periods}
                selectedPeriod={selectedRp}
                onValueChange={setPeriodId}
                testId="schedule-details-rp"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="text-2xs font-medium text-muted-foreground">Timezone</div>
            <div className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-background text-xs" role="group" aria-label="Schedule details timezone">
              <button
                type="button"
                className={['px-2 transition-colors', timeMode === 'display' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'].join(' ')}
                onClick={() => setTimeMode('display')}
                data-testid="schedule-details-tz-display"
                title={displayTz.zoneId}
              >
                {timezoneLabel}
              </button>
              <button
                type="button"
                className={['border-l border-border px-2 transition-colors', timeMode === 'utc' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'].join(' ')}
                onClick={() => setTimeMode('utc')}
                data-testid="schedule-details-tz-utc"
              >
                UTC
              </button>
            </div>
          </div>

          <div className="flex h-7 items-center justify-end text-2xs text-muted-foreground">
            {loadingKey ? 'Loading...' : `${rows.length} row${rows.length === 1 ? '' : 's'}`}
          </div>
        </div>

        {loadError && (
          <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive" data-testid="schedule-details-error">
            {loadError}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-background">
          <table className="w-full text-xs" data-testid="schedule-details-table">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left text-2xs font-semibold uppercase tracking-normal text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2 text-right">Pairing</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-task-id={row.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select roster task ${row.id}`}
                  className={[
                    'cursor-pointer border-b border-border/50 outline-none transition-colors last:border-0 hover:bg-accent/35 focus:bg-accent/45',
                    selectedDialogIds.has(row.id) ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : '',
                  ].join(' ')}
                  data-testid="schedule-details-row"
                  data-selected={selectedDialogIds.has(row.id) ? 'true' : 'false'}
                  onClick={() => handleSelectRow(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelectRow(row.id)
                    }
                  }}
                >
                  <td className="px-3 py-1.5">{row.type}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.start}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.end}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.credit}</td>
                  <td className="max-w-[260px] truncate px-3 py-1.5" title={row.label}>{row.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.pairing}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.source}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground" data-testid="schedule-details-empty">
                    No schedule rows in the selected RP.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppDialog>
  )
}
