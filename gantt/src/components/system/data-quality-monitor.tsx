import { useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { Badge, Button } from '@rois/ui'
import type { DataQualityCheckResult, DataQualityReport } from '@/services/data-quality-api'
import { fetchDataQualityReport } from '@/services/data-quality-api'

const SeverityIcon = ({ severity, pass }: { severity: 'error' | 'warning'; pass: boolean }) => {
  if (pass) return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
  if (severity === 'error') return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
  return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
}

const CheckRow = ({ check }: { check: DataQualityCheckResult }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`border-b border-border last:border-0 ${check.pass ? '' : 'bg-destructive/5'}`}
      data-testid={`dq-check-${check.id}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
        onClick={() => !check.pass && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <SeverityIcon severity={check.severity} pass={check.pass} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{check.name}</span>
            {!check.pass && (
              <Badge
                variant={check.severity === 'error' ? 'destructive' : 'outline'}
                className="text-2xs"
              >
                {check.count} issues
              </Badge>
            )}
            {check.pass && (
              <Badge variant="outline" className="border-green-500 text-2xs text-green-600">
                OK
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{check.description}</p>
        </div>
      </button>
      {expanded && check.samples.length > 0 && (
        <div className="mx-4 mb-3 rounded-sm border border-border bg-muted/40 p-2">
          <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Sample records
          </p>
          <ul className="space-y-0.5">
            {check.samples.map((s, i) => (
              <li key={i} className="font-mono text-xs text-foreground">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export const DataQualityMonitor = () => {
  const [report, setReport] = useState<DataQualityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runChecks = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDataQualityReport()
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run checks')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="data-quality-monitor">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Data Quality Monitor</span>
        <div className="flex-1" />
        {report && (
          <span className="text-xs text-muted-foreground">
            Last checked: {new Date(report.checkedAt).toLocaleString()}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={runChecks}
          disabled={loading}
          data-testid="dq-run-checks-btn"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running…' : 'Run Checks'}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {!report && !loading && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 opacity-30" />
            <p className="text-sm">Click &quot;Run Checks&quot; to scan for data quality issues.</p>
          </div>
        )}

        {error && (
          <div className="m-4 rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {report && (
          <>
            <div className="flex gap-3 border-b border-border bg-card px-4 py-2">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-destructive">{report.summary.errors}</span> errors
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-amber-500">{report.summary.warnings}</span> warnings
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-green-600">{report.summary.passed}</span> passed
              </span>
            </div>
            <div data-testid="dq-checks-list">
              {report.checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
