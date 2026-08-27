// gantt/src/components/scenario/scenario-detail-panel.tsx
import { useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@rois/ui'
import type { ScenarioDetail } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'
import { ScenarioBasicInfo } from './scenario-basic-info'
import { ScenarioFilterSection } from './scenario-filter-section'
import { ScenarioKpiSection, ScenarioRunProgressBar } from './scenario-kpi-section'
import { ScenarioToolbar } from './scenario-toolbar'
import { ScenarioEmptyState } from './scenario-empty-state'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ScenarioDetailPanelProps {}

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT:     'bg-muted text-muted-foreground',
  RUNNING:   'bg-blue-500/15 text-blue-400',
  DONE:      'bg-[#DFF7EA] text-[#065F46]',
  FAILED:    'bg-destructive/15 text-destructive',
  PUBLISHED: 'bg-amber-500/15 text-amber-400',
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:     'Draft',
  RUNNING:   'Running',
  DONE:      'Done',
  FAILED:    'Failed',
  PUBLISHED: 'Published',
}

const TYPE_ID_BADGE_CLASS: Record<string, string> = {
  PO: 'bg-blue-500/15 text-blue-400',
  RO: 'bg-[#DFF7EA] text-[#065F46]',
  TO: 'bg-violet-500/15 text-violet-400',
}

export const ScenarioDetailPanel = (_props: ScenarioDetailPanelProps): ReactNode => {
  const detail        = useScenarioStore((s) => s.detail)
  const draftDetail   = useScenarioStore((s) => s.draftDetail)
  const results       = useScenarioStore((s) => s.results)
  const progress      = useScenarioStore((s) => s.progress)
  const detailLoading = useScenarioStore((s) => s.detailLoading)
  const patchDraft    = useScenarioStore((s) => s.patchDraft)
  const focusNameField      = useScenarioStore((s) => s.focusNameField)
  const clearFocusNameField = useScenarioStore((s) => s.clearFocusNameField)
  const nameInputRef        = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusNameField) return
    // Delay the focus so that any Radix DropdownMenu close/focus-restore
    // animation has finished before we reclaim focus on the name input.
    const timer = setTimeout(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
      clearFocusNameField()
    }, 150)
    return () => clearTimeout(timer)
  }, [focusNameField, clearFocusNameField])

  if (detailLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!detail || !draftDetail) {
    return <ScenarioEmptyState showCreateButton={false} />
  }

  // Merge committed detail with pending edits for display
  const displayDetail: ScenarioDetail = { ...detail, ...draftDetail } as ScenarioDetail
  const isReadonly = detail.status === 'RUNNING' || detail.status === 'PUBLISHED'

  return (
    <div className="flex h-full flex-col" data-testid="scenario-detail-panel">
      {/* Header: scenario identity, editable name, run progress, status and actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span
          data-testid="scenario-id-badge"
          className={cn(
            'shrink-0 rounded px-2 py-0.5 text-sm font-bold tabular-nums',
            TYPE_ID_BADGE_CLASS[displayDetail.fileType] ?? 'bg-slate-500/15 text-slate-400',
          )}
        >
          {displayDetail.id}
        </span>
        <input
          ref={nameInputRef}
          data-testid="scenario-name-input"
          className="min-w-[12rem] flex-[1_1_18rem] bg-transparent text-base font-bold text-foreground outline-none placeholder:text-muted-foreground"
          value={draftDetail.name ?? ''}
          placeholder="Scenario name"
          disabled={isReadonly}
          onChange={(e) => patchDraft({ name: e.target.value })}
        />
        {detail.status === 'RUNNING' && (
          <div className="min-w-[16rem] flex-[1_1_22rem]" data-testid="scenario-header-progress">
            <ScenarioRunProgressBar progress={progress} compact />
          </div>
        )}
        <span data-testid="scenario-status-badge" className={cn('shrink-0 rounded px-2 py-0.5 text-2xs font-semibold', STATUS_BADGE_CLASS[detail.status])}>
          {STATUS_LABEL[detail.status]}
        </span>
        <ScenarioToolbar detail={displayDetail} />
      </div>

      {/* Scrollable body. Keep Basic Info on the left and give Scope Filters the
          wider right side; KPI remains below the top configuration row. */}
      <div data-testid="scenario-detail-body" className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 border-b border-border @[980px]:grid-cols-[minmax(360px,0.64fr)_minmax(580px,1.36fr)] @[980px]:divide-x @[980px]:divide-border">
          <div className="min-w-0">
            <ScenarioBasicInfo detail={displayDetail} disabled={isReadonly} />
          </div>

          <div className="@container min-w-0 border-t border-border @[980px]:border-t-0" data-testid="scenario-scope-filters">
            <div className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Scope Filters
            </div>
            <ScenarioFilterSection detail={displayDetail} disabled={isReadonly} />
          </div>
        </div>
        <ScenarioKpiSection
          scenarioId={detail.id}
          fileType={detail.fileType}
          results={results}
          status={detail.status}
          division={displayDetail.division}
        />
      </div>
    </div>
  )
}
