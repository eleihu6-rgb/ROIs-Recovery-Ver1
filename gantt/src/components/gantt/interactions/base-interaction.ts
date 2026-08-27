import { HEADER_HEIGHT, DOUBLE_CLICK_TIMEOUT, DRAG_THRESHOLD } from '../gantt-constants'
import type { PaneType } from '@/types/pane'

/** Generic item that can be clicked/hovered in any pane */
export interface HitTestResult {
  /** The type of item hit */
  type: 'roster-task' | 'pairing' | 'flight' | 'background'
  /** The item ID (taskId, pairingId, flightId, segmentId) */
  itemId: number | null
  /** The row index in the pane */
  rowIndex: number
  /** The row identifier (crewId, pairingId, registration, etc.) */
  rowId: string | null
  /** For pairing segment hits: the parent pairing ID */
  pairingId?: number
  /** For pairing segment hits: the segment ID */
  segmentId?: number
}

/** Rubber-band rectangle in canvas-local coordinates */
export interface RubberBandRect {
  x: number
  y: number
  w: number
  h: number
}

/** Callbacks that pane-specific interaction consumers must provide */
export interface PaneInteractionCallbacks {
  onItemClick: (hit: HitTestResult, ctrlKey: boolean) => void
  onItemDoubleClick: (hit: HitTestResult) => void
  onItemRightClick: (hit: HitTestResult, clientX: number, clientY: number) => void
  onItemHover: (hit: HitTestResult | null, clientX: number, clientY: number) => void
  onDragStart: (hit: HitTestResult, clientX: number, clientY: number) => void
  onDragMove: (clientX: number, clientY: number) => void
  onDragEnd: (clientX: number, clientY: number) => void
  onBackgroundClick: () => void
  onScroll: (dx: number, dy: number) => void
  onZoom: (direction: 'in' | 'out') => void
  /** Called while rubber-band is being drawn (null = cleared) */
  onRubberBandChange?: (rect: RubberBandRect | null) => void
  /** Called when rubber-band drag finishes — caller should select items in the rect */
  onRubberBandSelect?: (x1: number, y1: number, x2: number, y2: number, additive: boolean) => void
}

/** Function to perform hit-testing at a given canvas position */
export type HitTestFn = (canvasX: number, canvasY: number) => HitTestResult | null

/**
 * Creates a generic interaction handler for a single pane's canvas.
 * Manages mouse events: click, double-click, right-click, hover, drag, scroll, zoom.
 */
