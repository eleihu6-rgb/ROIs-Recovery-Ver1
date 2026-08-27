import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { useGanttSource } from './source/gantt-source-context'
import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  PAIRING_HEADER_HEIGHT,
  PAIRING_ROW_HEIGHT,
  PAIRING_TOP_ROW_HEIGHT,
  PAIRING_BOTTOM_ROW_HEIGHT,
  FONT_FAMILY,
  FONT_SIZE_PANEL,
  FONT_SIZE_PANEL_HEADER,
  PIN_ICON_SIZE,
  getGanttColors,
  getRowBackgroundColor,
} from './gantt-constants'
import { getVisibleRowRange, yToRow } from './gantt-utils'
import { publishRenderStats, publishHeaderRender } from '@/utils/gantt-test-hook'
import { rowY as baseRowY, frozenZoneHeight as baseFrozenZoneHeight } from './renderers/base-renderer'
import { drawCrewViolationIndicator } from './violation-overlay'
import { drawCrewLockBadge } from './lock-overlay'
import type { PaneType } from '@/types/pane'
import type { ColumnConfig } from '@/types/column'

/** Data for a single row in the left panel */
export interface PanelRowData {
  /** Unique row identifier */
  rowId: string
  /** Field values keyed by column key */
  values: Record<string, string>
  /**
   * Stable sort rank for the default rank order — the crew's effective rank at the window
   * start, so horizontal scroll never re-sorts the roster (see RankOrderRow.sortRank).
   */
  sortRank?: string
  /** Optional: color overrides for specific fields (key -> color) */
  colors?: Record<string, string>
  /** Max violation severity for this row (0 = none) */
  maxViolationSeverity?: number
  /** Lock status for this row: 'mine' = blue, 'other' = red, undefined = unlocked */
  lockStatus?: 'mine' | 'other'
  /** Lock owner username (shown on 'other' locks) */
  lockOwner?: string
  /** Pairing isFull status for status indicator */
  isFull?: boolean
  /** Optional Pairing source marker for Scenario Gantt merged sources */
  sourceIndicator?: 'scenario' | 'live'
  /** Per-slot composition segments for mixed-color second-row rendering */
  compositionSegments?: Array<{ text: string; isRed: boolean }>
}

interface PaneHeaderCanvasProps {
  /** Unique pane instance ID for scroll state */
  paneId: string
  paneType: PaneType
  /** Column configuration (defines which columns, their order, widths, row placement) */
  columns: ColumnConfig[]
  /** Row data for the panel (reordered: frozen first) */
  rows: PanelRowData[]
  /** Number of frozen rows at top */
  frozenRowCount: number
  /** Set of selected row indices */
  selectedRowIndices: Set<number>
  /** Current sort column key (for sort indicator) */
  sortColumn: string | null
  /** Sort direction */
  sortDirection: 'asc' | 'desc'
  /** Called when a column header is clicked (for sorting) */
  onColumnHeaderClick: (columnKey: string) => void
  /** Called when column width changes (drag resize) */
  onColumnWidthChange: (columnKey: string, newWidth: number) => void
  /** Called when canvas is ready */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void
  /** Called on vertical scroll (deltaY) */
  onWheel?: (deltaY: number) => void
  /** Called on right-click a data row (for context menu) */
  onRowRightClick?: (rowIndex: number, clientX: number, clientY: number) => void
  /** Called when a row is clicked for selection (rowIndex, ctrlKey, shiftKey) */
  onRowClick?: (rowIndex: number, ctrlKey: boolean, shiftKey: boolean) => void
  /** Called when a data row is double-clicked. */
  onRowDoubleClick?: (rowIndex: number) => void
  /** Called when a frozen row's pin icon is clicked (to unfreeze) */
  onUnfreezeRow?: (rowId: string) => void
  /** Called when hovering over a row's violation indicator (rowId, clientX, clientY) or null to clear */
  onViolationHover?: (rowId: string | null, clientX: number, clientY: number) => void
  /** Called when clicking a row's violation indicator bell (rowId, clientX, clientY) */
  onViolationClick?: (rowId: string, clientX: number, clientY: number) => void
  /** Two-line header mode (Pairing pane): top row with column labels, bottom row with spanning label */
  twoLineHeader?: boolean
  /** Bottom header row label for two-line mode */
  bottomHeaderLabel?: string
  /** Two-line row mode (Pairing pane): bottom row spans all columns */
  twoLineRows?: boolean
  /** Key for the bottom row data (spans all columns) */
  bottomRowKey?: string
  /** Width (px) of the left fixed panel — passed explicitly by the consuming pane. */
  leftPanelWidth: number
}

