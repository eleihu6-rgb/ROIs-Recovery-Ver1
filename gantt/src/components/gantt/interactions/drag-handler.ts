import { GHOST_ALPHA, ROW_HEIGHT, HEADER_HEIGHT } from '../gantt-constants'
import { isDragAllowed, yToRow } from '../gantt-utils'
import type { PaneType } from '@/types/pane'

/** Information about the drag source */
export interface DragSource {
  paneType: PaneType
  itemId: number
  /** Type of item being dragged */
  itemType: 'roster-task' | 'pairing' | 'flight'
  /** Source row identifier */
  sourceRowId: string | null
  /** Position where drag started (client coordinates) */
  startClientX: number
  startClientY: number
  /** Bounding rect of the source canvas */
  sourceCanvasRect: DOMRect
}

/** Information about the current drop target */
export interface DropTarget {
  paneType: PaneType
  rowIndex: number
  rowId: string | null
  canvasRect: DOMRect
}

/** Drag operation types resulting from source -> target combination */
export type DragOperation =
  | { type: 'move-task'; taskId: number; fromCrewId: string; toCrewId: string; sourcePaneType: PaneType }
  | { type: 'assign-pairing'; pairingId: number; toCrewId: string }
  | { type: 'assign-flight'; flightId: number; toCrewId: string }
  | { type: 'add-flight-to-pairing'; flightId: number; toPairingId: number }
  | null

/** Callbacks from the container-level drag handler */
export interface DragHandlerCallbacks {
  /** Called to execute the resulting drag operation */
  onDragComplete: (operation: DragOperation) => void
  /** Called when drag is cancelled (dropped in invalid zone) */
  onDragCancel: () => void
  /** Called to update which pane/row is the current drop target */
  onDropTargetChange: (paneType: PaneType | null, rowIndex: number) => void
}

/** Registration of a pane's canvas for cross-pane hit detection */
export interface PaneRegistration {
  paneType: PaneType
  getCanvasElement: () => HTMLCanvasElement | null
  getScrollY: () => number
  getRowCount: () => number
  getRowId: (rowIndex: number) => string | null
}

/**
 * Cross-Pane drag handler.
 * Manages the drag ghost element and determines which pane/row the
 * cursor is over during a drag operation.
 *
 * Drag matrix:
 * | Source        | Target            | Operation                          |
 * |---------------|-------------------|------------------------------------|
 * | Roster (any)  | Roster (any)      | move task to another Crew          |
 * | Pairing       | Roster (any)      | assign Pairing to Crew             |
 * | Flight        | Roster (any)      | assign Flight to Crew              |
 * | Flight        | Pairing           | add Flight to Pairing (build leg)  |
 */
