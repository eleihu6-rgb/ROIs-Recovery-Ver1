import { hitTestTask, xToTime, yToRow } from './gantt-utils'
import { DOUBLE_CLICK_TIMEOUT, HEADER_HEIGHT } from './gantt-constants'
import type { RosterItem } from '@/types'

export interface InteractionCallbacks {
  onTaskClick: (task: RosterItem) => void
  onTaskDoubleClick: (task: RosterItem) => void
  onTaskRightClick: (task: RosterItem, x: number, y: number) => void
  onTaskHover: (task: RosterItem | null) => void
  onTaskDragStart: (task: RosterItem, startX: number, startY: number) => void
  onTaskDragMove: (dx: number, dy: number) => void
  onTaskDragEnd: (task: RosterItem, newTime: Date | null, newCrewId: string | null) => void
  onBackgroundClick: () => void
  onScroll: (dx: number, dy: number) => void
  onZoom: (direction: 'in' | 'out') => void
  onSelectionRect: (startX: number, startY: number, endX: number, endY: number) => void
}

export interface InteractionState {
  items: RosterItem[]
  crewIds: string[]
  rangeStart: Date
  pxPerHour: number
  scrollX: number
  scrollY: number
}

interface DragState {
  active: boolean
  task: RosterItem | null
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
}

interface SelectionState {
  active: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
}

/**
 * Creates an interaction handler that manages mouse/keyboard events for the Gantt canvas.
 * Call `attach(canvas)` to bind events, and `detach()` to clean up.
 */
export const createInteractionHandler = (
  getState: () => InteractionState,
  callbacks: InteractionCallbacks,
) => {
  let canvas: HTMLCanvasElement | null = null
  let lastClickTime = 0
  let lastClickTaskId: number | null = null

  const drag: DragState = {
    active: false,
    task: null,
    startClientX: 0,
    startClientY: 0,
    currentClientX: 0,
    currentClientY: 0,
  }

  const selection: SelectionState = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  }

  const getCanvasCoords = (e: MouseEvent): { x: number; y: number } => {
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e: MouseEvent): void => {
    if (!canvas) return
    const { x, y } = getCanvasCoords(e)
    const state = getState()

    if (y < HEADER_HEIGHT) return // Ignore clicks on the header

    // Right click → context menu
    if (e.button === 2) {
      const task = hitTestTask(x, y, state.scrollX, state.scrollY, state.items, state.crewIds, state.rangeStart, state.pxPerHour)
      if (task) {
        e.preventDefault()
        callbacks.onTaskRightClick(task, e.clientX, e.clientY)
      }
      return
    }

    if (e.button !== 0) return // Only handle left click

    const task = hitTestTask(x, y, state.scrollX, state.scrollY, state.items, state.crewIds, state.rangeStart, state.pxPerHour)

    if (task) {
      // Check for double click
      const now = Date.now()
      if (lastClickTaskId === task.id && now - lastClickTime < DOUBLE_CLICK_TIMEOUT) {
        callbacks.onTaskDoubleClick(task)
        lastClickTime = 0
        lastClickTaskId = null
        return
      }
      lastClickTime = now
      lastClickTaskId = task.id

      // Start drag
      drag.active = true
      drag.task = task
      drag.startClientX = e.clientX
      drag.startClientY = e.clientY
      drag.currentClientX = e.clientX
      drag.currentClientY = e.clientY

      callbacks.onTaskClick(task)
    } else if (e.shiftKey) {
      // Start selection rectangle
      selection.active = true
      selection.startX = x + state.scrollX
      selection.startY = y + state.scrollY
      selection.currentX = selection.startX
      selection.currentY = selection.startY
    } else {
      callbacks.onBackgroundClick()
      lastClickTaskId = null
    }
  }

  const handleMouseMove = (e: MouseEvent): void => {
    if (!canvas) return
    const { x, y } = getCanvasCoords(e)
    const state = getState()

    if (drag.active && drag.task) {
      drag.currentClientX = e.clientX
      drag.currentClientY = e.clientY
      const dx = e.clientX - drag.startClientX
      const dy = e.clientY - drag.startClientY

      // Only start actual drag after some threshold
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        callbacks.onTaskDragMove(dx, dy)
      }
      return
    }

    if (selection.active) {
      selection.currentX = x + state.scrollX
      selection.currentY = y + state.scrollY
      callbacks.onSelectionRect(
        selection.startX,
        selection.startY,
        selection.currentX,
        selection.currentY,
      )
      return
    }

    // Hover detection
    const task = hitTestTask(x, y, state.scrollX, state.scrollY, state.items, state.crewIds, state.rangeStart, state.pxPerHour)
    callbacks.onTaskHover(task)

    if (canvas) {
      canvas.style.cursor = task ? 'pointer' : 'default'
    }
  }

  const handleMouseUp = (e: MouseEvent): void => {
    const state = getState()

    if (drag.active && drag.task) {
      const dx = e.clientX - drag.startClientX
      const dy = e.clientY - drag.startClientY

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        // Determine new time from horizontal drag
        const newTime = xToTime(
          dx + state.scrollX,
          state.rangeStart,
          state.pxPerHour,
        )

        // Determine new crew from vertical drag
        const { y } = getCanvasCoords(e)
        const newRow = yToRow(y + state.scrollY)
        const newCrewId = newRow >= 0 && newRow < state.crewIds.length
          ? state.crewIds[newRow]
          : null

        callbacks.onTaskDragEnd(drag.task, newTime, newCrewId)
      }

      drag.active = false
      drag.task = null
    }

    if (selection.active) {
      selection.active = false
    }
  }

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault()

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      callbacks.onZoom(e.deltaY < 0 ? 'in' : 'out')
    } else {
      // Scroll
      callbacks.onScroll(e.deltaX, e.deltaY)
    }
  }

  const handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
  }

  const attach = (canvasElement: HTMLCanvasElement): void => {
    canvas = canvasElement
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
  }

  const detach = (): void => {
    if (!canvas) return
    canvas.removeEventListener('mousedown', handleMouseDown)
    canvas.removeEventListener('mousemove', handleMouseMove)
    canvas.removeEventListener('mouseup', handleMouseUp)
    canvas.removeEventListener('wheel', handleWheel)
    canvas.removeEventListener('contextmenu', handleContextMenu)
    canvas = null
  }

  return { attach, detach }
}