/** Custom rowY for Pairing pane (42px rows) */
const pairingRowY = (rowIndex: number, scrollY: number, frozenRowCount: number): number => {
  if (rowIndex < frozenRowCount) {
    return PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT
  }
  return PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT - scrollY
}

/** Custom frozen zone height for Pairing pane */
const pairingFrozenZoneHeight = (frozenCount: number): number => {
  return frozenCount * PAIRING_ROW_HEIGHT
}

const PAIRING_SOURCE_INDICATOR_COLORS: Record<'scenario' | 'live', string> = {
  live: 'rgba(245, 158, 11, 0.9)',
  scenario: 'rgba(14, 165, 233, 0.75)',
}

/**
 * Left-side fixed panel canvas.
 * Renders a dual-row layout per data row with configurable columns.
 * Supports:
 * - Column width drag resize
 * - Click-to-sort on headers
 * - Row selection (click/ctrl/shift)
 * - Pin icon for frozen rows (click to unfreeze)
 * - Violation indicators
 * - Two-line layout for Pairing Pane (header + rows)
 */
export const PaneHeaderCanvas = ({
  paneId,
  paneType,
  columns,
  rows,
  frozenRowCount,
  selectedRowIndices,
  sortColumn,
  sortDirection,
  onColumnHeaderClick,
  onColumnWidthChange,
  onCanvasReady,
  onWheel,
  onRowRightClick,
  onRowClick,
  onRowDoubleClick,
  onUnfreezeRow,
  onViolationHover,
  onViolationClick,
  twoLineHeader = false,
  bottomHeaderLabel = 'Comp',
  twoLineRows = false,
  bottomRowKey = 'composition',
  leftPanelWidth,
}: PaneHeaderCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)
  // V4-P06: pane-scoped scheduling state — mirrors PaneCanvas (P1-2 discipline).
  // -1 (≠ any real scrollY) guarantees the first effect run schedules the initial render
  // (PaneCanvas uses a separate size-effect instead).
  const lastRenderedScrollYRef = useRef<number>(-1)
  const lastScheduledRenderRef = useRef<(() => void) | null>(null)

  // 统一数据源：viewport / dirty 信号一律从此读取，禁止直连 store。
  const source = useGanttSource()
  const scrollY = source.useScrollY(paneId)
  const dirtySignal = source.useDirtySignal()

  // Determine row height and header height based on pane type
  const isPairing = paneType === 'pairing'
  const rowHeight = isPairing ? PAIRING_ROW_HEIGHT : ROW_HEIGHT
  const headerHeight = isPairing ? PAIRING_HEADER_HEIGHT : HEADER_HEIGHT

  // Sorted and visible columns
  // F54-P03: memoized — an inline filter/sort created a NEW array identity on every
  // React re-render, which invalidated the render callback below and forced a full
  // canvas redraw per re-render (e.g. during scroll-driven pane renders).
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible).sort((a, b) => a.order - b.order),
    [columns],
  )

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    // Read latest scrollY fresh at RAF time via the source's synchronous getter
    // (store getState() under the hood — same freshness as the original direct read).
    const latestScrollY = source.getScrollY(paneId)

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)

    // Draw column headers (two-line for Pairing pane)
    if (isPairing && twoLineHeader) {
      drawTwoLineColumnHeaders(ctx, size.width, visibleColumns, sortColumn, sortDirection, bottomHeaderLabel)
    } else {
      drawColumnHeaders(ctx, size.width, visibleColumns, sortColumn, sortDirection, headerHeight)
    }

    // Draw data rows (two-line for Pairing pane)
    if (isPairing && twoLineRows) {
      drawTwoLineDataRows(ctx, size.width, size.height, latestScrollY, visibleColumns, rows, frozenRowCount, selectedRowIndices, bottomRowKey)
    } else {
      drawDataRows(ctx, size.width, size.height, latestScrollY, visibleColumns, rows, frozenRowCount, selectedRowIndices, headerHeight, rowHeight, bottomRowKey)
    }

    ctx.restore()
    // Clear the source's dirty state (Live: store markClean; Scenario: no-op).
    source.markClean()

    // 测试自省回执：左侧表头 canvas 的绘制次数（生产构建下 no-op）。
    publishRenderStats(`${paneId}:header`, {
      paneType,
      totalRows: rows.length,
      width: size.width,
      height: size.height,
    })
    // 渲染级回执：实际画到表头 canvas 上的列（按绘制顺序）+ 每行单元格值 + canvas 宽度。
    // 反映 draw 循环真正消费的 visibleColumns / rows.values（fillText 的输入），区别于
    // column-store 配置，使「Base 列确实被画出来」可在无 DOM 的 Canvas 上断言（§No-Illusion）。
    publishHeaderRender(paneType, {
      width: size.width,
      columns: visibleColumns.map((c) => ({ key: c.key, label: c.label, width: c.width })),
      rows: rows.map((r) => r.values),
    })
  }, [canvasRef, size, visibleColumns, rows, sortColumn, sortDirection, source, frozenRowCount, selectedRowIndices, isPairing, twoLineHeader, twoLineRows, bottomHeaderLabel, bottomRowKey, headerHeight, rowHeight, paneId, paneType])

  // Always-latest render reference so a pending RAF uses the newest closure.
  const renderRef = useRef(render)
  renderRef.current = render

  // V4-P06: schedule one RAF per actual cause — global dirty, own scrollY change,
  // or render-identity change (rows/columns/selection/size → new useCallback).
  // Mirrors PaneCanvas: no cancellation in cleanup (markClean() from the content
  // canvas flips `dirty` and re-runs this effect; cancelling here would drop the
  // pending frame), guard with !rafRef.current, cancel only on unmount.
  //
  // F54-P01: scrollY in deps so pane-scoped vertical scroll redraws this header
  // WITHOUT a global markDirty() — previously the header only redrew via global dirty,
  // which forced wheel handlers to mark the whole gantt view dirty (all panes redraw).
  const lastDirtySignalRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    // 共享重绘信号变化（缩放/横向滚动/选中/数据/zoom 等，由 source 统一抽象）→ 重绘；
    // 本 pane 自身 scrollY 变化（纵向滚动）→ 仅本 pane 重绘；render 标识变化（rows/列/选中/size）→ 重绘。
    const scrollYChanged = scrollY !== lastRenderedScrollYRef.current
    const renderChanged = render !== lastScheduledRenderRef.current
    const signalChanged = dirtySignal !== lastDirtySignalRef.current
    if ((signalChanged || scrollYChanged || renderChanged) && !rafRef.current) {
      lastScheduledRenderRef.current = render
      lastDirtySignalRef.current = dirtySignal
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        // Capture the scrollY actually rendered, fresh at RAF time (matches the
        // original's getState() read so wheel-driven scroll deltas converge).
        lastRenderedScrollYRef.current = source.getScrollY(paneId)
        renderRef.current()
      })
    }
  }, [render, scrollY, paneId, dirtySignal, source])

  // Cancel pending RAF only on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [])

  // Canvas ready notification
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && onCanvasReady) onCanvasReady(canvas)
  }, [canvasRef, onCanvasReady])

  // Interaction: header clicks, column resize, row clicks, pin icon clicks
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let resizeColKey: string | null = null
    let resizeStartX = 0
    let resizeStartWidth = 0

    /** Check if a point is within the pin icon hit area for a frozen row */
    const rowIndexAtY = (y: number): number => {
      if (isPairing) {
        const relY = y - headerHeight
        if (relY < 0) return -1
        const frozenZone = frozenRowCount * PAIRING_ROW_HEIGHT
        if (frozenRowCount > 0 && relY < frozenZone) {
          return Math.floor(relY / PAIRING_ROW_HEIGHT)
        }
        return Math.floor((relY + scrollY) / PAIRING_ROW_HEIGHT)
      }
      return yToRow(y, scrollY, frozenRowCount)
    }

    const getPinHitRow = (x: number, y: number): number => {
      if (y < headerHeight) return -1
      const ri = rowIndexAtY(y)
      if (ri < 0 || ri >= frozenRowCount || ri >= rows.length) return -1
      // Pin icon is at right edge of row
      const rowTop = isPairing ? pairingRowY(ri, scrollY, frozenRowCount) : baseRowY(ri, scrollY, frozenRowCount)
      const iconX = size.width - PIN_ICON_SIZE - 6
      const iconY = rowTop + (rowHeight - PIN_ICON_SIZE) / 2
      if (x >= iconX && x <= iconX + PIN_ICON_SIZE + 4 &&
          y >= iconY && y <= iconY + PIN_ICON_SIZE + 4) {
        return ri
      }
      return -1
    }

    const handleMouseDown = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Column header area
      if (y < headerHeight) {
        // Check for column resize handle (within 4px of right edge)
        let colX = 0
        for (const col of visibleColumns) {
          colX += col.width
          if (Math.abs(x - colX) < 4) {
            resizeColKey = col.key
            resizeStartX = e.clientX
            resizeStartWidth = col.width
            canvas.style.cursor = 'col-resize'
            e.preventDefault()
            return
          }
        }

        // Otherwise it is a sort click
        let startX = 0
        for (const col of visibleColumns) {
          if (x >= startX && x < startX + col.width) {
            onColumnHeaderClick(col.key)
            return
          }
          startX += col.width
        }
        return
      }

      // Data row area — check pin icon click first
      if (e.button === 0) {
        const pinRow = getPinHitRow(x, y)
        if (pinRow >= 0 && onUnfreezeRow) {
          const row = rows[pinRow]
          if (row) {
            // The consuming pane's onUnfreezeRow marks the gantt dirty (content pane redraw);
            // this header's own redraw is covered by the render-identity change (frozen rows /
            // selection change → new render useCallback). No direct store access here.
            onUnfreezeRow(row.rowId)
          }
          return
        }

        // Bell click detection — fires before row selection so clicking the bell
        // opens the per-crew violation popup instead of selecting the row.
        if (onViolationClick) {
          const ri0 = rowIndexAtY(y)
          if (ri0 >= 0 && ri0 < rows.length) {
            const row0 = rows[ri0]
            if (row0.maxViolationSeverity && row0.maxViolationSeverity > 0) {
              const isPinned0 = ri0 < frozenRowCount
              const violX0 = isPinned0 ? size.width - PIN_ICON_SIZE - 14 : size.width - 10
              const violY0 = (isPairing ? pairingRowY(ri0, scrollY, frozenRowCount) : baseRowY(ri0, scrollY, frozenRowCount)) + rowHeight / 2
              if (Math.abs(x - violX0) <= 8 && Math.abs(y - violY0) <= 8) {
                onViolationClick(row0.rowId, e.clientX, e.clientY)
                return
              }
            }
          }
        }

        // Row selection click
        const ri = rowIndexAtY(y)
        if (ri >= 0 && ri < rows.length && onRowClick) {
          onRowClick(ri, e.ctrlKey || e.metaKey, e.shiftKey)
        }
      }
    }

    const handleMouseMove = (e: MouseEvent): void => {
      if (resizeColKey) {
        const dx = e.clientX - resizeStartX
        const newWidth = Math.max(40, resizeStartWidth + dx)
        onColumnWidthChange(resizeColKey, newWidth)
        return
      }

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (y < headerHeight) {
        let colX = 0
        let isResizeArea = false
        for (const col of visibleColumns) {
          colX += col.width
          if (Math.abs(x - colX) < 4) {
            isResizeArea = true
            break
          }
        }
        canvas.style.cursor = isResizeArea ? 'col-resize' : 'pointer'
      } else {
        // Check pin icon hover
        const pinRow = getPinHitRow(x, y)
        if (pinRow >= 0) {
          canvas.style.cursor = 'pointer'
        } else {
          canvas.style.cursor = 'default'
        }

        // Check violation indicator hover
        if (onViolationHover) {
          const ri = rowIndexAtY(y)
          if (ri >= 0 && ri < rows.length) {
            const row = rows[ri]
            if (row.maxViolationSeverity && row.maxViolationSeverity > 0) {
              const isPinned = ri < frozenRowCount
              const violX = isPinned ? size.width - PIN_ICON_SIZE - 14 : size.width - 10
              const violY = (isPairing ? pairingRowY(ri, scrollY, frozenRowCount) : baseRowY(ri, scrollY, frozenRowCount)) + rowHeight / 2
              const hitRadius = 8
              if (Math.abs(x - violX) <= hitRadius && Math.abs(y - violY) <= hitRadius) {
                canvas.style.cursor = 'pointer'
                onViolationHover(row.rowId, e.clientX, e.clientY)
                return
              }
            }
          }
          // Mouse not on any violation indicator — clear
          onViolationHover(null, 0, 0)
        }
      }
    }

    const handleMouseUp = (): void => {
      resizeColKey = null
    }

    const handleWheel = (e: WheelEvent): void => {
      if (onWheel) {
        e.preventDefault()
        onWheel(e.deltaY)
      }
    }

    const handleContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const y = e.clientY - rect.top

      if (y > headerHeight && onRowRightClick) {
        const ri = rowIndexAtY(y)
        if (ri >= 0 && ri < rows.length) {
          onRowRightClick(ri, e.clientX, e.clientY)
        }
      }
    }

    const handleDoubleClick = (e: MouseEvent): void => {
      if (!onRowDoubleClick) return
      const rect = canvas.getBoundingClientRect()
      const y = e.clientY - rect.top
      if (y <= headerHeight) return
      const ri = rowIndexAtY(y)
      if (ri >= 0 && ri < rows.length) onRowDoubleClick(ri)
    }

    const handleMouseLeave = (): void => {
      if (onViolationHover) onViolationHover(null, 0, 0)
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    canvas.addEventListener('dblclick', handleDoubleClick)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
      canvas.removeEventListener('dblclick', handleDoubleClick)
    }
  }, [canvasRef, visibleColumns, onColumnHeaderClick, onColumnWidthChange, onWheel,
      onRowRightClick, onRowClick, onRowDoubleClick, onUnfreezeRow, onViolationHover, onViolationClick, scrollY, frozenRowCount, rows, size.width, isPairing, headerHeight, rowHeight])

  // Read theme panel color for inline style
  const panelBg = getGanttColors().bgColorPanel

  return (
    <div
      className="shrink-0"
      style={{
        width: leftPanelWidth,
        display: 'flex',
        backgroundColor: panelBg,
      }}
    >
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ width: leftPanelWidth, minWidth: leftPanelWidth }}
        data-gantt-area
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} data-testid={`pane-header-canvas-${paneType}`} className="absolute inset-0" />
      </div>
    </div>
  )
}