export const createCrossPaneDragHandler = (callbacks: DragHandlerCallbacks) => {
  const registrations = new Map<PaneType, PaneRegistration>()
  let currentDrag: DragSource | null = null
  let ghostElement: HTMLDivElement | null = null

  /** Register a pane's canvas so it can be a drop target */
  const registerPane = (reg: PaneRegistration): void => {
    registrations.set(reg.paneType, reg)
  }

  /** Unregister a pane */
  const unregisterPane = (paneType: PaneType): void => {
    registrations.delete(paneType)
  }

  /** Start a drag operation from a specific pane */
  const startDrag = (source: DragSource): void => {
    currentDrag = source
    createGhost(source)

    // Bind document-level listeners for cross-pane tracking
    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)
  }

  /** Create the semi-transparent drag ghost element */
  const createGhost = (source: DragSource): void => {
    ghostElement = document.createElement('div')
    ghostElement.style.position = 'fixed'
    ghostElement.style.pointerEvents = 'none'
    ghostElement.style.zIndex = '9999'
    ghostElement.style.opacity = String(GHOST_ALPHA)
    ghostElement.style.padding = '4px 8px'
    ghostElement.style.borderRadius = '4px'
    ghostElement.style.fontSize = '11px'
    ghostElement.style.fontFamily = 'var(--font-sans)'
    ghostElement.style.color = '#ffffff'
    ghostElement.style.whiteSpace = 'nowrap'
    ghostElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)'

    // Style based on source type
    switch (source.itemType) {
      case 'roster-task':
        ghostElement.style.background = '#3b82f6'
        ghostElement.textContent = `Task #${source.itemId}`
        break
      case 'pairing':
        ghostElement.style.background = '#6366f1'
        ghostElement.textContent = `Pairing #${source.itemId}`
        break
      case 'flight':
        ghostElement.style.background = '#22c55e'
        ghostElement.textContent = `Flight #${source.itemId}`
        break
    }

    ghostElement.style.left = `${source.startClientX + 12}px`
    ghostElement.style.top = `${source.startClientY + 12}px`
    document.body.appendChild(ghostElement)
  }

  /** Find which pane + row the cursor is over */
  const hitTestPanes = (clientX: number, clientY: number): DropTarget | null => {
    for (const [paneType, reg] of registrations) {
      const canvas = reg.getCanvasElement()
      if (!canvas) continue

      const rect = canvas.getBoundingClientRect()
      if (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom
      ) {
        // Within this pane's canvas
        const localY = clientY - rect.top
        const scrollY = reg.getScrollY()
        const absoluteY = localY + scrollY
        const rowIndex = yToRow(absoluteY)
        const rowCount = reg.getRowCount()

        if (rowIndex >= 0 && rowIndex < rowCount) {
          return {
            paneType,
            rowIndex,
            rowId: reg.getRowId(rowIndex),
            canvasRect: rect,
          }
        }
      }
    }
    return null
  }

  const handleDocumentMouseMove = (e: MouseEvent): void => {
    if (!currentDrag) return

    // Move ghost
    if (ghostElement) {
      ghostElement.style.left = `${e.clientX + 12}px`
      ghostElement.style.top = `${e.clientY + 12}px`
    }

    // Determine drop target
    const target = hitTestPanes(e.clientX, e.clientY)
    if (target && isDragAllowed(currentDrag.paneType, target.paneType)) {
      callbacks.onDropTargetChange(target.paneType, target.rowIndex)

      // Update ghost to show target info
      if (ghostElement && target.rowId) {
        ghostElement.style.borderLeft = '3px solid #22c55e'
      }
    } else {
      callbacks.onDropTargetChange(null, -1)
      if (ghostElement) {
        ghostElement.style.borderLeft = 'none'
      }
    }
  }

  const handleDocumentMouseUp = (e: MouseEvent): void => {
    if (!currentDrag) {
      cleanup()
      return
    }

    const target = hitTestPanes(e.clientX, e.clientY)

    if (target && isDragAllowed(currentDrag.paneType, target.paneType) && target.rowId) {
      const operation = resolveDragOperation(currentDrag, target)
      callbacks.onDragComplete(operation)
    } else {
      callbacks.onDragCancel()
    }

    cleanup()
  }

  /** Determine the resulting operation from source + target */
  const resolveDragOperation = (source: DragSource, target: DropTarget): DragOperation => {
    const targetRowId = target.rowId
    if (!targetRowId) return null

    // Roster -> Roster: move task
    if (source.itemType === 'roster-task' && isRosterPaneType(target.paneType)) {
      if (source.sourceRowId === targetRowId) return null // same crew, no-op
      return {
        type: 'move-task',
        taskId: source.itemId,
        fromCrewId: source.sourceRowId ?? '',
        toCrewId: targetRowId,
        sourcePaneType: source.paneType,
      }
    }

    // Pairing -> Roster: assign pairing
    if (source.itemType === 'pairing' && isRosterPaneType(target.paneType)) {
      return {
        type: 'assign-pairing',
        pairingId: source.itemId,
        toCrewId: targetRowId,
      }
    }

    // Flight -> Roster: assign flight
    if (source.itemType === 'flight' && isRosterPaneType(target.paneType)) {
      return {
        type: 'assign-flight',
        flightId: source.itemId,
        toCrewId: targetRowId,
      }
    }

    // Flight -> Pairing: add flight to pairing
    if (source.itemType === 'flight' && target.paneType === 'pairing') {
      return {
        type: 'add-flight-to-pairing',
        flightId: source.itemId,
        toPairingId: parseInt(targetRowId, 10),
      }
    }

    return null
  }

  const cleanup = (): void => {
    currentDrag = null
    if (ghostElement) {
      document.body.removeChild(ghostElement)
      ghostElement = null
    }
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)
    callbacks.onDropTargetChange(null, -1)
  }

  /** Cancel any ongoing drag (e.g., on Escape) */
  const cancelDrag = (): void => {
    if (currentDrag) {
      callbacks.onDragCancel()
      cleanup()
    }
  }

  return {
    registerPane,
    unregisterPane,
    startDrag,
    cancelDrag,
    isDragging: () => currentDrag !== null,
  }
}

export type CrossPaneDragHandler = ReturnType<typeof createCrossPaneDragHandler>

const isRosterPaneType = (paneType: PaneType): boolean =>
  paneType.startsWith('roster') || paneType === 'scenario-roster'
