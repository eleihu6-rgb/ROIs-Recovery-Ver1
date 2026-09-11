import { AlertCircle, Info, Lock, RefreshCw, ShieldAlert, TriangleAlert, X } from 'lucide-react'
import { Button } from '@rois/ui'
import { COST_ERROR_CATEGORY_META, type NormalizedCostError } from '@/types/cost-library'

interface CostErrorBannerProps {
  error: NormalizedCostError
  onRetry?: () => void
  onDismiss?: () => void
  /** When true, render a compact inline version (no border, no shadow) */
  compact?: boolean
  testIdPrefix?: string
}

const ICON_FOR_CATEGORY = {
  info: Info,
  warn: TriangleAlert,
  block: Lock,
  retry: RefreshCw,
  auth: ShieldAlert,
} as const

const ICON_BY_CATEGORY: Record<NormalizedCostError['category'], keyof typeof ICON_FOR_CATEGORY> = {
  validation: 'warn',
  unauthorized: 'auth',
  forbidden: 'block',
  not_found: 'info',
  conflict: 'warn',
  payload_too_large: 'warn',
  unprocessable: 'warn',
  rate_limited: 'retry',
  unavailable: 'retry',
  internal: 'warn',
}

const toneClasses = (tone: 'muted' | 'warning' | 'destructive'): string => {
  switch (tone) {
    case 'destructive':
      // Distinct from the destructive Button: a banner can be muted even when
      // the action is destructive, so we use border/text tones instead of bg.
      return 'border-destructive/40 bg-destructive/5 text-destructive'
    case 'warning':
      return 'border-warning/40 bg-warning/5 text-warning'
    case 'muted':
    default:
      return 'border-border bg-muted/40 text-foreground'
  }
}

const iconClasses = (tone: 'muted' | 'warning' | 'destructive'): string => {
  switch (tone) {
    case 'destructive':
      return 'text-destructive'
    case 'warning':
      return 'text-warning'
    case 'muted':
    default:
      return 'text-muted-foreground'
  }
}

export const CostErrorBanner = ({
  error,
  onRetry,
  onDismiss,
  compact = false,
  testIdPrefix = 'cost-error',
}: CostErrorBannerProps): React.JSX.Element => {
  const meta = COST_ERROR_CATEGORY_META[error.category]
  const Icon = ICON_FOR_CATEGORY[ICON_BY_CATEGORY[error.category]]
  const padding = compact ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3'
  const radius = compact ? 'rounded-md' : 'rounded-lg'
  return (
    <div
      role="alert"
      data-testid={testIdPrefix}
      data-category={error.category}
      data-retryable={error.retryable}
      className={`flex items-start border ${radius} ${padding} ${toneClasses(meta.tone)}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses(meta.tone)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span data-testid={`${testIdPrefix}-category`} className="text-xs font-semibold uppercase tracking-wide">
            {meta.label}
          </span>
          <span data-testid={`${testIdPrefix}-status`} className="font-mono text-2xs text-muted-foreground">
            HTTP {error.status || '—'}
          </span>
          {error.sqlState && (
            <span
              data-testid={`${testIdPrefix}-sqlstate`}
              className="font-mono text-2xs text-muted-foreground"
              title="PostgreSQL SQLSTATE — useful for support tickets"
            >
              SQLSTATE {error.sqlState}
            </span>
          )}
        </div>
        <p data-testid={`${testIdPrefix}-message`} className="mt-1 break-words text-xs leading-relaxed">
          {error.message}
        </p>
        {error.hint && (
          <p data-testid={`${testIdPrefix}-hint`} className="mt-1 break-words text-2xs leading-relaxed text-muted-foreground">
            <span aria-hidden="true">Hint: </span>
            {error.hint}
          </p>
        )}
        {!error.hint && error.category === 'internal' && (
          <p className="mt-1 text-2xs text-muted-foreground">
            Try again. If this keeps happening, note the timestamp and SQLSTATE for your administrator.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && error.retryable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            data-testid={`${testIdPrefix}-retry`}
            aria-label="Retry"
          >
            <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
            Retry
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss error"
            data-testid={`${testIdPrefix}-dismiss`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Compact error pill for inline error states (e.g. row-level failures).
 * Falls back to a simple `<span>` when no error is supplied so call sites
 * don't have to branch.
 */
export const CostErrorPill = ({ error }: { error: NormalizedCostError | null }): React.JSX.Element | null => {
  if (!error) return null
  const meta = COST_ERROR_CATEGORY_META[error.category]
  return (
    <span
      role="alert"
      data-testid="cost-error-pill"
      data-category={error.category}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs ${toneClasses(meta.tone)}`}
    >
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="font-medium">{meta.label}</span>
      <span className="text-muted-foreground">— {error.message}</span>
    </span>
  )
}