// ─── Drawing functions ──────────────────────────────────────────────────────

const drawColumnHeaders = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  columns: ColumnConfig[],
  sortColumn: string | null,
  sortDirection: 'asc' | 'desc',
  headerHeight: number = HEADER_HEIGHT,
): void => {
  const colors = getGanttColors()

  // Background
  ctx.fillStyle = colors.bgColorPanelHeader
  ctx.fillRect(0, 0, canvasWidth, headerHeight)

  // Bottom border
  ctx.strokeStyle = colors.gridColorMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, headerHeight)
  ctx.lineTo(canvasWidth, headerHeight)
  ctx.stroke()

  // Column headers with separators
  let x = 0
  for (const col of columns) {
    const isSort = sortColumn === col.key
    const lineY = col.row === 1 ? 5 : headerHeight / 2 + 2

    ctx.fillStyle = isSort ? colors.selectionBorder : colors.textColor
    ctx.font = `${isSort ? 'bold' : 'normal'} ${FONT_SIZE_PANEL_HEADER}px ${FONT_FAMILY}`
    ctx.textBaseline = 'top'

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 4, lineY - 1, col.width - 8, 15)
    ctx.clip()
    const label = isSort ? `${col.label} ${sortDirection === 'asc' ? '↑' : '↓'}` : col.label
    ctx.fillText(label, x + 4, lineY)
    ctx.restore()

    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + col.width, 0)
    ctx.lineTo(x + col.width, headerHeight)
    ctx.stroke()

    x += col.width
  }
}

