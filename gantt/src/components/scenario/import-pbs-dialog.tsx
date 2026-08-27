import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Import, Loader2 } from 'lucide-react'
import {
  AppDialog,
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  cn,
} from '@rois/ui'
import {
  type ImportMaterial,
  type ImportPbsMaterialResult,
  type ImportPbsMaterialStats,
  type ImportProgressState,
} from '@/services/import-pbs-material-api'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { GanttEnglishDatePicker } from '@/components/common/gantt-date-fields'
import { RpSelect } from '@/components/common/rp-select'

/** What gets imported — at least one must be selected. */
export interface ImportPbsScope {
  flight: boolean
  pairing: boolean
  roster: boolean
  rosterGround: boolean
  crew: boolean
}

export interface ImportPbsPayload {
  rosterPeriodId: number
  rosterPeriod: string
  startDate: string
  endDate: string
  scope: ImportPbsScope
}

export type ImportProgressStage = 'fetch' | 'transform' | 'write'
type StageProgress = NonNullable<ImportProgressState['current'][string]['fetch']>

interface ImportPbsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: ImportPbsPayload) => void | Promise<void>
  importing?: boolean
  /** Real SSE-driven progress; null while waiting for the first event. */
  progress?: ImportProgressState | null
  result?: ImportPbsMaterialResult | null
  completedElapsedMs?: number | null
}

const MATERIAL_ORDER: readonly ImportMaterial[] = ['crew', 'roster', 'rosterGround', 'pairing', 'flight']

const SCOPE_ITEMS: ReadonlyArray<{ key: keyof ImportPbsScope; label: string }> = [
  { key: 'crew', label: 'Crew' },
  { key: 'roster', label: 'Roster' },
  { key: 'rosterGround', label: 'RosterGround' },
  { key: 'pairing', label: 'Pairing' },
  { key: 'flight', label: 'Flight' },
]

export const IMPORT_PROGRESS_STAGES: ReadonlyArray<{ id: ImportProgressStage; label: string }> = [
  { id: 'fetch', label: 'Fetch' },
  { id: 'transform', label: 'Transform' },
  { id: 'write', label: 'Write' },
]

const Field = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <div className="flex flex-col gap-1.5 min-w-0">
    <span data-testid="import-pbs-field-label" className="text-2xs font-medium text-muted-foreground">{label}</span>
    {children}
  </div>
)

const formatElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formatDurationLabel = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

const formatStageSeconds = (event: StageProgress | undefined, nowMs: number): string => {
  if (!event?.startedAt) return '0s'
  const startedMs = Date.parse(event.startedAt)
  if (!Number.isFinite(startedMs)) return '0s'
  const finishedMs = event.finishedAt ? Date.parse(event.finishedAt) : nowMs
  if (!Number.isFinite(finishedMs)) return '0s'
  return `${Math.max(0, Math.round((finishedMs - startedMs) / 1000))}s`
}

const formatStageMilliseconds = (milliseconds: number | undefined): string | null => {
  if (typeof milliseconds !== 'number') return null
  return `${Math.max(0, Math.round(milliseconds / 1000))}s`
}

const MATERIAL_LABEL: Record<ImportMaterial, string> = {
  crew: 'Crew',
  roster: 'Roster',
  rosterGround: 'RosterGround',
  pairing: 'Pairing',
  flight: 'Flight',
}

const materialOrder = (materials: ImportMaterial[]): ImportMaterial[] =>
  MATERIAL_ORDER.filter((material) => materials.includes(material))

const formatCount = (value: number | undefined): string =>
  typeof value === 'number' ? value.toLocaleString() : '0'

const formatStageStatus = (status: StageProgress['status'] | undefined): string => {
  if (status === 'done') return 'Done'
  if (status === 'running') return 'Running'
  if (status === 'fail') return 'Failed'
  return 'Waiting'
}

const materialStageEvent = (
  progress: ImportProgressState,
  material: ImportMaterial,
  stage: ImportProgressStage,
): StageProgress | undefined => {
  const current = progress.current[material]
  if (stage === 'transform') {
    return current?.enqueue ?? current?.transform
  }
  return current?.[stage]
}

