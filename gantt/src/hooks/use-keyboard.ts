import { useEffect } from 'react'
import { useGanttContextId } from '@/components/gantt/context/gantt-context'
import type { GanttContextId } from '@/types/gantt-context'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useUiStore } from '@/stores/ui-store'
import { useFlightStore } from '@/stores/flight-store'
import { useDraftStore } from '@/stores/draft-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { buildScenarioRosterRemovePatch } from '@/utils/scenario-roster-edit'
import { notify } from '@/utils/notify'
import { saveDraft } from '@/utils/save-draft'
import { clearAllGanttSelections } from '@/utils/clear-gantt-selections'
import { deleteSelectedGanttItems } from '@/utils/delete-gantt-selection'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'

/**
 * Hook that binds global keyboard shortcuts for the Gantt chart.
 */
export const useKeyboard = (contextIdOverride?: GanttContextId, enabled = true) => {
  const contextId = contextIdOverride ?? useGanttContextId()
  const zoomIn = useGanttViewStore((s) => s.zoomIn)
  const zoomOut = useGanttViewStore((s) => s.zoomOut)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const undoOp = useDraftStore((s) => s.undoOp)
  const redoOp = useDraftStore((s) => s.redoOp)
  const scenarioId = typeof contextId === 'number' ? contextId : null
  // NOTE: do NOT read `checking` here via Zustand subscription — the keydown
  // effect below is re-registered only when [enabled, zoomIn, zoomOut, ...]
  // changes, so a closure-captured `liveChecking` would be stale at keydown
  // time. Read the live value inside the handler via getState() instead.

  const deleteScenarioSelection = () => {
    if (scenarioId == null) return
    const scenarioStore = getScenarioGanttStore(scenarioId)
    const scenarioState = scenarioStore.getState()
    const data = scenarioState.data
    if (
      !data ||
      !scenarioState.lockStatus?.isOwner ||
      !data.capabilities.roster.canRemove
    ) return

    const selectedTaskIds = getScenarioRosterSelectionStore(scenarioId).getState().selectedTaskIds
    if (selectedTaskIds.size === 0) return

    const { items } = buildScenarioRosterItems({
      crew: data.crew,
      pairingMap: new Map(data.pairings.map((pairing) => [pairing.pairingId, pairing])),
      assignments: data.assignments,
      pairingSegments: data.pairingSegments,
      groundItems: data.groundItems,
      pendingChanges: scenarioState.pendingChanges,
    })
    const selectedItems = items.filter((item) => selectedTaskIds.has(item.id))
    const patches = new Map<string, ReturnType<typeof buildScenarioRosterRemovePatch>>()
    for (const item of selectedItems) {
      const patch = buildScenarioRosterRemovePatch(item)
      if (!patch) continue
      const key = patch.pairingId != null
        ? `pairing:${patch.crewId}:${patch.pairingId}`
        : `ground:${patch.crewId}:${patch.startDtUtc}:${patch.endDtUtc}:${patch.assignmentGroup}:${patch.assignment}`
      patches.set(key, patch)
    }
    for (const patch of patches.values()) {
      if (patch) scenarioState.addPatch(patch)
    }
    if (patches.size > 0) {
      getScenarioRosterSelectionStore(scenarioId).getState().clear()
    }
  }

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Save: Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const checking = useRuleCheckStore.getState().checking
        if (checking || (scenarioId != null && getScenarioViolationStore(scenarioId).getState().checking)) return
        if (scenarioId != null) {
          void getScenarioGanttStore(scenarioId).getState().save(scenarioId)
          return
        }
        saveDraft()
        return
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (scenarioId != null) {
          if (getScenarioViolationStore(scenarioId).getState().checking) return
          getScenarioGanttStore(scenarioId).getState().undo()
          return
        }
        const { operations } = useDraftStore.getState()
        if (useRuleCheckStore.getState().checking) return
        if (operations.length > 0) undoOp()
        return
      }

      // Create Pairing from selected flights: Ctrl+Q
      if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
        if (scenarioId != null) return
        e.preventDefault()
        const selected = useGanttViewStore.getState().selectedTaskIds
        if (selected.size === 0) return
        // Check if any selected IDs are flights
        const flightItems = useFlightStore.getState().items
        const allFlightIds = new Set<number>()
        for (const row of flightItems) {
          for (const flt of row.flights) allFlightIds.add(flt.id)
        }
        const flightIds = [...selected].filter((id) => allFlightIds.has(id))
        if (flightIds.length === 0) {
          notify.warning('Select flights first (Ctrl+Click in Flight Pane)')
          return
        }
        useDraftStore.getState().addOp(
          { type: 'create-pairing-from-flights', flightIds },
          [], [],
        )
        notify.info(`Pairing from ${flightIds.length} flight(s) will be created on Save`)
        useGanttViewStore.getState().clearSelection()
        return
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault()
        if (scenarioId != null) {
          if (getScenarioViolationStore(scenarioId).getState().checking) return
          getScenarioGanttStore(scenarioId).getState().redo()
          return
        }
        const { redoStack } = useDraftStore.getState()
        if (useRuleCheckStore.getState().checking) return
        if (redoStack.length > 0) redoOp()
        return
      }

      switch (e.key) {
        case 'Escape':
          clearAllGanttSelections()
          closeContextMenu()
          break

        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (scenarioId != null) {
              getScenarioGanttStore(scenarioId).getState().zoomIn(Math.max(100, window.innerWidth))
              break
            }
            zoomIn()
          }
          break

        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (scenarioId != null) {
              getScenarioGanttStore(scenarioId).getState().zoomOut(Math.max(100, window.innerWidth))
              break
            }
            zoomOut()
          }
          break

        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          if (scenarioId != null) {
            deleteScenarioSelection()
            break
          }
          void deleteSelectedGanttItems()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, zoomIn, zoomOut, closeContextMenu, undoOp, redoOp, scenarioId])
}
