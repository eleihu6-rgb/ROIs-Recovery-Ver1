import { AlertTriangle } from 'lucide-react'
import { AppDialog, useI18n } from '@rois/ui'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { VIOLATION_SEVERITY_COLORS } from '@/components/gantt/gantt-constants'
import { RULE_SEVERITY_LABELS, severityLabelFromNum } from '@/utils/severity-labels'
import { groupRuleConfirmViolations } from './rule-confirm-groups'

/**
 * Confirmation dialog shown when a roster modification triggers rule violations.
 *
 * - WARNING only: shows violations, user can "Continue" or "Cancel"
 * - ERROR (blocking): shows violations, only "Cancel" is available
 *
 * Uses the project-standard AppDialog and groups rule 8030 by physical flight
 * (cross-pairing), keeping only the earliest-start flight in the dialog.
 */
export const RuleConfirmDialog = () => {
  const { t } = useI18n()
  const { open, violations, hasBlocking, onConfirm, onCancel } =
    useRuleCheckStore((s) => s.confirmDialog)
  const groups = groupRuleConfirmViolations(violations)
  const errorCount = groups.filter((group) => group.severity >= 3).length
  const warningCount = groups.filter((group) => group.severity === 2).length
  const softCount = groups.filter((group) => group.severity === 1).length
  const desc = hasBlocking ? t.ruleCheck.blockedDesc : t.ruleCheck.warningDesc

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel?.()
      }}
      title={hasBlocking ? t.ruleCheck.blockedTitle : t.ruleCheck.warningTitle}
      icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
      description={desc}
      footer={(
        <>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          {!hasBlocking && (
            <button
              type="button"
              onClick={() => onConfirm?.()}
              data-testid="rule-confirm-proceed"
              className="flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              {t.ruleCheck.continueAnyway}
            </button>
          )}
        </>
      )}
      className="sm:max-w-[480px]"
      bodyClassName="space-y-2"
      data-testid="rule-confirm-dialog"
    >
      <div className="flex flex-wrap gap-2">
        {errorCount > 0 && (
          <span className="rounded-sm bg-destructive/15 px-2 py-0.5 text-2xs font-bold tabular-nums text-destructive">
            {errorCount} {RULE_SEVERITY_LABELS.ERROR}
          </span>
        )}
        {warningCount > 0 && (
          <span className="rounded-sm bg-ring/15 px-2 py-0.5 text-2xs font-bold tabular-nums text-ring">
            {warningCount} {RULE_SEVERITY_LABELS.WARNING}
          </span>
        )}
        {softCount > 0 && (
          <span className="rounded-sm bg-muted px-2 py-0.5 text-2xs font-bold tabular-nums text-muted-foreground">
            {softCount} {RULE_SEVERITY_LABELS.INFO}
          </span>
        )}
      </div>

      <div className="max-h-[240px] overflow-y-auto rounded-md border border-border/60 bg-muted/30">
        {groups.map((group, index) => {
          const sevColor =
            VIOLATION_SEVERITY_COLORS[group.severity] ?? VIOLATION_SEVERITY_COLORS[3]
          const label = severityLabelFromNum(group.severity)

          return (
            <div
              key={group.key}
              data-testid={`rule-confirm-group-${group.ruleCode}-${index}`}
              className={`flex items-start gap-2 px-3 py-2 ${index > 0 ? 'border-t border-border/40' : ''} ${group.isNew ? 'bg-amber-500/8 dark:bg-amber-400/10' : ''}`}
            >
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: sevColor, boxShadow: `0 0 3px ${sevColor}40` }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-2xs font-bold uppercase tracking-wide"
                    style={{ color: sevColor }}
                  >
                    {label}
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">
                    {group.ruleName}
                  </span>
                </div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {group.message}
                </div>
                {group.members.length > 0 && (
                  <div className="mt-2 space-y-1 border-l-2 border-border pl-2">
                    {group.members.map((member) => (
                      <div
                        key={member.crewId}
                        data-testid={`rule-confirm-member-${member.crewId}`}
                        className="flex items-center gap-1.5 text-xs text-foreground"
                      >
                        <span>
                          Crew <span className="font-mono tabular-nums">{member.crewId}</span>
                        </span>
                        {member.age !== null && (
                          <span className="text-muted-foreground">
                            · Age <span className="font-mono tabular-nums">{member.age}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </AppDialog>
  )
}