const materialStageSeconds = (
  progress: ImportProgressState,
  material: ImportMaterial,
  stage: ImportProgressStage,
  nowMs: number,
  stat?: ImportPbsMaterialStats,
): string => {
  if (stat) {
    if (stage === 'fetch') return formatStageMilliseconds(stat.timings.fetchMs) ?? '0s'
    if (stage === 'transform') return formatStageMilliseconds(stat.timings.transformMs + stat.timings.enqueueMs) ?? '0s'
    return formatStageMilliseconds(stat.timings.databaseMs) ?? '0s'
  }
  if (stage !== 'transform') {
    return formatStageSeconds(materialStageEvent(progress, material, stage), nowMs)
  }
  const transform = progress.current[material]?.transform
  const enqueue = progress.current[material]?.enqueue
  const startedAt = transform?.startedAt ?? enqueue?.startedAt
  const finishedAt = enqueue?.finishedAt ?? (enqueue?.status === 'running' ? undefined : transform?.finishedAt)
  return formatStageSeconds(
    {
      status: enqueue?.status ?? transform?.status ?? 'running',
      startedAt,
      finishedAt,
    },
    nowMs,
  )
}

const buildFallbackStats = (result: ImportPbsMaterialResult | null): ImportPbsMaterialStats[] => {
  if (!result) return []
  if (result.materialStats?.length) return result.materialStats
  return result.results.flatMap((connector) => (connector.timings ?? []).map((timing) => ({
    material: timing.material as ImportMaterial,
    status: connector.status === 'success' && timing.rejected === 0 ? 'success' : 'partial',
    added: 0,
    updated: 0,
    deleted: 0,
    success: timing.recordsOut,
    failed: 0,
    skipped: 0,
    rejected: timing.rejected,
    recordsIn: timing.recordsIn,
    recordsOut: timing.recordsOut,
    warnings: [],
    errors: [],
    timings: {
      fetchMs: timing.fetchMs,
      transformMs: timing.transformMs,
      enqueueMs: timing.enqueueMs,
      databaseMs: timing.databaseMs ?? 0,
      totalMs: timing.totalMs ?? timing.fetchMs + timing.transformMs + timing.enqueueMs + (timing.databaseMs ?? 0),
    },
  } satisfies ImportPbsMaterialStats)))
}

const durationBreakdown = (stat: ImportPbsMaterialStats): {
  fetchMs: number
  transformMs: number
  databaseMs: number
  totalMs: number
} => {
  const fetchMs = stat.timings.fetchMs
  const transformMs = stat.timings.transformMs + stat.timings.enqueueMs
  const databaseMs = stat.timings.databaseMs
  const totalMs = stat.timings.totalMs
  return { fetchMs, transformMs, databaseMs, totalMs }
}

const DetailList = ({ stat }: { stat: ImportPbsMaterialStats }): ReactNode => {
  const errors = stat.errors
  const warnings = stat.warnings
  if (errors.length === 0 && warnings.length === 0) return null
  return (
    <div
      data-testid={`import-pbs-result-${stat.material}-details`}
      className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto pr-1 text-2xs leading-snug text-muted-foreground"
      aria-label={`${MATERIAL_LABEL[stat.material]} import details`}
    >
      {errors.map((item, index) => (
        <div
          key={`error-${item.id}-${index}`}
          data-testid={`import-pbs-result-${stat.material}-error-${index}`}
          className="break-words text-destructive"
        >
          {item.id ? `${item.id}: ` : ''}{item.reason || 'Import failed'}
        </div>
      ))}
      {warnings.map((item, index) => (
        <div
          key={`warning-${index}`}
          data-testid={`import-pbs-result-${stat.material}-warning-${index}`}
          className="break-words"
        >
          {item}
        </div>
      ))}
    </div>
  )
}

/**
 * Import PBS material dialog.
 *
 * The connector import is driven by RosterPeriod. Dates are displayed from the
 * selected RP and are not user-editable; connector-server receives only the RP
 * date range resolved server-side.
 */
