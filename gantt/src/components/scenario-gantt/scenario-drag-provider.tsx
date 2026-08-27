// gantt/src/components/scenario-gantt/scenario-drag-provider.tsx
import { useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { DragProvider } from '@/components/gantt/drag-context'
import { createCrossPaneDragHandler } from '@/components/gantt/interactions/drag-handler'
import type { DragHandlerCallbacks, DragOperation } from '@/components/gantt/interactions/drag-handler'
import { useScenarioGanttSource } from '@/components/gantt/source/scenario-gantt-source'

interface ScenarioDragProviderProps {
  scenarioId: number
  children: ReactNode
}

/**
 * Scenario-scoped cross-pane drag provider. Mirrors Live's app-layout DragProvider but maps
 * the resulting DragOperation onto the SCENARIO edit controller (source.edit.execute), which
 * pushes an optimistic AssignmentPatch into the per-scenario gantt store. Capability + lock
 * gating live inside edit.execute, so this layer only translates the source→target combo:
 *
 *   - assign-pairing {pairingId, toCrewId}            → roster-assign   (pairing pane → roster row)
 *   - move-task      {taskId, fromCrewId, toCrewId}   → roster-reassign (roster row → roster row)
 *
 * The taskId → pairingId resolution for reassign uses the source-row's pairing: a roster-task
 * drag carries the dragged item id, but the patch pipeline keys on (crewId, pairingId), so we
 * look the pairingId up via the registered resolver. Flight ops and pairing-segment ops are
 * out of RO roster scope and ignored.
 */
export const ScenarioDragProvider = ({ scenarioId, children }: ScenarioDragProviderProps) => {
  const source = useScenarioGanttSource(scenarioId)
  const handlerRef = useRef<ReturnType<typeof createCrossPaneDragHandler> | null>(null)
  // Resolver registered by the roster pane: taskId → its pairingId (for reassign).
  const taskPairingResolverRef = useRef<((taskId: number) => number | null) | null>(null)
  // Handler is created once; always dispatch through the latest execute closure.
  const executeRef = useRef<(operation: DragOperation) => void>(() => {})

  const executeDragOperation = useCallback((operation: DragOperation) => {
    if (!operation) return
    const edit = source.edit
    if (!edit) return
    switch (operation.type) {
      case 'assign-pairing':
        void edit.execute({ type: 'roster-assign', pairingId: operation.pairingId, toCrewId: operation.toCrewId })
        break
      case 'move-task': {
        const pairingId = taskPairingResolverRef.current?.(operation.taskId) ?? null
        if (pairingId == null) return // ground tasks (no pairing) can't be reassigned via patch
        void edit.execute({
          type: 'roster-reassign',
          pairingId,
          fromCrewId: operation.fromCrewId,
          toCrewId: operation.toCrewId,
        })
        break
      }
      // assign-flight / add-flight-to-pairing: out of RO roster scope.
      default:
        break
    }
  }, [source])
  executeRef.current = executeDragOperation

  if (!handlerRef.current) {
    const callbacks: DragHandlerCallbacks = {
      onDragComplete: (operation) => executeRef.current(operation),
      onDragCancel: () => { /* no drop-target highlight state in scenario panes (P3) */ },
      onDropTargetChange: () => { /* no drop-target highlight state in scenario panes (P3) */ },
    }
    handlerRef.current = createCrossPaneDragHandler(callbacks)
  }

  // Expose the pairing resolver registration on the handler instance so the roster pane can
  // wire it without threading another context. (Attached as a non-enumerable extension.)
  ;(handlerRef.current as ScenarioDragHandler).registerTaskPairingResolver = (fn) => {
    taskPairingResolverRef.current = fn
  }

  return <DragProvider value={handlerRef.current}>{children}</DragProvider>
}

/** Cross-pane handler augmented with the scenario task→pairing resolver registration. */
export type ScenarioDragHandler = ReturnType<typeof createCrossPaneDragHandler> & {
  registerTaskPairingResolver?: (fn: (taskId: number) => number | null) => void
}
