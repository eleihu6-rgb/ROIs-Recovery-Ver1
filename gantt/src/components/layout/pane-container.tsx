import { useCallback, useEffect, useRef } from 'react'
import { RosterPane } from '@/components/panes/roster-pane'
import { PairingPane } from '@/components/panes/pairing-pane'
import { FlightPane } from '@/components/panes/flight-pane'
import { PaneSplitter } from './pane-splitter'
import { DragProvider } from '@/components/gantt/drag-context'
import { createCrossPaneDragHandler } from '@/components/gantt/interactions/drag-handler'
import type { DragOperation, DragHandlerCallbacks } from '@/components/gantt/interactions/drag-handler'
import { usePaneStore } from '@/stores/pane-store'
import { checkLiveDraftLegality, useRosterStore } from '@/stores/roster-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useDraftStore } from '@/stores/draft-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useLockStore } from '@/stores/lock-store'
import { useCrewStore } from '@/stores/crew-store'
import { useRankActingStore } from '@/stores/rank-acting-store'
import { useAuthStore } from '@/stores/auth-store'
import { rosterApi } from '@/services/roster-api'
import { notify } from '@/utils/notify'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import type { PaneType, PaneConfig } from '@/types/pane'
import type { RosterItem } from '@/types'
import { isDeadheadSegAssignment } from '@/utils/puck-duty-color'
import { validateAssignment } from '@rois/shared-rules'

/**
 * Container that manages multiple panes stacked vertically.
 * Also owns the cross-pane drag handler and executes drag operations.
 */
export const PaneContainer = () => {
  const panes = usePaneStore((s) => s.panes)
  const resizePane = usePaneStore((s) => s.resizePane)
  const setDropTargetRow = usePaneStore((s) => s.setDropTargetRow)
  const moveTask = useRosterStore((s) => s.moveTask)
  const markDirty = useGanttViewStore((s) => s.markDirty)

  const visiblePanes = getVisiblePaneOrder(panes)

  // ── Cross-pane drag handler (stable ref) ──
  const dragHandlerRef = useRef<ReturnType<typeof createCrossPaneDragHandler> | null>(null)

  if (!dragHandlerRef.current) {
    const callbacks: DragHandlerCallbacks = {
      onDragComplete: (operation) => {
        executeDragOperation(operation)
      },
      onDragCancel: () => {
        // Clear all drop target highlights
        clearAllDropTargets()
      },
      onDropTargetChange: (paneType, rowIndex) => {
        // Clear old highlights, set new one
        clearAllDropTargets()
        if (paneType) {
          setDropTargetRow(paneType, rowIndex)
          markDirty()
        }
      },
    }
    dragHandlerRef.current = createCrossPaneDragHandler(callbacks)
  }

  const clearAllDropTargets = useCallback(() => {
    const allTypes: PaneType[] = ['roster-main', 'roster-sub', 'pairing', 'flight']
    for (const pt of allTypes) {
      usePaneStore.getState().setDropTargetRow(pt, -1)
    }
    useGanttViewStore.getState().markDirty()
  }, [])

  /** Execute the drag operation result */
  const executeDragOperation = useCallback(async (operation: DragOperation) => {
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

        // Resolve the crew's acting rank for this pairing assignment
        const crewEntry = useCrewStore.getState().items.find((c) => c.crew.crewId === toCrewId)
        const initialActingRank = crewEntry?.crew.panelRank ?? ''

        // Pre-check: division / open position / rank_acting must all pass before
        // we build placeholders or queue a draft op. Defense-in-depth: the same
        // check runs server-side; failing here saves a round-trip + avoids a
        // rollback when the save legality dialog appears.
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
        const currentItems = useRosterStore.getState().main.rosterItems
        const allowed = await checkLiveDraftLegality(
          [toCrewId],
          currentItems,
          [...currentItems, ...placeholders],
          { relatedItems: placeholders, relatedPairingIds: [pairing.id] },
        )
        if (!allowed) break
        await useLockStore.getState().acquireLock(toCrewId, [pairing.id]).catch(() => {})
        draft.addOp(
          { type: 'assign-pairing', pairingId: pairing.id, crewId: toCrewId, rosterActingRank, tasks: placeholders as unknown as Record<string, unknown>[] },
          [toCrewId],
          [pairing.id],
        )

        // Update roster display via draft ops
        const base = useRosterStore.getState().main.baseItems
        const displayed = draft.applyDraftOps(base)
        useRosterStore.setState((s) => ({ main: { ...s.main, rosterItems: displayed } }))
        markDirty()

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
  }, [moveTask, clearAllDropTargets])

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

  const handleSplitterDrag = useCallback((upperPaneType: PaneType, _lowerPaneType: PaneType, deltaY: number) => {
    const currentPanes = usePaneStore.getState().panes
    const upperConfig = currentPanes.find((p) => p.type === upperPaneType)
    if (upperConfig) {
      resizePane(upperPaneType, upperConfig.height + deltaY)
    }
  }, [resizePane])

  return (
    <DragProvider value={dragHandlerRef.current}>
      <div className="flex flex-1 flex-col overflow-hidden">
        {visiblePanes.map((config, index) => {
          const isLast = index === visiblePanes.length - 1
          return (
            // Fragment so PaneSplitter is a sibling of the pane div, not inside it
            <div key={config.type} className="contents">
              {index > 0 && (
                <PaneSplitter
                  onDrag={(deltaY) => {
                    const upperPane = visiblePanes[index - 1]
                    handleSplitterDrag(upperPane.type, config.type, deltaY)
                  }}
                />
              )}
              <div
                className="flex flex-col overflow-hidden"
                style={
                  isLast
                    ? { flex: 1, minHeight: config.minHeight }
                    : { height: config.height, flexShrink: 0, minHeight: config.minHeight }
                }
              >
                {renderPane(config.type)}
              </div>
            </div>
          )
        })}
      </div>
    </DragProvider>
  )
}

const getVisiblePaneOrder = (configs: PaneConfig[]): PaneConfig[] => {
  const order: PaneType[] = ['roster-main', 'roster-sub', 'pairing', 'flight']
  return order
    .map((type) => configs.find((c) => c.type === type))
    .filter((c): c is PaneConfig => c !== undefined && c.visible && !c.floating)
}

const renderPane = (type: PaneType): React.ReactNode => {
  switch (type) {
    case 'roster-main':
      return <RosterPane paneId="roster-main" />
    case 'roster-sub':
      return <RosterPane paneId="roster-sub" />
    case 'pairing':
      return <PairingPane paneId="pairing-1" />
    case 'flight':
      return <FlightPane paneId="flight-1" />
    default:
      return null
  }
}
