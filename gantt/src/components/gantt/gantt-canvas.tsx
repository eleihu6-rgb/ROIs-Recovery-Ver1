/**
 * @deprecated Use PaneCanvas + RosterPane instead.
 * This file is kept for backward compatibility during the migration period.
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useUiStore } from '@/stores/ui-store'
import { useFilterStore } from '@/stores/filter-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { renderGantt } from './gantt-renderer'
import { createInteractionHandler } from './gantt-interaction'
import type { RenderContext } from './gantt-renderer'
import type { InteractionCallbacks, InteractionState } from './gantt-interaction'

export const GanttCanvas = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)

  // Store values
  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const scrollX = useGanttViewStore((s) => s.scrollX)
  const scrollY = useGanttViewStore((s) => s.scrollY)
  const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
  const hoveredTaskId = useGanttViewStore((s) => s.hoveredTaskId)
  const dirty = useGanttViewStore((s) => s.dirty)
  const markClean = useGanttViewStore((s) => s.markClean)
  const setScrollX = useGanttViewStore((s) => s.setScrollX)
  const setScrollY = useGanttViewStore((s) => s.setScrollY)
  const scroll = useGanttViewStore((s) => s.scroll)
  const selectTask = useGanttViewStore((s) => s.selectTask)
  const clearSelection = useGanttViewStore((s) => s.clearSelection)
  const setHoveredTask = useGanttViewStore((s) => s.setHoveredTask)
  const zoomIn = useGanttViewStore((s) => s.zoomIn)
  const zoomOut = useGanttViewStore((s) => s.zoomOut)

  const dateRange = useFilterStore((s) => s.dateRange)
  const items = useRosterStore((s) => s.main.rosterItems)
  const moveTask = useRosterStore((s) => s.moveTask)

  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
  const crewItems = useCrewStore((s) => s.items)

  const openTaskDetail = useUiStore((s) => s.openTaskDetail)
  const openContextMenu = useUiStore((s) => s.openContextMenu)

  // Build crew labels for display
  const crewLabels = useMemo(() => {
    return selectedCrewIds.map((cid) => {
      const item = crewItems.find((i) => i.crew.crewId === cid)
      const c = item?.crew
      return c ? `${c.lastName} ${c.firstName}` : cid
    })
  }, [selectedCrewIds, crewItems])

  // Rule check store
  const ruleViolations = useRuleCheckStore((s) => s.violations)

  // Violation task IDs set
  const violationTaskIds = useMemo(() => {
    const ids = new Set<number>()
    for (const [, violations] of ruleViolations) {
      for (const v of violations) {
        if (v.targetType === 'roster') ids.add(v.targetId as number)
        // For crew-level violations, mark all their roster items
        if (v.targetType === 'crew') {
          for (const item of items) {
            if (String(item.crewId) === String(v.targetId)) {
              ids.add(item.id)
            }
          }
        }
      }
    }
    return ids
  }, [ruleViolations, items])

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    const rc: RenderContext = {
      ctx,
      dpr,
      canvasWidth: size.width,
      canvasHeight: size.height,
      scrollX,
      scrollY,
      pxPerHour,
      rangeStart: dateRange.start,
      rangeEnd: dateRange.end,
      crewIds: selectedCrewIds,
      crewLabels,
      items,
      selectedTaskIds,
      hoveredTaskId,
      violationTaskIds,
    }

    renderGantt(rc)
    markClean()
  }, [
    canvasRef, size, scrollX, scrollY, pxPerHour, dateRange, selectedCrewIds,
    crewLabels, items, selectedTaskIds, hoveredTaskId, violationTaskIds, markClean,
  ])

  // RAF-based rendering with dirty flag
  useEffect(() => {
    if (!dirty) return

    rafRef.current = requestAnimationFrame(() => {
      render()
    })

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [dirty, render])

  // Interaction handler
  const interactionRef = useRef<ReturnType<typeof createInteractionHandler> | null>(null)

  const getInteractionState = useCallback((): InteractionState => ({
    items,
    crewIds: selectedCrewIds,
    rangeStart: dateRange.start,
    pxPerHour,
    scrollX,
    scrollY,
  }), [items, selectedCrewIds, dateRange.start, pxPerHour, scrollX, scrollY])

  const interactionCallbacks = useMemo((): InteractionCallbacks => ({
    onTaskClick: (task) => {
      selectTask(task.id)
    },
    onTaskDoubleClick: (task) => {
      openTaskDetail(task)
    },
    onTaskRightClick: (task, x, y) => {
      selectTask(task.id)
      openContextMenu(x, y, task, 'roster-main')
    },
    onTaskHover: (task) => {
      setHoveredTask(task?.id ?? null)
    },
    onTaskDragStart: () => {
      // Drag visual handled in renderer via dirty flag
    },
    onTaskDragMove: () => {
      // Could show ghost position — for now just mark dirty
    },
    onTaskDragEnd: (task, _newTime, newCrewId) => {
      if (newCrewId && newCrewId !== task.crewId) {
        moveTask('main', task.id, newCrewId)
      }
    },
    onBackgroundClick: () => {
      clearSelection()
    },
    onScroll: (dx, dy) => {
      scroll(dx, dy)
    },
    onZoom: (direction) => {
      if (direction === 'in') zoomIn()
      else zoomOut()
    },
    onSelectionRect: () => {
      // Multi-select rectangle — could implement later
    },
  }), [selectTask, openTaskDetail, openContextMenu, setHoveredTask, moveTask, clearSelection, scroll, zoomIn, zoomOut])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handler = createInteractionHandler(getInteractionState, interactionCallbacks)
    handler.attach(canvas)
    interactionRef.current = handler

    return () => {
      handler.detach()
      interactionRef.current = null
    }
  }, [canvasRef, getInteractionState, interactionCallbacks])

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      data-gantt-area
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
