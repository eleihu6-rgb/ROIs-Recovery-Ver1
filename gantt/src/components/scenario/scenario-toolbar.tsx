// gantt/src/components/scenario/scenario-toolbar.tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Play, Square, ExternalLink, Eraser, UploadCloud, Save,
  Loader2, Trash2, AlertTriangle, XCircle, CheckCircle2, RefreshCw,
} from 'lucide-react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  AppDialog,
  cn,
} from '@rois/ui'
import type { ScenarioDetail } from '@/types'
import { isPoFilter, isRoFilter } from '@/types/scenario'
import { useScenarioStore } from '@/stores/scenario-store'
import { useShellStore } from '@/stores/shell-store'
import { PublishRosterDialog } from './publish-roster-dialog'

interface ScenarioToolbarProps {
  detail: ScenarioDetail
}

interface RunCheckResult {
  blockers: string[]
  warnings: string[]
}

function checkRunConditions(detail: ScenarioDetail): RunCheckResult {
  const blockers: string[] = []
  const warnings: string[] = []

  // Status: only DRAFT and FAILED are runnable
  if (detail.status === 'DONE') {
    blockers.push('Scenario already has an optimization result — remove it before re-running')
  }

  // Required date range
  if (!detail.strDtLoc) blockers.push('Start date is required')
  if (!detail.endDtLoc) blockers.push('End date is required')

  // Required rule set
  if (!detail.rulesetId) blockers.push('Rule Set is required')

  // Filter / pairing conditions (type-specific)
  const fp = detail.filterParams
  if (!fp) {
    warnings.push('No filter conditions configured — optimization will cover all data in the date range')
  } else if (isPoFilter(fp)) {
    const hasFlightFilter = fp.flightNos.length > 0 || fp.depAirports.length > 0 || fp.arrAirports.length > 0 || fp.fleets.length > 0
    if (!hasFlightFilter) {
      warnings.push('No flight filters set — all flights in the date range will be included')
    }
  } else if (isRoFilter(fp)) {
    const crewBases   = fp.crew?.bases   ?? []
    const crewFleets  = fp.crew?.fleets  ?? []
    const pairBases   = fp.pairing?.bases   ?? []
    const pairFleets  = fp.pairing?.fleets  ?? []
    const pairSources = fp.pairing?.sources ?? []

    if (crewBases.length === 0 && crewFleets.length === 0) {
      warnings.push('No Crew filters set (bases / fleets) — all crew will be included')
    }
    if (pairBases.length === 0 && pairFleets.length === 0 && pairSources.length === 0) {
      warnings.push('No Pairing filters set — all pairings in the date range will be included')
    }
  }

  // Pairing Scenario (required); 0 = Live pairings, which is a valid selection
  if (detail.pairingScenarioId === null || detail.pairingScenarioId === undefined) {
    blockers.push('Pairing Scenario is required')
  }

  return { blockers, warnings }
}

/**
 * Per-scenario icon toolbar, rendered in the top-right of the detail panel
 * header. Replaces the old bottom action bar. Every action is icon-only with a
 * hover tooltip (the icon carries no visible label, so the tooltip is the only
 * affordance — it must be correct).
 */
