import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react'
import { Badge, Button, Input } from '@rois/ui'
import { notify } from '@/utils/notify'
import { getHttpErrorStatus } from '@/services/http-client'
import {
  fetchPbsBusinessTimeStatus,
  savePbsBusinessTime,
  type PbsBusinessTimeStatus,
} from '@/services/pbs-business-time-api'
import { useShellStore } from '@/stores/shell-store'

const getShanghaiParts = (date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>
}

const formatShanghaiDateTime = (value: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const parts = getShanghaiParts(date)
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

const toShanghaiDateTimeInput = (value: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = getShanghaiParts(date)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

interface StatusFieldProps {
  label: string
  value: string
}

const StatusField = ({ label, value }: StatusFieldProps): ReactNode => (
  <div className="min-w-0 border-r border-border px-3 py-2 last:border-r-0">
    <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 truncate text-xs font-semibold tabular-nums text-foreground">{value}</div>
  </div>
)

export const PbsBusinessTimeView = (): ReactNode => {
  const setPbsItem = useShellStore((state) => state.setPbsItem)
  const [status, setStatus] = useState<PbsBusinessTimeStatus | null>(null)
  const [businessTimeLocal, setBusinessTimeLocal] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingAction, setSavingAction] = useState<'SET' | 'CLEAR' | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const returnToPeriodForForbidden = useCallback((): void => {
    notify.error('You do not have permission to manage PBS Business Time.')
    setPbsItem('period')
  }, [setPbsItem])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    try {
      const nextStatus = await fetchPbsBusinessTimeStatus()
      setStatus(nextStatus)
      setBusinessTimeLocal(nextStatus.source === 'override'
        ? toShanghaiDateTimeInput(nextStatus.businessNow)
        : '')
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      setLoadError('PBS Business Time could not be loaded. Check the connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [returnToPeriodForForbidden])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (): Promise<void> => {
    if (!businessTimeLocal.trim()) {
      setFieldError('Business Time is required.')
      return
    }

    setFieldError(null)
    setSavingAction('SET')
    try {
      const nextStatus = await savePbsBusinessTime({
        action: 'SET',
        businessTimeLocal: businessTimeLocal.trim(),
      })
      setStatus(nextStatus)
      setBusinessTimeLocal(toShanghaiDateTimeInput(nextStatus.businessNow))
      notify.success('PBS Business Time saved. Portal may take up to 60 seconds to reflect it.')
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      notify.error('PBS Business Time could not be saved. Your current values were kept; try again.')
    } finally {
      setSavingAction(null)
    }
  }

  const clear = async (): Promise<void> => {
    setSavingAction('CLEAR')
    try {
      const nextStatus = await savePbsBusinessTime({ action: 'CLEAR' })
      setStatus(nextStatus)
      setBusinessTimeLocal('')
      setFieldError(null)
      notify.success('PBS Business Time cleared. Portal may take up to 60 seconds to reflect it.')
    } catch (err) {
      if (getHttpErrorStatus(err) === 403) {
        returnToPeriodForForbidden()
        return
      }
      notify.error('PBS Business Time could not be cleared. Try again.')
    } finally {
      setSavingAction(null)
    }
  }

  const busy = loading || savingAction !== null
  const effectiveMode = status?.source === 'override' ? 'Rolling' : 'System Time'
  const statusLabel = status
    ? (status.source === 'override' ? 'OVERRIDE' : 'SYSTEM TIME')
    : (loading ? 'LOADING' : 'UNAVAILABLE')

  return (
    <div className="h-full overflow-auto bg-background" data-testid="pbs-business-time-view">
      <div className="border-b border-border bg-background">
        <div className="flex h-11 items-center justify-between px-4">
          <h1 className="text-sm font-semibold text-foreground">PBS Business Time</h1>
          <Badge
            variant="outline"
            className={status
              ? (status.source === 'override'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700')
              : 'text-muted-foreground'}
          >
            {statusLabel}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <section
          role="alert"
          aria-label="Business Time risk notice"
          className="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Development and testing control. Changes affect the current PBS period, bid-window availability,
            remaining time, and Award period selection.
          </span>
        </section>

        {loadError ? (
          <section
            role="alert"
            aria-label="Business Time loading error"
            className="flex items-center justify-between gap-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground"
          >
            <span>{loadError}</span>
            <Button data-testid="pbs-business-time-retry" variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </section>
        ) : (
          <section className="overflow-hidden rounded-sm border border-border bg-background">
            <div className="grid grid-cols-2 border-b border-border bg-muted/20 lg:grid-cols-4">
              <StatusField label="Mode" value={effectiveMode} />
              <StatusField label="Real Time" value={formatShanghaiDateTime(status?.realNow ?? null)} />
              <StatusField label="PBS Business Time" value={formatShanghaiDateTime(status?.businessNow ?? null)} />
              <StatusField label="Override Set At" value={formatShanghaiDateTime(status?.anchorReal ?? null)} />
            </div>

            <div className="flex flex-wrap items-end gap-2 p-3">
              <label className="min-w-64 flex-1 max-w-sm text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Business Time (Asia/Shanghai, UTC+8)
                <Input
                  data-testid="pbs-business-time-input"
                  type="datetime-local"
                  value={businessTimeLocal}
                  aria-invalid={fieldError ? 'true' : undefined}
                  aria-describedby={fieldError ? 'pbs-business-time-input-error' : undefined}
                  className="mt-1 h-8 text-xs normal-case tracking-normal text-foreground"
                  onChange={(event) => {
                    setBusinessTimeLocal(event.target.value)
                    if (fieldError) setFieldError(null)
                  }}
                />
              </label>
              <Button
                data-testid="pbs-business-time-save"
                size="sm"
                disabled={busy}
                onClick={() => void save()}
              >
                {savingAction === 'SET' ? 'Saving...' : 'Set Business Time'}
              </Button>
              <Button
                data-testid="pbs-business-time-clear"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void clear()}
              >
                {savingAction === 'CLEAR' ? 'Clearing...' : 'Use Real Time'}
              </Button>
              <Button
                data-testid="pbs-business-time-refresh"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void load()}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
            {fieldError ? (
              <div id="pbs-business-time-input-error" role="alert" className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive">
                {fieldError}
              </div>
            ) : null}
          </section>
        )}

        {status?.warnings.length ? (
          <section
            role="alert"
            aria-label="Business Time configuration warning"
            className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {status.warnings.join(' ')}
          </section>
        ) : null}

        <section className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Rolling mode keeps the selected PBS Business Time moving forward at the same speed as real time.
            Times on this page are refresh snapshots in Asia/Shanghai (UTC+8).
          </p>
        </section>
      </div>
    </div>
  )
}