export const ImportPbsDialog = ({
  open,
  onOpenChange,
  onConfirm,
  importing = false,
  progress = null,
  result = null,
  completedElapsedMs = null,
}: ImportPbsDialogProps): ReactNode => {
  const periodOptions = useRosterPeriodStore((s) => s.items)
  const periodsLoading = useRosterPeriodStore((s) => s.loading)
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [scope, setScope] = useState<ImportPbsScope>({
    flight: false,
    pairing: false,
    roster: false,
    rosterGround: false,
    crew: false,
  })

  useEffect(() => {
    if (!open) return
    setScope({
      flight: false,
      pairing: false,
      roster: false,
      rosterGround: false,
      crew: false,
    })
  }, [open])

  // Default to the current RP (or first) once the windowed list is available.
  useEffect(() => {
    if (!open || selectedPeriodId || periodOptions.length === 0) return
    const current = periodOptions.find((p) => p.isCurrent) ?? periodOptions[0]
    setSelectedPeriodId(current ? String(current.id) : '')
  }, [open, selectedPeriodId, periodOptions])

  useEffect(() => {
    if (!importing) {
      setElapsedMs(0)
      return undefined
    }
    const startedAt = Date.now()
    setElapsedMs(0)
    // 250ms keeps the elapsed text updating; stage/percent come from SSE props.
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)
    return () => window.clearInterval(timer)
  }, [importing])

  const selectedPeriod = useMemo(
    () => periodOptions.find((period) => String(period.id) === selectedPeriodId) ?? null,
    [periodOptions, selectedPeriodId],
  )

  const percent = progress?.percent ?? 0
  const progressHeadline = progress?.status === 'error' ? 'Import interrupted' : 'Overall import progress'
  const resultStats = useMemo(() => buildFallbackStats(result), [result])
  const resultStatsByMaterial = useMemo(
    () => new Map(resultStats.map((item) => [item.material, item])),
    [resultStats],
  )
  const resultMaterials = resultStats.map((item) => item.material)
  const displayedResultStats = materialOrder(resultMaterials)
    .map((material) => resultStats.find((item) => item.material === material))
    .filter((item): item is ImportPbsMaterialStats => Boolean(item))

  const scopeSelected = Object.values(scope).some(Boolean)
  const canConfirm = Boolean(selectedPeriod) && scopeSelected && !periodsLoading && !importing

  const toggleScope = (key: keyof ImportPbsScope): void => {
    setScope((s) => ({ ...s, [key]: !s[key] }))
  }

  const handleConfirm = (): void => {
    if (!canConfirm || !selectedPeriod) return
    void onConfirm({
      rosterPeriodId: selectedPeriod.id,
      rosterPeriod: selectedPeriod.rosterPeriod,
      startDate: selectedPeriod.rpStart,
      endDate: selectedPeriod.rpEnd,
      scope,
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(o: boolean) => { if (!importing) onOpenChange(o) }}
      data-testid="import-pbs-dialog"
      className="sm:max-w-[min(840px,calc(100vw-48px))]"
      dismissable={!importing}
      icon={<Import className="h-4 w-4" />}
      title="Import PBS Material"
      description="Pull selected material from the connector for the selected roster period."
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            data-testid="import-pbs-cancel"
            disabled={importing}
            onClick={() => onOpenChange(false)}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            data-testid="import-pbs-confirm"
            disabled={result ? false : !canConfirm}
            onClick={result ? () => onOpenChange(false) : handleConfirm}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Import className="h-3.5 w-3.5" />}
            {result ? 'Done' : importing ? 'Importing...' : 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1 text-xs">
        <Field label="Roster Period">
          <div className="grid min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
            <RpSelect
              testId="import-pbs-roster-period"
              value={selectedPeriodId}
              onValueChange={setSelectedPeriodId}
              disabled={importing}
              className="h-7 min-w-0 text-xs"
            />
            <GanttEnglishDatePicker
              ariaLabel="Import PBS start date"
              buttonClassName="min-w-0 w-full"
              disabled
              testId="import-pbs-start-date"
              value={selectedPeriod?.rpStart ?? ''}
              onValueChange={() => {}}
            />
            <GanttEnglishDatePicker
              ariaLabel="Import PBS end date"
              buttonClassName="min-w-0 w-full"
              disabled
              testId="import-pbs-end-date"
              value={selectedPeriod?.rpEnd ?? ''}
              onValueChange={() => {}}
            />
          </div>
        </Field>

        <Field label="Material">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="import-pbs-scope">
            {SCOPE_ITEMS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  data-testid={`import-pbs-scope-${key}`}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={scope[key]}
                  disabled={importing}
                  onChange={() => toggleScope(key)}
                />
                <span className="text-foreground">{label}</span>
              </label>
            ))}
          </div>
        </Field>

        {!scopeSelected && (
          <p className="text-xs text-destructive">Select at least one material type.</p>
        )}
        {(importing || progress) && (
          <div
            data-testid="import-pbs-progress"
            className="rounded-md border border-border bg-muted/40 p-3"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                data-testid="import-pbs-stage-label"
                className="text-xs font-medium text-foreground"
              >
                {progressHeadline}
              </span>
              <span data-testid="import-pbs-elapsed" className="font-mono text-2xs text-muted-foreground">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
              <div
                data-testid="import-pbs-progress-bar"
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-300 ease-out',
                  progress?.indeterminate && 'animate-pulse',
                )}
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              />
            </div>
            {progress && progress.materials.length > 0 && (
              <div className="mt-3 overflow-x-auto" data-testid="import-pbs-material-progress">
                <table className="min-w-[520px] w-full table-fixed text-left text-2xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="w-[96px] px-1.5 py-1 font-medium">Material</th>
                      {IMPORT_PROGRESS_STAGES.map((stage) => (
                        <th key={stage.id} className="px-1.5 py-1 font-medium">{stage.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materialOrder(progress.materials).map((material) => (
                      <tr key={material} data-testid={`import-pbs-material-progress-${material}`} className="border-t border-border/50">
                        <td className="whitespace-nowrap px-1.5 py-1.5 font-medium text-foreground">
                          {MATERIAL_LABEL[material]}
                        </td>
                        {IMPORT_PROGRESS_STAGES.map((stage) => {
                          const event = materialStageEvent(progress, material, stage.id)
                          const status = event?.status
                          const nowMs = Date.now()
                          const stat = resultStatsByMaterial.get(material)
                          return (
                            <td
                              key={stage.id}
                              data-testid={`import-pbs-material-progress-${material}-${stage.id}`}
                              data-status={status ?? 'waiting'}
                              className={cn(
                                'px-1.5 py-1.5 align-top',
                                status === 'running' && 'text-primary',
                                status === 'done' && 'text-foreground',
                                status === 'fail' && 'text-destructive',
                                !status && 'text-muted-foreground',
                              )}
                            >
                              <div className="font-medium">{formatStageStatus(status)}</div>
                              <div className="mt-0.5 font-mono tabular-nums text-muted-foreground">
                                {materialStageSeconds(progress, material, stage.id, nowMs, stat)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {result && (
          <div
            data-testid="import-pbs-result"
            className="rounded-md border border-border bg-background"
          >
            <div className="border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">Import result</div>
                  <div className="text-2xs text-muted-foreground">{result.rosterPeriod} · {result.startDt} to {result.endDt}</div>
                </div>
                {typeof completedElapsedMs === 'number' && (
                  <div className="shrink-0 text-right" data-testid="import-pbs-result-elapsed">
                    <div className="text-2xs text-muted-foreground">Elapsed</div>
                    <div className="font-mono text-xs tabular-nums text-foreground">{formatDurationLabel(completedElapsedMs)}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full table-fixed text-left text-2xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {['Material', 'Status', 'Add', 'Update', 'Delete', 'OK', 'Fail', 'Skip', 'Fetch', 'Trans', 'DB', 'Total'].map((label) => (
                      <th key={label} className="whitespace-nowrap px-1.5 py-1.5 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedResultStats.map((stat) => {
                    const timing = durationBreakdown(stat)
                    const detail = <DetailList stat={stat} />
                    return (
                      <Fragment key={stat.material}>
                        <tr data-testid={`import-pbs-result-${stat.material}`} className="border-t border-border/60 align-top">
                          <td className="w-[86px] whitespace-nowrap px-1.5 py-1.5 font-medium text-foreground">{MATERIAL_LABEL[stat.material]}</td>
                          <td className="w-[58px] whitespace-nowrap px-1.5 py-1.5 text-muted-foreground">{stat.status}</td>
                          <td className="w-[48px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.added)}</td>
                          <td className="w-[56px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.updated)}</td>
                          <td className="w-[52px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.deleted)}</td>
                          <td className="w-[48px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.success)}</td>
                          <td className="w-[48px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.failed)}</td>
                          <td className="w-[48px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground">{formatCount(stat.skipped)}</td>
                          <td className="w-[58px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground" data-testid={`import-pbs-result-${stat.material}-fetch-ms`}>{formatDurationLabel(timing.fetchMs)}</td>
                          <td className="w-[58px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground" data-testid={`import-pbs-result-${stat.material}-transform-ms`}>{formatDurationLabel(timing.transformMs)}</td>
                          <td className="w-[50px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-muted-foreground" data-testid={`import-pbs-result-${stat.material}-db-ms`}>{formatDurationLabel(timing.databaseMs)}</td>
                          <td className="w-[58px] whitespace-nowrap px-1.5 py-1.5 font-mono tabular-nums text-foreground" data-testid={`import-pbs-result-${stat.material}-total-ms`}>{formatDurationLabel(timing.totalMs)}</td>
                        </tr>
                        {detail && (
                          <tr className="border-t border-border/40">
                            <td colSpan={12} className="px-1.5 pb-2 pt-0">
                              {detail}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