export const ScenarioToolbar = ({ detail }: ScenarioToolbarProps): ReactNode => {
  const isDirty            = useScenarioStore((s) => s.isDirty)
  const saving             = useScenarioStore((s) => s.saving)
  const saveDetail         = useScenarioStore((s) => s.saveDetail)
  const transitionStatus   = useScenarioStore((s) => s.transitionStatus)
  const runScenario        = useScenarioStore((s) => s.runScenario)
  const refreshDetail      = useScenarioStore((s) => s.refreshDetail)
  const running            = useScenarioStore((s) => s.runningId === detail.id)
  const setModule          = useShellStore((s) => s.setModule)
  const setScenarioTabType = useShellStore((s) => s.setScenarioTabType)

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [deleteVersionFiles, setDeleteVersionFiles] = useState(false)
  const [publishOpen, setPublishOpen]             = useState(false)
  const [runCheck, setRunCheck]                   = useState<RunCheckResult | null>(null)
  const [saveRunOpen, setSaveRunOpen]             = useState(false)

  const isRunning   = detail.status === 'RUNNING'
  const hasResult   = detail.status === 'DONE' || detail.status === 'FAILED'
  const isDone      = detail.status === 'DONE'
  const isPublished = detail.status === 'PUBLISHED'
  const isBusy      = running || isRunning
  const canPublish  = detail.fileType === 'RO' && (detail.pairingScenarioId ?? 0) === 0

  const handleRun = (): void => {
    // Kill: no validation needed
    if (isRunning) {
      void transitionStatus(detail.id, 'FAILED')
      return
    }

    const check = checkRunConditions(detail)
    // If there are any issues, show the pre-run check dialog
    if (check.blockers.length > 0 || check.warnings.length > 0) {
      setRunCheck(check)
      return
    }

    startRun()
  }

  const handleConfirmedRun = (): void => {
    setRunCheck(null)
    startRun()
  }

  /** Final gate before starting the optimisation: unsaved edits must be saved first. */
  const startRun = (): void => {
    if (isDirty) {
      setSaveRunOpen(true)
      return
    }
    void runScenario(detail.id)
  }

  const handleSaveAndRun = async (): Promise<void> => {
    setSaveRunOpen(false)
    await saveDetail()
    // saveDetail toasts on failure and keeps isDirty=true — only run when the save landed.
    if (useScenarioStore.getState().isDirty) return
    void runScenario(detail.id)
  }

  const handleOpen = (): void => {
    const moduleKey = `scenario-gantt:${detail.id}`
    setScenarioTabType(moduleKey, detail.fileType)
    setModule(moduleKey)
  }

  const iconBtn = 'h-7 w-7 p-0'
  const icon    = 'h-3.5 w-3.5'

  // Pre-run check dialog footer: blockers → only Close; warnings-only → Cancel + Proceed
  const hasBlockers  = (runCheck?.blockers.length ?? 0) > 0
  const hasWarnings  = (runCheck?.warnings.length ?? 0) > 0
  const runCheckFooter = hasBlockers ? (
    <Button variant="ghost" onClick={() => setRunCheck(null)}>Close</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={() => setRunCheck(null)}>Cancel</Button>
      <Button onClick={handleConfirmedRun}>Proceed Anyway</Button>
    </>
  )

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className="flex shrink-0 items-center gap-1">
          {/* Save edits to the scenario */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="scenario-save-btn"
                className={cn(iconBtn, isDirty && !saving && 'text-primary')}
                disabled={!isDirty || saving}
                onClick={() => { void saveDetail() }}
              >
                {saving
                  ? <Loader2 className={cn(icon, 'animate-spin')} />
                  : <Save className={icon} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {saving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
            </TooltipContent>
          </Tooltip>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Kick off / kill the optimization run */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="scenario-run-btn"
                className={cn(iconBtn, isBusy && 'text-amber-500 hover:text-amber-600')}
                disabled={saving || isPublished}
                onClick={handleRun}
              >
                {running && !isRunning
                  ? <Loader2 className={cn(icon, 'animate-spin')} />
                  : isRunning
                  ? <Square className={icon} />
                  : <Play className={icon} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {running && !isRunning ? 'Starting…' : isRunning ? 'Kill run' : 'Kick off run'}
            </TooltipContent>
          </Tooltip>

          {/* Refresh status — only shown when scenario appears stuck in RUNNING (no active poll) */}
          {isRunning && !running && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="scenario-refresh-btn"
                  className={iconBtn}
                  onClick={() => { void refreshDetail(detail.id) }}
                >
                  <RefreshCw className={icon} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Refresh status
              </TooltipContent>
            </Tooltip>
          )}

          {/* Open the scenario in the Gantt view */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="scenario-open-btn"
                className={iconBtn}
                onClick={handleOpen}
              >
                <ExternalLink className={icon} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Open scenario
            </TooltipContent>
          </Tooltip>

          {/* Remove the optimization result (revert to draft) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="scenario-remove-result-btn"
                className={iconBtn}
                disabled={!hasResult || saving}
                onClick={() => {
                  setDeleteVersionFiles(false)
                  setRemoveConfirmOpen(true)
                }}
              >
                <Eraser className={icon} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Remove result
            </TooltipContent>
          </Tooltip>

          {canPublish && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="scenario-publish-btn"
                  className={cn(
                    iconBtn,
                    (isDone || isPublished) && !saving && 'text-amber-500 hover:text-amber-600',
                  )}
                  disabled={!(isDone || isPublished) || saving}
                  onClick={() => setPublishOpen(true)}
                >
                  <UploadCloud className={icon} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Import to Live Roster
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {/* Pre-run validation dialog */}
      <AppDialog
        open={runCheck !== null}
        onOpenChange={(open) => { if (!open) setRunCheck(null) }}
        title="Pre-run Check"
        icon={hasBlockers
          ? <XCircle className="h-4 w-4" />
          : <AlertTriangle className="h-4 w-4" />}
        data-testid="run-check-dialog"
        className="sm:max-w-[480px]"
        footer={runCheckFooter}
      >
        <div className="space-y-3 py-1">
          {hasBlockers && (
            <section className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                Must fix before running
              </p>
              <ul className="space-y-1 pl-5">
                {runCheck?.blockers.map((b) => (
                  <li key={b} className="text-xs text-destructive">{b}</li>
                ))}
              </ul>
            </section>
          )}

          {hasWarnings && (
            <section className="space-y-1.5">
              <p className={cn(
                'flex items-center gap-1.5 text-xs font-semibold',
                hasBlockers ? 'text-muted-foreground' : 'text-ring',
              )}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {hasBlockers ? 'Also noted' : 'Warnings — optimization may be broader than expected'}
              </p>
              <ul className="space-y-1 pl-5">
                {runCheck?.warnings.map((w) => (
                  <li key={w} className={cn('text-xs', hasBlockers ? 'text-muted-foreground' : 'text-ring')}>
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!hasBlockers && hasWarnings && (
            <p className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              All required fields are set. You can proceed with the warnings above.
            </p>
          )}
        </div>
      </AppDialog>

      {/* Unsaved changes — require saving before the optimisation starts */}
      <AppDialog
        open={saveRunOpen}
        onOpenChange={(open) => { if (!open) setSaveRunOpen(false) }}
        title="Unsaved changes"
        icon={<AlertTriangle className="h-4 w-4" />}
        description="You have unsaved changes to this scenario. Save before starting the optimisation?"
        dismissable={!saving}
        data-testid="save-run-dialog"
        className="sm:max-w-[420px]"
        footer={
          <>
            <Button variant="ghost" disabled={saving} onClick={() => setSaveRunOpen(false)}>
              Cancel
            </Button>
            <Button data-testid="save-run-confirm" disabled={saving} onClick={() => { void handleSaveAndRun() }}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save & Run
            </Button>
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          Saving first ensures the optimisation runs with the latest edits.
        </p>
      </AppDialog>

      {/* Remove result confirmation dialog */}
      <AppDialog
        open={removeConfirmOpen}
        onOpenChange={(open) => {
          setRemoveConfirmOpen(open)
          if (!open) setDeleteVersionFiles(false)
        }}
        title="Remove Optimization Result"
        icon={<Trash2 className="h-4 w-4" />}
        description="This will revert the scenario back to DRAFT and remove the current database optimization result. Archived version files are retained unless selected below."
        dismissable={!saving}
        data-testid="remove-result-dialog"
        className="sm:max-w-[420px]"
        footer={
          <>
            <Button variant="ghost" disabled={saving} onClick={() => setRemoveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                setRemoveConfirmOpen(false)
                void transitionStatus(detail.id, 'DRAFT', { deleteVersionFiles })
              }}
            >
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Remove Result
            </Button>
          </>
        }
      >
        <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={deleteVersionFiles}
            disabled={saving}
            onChange={(event) => setDeleteVersionFiles(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-destructive"
            data-testid="remove-result-delete-versions"
          />
          <span>
            <span className="block font-semibold">Delete all version files</span>
            <span className="mt-0.5 block text-2xs text-muted-foreground">
              Permanently remove every archived optimizer version for this Scenario.
            </span>
          </span>
        </label>
      </AppDialog>

      {/* Import to Live roster dialog */}
      {(isDone || isPublished) && (
        <PublishRosterDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          scenarioId={detail.id}
        />
      )}
    </>
  )
}