/** Draw two-line header for Pairing Pane: top row with column labels, bottom row with spanning label */
const drawTwoLineColumnHeaders = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  columns: ColumnConfig[],
  sortColumn: string | null,
  sortDirection: 'asc' | 'desc',
  bottomLabel: string,
): void => {
  const colors = getGanttColors()
  const topHeight = PAIRING_TOP_ROW_HEIGHT

  // Top row background
  ctx.fillStyle = colors.bgColorPanelHeader
  ctx.fillRect(0, 0, canvasWidth, topHeight)

  // Top row column headers
  let x = 0
  for (const col of columns) {
    const isSort = sortColumn === col.key

    ctx.fillStyle = isSort ? colors.selectionBorder : colors.textColorSecondary
    ctx.font = `${isSort ? 'bold' : 'normal'} 9px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 3, 0, col.width - 6, topHeight)
    ctx.clip()
    const label = isSort ? `${col.label} ${sortDirection === 'asc' ? '↑' : '↓'}` : col.label
    ctx.fillText(label, x + 4, topHeight / 2)
    ctx.restore()

    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + col.width, 0)
    ctx.lineTo(x + col.width, topHeight)
    ctx.stroke()

    x += col.width
  }

  // Bottom row background (slightly different shade)
  ctx.fillStyle = colors.bgColorPanelHeader
  ctx.globalAlpha = 0.5
  ctx.fillRect(0, topHeight, canvasWidth, PAIRING_BOTTOM_ROW_HEIGHT)
  ctx.globalAlpha = 1

  // Bottom row bottom border
  ctx.strokeStyle = colors.gridColorMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, PAIRING_HEADER_HEIGHT)
  ctx.lineTo(canvasWidth, PAIRING_HEADER_HEIGHT)
  ctx.stroke()

  // Bottom row label (spans full width)
  ctx.fillStyle = colors.textColorSecondary
  ctx.font = `9px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(bottomLabel, 8, topHeight + PAIRING_BOTTOM_ROW_HEIGHT / 2)
}

/** Draw a single data row (used for both frozen and scrollable rows) */
const drawSingleRow = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  y: number,
  i: number,
  row: PanelRowData,
  columns: ColumnConfig[],
  colors: ReturnType<typeof getGanttColors>,
  isPinned: boolean,
  isSelected: boolean,
  rowHeight: number = ROW_HEIGHT,
  bottomRowKey?: string,
): void => {
  ctx.fillStyle = getRowBackgroundColor(i, colors)
  ctx.fillRect(0, y, canvasWidth, rowHeight)

  // Frozen row tint
  if (isPinned) {
    ctx.fillStyle = colors.rowFrozenColor
    ctx.fillRect(0, y, canvasWidth, rowHeight)
  }

  // Selection highlight (on top of freeze tint)
  if (isSelected) {
    ctx.fillStyle = colors.rowSelectedColor
    ctx.fillRect(0, y, canvasWidth, rowHeight)
    // Left accent bar
    ctx.fillStyle = colors.selectionBorder
    ctx.fillRect(0, y, 3, rowHeight)
  }

  // Horizontal separator
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, y + rowHeight)
  ctx.lineTo(canvasWidth, y + rowHeight)
  ctx.stroke()

  // Cell values (dual-row layout)
  let x = 0
  for (const col of columns) {
    const value = row.values[col.key] ?? ''
    const cellY = col.row === 1 ? y + 5 : y + rowHeight / 2 + 2
    const textColor = row.colors?.[col.key] ?? (col.row === 1 ? colors.textColor : colors.textColorSecondary)

    ctx.fillStyle = textColor
    ctx.font = `${col.row === 1 ? 'bold' : 'normal'} ${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
    ctx.textBaseline = 'top'

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 3, cellY - 1, col.width - 6, 15)
    ctx.clip()
    ctx.fillText(value, x + 4, cellY)
    ctx.restore()

    // Column separator
    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + col.width, y)
    ctx.lineTo(x + col.width, y + rowHeight)
    ctx.stroke()

    x += col.width
  }

  // Pin icon for frozen rows (right edge — clickable to unfreeze)
  if (isPinned) {
    const iconX = canvasWidth - PIN_ICON_SIZE - 6
    const iconY = y + (rowHeight - PIN_ICON_SIZE) / 2

    // Pin icon background circle
    ctx.save()
    ctx.fillStyle = colors.selectionBorder
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.arc(iconX + PIN_ICON_SIZE / 2, iconY + PIN_ICON_SIZE / 2, PIN_ICON_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // Pin icon (simple pushpin shape)
    ctx.fillStyle = colors.selectionBorder
    ctx.font = `${PIN_ICON_SIZE - 2}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('📌', iconX + PIN_ICON_SIZE / 2, y + rowHeight / 2)
    ctx.textAlign = 'left'
    ctx.restore()
  }

  // Lock badge
  if (row.lockStatus) {
    const badgeX = isPinned ? canvasWidth - PIN_ICON_SIZE - 30 : canvasWidth - 50
    drawCrewLockBadge(ctx, badgeX, y + rowHeight / 2, row.lockOwner ?? '', row.lockStatus)
  }

  // Violation indicator
  if (row.maxViolationSeverity && row.maxViolationSeverity > 0) {
    const violX = isPinned ? canvasWidth - PIN_ICON_SIZE - 14 : canvasWidth - 10
    drawCrewViolationIndicator(ctx, violX, y + rowHeight / 2, row.maxViolationSeverity)
  }

  // Bottom spanning row (e.g. crew name) — no separator, same style as Pairing Comp
  if (bottomRowKey) {
    const bottomValue = row.values[bottomRowKey] ?? ''
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `9px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(bottomValue, 8, y + rowHeight / 2 + 7)
  }
}

/** Draw two-line row for Pairing Pane: top row with column values, bottom row with spanning value */
const drawTwoLineRow = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  y: number,
  i: number,
  row: PanelRowData,
  columns: ColumnConfig[],
  colors: ReturnType<typeof getGanttColors>,
  isPinned: boolean,
  isSelected: boolean,
  bottomRowKey: string,
): void => {
  const topHeight = PAIRING_TOP_ROW_HEIGHT

  ctx.fillStyle = getRowBackgroundColor(i, colors)
  ctx.fillRect(0, y, canvasWidth, PAIRING_ROW_HEIGHT)

  // Frozen row tint
  if (isPinned) {
    ctx.fillStyle = colors.rowFrozenColor
    ctx.fillRect(0, y, canvasWidth, PAIRING_ROW_HEIGHT)
  }

  // Selection highlight (on top of freeze tint)
  if (isSelected) {
    ctx.fillStyle = colors.rowSelectedColor
    ctx.fillRect(0, y, canvasWidth, PAIRING_ROW_HEIGHT)
    // Left accent bar
    ctx.fillStyle = colors.selectionBorder
    ctx.fillRect(0, y, 3, PAIRING_ROW_HEIGHT)
  }

  if (row.sourceIndicator) {
    ctx.fillStyle = PAIRING_SOURCE_INDICATOR_COLORS[row.sourceIndicator]
    ctx.fillRect(0, y + 2, 3, PAIRING_ROW_HEIGHT - 4)
  }

  // Status indicator (left border color based on isFull)
  if (row.isFull !== undefined) {
    ctx.save()
    ctx.lineWidth = 2
    ctx.strokeStyle = row.isFull
      ? 'rgba(34, 197, 94, 0.45)'
      : 'rgba(245, 158, 11, 0.4)'
    ctx.beginPath()
    const statusX = row.sourceIndicator ? 4 : 0
    ctx.moveTo(statusX, y)
    ctx.lineTo(statusX, y + PAIRING_ROW_HEIGHT)
    ctx.stroke()
    ctx.restore()
  }

  // Row bottom border
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, y + PAIRING_ROW_HEIGHT)
  ctx.lineTo(canvasWidth, y + PAIRING_ROW_HEIGHT)
  ctx.stroke()

  // Top row: column values
  let x = 0
  for (const col of columns) {
    const value = row.values[col.key] ?? ''
    const textColor = row.colors?.[col.key] ?? colors.textColor

    ctx.fillStyle = textColor
    ctx.font = `bold 11px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 3, y, col.width - 6, topHeight)
    ctx.clip()
    ctx.fillText(value, x + 4, y + topHeight / 2)
    ctx.restore()

    // Column separator
    ctx.strokeStyle = colors.gridColor
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + col.width, y)
    ctx.lineTo(x + col.width, y + topHeight)
    ctx.stroke()

    x += col.width
  }

  // Bottom row: composition spanning full width, bold + vertically centered
  const bottomRowY = y + PAIRING_TOP_ROW_HEIGHT + (PAIRING_ROW_HEIGHT - PAIRING_TOP_ROW_HEIGHT) / 2
  ctx.font = `bold 11px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  if (row.compositionSegments && row.compositionSegments.length > 0) {
    let segX = 8
    for (const seg of row.compositionSegments) {
      ctx.fillStyle = seg.isRed ? colors.textColorRed : colors.textColor
      ctx.fillText(seg.text, segX, bottomRowY)
      segX += ctx.measureText(seg.text).width
    }
  } else {
    const bottomValue = row.values[bottomRowKey] ?? ''
    const bottomTextColor = row.colors?.[bottomRowKey] ?? colors.textColor
    ctx.fillStyle = bottomTextColor
    ctx.fillText(bottomValue, 8, bottomRowY)
  }

  // Pin icon for frozen rows
  if (isPinned) {
    const iconX = canvasWidth - PIN_ICON_SIZE - 6
    const iconY = y + (PAIRING_ROW_HEIGHT - PIN_ICON_SIZE) / 2

    ctx.save()
    ctx.fillStyle = colors.selectionBorder
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.arc(iconX + PIN_ICON_SIZE / 2, iconY + PIN_ICON_SIZE / 2, PIN_ICON_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = colors.selectionBorder
    ctx.font = `${PIN_ICON_SIZE - 2}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('📌', iconX + PIN_ICON_SIZE / 2, y + PAIRING_ROW_HEIGHT / 2)
    ctx.textAlign = 'left'
    ctx.restore()
  }
}

