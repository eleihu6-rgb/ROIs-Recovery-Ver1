import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Play, Power, RefreshCw, Save, Workflow } from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@rois/ui'
import {
  disableSchedulerJob,
  enableSchedulerJob,
  fetchSchedulerJobRuns,
  fetchSchedulerJobs,
  runSchedulerJobNow,
  updateSchedulerJobSchedule,
  type SchedulerJob,
  type SchedulerRun,
  type SchedulerScheduleType,
} from '@/services/scheduler-admin-api'
import { useMenuStore } from '@/stores/menu-store'

type ActionKey = 'refresh' | 'toggle' | 'save' | 'run' | 'runs'

interface ScheduleDraft {
  scheduleType: SchedulerScheduleType
  intervalSeconds: string
  cronExpr: string
}

const statusClassName = (status: string | null): string => {
  if (status === 'failed') return 'border-red-300 bg-red-50 text-red-700'
  if (status === 'running') return 'border-blue-300 bg-blue-50 text-blue-700'
  if (status === 'skipped') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (status === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  return 'border-slate-300 bg-slate-50 text-slate-600'
}

const enabledClassName = (enabled: number): string =>
  enabled === 1 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-600'

const formatDateTime = (value: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const formatDuration = (durationMs: number | null): string =>
  durationMs == null ? '-' : `${durationMs} ms`

interface SchedulerServiceGroup {
  serviceCode: string
  serviceName: string
  jobs: SchedulerJob[]
}

const serviceCodeOf = (job: SchedulerJob): string =>
  job.service_code ?? 'live-server'

const serviceNameOf = (job: SchedulerJob): string =>
  job.service_name ?? 'Live Server'

const buildDraft = (job: SchedulerJob): ScheduleDraft => ({
  scheduleType: job.schedule_type,
  intervalSeconds: String(job.interval_seconds ?? 300),
  cronExpr: job.cron_expr ?? '0 * * * *',
})

const scheduleText = (job: SchedulerJob): string =>
  job.schedule_type === 'fixed_delay'
    ? `${job.interval_seconds ?? '-'} sec fixed delay`
    : job.cron_expr ?? '-'

export const SchedulerView = (): ReactNode => {
  const [jobs, setJobs] = useState<SchedulerJob[]>([])
  const [runs, setRuns] = useState<SchedulerRun[]>([])
  const [selectedServiceCode, setSelectedServiceCode] = useState<string | null>(null)
  const [selectedJobCode, setSelectedJobCode] = useState<string | null>(null)
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canAccessPage = useMenuStore((s) => s.canAccessPage)

  const serviceGroups = useMemo<SchedulerServiceGroup[]>(() => {
    const groups = new Map<string, SchedulerServiceGroup>()
    for (const job of jobs) {
      const serviceCode = serviceCodeOf(job)
      const existing = groups.get(serviceCode)
      if (existing) {
        existing.jobs.push(job)
      } else {
        groups.set(serviceCode, {
          serviceCode,
          serviceName: serviceNameOf(job),
          jobs: [job],
        })
      }
    }
    return Array.from(groups.values()).sort((left, right) => left.serviceName.localeCompare(right.serviceName))
  }, [jobs])

  const selectedService = useMemo(
    () => serviceGroups.find((group) => group.serviceCode === selectedServiceCode) ?? serviceGroups[0] ?? null,
    [selectedServiceCode, serviceGroups],
  )

  const visibleJobs = selectedService?.jobs ?? []

  const selectedJob = useMemo(
    () => visibleJobs.find((job) => job.job_code === selectedJobCode) ?? visibleJobs[0] ?? null,
    [selectedJobCode, visibleJobs],
  )

  const runAction = useCallback(async (action: ActionKey, task: () => Promise<void>): Promise<void> => {
    setActiveAction(action)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setActiveAction(null)
    }
  }, [])

  const loadJobs = useCallback(async (): Promise<void> => {
    await runAction('refresh', async () => {
      const response = await fetchSchedulerJobs()
      setJobs(response.jobs)
      setSelectedServiceCode((current) => current ?? (response.jobs[0] ? serviceCodeOf(response.jobs[0]) : null))
      setSelectedJobCode((current) => current ?? response.jobs[0]?.job_code ?? null)
      setMessage(`Loaded ${response.jobs.length} jobs`)
    })
  }, [runAction])

  const loadRuns = useCallback(async (jobCode: string): Promise<void> => {
    await runAction('runs', async () => {
      const response = await fetchSchedulerJobRuns(jobCode, 50)
      setRuns(response.runs)
    })
  }, [runAction])

  useEffect(() => {
    // Defensive guard: SystemView already redirects non-permitted users away
    // from 'scheduler' (canAccessPage('scheduler') === false), but the menu
    // store is fail-open until the first /api/auth/menus fetch lands. Skip
    // the auto-fetch in that window so we do not 403 with a permission error.
    if (!canAccessPage('scheduler')) return
    void loadJobs()
  }, [canAccessPage, loadJobs])

  useEffect(() => {
    if (!selectedJob) {
      setDraft(null)
      setRuns([])
      return
    }
    setDraft(buildDraft(selectedJob))
    void loadRuns(selectedJob.job_code)
  }, [loadRuns, selectedJob])

  const busy = (action: ActionKey): boolean => activeAction === action

  const handleSelectService = (serviceCode: string): void => {
    const group = serviceGroups.find((item) => item.serviceCode === serviceCode)
    setSelectedServiceCode(serviceCode)
    setSelectedJobCode(group?.jobs[0]?.job_code ?? null)
    setMessage(null)
    setError(null)
  }

  const handleSelectJob = (jobCode: string): void => {
    setSelectedJobCode(jobCode)
    setMessage(null)
    setError(null)
  }

  const handleToggle = (): void => {
    if (!selectedJob) return
    void runAction('toggle', async () => {
      const response = selectedJob.enabled === 1
        ? await disableSchedulerJob(selectedJob.job_code)
        : await enableSchedulerJob(selectedJob.job_code)
      setJobs((current) => current.map((job) => job.job_code === response.job.job_code ? response.job : job))
      setMessage(`${response.job.job_name} ${response.job.enabled === 1 ? 'enabled' : 'disabled'}`)
    })
  }

  const handleSaveSchedule = (): void => {
    if (!selectedJob || !draft) return
    void runAction('save', async () => {
      const payload = draft.scheduleType === 'fixed_delay'
        ? { scheduleType: 'fixed_delay' as const, intervalSeconds: Number(draft.intervalSeconds) }
        : { scheduleType: 'cron' as const, cronExpr: draft.cronExpr.trim() }
      const response = await updateSchedulerJobSchedule(selectedJob.job_code, payload)
      setJobs((current) => current.map((job) => job.job_code === response.job.job_code ? response.job : job))
      setDraft(buildDraft(response.job))
      setMessage(`${response.job.job_name} schedule saved`)
    })
  }

  const handleRunNow = (): void => {
    if (!selectedJob) return
    void runAction('run', async () => {
      const response = await runSchedulerJobNow(selectedJob.job_code)
      setRuns((current) => [response.run, ...current].slice(0, 50))
      await loadJobs()
      setMessage(`${selectedJob.job_name} run completed with ${response.run.status}`)
    })
  }

  const invalidInterval = draft?.scheduleType === 'fixed_delay'
    && (!Number.isInteger(Number(draft.intervalSeconds)) || Number(draft.intervalSeconds) <= 0)
  const invalidCron = draft?.scheduleType === 'cron' && draft.cronExpr.trim().length < 5
  const canSave = Boolean(selectedJob && draft && !invalidInterval && !invalidCron)

  return (
    <div className="h-full overflow-auto bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Scheduler</h1>
          </div>
          <div className="flex items-center gap-2">
            {message && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {message}
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
            <Button size="sm" variant="outline" className="h-8" onClick={() => void loadJobs()} disabled={busy('refresh')}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(180px,240px)_minmax(520px,1.2fr)_minmax(360px,0.65fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</h2>
            <span className="text-xs text-muted-foreground">{serviceGroups.length} total</span>
          </div>
          <div className="overflow-hidden rounded-sm border border-border">
            {serviceGroups.length === 0 ? (
              <div className="h-24 p-3 text-xs text-muted-foreground">No services loaded</div>
            ) : serviceGroups.map((group) => {
              const enabledCount = group.jobs.filter((job) => job.enabled === 1).length
              const failedCount = group.jobs.filter((job) => job.last_status === 'failed').length
              return (
                <button
                  key={group.serviceCode}
                  type="button"
                  data-testid={`scheduler-service-${group.serviceCode}`}
                  className={[
                    'flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-b-0',
                    selectedService?.serviceCode === group.serviceCode ? 'bg-primary/5 text-foreground' : 'hover:bg-muted/40',
                  ].join(' ')}
                  onClick={() => handleSelectService(group.serviceCode)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{group.serviceName}</span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">{group.serviceCode}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {failedCount > 0 && <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">{failedCount}</Badge>}
                    <Badge variant="outline" className="text-2xs">{enabledCount}/{group.jobs.length}</Badge>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jobs</h2>
            <span className="text-xs text-muted-foreground">{visibleJobs.length} total</span>
          </div>
          <div className="overflow-hidden rounded-sm border border-border">
            <div className="max-h-[calc(100vh-210px)] overflow-auto">
              <Table data-testid="scheduler-jobs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Last Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        No scheduler jobs loaded
                      </TableCell>
                    </TableRow>
                  ) : visibleJobs.map((job) => (
                    <TableRow
                      key={`${serviceCodeOf(job)}:${job.job_code}`}
                      data-testid={`scheduler-job-row-${serviceCodeOf(job)}-${job.job_code}`}
                      className={`cursor-pointer hover:bg-muted/40 ${selectedJob?.job_code === job.job_code ? 'bg-primary/5' : ''}`}
                      onClick={() => handleSelectJob(job.job_code)}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">{job.job_name}</div>
                          <div className="truncate font-mono text-2xs text-muted-foreground">{job.job_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={enabledClassName(job.enabled)}>
                          {job.enabled === 1 ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{scheduleText(job)}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(job.next_run_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClassName(job.last_status)}>
                          {job.last_status ?? 'none'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{formatDuration(job.last_duration_ms)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        <aside className="min-w-0">
          <section className="rounded-sm border border-border bg-background">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job Control</h2>
            </div>
            {selectedJob && draft ? (
              <div className="space-y-3 p-3">
                <div>
                  <div className="truncate text-sm font-semibold">{selectedJob.job_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {serviceCodeOf(selectedJob)} / {selectedJob.job_code}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Schedule Type">
                    <Select
                      value={draft.scheduleType}
                      onValueChange={(value) => setDraft((current) => current ? { ...current, scheduleType: value as SchedulerScheduleType } : current)}
                    >
                      <SelectTrigger data-testid="scheduler-schedule-type" className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_delay" className="text-xs">Fixed Delay</SelectItem>
                        <SelectItem value="cron" className="text-xs">Cron</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={draft.scheduleType === 'fixed_delay' ? 'Interval Seconds' : 'Cron Expression'}>
                    {draft.scheduleType === 'fixed_delay' ? (
                      <Input
                        data-testid="scheduler-interval-seconds"
                        type="number"
                        min={1}
                        value={draft.intervalSeconds}
                        onChange={(event) => setDraft((current) => current ? { ...current, intervalSeconds: event.target.value } : current)}
                        className="h-8 text-xs"
                      />
                    ) : (
                      <Input
                        data-testid="scheduler-cron-expr"
                        value={draft.cronExpr}
                        onChange={(event) => setDraft((current) => current ? { ...current, cronExpr: event.target.value } : current)}
                        className="h-8 font-mono text-xs"
                      />
                    )}
                  </Field>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <InfoRow label="Last Run" value={formatDateTime(selectedJob.last_run_at)} />
                  <InfoRow label="Next Run" value={formatDateTime(selectedJob.next_run_at)} />
                  <InfoRow label="Locked By" value={selectedJob.locked_by ?? '-'} />
                  <InfoRow label="Updated By" value={selectedJob.updated_by} />
                </div>
                {selectedJob.last_error && (
                  <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {selectedJob.last_error}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-8" onClick={handleToggle} disabled={busy('toggle')}>
                    <Power className="h-4 w-4" />
                    {selectedJob.enabled === 1 ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={handleRunNow} disabled={busy('run')}>
                    <Play className="h-4 w-4" />
                    Run Now
                  </Button>
                  <Button size="sm" className="h-8" onClick={handleSaveSchedule} disabled={!canSave || busy('save')}>
                    <Save className="h-4 w-4" />
                    Save Schedule
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-36 p-3 text-xs text-muted-foreground">Select a scheduler job.</div>
            )}
          </section>

          <section className="mt-4 rounded-sm border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run History</h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => selectedJob && void loadRuns(selectedJob.job_code)}
                disabled={!selectedJob || busy('runs')}
              >
                <Clock3 className="h-4 w-4" />
                Refresh
              </Button>
            </div>
            <div className="max-h-96 overflow-auto">
              <Table data-testid="scheduler-runs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-xs text-muted-foreground">
                        No runs loaded
                      </TableCell>
                    </TableRow>
                  ) : runs.map((run) => (
                    <TableRow key={run.id} title={run.error ?? run.message ?? undefined}>
                      <TableCell>
                        <Badge variant="outline" className={statusClassName(run.status)}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{run.trigger_type}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(run.started_at)}</TableCell>
                      <TableCell className="text-right text-xs">{formatDuration(run.duration_ms)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <label className="grid gap-1 text-xs">
    <span className="font-medium text-muted-foreground">{label}</span>
    {children}
  </label>
)

const InfoRow = ({ label, value }: { label: string; value: string }): ReactNode => (
  <div className="min-w-0 rounded-sm border border-border px-2 py-1.5">
    <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="truncate text-xs text-foreground">{value}</div>
  </div>
)
