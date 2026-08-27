import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileArchive, Stethoscope, Trash2 } from 'lucide-react'
import { notify } from '@/utils/notify'
import { regressionApi } from '@/services/regression-api'
import type { DiagnosisResult, RegressionRound, RegressionVersion, SnapshotArtifact } from '@/types/regression'

const fmtMs = (ms?: number): string => {
  if (ms == null) return '-'
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`
}

const statusTone = (status?: string): string =>
  status === 'pass' || status === 'flaky'
    ? 'text-emerald-700'
    : status === 'fail'
      ? 'text-red-700'
      : 'text-muted-foreground'

const normalizeVersions = (versions: RegressionVersion[]): RegressionVersion[] =>
  versions.map((v) => {
    if (v.rounds) return v
    if (v.status) {
      return {
        ...v,
        rounds: [{
          round: 1,
          run_id: '',
          status: v.status as RegressionRound['status'],
          run_at: v.run_at ?? '',
          duration_ms: v.duration_ms ?? 0,
          log: v.log ?? '',
          details: { summary: v.log ?? '', steps: [], artifacts: [] },
        }],
      }
    }
    return { ...v, rounds: [] }
  })

const StepValue = ({ value }: { value: unknown }) => {
  if (value == null || value === '') return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>
  }
  return <span>{JSON.stringify(value)}</span>
}

const SnapshotStrip = ({
  artifacts,
  runId,
  onDelete,
}: {
  artifacts: SnapshotArtifact[]
  runId: string
  onDelete: (filename: string) => void
}) => {
  const visible = artifacts.filter((a) => !a.deleted)
  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="snapshot-empty">
        No evidence snapshot recorded for this round.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="snapshot-strip">
      {visible.map((snap) => (
        <div key={snap.id} className="group relative" data-testid="snapshot-item">
          <a
            href={regressionApi.snapshotUrl(snap.url)}
            target="_blank"
            rel="noreferrer"
            title="Open evidence snapshot"
            data-testid="snapshot-link"
          >
            <img
              src={regressionApi.snapshotUrl(snap.url)}
              alt={snap.label}
              title="Evidence snapshot captured during this run round"
              className="max-h-[220px] rounded-sm border border-border object-contain"
              data-testid="snapshot-img"
            />
          </a>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground" data-testid="snapshot-label">{snap.label}</span>
            <button
              type="button"
              title="Delete this evidence snapshot"
              data-testid="snapshot-delete"
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              onClick={() => onDelete(snap.filename)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          {snap.created_at && (
            <span className="text-muted-foreground/70">{snap.created_at.slice(0, 15)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

const diagnosisTypeBg: Record<string, string> = {
  data_issue: '#fffbeb',
  code_bug: '#fef2f2',
  env_issue: '#eff6ff',
  test_bug: '#fff7ed',
}
const diagnosisTypeColor: Record<string, string> = {
  data_issue: '#d97706',
  code_bug: '#dc2626',
  env_issue: '#2563eb',
  test_bug: '#ea580c',
}

const RoundDetails = ({ round, testId }: { round: RegressionRound; testId: number }) => {
  const [open, setOpen] = useState(false)
  const [artifacts, setArtifacts] = useState<SnapshotArtifact[]>(
    () =>
      (round.details?.artifacts ?? []).filter(
        (a): a is SnapshotArtifact => (a as SnapshotArtifact).type === 'snapshot',
      ),
  )
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const steps = round.details?.steps ?? []

  const handleDeleteSnapshot = async (filename: string) => {
    if (!round.run_id || round.run_id === 'manual') return
    try {
      await regressionApi.deleteSnapshot(round.run_id, filename)
      setArtifacts((prev) => prev.map((a) => (a.filename === filename ? { ...a, deleted: true } : a)))
      notify.success('Snapshot deleted')
    } catch {
      notify.error('Failed to delete snapshot')
    }
  }

  const handleDiagnose = async () => {
    setDiagnosing(true)
    try {
      const result = await regressionApi.diagnose(testId)
      setDiagnosis(result)
    } catch {
      notify.error('Diagnosis failed')
    } finally {
      setDiagnosing(false)
    }
  }

  return (
    <div className="rounded-sm border border-border bg-background">
      <button
        type="button"
        data-testid="round-detail-toggle"
        aria-label={`Show recorded evidence for round ${round.round}`}
        title="Show recorded test evidence, expected values, actual values, logs, and artifacts"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-2xs hover:bg-muted/70"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className={`font-semibold ${statusTone(round.status)}`}>{round.status}</span>
        <span className="font-mono text-muted-foreground">round {round.round}</span>
        <span className="font-mono text-muted-foreground" data-testid="round-tester">{round.tester || '—'}</span>
        <span className="truncate text-muted-foreground">{round.details?.summary || round.log || 'No detail recorded'}</span>
        <span className="ml-auto font-mono text-muted-foreground">{fmtMs(round.duration_ms)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2 text-2xs" data-testid="round-detail">
          {round.details?.summary && (
            <p className="text-foreground">{round.details.summary}</p>
          )}
          <SnapshotStrip
            artifacts={artifacts}
            runId={round.run_id}
            onDelete={(f) => void handleDeleteSnapshot(f)}
          />
          {steps.length > 0 ? (
            <div className="space-y-1">
              {/* 10rem fits real step names (e.g. assert_jump_buttons_visible); overflow-wrap
                  lets even longer unbreakable tokens wrap inside the track instead of
                  painting over the params column. */}
              {steps.map((step, index) => (
                <div key={index} className="grid grid-cols-[10rem_1fr] gap-2 rounded-sm bg-muted/40 px-2 py-1">
                  <span className="font-medium text-muted-foreground [overflow-wrap:anywhere]" data-testid="step-name">
                    {String(step.action ?? step.assertion ?? `step ${index + 1}`)}
                  </span>
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-muted-foreground" data-testid="step-params">
                    {Object.entries(step)
                      .filter(([key]) => key !== 'action' && key !== 'assertion')
                      .map(([key, value]) => (
                        <span key={key} className="[overflow-wrap:anywhere]">
                          <span className="text-foreground">{key}</span>=<StepValue value={value} />
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No structured steps recorded for this round.</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            {round.run_at && <span>Run at {round.run_at.slice(0, 19)}</span>}
            {round.has_trace && round.run_id && round.run_id !== 'manual' && (
              <a
                href={regressionApi.traceUrl(round.run_id, testId)}
                download
                title="Download Playwright trace for this run round"
                className="inline-flex items-center gap-1 text-primary"
              >
                <FileArchive className="h-3 w-3" /> trace
              </a>
            )}
          </div>
          {round.log && <pre className="max-h-32 overflow-auto rounded-sm bg-muted p-2 text-muted-foreground">{round.log}</pre>}
          {round.status === 'fail' && (
            <div className="space-y-2">
              <button
                type="button"
                data-testid="diagnose-button"
                aria-label="Ask AI to diagnose this failure"
                title="Ask AI to diagnose whether this is a code bug, data issue, env issue, or test bug"
                disabled={diagnosing}
                onClick={() => void handleDiagnose()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                <Stethoscope className="h-3 w-3 shrink-0" />
                {diagnosing ? 'Diagnosing…' : 'Diagnose'}
              </button>
              {diagnosis && (
                <div
                  data-testid="diagnosis-panel"
                  className="rounded-sm border p-3 space-y-1.5"
                  style={{
                    borderColor: diagnosisTypeColor[diagnosis.issue_type] ?? '#e5e7eb',
                    background: diagnosisTypeBg[diagnosis.issue_type] ?? '#f9fafb',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="diagnosis-type"
                      className="rounded-sm px-2 py-0.5 font-semibold"
                      style={{
                        background: diagnosisTypeColor[diagnosis.issue_type] ?? '#6b7280',
                        color: 'white',
                      }}
                    >
                      {diagnosis.issue_type}
                    </span>
                    <span data-testid="diagnosis-summary" className="font-medium text-foreground">
                      {diagnosis.summary}
                    </span>
                  </div>
                  {diagnosis.explanation && (
                    <p className="text-muted-foreground">{diagnosis.explanation}</p>
                  )}
                  {diagnosis.recommendation && (
                    <p className="font-medium text-foreground">Next step: {diagnosis.recommendation}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Expandable per-test version timeline fetched from GET /tests/{id}/detail. */
export const VersionHistory = ({ testId }: { testId: number }) => {
  const [versions, setVersions] = useState<RegressionVersion[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [creator, setCreator] = useState('')
  const [error, setError] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualStatus, setManualStatus] = useState<RegressionRound['status']>('pass')
  const [manualSummary, setManualSummary] = useState('')
  const [manualLog, setManualLog] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  useEffect(() => {
    let alive = true
    regressionApi
      .detail(testId)
      .then((t) => {
        if (!alive) return
        const next = normalizeVersions(t.versions ?? [])
        setVersions(next)
        setSelected(t.active_version ?? next.at(-1)?.version ?? null)
        setCreator(t.created_by ?? '')
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [testId])

  const sortedVersions = useMemo(() => [...(versions ?? [])].reverse(), [versions])
  const active = versions?.find((v) => v.version === selected) ?? versions?.at(-1)
  const rounds = [...(active?.rounds ?? [])].reverse()

  const saveManualRound = async () => {
    if (!active || !versions) return
    setSavingManual(true)
    try {
      const round = await regressionApi.recordManualRound(testId, active.version, {
        status: manualStatus,
        duration_ms: 0,
        log: manualLog,
        details: {
          summary: manualSummary,
          steps: [],
          artifacts: [],
        },
      })
      setVersions(versions.map((v) => (
        v.version === active.version ? { ...v, rounds: [...(v.rounds ?? []), round] } : v
      )))
      setManualSummary('')
      setManualLog('')
      setManualOpen(false)
      notify.success(`Recorded manual round ${round.round}`)
    } catch (e) {
      console.error('[regression]', e)
      notify.error('Manual round failed to save')
    } finally {
      setSavingManual(false)
    }
  }

  if (error)
    return (
      <div className="px-4 py-2 text-2xs text-destructive" data-testid="version-history-error">
        Failed to load version history
      </div>
    )
  if (versions === null)
    return <div className="px-4 py-2 text-2xs text-muted-foreground">Loading history...</div>

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3" data-testid="version-history">
      {versions.length === 0 ? (
        <span className="text-2xs text-muted-foreground">No versions recorded yet.</span>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {sortedVersions.map((v) => {
              const isActive = v.version === active?.version
              const label = v.version === versions.at(-1)?.version ? `Latest v${v.version}` : `v${v.version}`
              return (
                <button
                  key={v.version}
                  type="button"
                  data-testid="version-row"
                  aria-label={`Show test definition and run rounds for version ${v.version}`}
                  title={`Show test definition and run rounds for version v${v.version}`}
                  className={[
                    'rounded-sm border px-2.5 py-1 text-2xs font-semibold',
                    isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  onClick={() => setSelected(v.version)}
                >
                  {label} · {v.rounds?.length ?? 0} rounds
                </button>
              )
            })}
            <span className="ml-auto text-2xs text-muted-foreground" data-testid="version-creator">
              Created by {creator || '—'}
            </span>
          </div>

          {active && (
            <div className="rounded-sm border border-border bg-background">
              <div className="border-b border-border px-3 py-2 text-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">v{active.version}</span>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground">{active.trigger}</span>
                  <span data-testid="version-modifier" className="rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground">
                    by {active.modified_by || '—'}
                    {active.applied_by ? ` · applied by ${active.applied_by}` : ''}
                  </span>
                  {active.timestamp && <span className="text-muted-foreground">{active.timestamp.slice(0, 19)}</span>}
                  {active.spec_file && <span className="ml-auto font-mono text-muted-foreground">{active.spec_file}</span>}
                </div>
                <p className="mt-1 truncate text-foreground">{active.title}</p>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="manual-round-open"
                    aria-label="Record a manual test round for the selected version"
                    title="Record a manual test round for the selected version"
                    className="rounded-sm border border-border bg-background px-2.5 py-1 text-2xs font-semibold text-muted-foreground hover:text-foreground"
                    onClick={() => setManualOpen((value) => !value)}
                  >
                    Manual round
                  </button>
                </div>
                {manualOpen && (
                  <div className="grid gap-2 rounded-sm border border-border bg-muted/30 p-3 text-2xs" data-testid="manual-round-form">
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <label className="font-medium text-muted-foreground" htmlFor={`manual-status-${testId}`}>Status</label>
                      <select
                        id={`manual-status-${testId}`}
                        value={manualStatus}
                        onChange={(e) => setManualStatus(e.target.value as RegressionRound['status'])}
                        className="h-7 rounded-sm border border-border bg-background px-2"
                      >
                        <option value="pass">pass</option>
                        <option value="fail">fail</option>
                        <option value="flaky">flaky</option>
                      </select>
                    </div>
                    <label className="grid gap-1">
                      <span className="font-medium text-muted-foreground">Evidence summary</span>
                      <textarea
                        value={manualSummary}
                        onChange={(e) => setManualSummary(e.target.value)}
                        placeholder="Example: switched to date range X-Y, clicked >> on pairing TG123 2026-06-08, expected M-N and observed M-N."
                        className="min-h-16 resize-y rounded-sm border border-border bg-background p-2"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-medium text-muted-foreground">Log / notes</span>
                      <textarea
                        value={manualLog}
                        onChange={(e) => setManualLog(e.target.value)}
                        className="min-h-12 resize-y rounded-sm border border-border bg-background p-2"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="rounded-sm px-2 py-1 text-muted-foreground" onClick={() => setManualOpen(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="manual-round-save"
                        className="rounded-sm bg-primary px-2.5 py-1 font-semibold text-primary-foreground disabled:opacity-50"
                        disabled={savingManual || !manualSummary.trim()}
                        onClick={() => void saveManualRound()}
                      >
                        Save round
                      </button>
                    </div>
                  </div>
                )}
                {rounds.length > 0 ? (
                  rounds.map((round) => (
                    <RoundDetails key={`${round.run_id}-${round.round}`} round={round} testId={testId} />
                  ))
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    No run rounds recorded for this version yet.
                  </p>
                )}
                {active.code && (
                  <details>
                    <summary className="cursor-pointer text-2xs text-muted-foreground hover:text-foreground">code snapshot</summary>
                    <pre className="mt-1 max-h-36 overflow-auto rounded-sm bg-muted p-2 text-2xs">{active.code}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
