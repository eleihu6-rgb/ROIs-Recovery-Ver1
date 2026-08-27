import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LayoutGrid } from './layout-grid'
import { StatusBar } from './status-bar'
import { HorizontalScrollbar } from './horizontal-scrollbar'
import { FloatingPane } from './floating-pane'
import { TaskDetailDialog } from '@/components/roster/task-detail-dialog'
import { AddTaskDialog } from '@/components/roster/add-task-dialog'
import { MemoDialog } from '@/components/memo/memo-dialog'
import { SwapDialog } from '@/components/roster/swap-dialog'
import { DutyNodeDialog } from '@/components/pairing/duty-node-dialog'
import { ContextMenu } from '@/components/roster/context-menu'
import { ViolationTooltip } from '@/components/gantt/violation-tooltip'
import { KeyboardShortcutsDialog } from '@/components/common/keyboard-shortcuts-dialog'
import { AddPaneMenu } from './add-pane-menu'
import { ResPairingPlannerDialog } from '@/components/res-pairing/res-pairing-planner-dialog'
import { useResPlannerStore } from '@/stores/res-planner-store'
import { RosterPane } from '@/components/panes/roster-pane'
import { PairingPane } from '@/components/panes/pairing-pane'
import { FlightPane } from '@/components/panes/flight-pane'
import { DragProvider } from '@/components/gantt/drag-context'
import { GanttContextProvider } from '@/components/gantt/context/gantt-context'
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { useLiveGanttSource } from '@/components/gantt/source/live-gantt-source'
import { createCrossPaneDragHandler } from '@/components/gantt/interactions/drag-handler'
import type { DragOperation, DragHandlerCallbacks } from '@/components/gantt/interactions/drag-handler'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewport } from '@/hooks/use-gantt-viewport'
import { useKeyboard } from '@/hooks/use-keyboard'
import { useRuleCheck } from '@/hooks/use-rule-check'
import { usePersistedViolations } from '@/hooks/use-persisted-violations'
import { useLockStore } from '@/stores/lock-store'
import { useDraftStore } from '@/stores/draft-store'
import { usePaneStore } from '@/stores/pane-store'
import { useFilterStore } from '@/stores/filter-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { checkLiveDraftLegality, useRosterStore } from '@/stores/roster-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useCrewStore } from '@/stores/crew-store'
import { useRankActingStore } from '@/stores/rank-acting-store'
import { useAuthStore } from '@/stores/auth-store'
import { validateAssignment } from '@rois/shared-rules'
import { rosterApi } from '@/services/roster-api'
import { notify } from '@/utils/notify'
import type { PaneType } from '@/types/pane'
import type { RosterItem } from '@/types'
import { isDeadheadSegAssignment } from '@/utils/puck-duty-color'
import { differenceInHours } from 'date-fns'

/** Render the appropriate pane component for a given pane type (used by FloatingPaneLayer) */
const renderPaneContent = (type: PaneType) => {
  switch (type) {
    case 'roster-main': return <RosterPane paneId="roster-main" />
    case 'roster-sub':  return <RosterPane paneId="roster-sub" />
    case 'pairing':     return <PairingPane paneId="pairing" />
    case 'flight':      return <FlightPane paneId="flight" />
  }
}

/**
 * Persistent result banner shown after RES pairings are generated.
 * Rendered OUTSIDE the dialog (in AppLayout) so it survives dialog close.
 * Dismissible via the × button. Shows created count and call codes.
 */