const drawDataRows = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  scrollY: number,
  columns: ColumnConfig[],
  rows: PanelRowData[],
  frozenCount: number,
  selectedIndices: Set<number>,
  headerHeight: number = HEADER_HEIGHT,
  rowHeight: number = ROW_HEIGHT,
  bottomRowKey?: string,
): void => {
  const colors = getGanttColors()
  const fzHeight = baseFrozenZoneHeight(frozenCount)

  // Clip to data area (below header)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, headerHeight, canvasWidth, canvasHeight - headerHeight)
  ctx.clip()

  // Scrollable rows (clipped below frozen zone)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, headerHeight + fzHeight, canvasWidth, canvasHeight - headerHeight - fzHeight)
  ctx.clip()

  const scrollableCount = rows.length - frozenCount
  const { first, last } = getVisibleRowRange(scrollY, canvasHeight, scrollableCount)
  for (let idx = first; idx <= last; idx++) {
    const i = idx + frozenCount
    const row = rows[i]
    if (!row) continue

    const y = baseRowY(i, scrollY, frozenCount)
    if (y + rowHeight < headerHeight + fzHeight) continue
    if (y > canvasHeight) break

    drawSingleRow(ctx, canvasWidth, y, i, row, columns, colors, false, selectedIndices.has(i), rowHeight, bottomRowKey)
  }
  ctx.restore()

  // Frozen rows (fixed, on top)
  for (let i = 0; i < frozenCount && i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const y = baseRowY(i, scrollY, frozenCount)
    drawSingleRow(ctx, canvasWidth, y, i, row, columns, colors, true, selectedIndices.has(i), rowHeight, bottomRowKey)
  }

  // Frozen separator line
  if (frozenCount > 0 && frozenCount < rows.length) {
    const sepY = headerHeight + fzHeight
    ctx.save()
    ctx.strokeStyle = colors.selectionBorder
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, sepY)
    ctx.lineTo(canvasWidth, sepY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  ctx.restore()
}

/** Draw two-line data rows for Pairing Pane */
const drawTwoLineDataRows = (
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  scrollY: number,
  columns: ColumnConfig[],
  rows: PanelRowData[],
  frozenCount: number,
  selectedIndices: Set<number>,
  bottomRowKey: string,
): void => {
  const colors = getGanttColors()
  const fzHeight = pairingFrozenZoneHeight(frozenCount)

  // Clip to data area (below header)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, PAIRING_HEADER_HEIGHT, canvasWidth, canvasHeight - PAIRING_HEADER_HEIGHT)
  ctx.clip()

  // Scrollable rows (clipped below frozen zone)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, PAIRING_HEADER_HEIGHT + fzHeight, canvasWidth, canvasHeight - PAIRING_HEADER_HEIGHT - fzHeight)
  ctx.clip()

  const scrollableCount = rows.length - frozenCount
  const scrollableHeight = canvasHeight - PAIRING_HEADER_HEIGHT - fzHeight
  const first = Math.max(0, Math.floor(scrollY / PAIRING_ROW_HEIGHT))
  const last = Math.min(scrollableCount - 1, Math.ceil((scrollY + scrollableHeight) / PAIRING_ROW_HEIGHT))

  for (let idx = first; idx <= last; idx++) {
    const i = idx + frozenCount
    const row = rows[i]
    if (!row) continue

    const y = pairingRowY(i, scrollY, frozenCount)
    if (y + PAIRING_ROW_HEIGHT < PAIRING_HEADER_HEIGHT + fzHeight) continue
    if (y > canvasHeight) break

    drawTwoLineRow(ctx, canvasWidth, y, i, row, columns, colors, false, selectedIndices.has(i), bottomRowKey)
  }
  ctx.restore()

  // Frozen rows (fixed, on top)
  for (let i = 0; i < frozenCount && i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const y = pairingRowY(i, scrollY, frozenCount)
    drawTwoLineRow(ctx, canvasWidth, y, i, row, columns, colors, true, selectedIndices.has(i), bottomRowKey)
  }

  // Frozen separator line
  if (frozenCount > 0 && frozenCount < rows.length) {
    const sepY = PAIRING_HEADER_HEIGHT + fzHeight
    ctx.save()
    ctx.strokeStyle = colors.selectionBorder
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(0, sepY)
    ctx.lineTo(canvasWidth, sepY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  ctx.restore()
}
