// gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx
import { type ReactNode } from 'react'
import { Loader2, Save, Lock, PencilLine, Eye, RefreshCw, Trash2, Undo2, Redo2 } from 'lucide-react'
import {
  Button, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@rois/ui'
import { cn } from '@rois/ui'
import { TimezoneSwitcher } from '@/components/common/timezone-switcher'
import { ZoomControlView } from '@/components/common/zoom-control'
import { RuleGroupDisplay } from '@/components/common/rule-group-display'
import type { ScenarioGanttData, LockStatus } from '@/types/scenario-gantt'
import type { ScenarioType } from '@/types/scenario'
import { PANE_COLORS, PANE_NAMES, type ScenarioPaneType } from '@/stores/scenario-layout-store'

interface ScenarioGanttToolbarProps {
  data: ScenarioGanttData
  historicalVersion?: string
  lockStatus: LockStatus | null
  isDirty: boolean
  saving: boolean
  checking?: boolean
  acquiringLock: boolean
  pendingCount: number
  canDelete: boolean
  canUndo: boolean
  canRedo: boolean
  pxPerHour: number
  zoomMin: number
  zoomMax: number
  openPaneTypes: Set<string>
  allowedPanes: ScenarioPaneType[]
  onZoomIn: () => void
  onZoomOut: () => void
  onRefresh: () => void
  onDelete: () => void
  onUndo: () => void
  onRedo: () => void
  onAcquireLock: () => void
  onReleaseLock: () => void
  onSave: () => void
  onAddPane: (type: ScenarioPaneType) => void
  onResetLayout: () => void
}

const SCENARIO_NAV_BADGE_CLASS = 'bg-[#DFF7EA] text-[#065F46]'

export const ScenarioGanttToolbar = ({
  data,
  historicalVersion,
  lockStatus,
  isDirty,
  saving,
  checking = false,
  acquiringLock,
  pendingCount,
  canDelete,
  canUndo,
  canRedo,
  pxPerHour,
  zoomMin,
  zoomMax,
  openPaneTypes,
  allowedPanes,
  onZoomIn,
  onZoomOut,
  onRefresh,
  onDelete,
  onUndo,
  onRedo,
  onAcquireLock,
  onReleaseLock,
  onSave,
  onAddPane,
  onResetLayout,
}: ScenarioGanttToolbarProps): ReactNode => {
  const isOwner  = lockStatus?.isOwner ?? false
  const isLocked = lockStatus?.locked  ?? false
  const lockedBy = lockStatus?.owner   ?? null
  const fileType = (data.fileType ?? 'PO') as ScenarioType
  const sourceBadge = data.dataSource === 'seed'
    ? 'Live lead-in · preview'
    : data.dataSource === 'live-refresh'
      ? 'Live Context'
    : null
  const actionsBlocked = saving || checking
  const canSave = isDirty && !actionsBlocked && isOwner
  const editButtonBase = 'relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100'
  const editButtonActive = 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95'
  const editButtonDisabled = 'pointer-events-none text-muted-foreground/30'

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      data-testid="scenario-gantt-toolbar"
    >
      <span className={cn('rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-widest', SCENARIO_NAV_BADGE_CLASS)}>
        Scenario
      </span>

      <span className={cn('rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-widest', SCENARIO_NAV_BADGE_CLASS)}>
        {fileType}
      </span>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {sourceBadge && (
        <>
          <span
            data-testid="sg-source-badge"
            className="rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-500/15 text-amber-400"
          >
            {sourceBadge}
          </span>
          <div className="mx-1 h-3.5 w-px bg-border" />
        </>
      )}

      {historicalVersion && (
        <>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-3xs font-semibold text-amber-600" data-testid="scenario-history-version">
            Historical {historicalVersion}
          </span>
          <div className="mx-1 h-3.5 w-px bg-border" />
        </>
      )}

      {!historicalVersion && (
        <>
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-0.5">
              <ToolbarIconButton tip="Refresh" testId="sg-refresh-btn" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </ToolbarIconButton>

              <ToolbarIconButton
                tip="Delete selected CR task"
                testId="sg-delete-btn"
                onClick={onDelete}
                disabled={!canDelete || !isOwner}
                danger
              >
                <Trash2 className="h-3.5 w-3.5" />
              </ToolbarIconButton>

              <ToolbarIconButton
                tip="Undo"
                testId="sg-undo-btn"
                onClick={onUndo}
                disabled={!canUndo || !isOwner || actionsBlocked}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </ToolbarIconButton>

              <ToolbarIconButton
                tip="Redo"
                testId="sg-redo-btn"
                onClick={onRedo}
                disabled={!canRedo || !isOwner || actionsBlocked}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </ToolbarIconButton>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`${editButtonBase} ${canSave ? editButtonActive : saving ? 'text-primary' : editButtonDisabled}`}
                    onClick={onSave}
                    disabled={!canSave}
                    data-testid="sg-save-btn"
                  >
                    {saving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    {pendingCount > 0 && !saving && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-3xs font-bold leading-none text-primary-foreground">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {saving ? 'Saving...' : pendingCount > 0 ? `Save ${pendingCount} change(s)` : 'Save'}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <div className="mx-1 h-3.5 w-px bg-border" />
        </>
      )}

      {/* Legality Alert Center is now the shared per-pane bell in the roster pane's condition
          strip (unified with Live via RosterPaneSource.useAlertCenter) — no top-toolbar bell. */}

      {/* Zoom controls — shared with Live via ZoomControlView (testids zoom-in / zoom-out) */}
      <TooltipProvider delayDuration={300}>
        <ZoomControlView
          pxPerHour={pxPerHour}
          zoomMin={zoomMin}
          zoomMax={zoomMax}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
        />
      </TooltipProvider>

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Scenario uses its own persisted ruleset; display it like Live without switching. */}
      <RuleGroupDisplay rulesetId={data.rulesetId} />

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Timezone selector */}
      <TimezoneSwitcher scenarioId={data.scenarioId} />

      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Pane toggle buttons */}
      <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 p-1">
        {(['roster', 'pairing', 'flight'] as const).filter((type) => allowedPanes.includes(type)).map((type) => {
          const isOpen = openPaneTypes.has(type)
          return (
            <button
              key={type}
              className={[
                'flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-all',
                isOpen ? 'opacity-40 pointer-events-none' : 'hover:bg-muted',
              ].join(' ')}
              onClick={() => onAddPane(type)}
              disabled={isOpen}
              data-testid={`sg-add-pane-${type}`}
            >
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PANE_COLORS[type] }} />
              {PANE_NAMES[type]}
            </button>
          )
        })}
        <button
          className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onResetLayout}
          data-testid="sg-reset-layout"
        >
          Reset
        </button>
      </div>

      <div className="flex-1" />

      <TooltipProvider delayDuration={300}>
        {historicalVersion ? (
          <div className="flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-0.5">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="text-2xs font-semibold text-muted-foreground">Historical · Read-only</span>
          </div>
        ) : isOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-md border border-amber-600/40 bg-amber-500/15 px-2 text-amber-700 shadow-sm hover:border-amber-600/60 hover:bg-amber-500/20 hover:text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-200 dark:hover:border-amber-300/60 dark:hover:bg-amber-400/20 dark:hover:text-amber-100"
                onClick={onReleaseLock}
                data-testid="sg-release-lock-btn"
              >
                <PencilLine className="h-3.5 w-3.5" />
                <span className="text-2xs font-semibold">Edit</span>
                {lockStatus?.ttl != null && (
                  <span className="text-2xs text-amber-700/80 dark:text-amber-200/80">{Math.round(lockStatus.ttl / 60)}m</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Exit editing</TooltipContent>
          </Tooltip>
        ) : isLocked ? (
          <div className="flex items-center gap-1.5 rounded border border-red-500/25 bg-red-500/10 px-2 py-0.5">
            <Lock className="h-3 w-3 text-red-400" />
            <span className="text-2xs font-semibold text-red-400">Locked by {lockedBy}</span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                disabled={acquiringLock}
                onClick={onAcquireLock}
                data-testid="sg-acquire-lock-btn"
              >
                {acquiringLock
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Eye className="h-3.5 w-3.5" />}
                <span className="text-2xs">View</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Enable editing</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}

const ToolbarIconButton = ({
  tip,
  testId,
  onClick,
  disabled,
  danger,
  children,
}: {
  tip: string
  testId: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}): ReactNode => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100',
          disabled
            ? 'pointer-events-none text-muted-foreground/30'
            : danger
              ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
        ].join(' ')}
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
  </Tooltip>
)
