import { AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react'
import type { DataValidationIssue } from '@/types/data-maintenance'
import { cn } from '@rois/ui'

interface ValidationPanelProps {
  issues: DataValidationIssue[]
}

export const ValidationPanel = ({ issues }: ValidationPanelProps) => {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <div
      data-testid="data-validation-panel"
      className="border-t border-border bg-muted/20"
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <ShieldCheckIcon issueCount={issues.length} />
        <span className="text-sm font-semibold text-foreground">Validation</span>

        {issues.length > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            {errors.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-2xs font-medium text-destructive">
                <XCircle className="h-3 w-3 shrink-0" />
                {errors.length} error{errors.length !== 1 ? 's' : ''}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Issue list */}
      <div className="max-h-40 overflow-y-auto">
        {issues.length === 0 ? (
          <div className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            No issues
          </div>
        ) : (
          issues.map((issue, idx) => (
            <div
              key={issue.clientChangeId ?? idx}
              data-testid="data-validation-issue"
              className={cn(
                'flex items-start gap-2 border-b border-border/50 px-4 py-2 text-xs',
                issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {issue.severity === 'error'
                ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              }
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{issue.entityId}{issue.field ? `.${issue.field}` : ''}</span>
                <span className="text-muted-foreground">{issue.message}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Small helper component to show the right icon in the header
const ShieldCheckIcon = ({ issueCount }: { issueCount: number }) => {
  if (issueCount === 0) {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
}