const ResGenerateBanner = () => {
  const lastResult = useResPlannerStore((s) => s.lastResult)
  const setLastResult = useResPlannerStore((s) => s.setLastResult)
  if (!lastResult) return null
  return (
    <div
      data-testid="res-generate-result"
      className="fixed bottom-8 right-4 z-50 flex items-center gap-3 rounded-md border border-border bg-background px-4 py-2.5 text-sm shadow-lg"
    >
      <span className="font-medium text-foreground">
        {lastResult.created + lastResult.skipped} RES pairings ready
        {lastResult.created > 0 && ` (${lastResult.created} new)`}
      </span>
      {lastResult.codes.length > 0 && (
        <span className="text-xs text-muted-foreground">
          ({lastResult.codes.join(', ')})
        </span>
      )}
      <button
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        onClick={() => setLastResult(null)}
        title="Dismiss"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

/** Renders all currently-floating panes as fixed overlays via a portal */
const FloatingPaneLayer = () => {
  const panes = usePaneStore((s) => s.panes)
  const floating = panes.filter((p) => p.visible && p.floating)
  if (floating.length === 0) return null

  return createPortal(
    <>
      {floating.map((config) => (
        <FloatingPane key={config.type} config={config}>
          {renderPaneContent(config.type)}
        </FloatingPane>
      ))}
    </>,
    document.body,
  )
}

export const AppLayout = () => {
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen)
  const closeShortcuts = useUiStore((s) => s.closeShortcuts)
  const setDropTargetRow = usePaneStore((s) => s.setDropTargetRow)
  const moveTask = useRosterStore((s) => s.moveTask)
  const markDirty = useGanttViewStore((s) => s.markDirty)

  // Initialize viewport data fetching
  useGanttViewport()

  // Bind keyboard shortcuts (including Ctrl+Z / Ctrl+Shift+Z for undo/redo)
  useKeyboard()

  // Watch roster changes and trigger rule checks
  useRuleCheck()

  // Fetch persisted violations from rule_violation table; refreshes on violations:updated WS event
  usePersistedViolations()

  // Initialize WebSocket + lock sync
  const initLocks = useLockStore((s) => s.init)
  const cleanupLocks = useLockStore((s) => s.cleanup)
  useEffect(() => {
    initLocks()
    return () => cleanupLocks()
  }, [initLocks, cleanupLocks])

  // ── Cross-pane drag handler (stable ref) ──
  const dragHandlerRef = useRef<ReturnType<typeof createCrossPaneDragHandler> | null>(null)

  const clearAllDropTargets = () => {
    const allTypes: PaneType[] = ['roster-main', 'roster-sub', 'pairing', 'flight']
    for (const pt of allTypes) {
      usePaneStore.getState().setDropTargetRow(pt, -1)
    }
    useGanttViewStore.getState().markDirty()
  }

  const executeDragOperation = async (operation: DragOperation) => {
    clearAllDropTargets()
    if (!operation) return

    switch (operation.type) {
      case 'move-task': {
        const pane = operation.sourcePaneType === 'roster-sub' ? 'sub' as const : 'main' as const
        await moveTask(pane, operation.taskId, operation.toCrewId)
        break
      }
      case 'assign-pairing': {
        const pairingItem = usePairingStore.getState().items.find((i) => i.pairing.id === operation.pairingId)
        if (!pairingItem) {
          notify.error('Pairing data not found locally. Try refreshing.')
          break
        }

        const pairing = pairingItem.pairing
        const toCrewId = operation.toCrewId

        // Resolve the crew's acting rank for this pairing assignment.
        // Fall back through ranks?.[0]?.rank so slim crews (panelRank=undefined) and
        // history-less crews still produce a usable starting rank before validateAssignment.
        const crewEntry = useCrewStore.getState().items.find((c) => c.crew.crewId === toCrewId)
        const initialActingRank = crewEntry?.crew.panelRank ?? crewEntry?.crew.ranks?.[0]?.rank ?? ''

        // Pre-check: division / open position / rank_acting must all pass before
        // we build placeholders or queue a draft op. Defense-in-depth: the same
        // check runs server-side; failing here saves a round-trip + avoids a
        // rollback when the save legality dialog appears. Critically, it also
        // resolves the EXACT slot rank (after rank_acting downgrade) — without
        // this, refreshDraftCoverage would key the placeholder to a rank that
        // doesn't match any composition slot and the fill would not bump.
        let resolvedActingRank = initialActingRank
        if (crewEntry) {
          const schema = useAuthStore.getState().user?.schema ?? ''
          const rankActingMap = useRankActingStore.getState().getForFiliale(schema)
          const precheck = validateAssignment(
            {
              id: toCrewId,
              division: crewEntry.crew.division,
              rank: initialActingRank,
            },
            {
              id: pairing.id,
              division: pairing.division,
              composition: pairing.composition.map((c) => ({
                actingRank: c.rank,
                plan: c.plan,
                fill: c.fill,
              })),
            },
            rankActingMap,
          )
          if (!precheck.ok) {
            notify.error(precheck.message)
            break
          }
          resolvedActingRank = precheck.actingRank
        }
        const rosterActingRank = resolvedActingRank

        // Build placeholder RosterItems for immediate visual feedback
        // Use segment's fltNum + airports for label (same format as backend assignPairing)
        let tempId = -Date.now()
        const placeholders: RosterItem[] = pairingItem.segments.length > 0
          ? pairingItem.segments.map((seg) => ({
              id: tempId--,
              crewId: toCrewId,
              pairingId: pairing.id,
              ver: 0,
              base: pairing.base,
              label: `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`,
              assignmentGroup: isDeadheadSegAssignment(seg.segAssignment)
                ? 'DHD'
                : pairing.assignmentGroup,
              assignment: pairing.assignment,
              segAssignment: seg.segAssignment,
              role: null, subRole: null, source: null,
              isRequested: 0, isSwapped: 0, preference: null,
              comments: null, score: null, workingHour: null,
              schStrDtUtc: seg.schStrDtUtc, schEndDtUtc: seg.schEndDtUtc,
              actStrDtUtc: null, actEndDtUtc: null,
              fltId: seg.fltId, fltDt: null,
              dutySeq: seg.dutySeq, segSeq: seg.segSeq,
              division: pairing.division,
              flightActingRank: rosterActingRank, rosterActingRank, activeRank: null, position: null,
              schCreditedMinutes: null, actCreditedMinutes: null,
              // Carry per-duty credit so the optimistic MCred delta counts an added pairing
              // (deduped by (pairingId,dutySeq) in sumCrewCreditMinutes).
              dutyActCreditedMinutes: seg.dutyActCreditedMinutes ?? null,
              tagSet: null, exceptionCode: null,
              // Flight task rest: from pairing_segment.duty_act_rest_min
              actRestMin: seg.dutyActRestMin ?? null,
              ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
              pickupStartUtc: seg.pickupStartUtc, pickupEndUtc: seg.pickupEndUtc,
              briefStartUtc: seg.briefStartUtc, briefEndUtc: seg.briefEndUtc,
              debriefStartUtc: seg.debriefStartUtc, debriefEndUtc: seg.debriefEndUtc,
              dropoffStartUtc: seg.dropoffStartUtc, dropoffEndUtc: seg.dropoffEndUtc,
            }))
          : [{
              id: tempId--,
              crewId: toCrewId,
              pairingId: pairing.id,
              ver: 0,
              base: pairing.base,
              label: pairing.pairingLabel,
              assignmentGroup: pairing.assignmentGroup,
              assignment: pairing.assignment,
              role: null, subRole: null, source: null,
              isRequested: 0, isSwapped: 0, preference: null,
              comments: null, score: null, workingHour: null,
              schStrDtUtc: pairing.schStrDtUtc, schEndDtUtc: pairing.schEndDtUtc,
              actStrDtUtc: null, actEndDtUtc: null,
              fltId: null, fltDt: null,
              dutySeq: null, segSeq: null,
              division: pairing.division,
              flightActingRank: rosterActingRank, rosterActingRank, activeRank: null, position: null,
              schCreditedMinutes: null, actCreditedMinutes: null,
              tagSet: null, exceptionCode: null,
              actRestMin: null,
              ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
            }]

        const draft = useDraftStore.getState()
        const beforeItems = useRosterStore.getState().main.rosterItems
        // Lock the toolbar BEFORE the optimistic addOp so undo/save stay disabled
        // through the 1-2s legality check. Same pattern as moveTask: the check
        // runs AFTER addOp here, so showConfirmDialog's own setChecking wouldn't
        // cover the gap between drop and the first network call.
        useRuleCheckStore.getState().setChecking(true)
        const opId = draft.addOp(
          { type: 'assign-pairing', pairingId: pairing.id, crewId: toCrewId, rosterActingRank, tasks: placeholders as unknown as Record<string, unknown>[] },
          [toCrewId],
          [pairing.id],
        )

        // Optimistic apply: show the placeholder tasks on the roster immediately — the drop
        // must not wait 2-3s for the Rust legality preview.
        const base = useRosterStore.getState().main.baseItems
        const displayed = draft.applyDraftOps(base)
        useRosterStore.setState((s) => ({ main: { ...s.main, rosterItems: displayed } }))
        usePairingStore.getState().refreshDraftCoverage(base, displayed)
        markDirty()

        // Lock is best-effort (non-blocking); the legality preview runs in the background.
        void useLockStore.getState().acquireLock(toCrewId, [pairing.id]).catch(() => {})
        const allowed = await checkLiveDraftLegality(
          [toCrewId],
          beforeItems,
          displayed,
          { relatedItems: placeholders, relatedPairingIds: [pairing.id] },
        )
        if (!allowed) {
          // Roll the optimistic assignment back.
          useDraftStore.getState().removeOp(opId)
          const reverted = draft.applyDraftOps(base)
          useRosterStore.setState((s) => ({ main: { ...s.main, rosterItems: reverted } }))
          usePairingStore.getState().refreshDraftCoverage(base, reverted)
          markDirty()
          notify.warning('Assignment reverted — legality check did not approve')
          // If the confirm dialog is open, it owns `checking`; otherwise release
          // the lock ourselves (no dialog path — e.g. check threw).
          if (!useRuleCheckStore.getState().confirmDialog.open) {
            useRuleCheckStore.getState().setChecking(false)
          }
          break
        }
        // Check passed (or user confirmed via dialog) — release the toolbar lock.
        useRuleCheckStore.getState().setChecking(false)

        break
      }
      case 'assign-flight':
        try {
          const created = await rosterApi.assignFlight({
            flightId: operation.flightId,
            crewId: operation.toCrewId,
          })
          useRosterStore.getState().patchItems('main', [created])
          markDirty()

          const ruleStore = useRuleCheckStore.getState()
          const allItems = useRosterStore.getState().main.rosterItems
          const preResult = await ruleStore.preCheck([operation.toCrewId], allItems)
          if (preResult.violations.length > 0) {
            await ruleStore.showConfirmDialog(preResult.violations, preResult.hasBlocking)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          notify.error(`Assign flight failed: ${msg}`)
        }
        break
      case 'add-flight-to-pairing': {
        // Flight → Pairing: add flight as new segment (draft mode)
        const draft = useDraftStore.getState()
        draft.addOp(
          { type: 'add-flight-to-pairing', pairingId: operation.toPairingId, flightId: operation.flightId },
          [],
          [operation.toPairingId],
        )
        notify.info(`Flight #${operation.flightId} will be added to Pairing #${operation.toPairingId} on Save`)
        break
      }
    }
  }

  if (!dragHandlerRef.current) {
    const callbacks: DragHandlerCallbacks = {
      onDragComplete: (operation) => {
        executeDragOperation(operation)
      },
      onDragCancel: () => {
        clearAllDropTargets()
      },
      onDropTargetChange: (paneType, rowIndex) => {
        clearAllDropTargets()
        if (paneType) {
          setDropTargetRow(paneType, rowIndex)
          markDirty()
        }
      },
    }
    dragHandlerRef.current = createCrossPaneDragHandler(callbacks)
  }

  // Escape key cancels drag
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragHandlerRef.current?.cancelDrag()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Warn on page close with unsaved draft
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useDraftStore.getState().active && useDraftStore.getState().operations.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const liveSource = useLiveGanttSource()
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const dateRange = useFilterStore((s) => s.dateRange)
  const setZoomBounds = useGanttViewStore((s) => s.setZoomBounds)
  const measuredViewportWidth = useGanttViewStore((s) => s.viewportWidth)

  // Update zoom bounds when viewport or date range changes
  useEffect(() => {
    const splitterWidth = 2
    const updateBounds = () => {
      // Prefer the measured timeline width (excludes the left rail + scrollbar);
      // the window-innerWidth estimate over-counts chrome and makes "full range
      // fits" too wide, clipping the range's tail days.
      const viewportWidth = measuredViewportWidth > 0
        ? measuredViewportWidth
        : window.innerWidth - leftPanelWidth - splitterWidth
      const totalHours = Math.max(1, differenceInHours(dateRange.end, dateRange.start))
      const min = viewportWidth / totalHours  // full range fits
      const max = viewportWidth              // 1 hour fits (absolute ceiling)
      setZoomBounds(min, max)
    }
    updateBounds()
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [leftPanelWidth, dateRange, setZoomBounds, measuredViewportWidth])

  return (
    <DragProvider value={dragHandlerRef.current}>
      <GanttContextProvider contextId="live">
      <GanttSourceProvider value={liveSource}>
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">

        {/* Multi-pane container: Roster Main/Sub, Pairing, Flight */}
        <LayoutGrid />

      {/* Global horizontal scrollbar */}
      <HorizontalScrollbar />

      {/* Bottom status bar */}
      <StatusBar />

      {/* Dialogs (Live-only). FlightDetailDialog + PairingInfoDialog + FlightNaviDialog +
          GroundTaskDialog are shared (Live + Scenario) and hoisted to app-shell root to
          avoid keep-alive double-mount. */}
      <TaskDetailDialog />
      <AddTaskDialog />
      <SwapDialog />
      <DutyNodeDialog />
      <MemoDialog />

      {/* Context Menu */}
      <ContextMenu />

      {/* Violation tooltip on hover */}
      <ViolationTooltip />

      {/* RuleConfirmDialog is hoisted to AppShell (shared Live + Scenario). */}

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />

      {/* Add pane menu */}
      <AddPaneMenu />

      {/* Floating panes (detached from stack) */}
      <FloatingPaneLayer />

      {/* RES Pairing Planner (Live-only; mounted once here, opened via useResPlannerStore) */}
      <ResPairingPlannerDialog />

      {/* RES generate result banner — persists after the dialog closes */}
      <ResGenerateBanner />
      </div>
      </GanttSourceProvider>
      </GanttContextProvider>
    </DragProvider>
  )
}