export const createPaneInteractionHandler = (
  paneType: PaneType,
  hitTest: () => HitTestFn,
  callbacks: PaneInteractionCallbacks,
) => {
  let canvas: HTMLCanvasElement | null = null
  let lastClickTime = 0
  let lastClickItemId: number | null = null
  let isDragging = false
  let dragStartHit: HitTestResult | null = null
  let dragStartClientX = 0
  let dragStartClientY = 0
  let documentTracking = false

  // Rubber-band state
  let rubberBandPending = false
  let isRubberBanding = false
  let rbStartX = 0
  let rbStartY = 0
  let rbCtrlKey = false

  const getCanvasCoords = (e: MouseEvent): { x: number; y: number } => {
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const stopDocumentTracking = (): void => {
    if (!documentTracking) return
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    documentTracking = false
  }

  const startDocumentTracking = (): void => {
    if (documentTracking) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    documentTracking = true
  }

  const handleMouseDown = (e: MouseEvent): void => {
    if (!canvas) return
    const { x, y } = getCanvasCoords(e)
    const hitTestFn = hitTest()

    if (y < HEADER_HEIGHT) return

    // Right-click
    if (e.button === 2) {
      const hit = hitTestFn(x, y)
      if (hit) {
        e.preventDefault()
        callbacks.onItemRightClick(hit, e.clientX, e.clientY)
      }
      return
    }

    if (e.button !== 0) return

    const hit = hitTestFn(x, y)

    if (hit && hit.itemId !== null) {
      // Check double-click
      const now = Date.now()
      if (lastClickItemId === hit.itemId && now - lastClickTime < DOUBLE_CLICK_TIMEOUT) {
        callbacks.onItemDoubleClick(hit)
        lastClickTime = 0
        lastClickItemId = null
        return
      }
      lastClickTime = now
      lastClickItemId = hit.itemId

      // Prepare for potential drag
      dragStartHit = hit
      dragStartClientX = e.clientX
      dragStartClientY = e.clientY
      isDragging = false
      startDocumentTracking()

      callbacks.onItemClick(hit, e.ctrlKey || e.metaKey)
    } else {
      // Background click — defer onBackgroundClick until mouseup (may become rubber band)
      rubberBandPending = true
      rbStartX = x
      rbStartY = y
      rbCtrlKey = e.ctrlKey || e.metaKey
      lastClickItemId = null
      startDocumentTracking()
    }
  }

  const handleDoubleClick = (e: MouseEvent): void => {
    if (!canvas) return
    const { x, y } = getCanvasCoords(e)

    if (y < HEADER_HEIGHT) return

    const hitTestFn = hitTest()
    const hit = hitTestFn(x, y)

    if (hit && hit.itemId !== null) {
      // Direct double-click from browser dblclick event
      callbacks.onItemDoubleClick(hit)
      // Reset click tracking to prevent double-trigger from mousedown
      lastClickTime = 0
      lastClickItemId = null
    }
  }

  const handleMouseMove = (e: MouseEvent): void => {
    if (!canvas) return
    const { x, y } = getCanvasCoords(e)
    const hitTestFn = hitTest()

    // Check if we should start or continue a drag
    if (dragStartHit) {
      const dx = Math.abs(e.clientX - dragStartClientX)
      const dy = Math.abs(e.clientY - dragStartClientY)

      if (!isDragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        isDragging = true
        callbacks.onDragStart(dragStartHit, dragStartClientX, dragStartClientY)
      }

      if (isDragging) {
        callbacks.onDragMove(e.clientX, e.clientY)
        return
      }
    }

    // Rubber-band: activate or update
    if (rubberBandPending || isRubberBanding) {
      const dx = Math.abs(x - rbStartX)
      const dy = Math.abs(y - rbStartY)
      if (!isRubberBanding && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        isRubberBanding = true
        rubberBandPending = false
      }
      if (isRubberBanding) {
        const rx = Math.min(rbStartX, x)
        const ry = Math.min(rbStartY, y)
        const rw = Math.abs(x - rbStartX)
        const rh = Math.abs(y - rbStartY)
        callbacks.onRubberBandChange?.({ x: rx, y: ry, w: rw, h: rh })
        if (canvas) canvas.style.cursor = 'crosshair'
        return
      }
    }

    // Hover detection
    const hit = hitTestFn(x, y)
    callbacks.onItemHover(hit, e.clientX, e.clientY)

    if (canvas) {
      canvas.style.cursor = (hit && hit.itemId !== null) ? 'pointer' : 'default'
    }
  }

  const handleMouseUp = (e: MouseEvent): void => {
    if (isDragging) {
      callbacks.onDragEnd(e.clientX, e.clientY)
    }

    if (isRubberBanding) {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      callbacks.onRubberBandSelect?.(rbStartX, rbStartY, x, y, rbCtrlKey)
      callbacks.onRubberBandChange?.(null)
      if (canvas) canvas.style.cursor = 'default'
    } else if (rubberBandPending) {
      // Mouse was released without moving — treat as plain background click
      callbacks.onBackgroundClick()
    }

    isDragging = false
    dragStartHit = null
    rubberBandPending = false
    isRubberBanding = false
    stopDocumentTracking()
  }

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      callbacks.onZoom(e.deltaY < 0 ? 'in' : 'out')
    } else {
      callbacks.onScroll(e.deltaX, e.deltaY)
    }
  }

  const handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
  }

  const handleMouseLeave = (): void => {
    callbacks.onItemHover(null, 0, 0)
    // Cancel rubber band if mouse leaves canvas
    if (isRubberBanding || rubberBandPending) {
      callbacks.onRubberBandChange?.(null)
      rubberBandPending = false
      isRubberBanding = false
      if (canvas) canvas.style.cursor = 'default'
    }
    // Don't end drag here - it may cross pane boundaries
    // The drag-handler at the container level will manage this
  }

  const attach = (canvasElement: HTMLCanvasElement): void => {
    canvas = canvasElement
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('dblclick', handleDoubleClick)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    canvas.addEventListener('mouseleave', handleMouseLeave)
  }

  const detach = (): void => {
    if (!canvas) return
    stopDocumentTracking()
    canvas.removeEventListener('mousedown', handleMouseDown)
    canvas.removeEventListener('dblclick', handleDoubleClick)
    canvas.removeEventListener('mousemove', handleMouseMove)
    canvas.removeEventListener('mouseup', handleMouseUp)
    canvas.removeEventListener('wheel', handleWheel)
    canvas.removeEventListener('contextmenu', handleContextMenu)
    canvas.removeEventListener('mouseleave', handleMouseLeave)
    canvas = null
  }

  return { attach, detach, getPaneType: () => paneType }
}
