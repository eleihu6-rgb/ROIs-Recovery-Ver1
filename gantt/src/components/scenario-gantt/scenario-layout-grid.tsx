// gantt/src/components/scenario-gantt/scenario-layout-grid.tsx
import { useState, useCallback, lazy, Suspense, useRef } from 'react'
import { DropIndicator } from '@/components/layout/drop-indicator'
import { HorizontalPaneSplitter } from '@/components/layout/horizontal-pane-splitter'
import { resizeRowHeights } from '@/components/layout/row-resize'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import type { ScenarioPaneType } from '@/stores/scenario-layout-store'

// Lazy-load pane components to avoid circular deps and to code-split
const ScenarioRosterPaneLazy  = lazy(() => import('./scenario-roster-pane').then((m) => ({ default: m.ScenarioRosterPane })))
const ScenarioPairingPaneLazy = lazy(() => import('./scenario-pairing-pane').then((m) => ({ default: m.ScenarioPairingPane })))
const ScenarioFlightPaneLazy  = lazy(() => import('./scenario-flight-pane').then((m) => ({ default: m.ScenarioFlightPane })))

export interface ScenarioPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

// ── ScenarioPaneWrapper ────────────────────────────────────────────────────────
interface ScenarioPaneWrapperProps {
  paneId: string
  scenarioId: number
  totalPanes: number
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
}

const ScenarioPaneWrapper = ({ paneId, scenarioId, totalPanes, onClosePane, onStartDrag, onEndDrag }: ScenarioPaneWrapperProps) => {
  const useStore = getScenarioLayoutStore(scenarioId)
  const paneInfo = useStore((s) => s.panes.get(paneId))
  if (!paneInfo) return null

  const PANE_MAP: Record<ScenarioPaneType, React.ComponentType<ScenarioPaneProps>> = {
    roster:  ScenarioRosterPaneLazy as React.ComponentType<ScenarioPaneProps>,
    pairing: ScenarioPairingPaneLazy as React.ComponentType<ScenarioPaneProps>,
    flight:  ScenarioFlightPaneLazy as React.ComponentType<ScenarioPaneProps>,
  }

  const PaneComponent = PANE_MAP[paneInfo.type]
  const draggable = totalPanes > 1

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      <Suspense fallback={
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>
      }>
        <PaneComponent
          paneId={paneId}
          scenarioId={scenarioId}
          draggable={draggable}
          onDragStart={(e) => onStartDrag(paneId, e)}
          onDragEnd={onEndDrag}
          onClose={() => onClosePane(paneId)}
        />
      </Suspense>
    </div>
  )
}

// ── ScenarioGridCell ──────────────────────────────────────────────────────────
interface ScenarioGridCellProps {
  row: number
  col: number
  paneId: string | null
  scenarioId: number
  totalPanes: number
  rowPaneCount: number
  onMovePane: (paneId: string, toRow: number, toCol: number, hint: 'left' | 'right' | 'top' | 'bottom' | 'center') => void
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
  draggedPaneId: string | null
}

const ScenarioGridCell = ({
  row, col, paneId, scenarioId, totalPanes, rowPaneCount,
  onMovePane, onClosePane, onStartDrag, onEndDrag, draggedPaneId,
}: ScenarioGridCellProps) => {
  const [dropIndicator, setDropIndicator] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!paneId || !draggedPaneId || draggedPaneId === paneId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    let position: typeof dropIndicator = null
    if (rowPaneCount === 1 && totalPanes > 1) {
      if (relY < h * 0.25)       position = row === 0 ? 'left' : 'top'
      else if (relY > h * 0.75)  position = 'bottom'
      else if (relX < w / 2)     position = 'left'
      else                        position = 'right'
    } else if (rowPaneCount === 2) {
      position = relY < h / 2 ? (row === 0 ? null : 'top') : 'bottom'
    }
    setDropIndicator(position)
  }, [paneId, draggedPaneId, row, rowPaneCount, totalPanes])

  const handleDragLeave = useCallback(() => setDropIndicator(null), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!paneId || !draggedPaneId || draggedPaneId === paneId) return
    e.preventDefault()
    if (dropIndicator) onMovePane(draggedPaneId, row, col, dropIndicator)
    setDropIndicator(null)
  }, [paneId, draggedPaneId, dropIndicator, row, col, onMovePane])

  if (!paneId) return null

  return (
    <div
      className="relative flex flex-1 overflow-hidden border-r border-border last:border-r-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropIndicator && <DropIndicator position={dropIndicator} />}
      <ScenarioPaneWrapper
        paneId={paneId}
        scenarioId={scenarioId}
        totalPanes={totalPanes}
        onClosePane={onClosePane}
        onStartDrag={onStartDrag}
        onEndDrag={onEndDrag}
      />
    </div>
  )
}

// ── ScenarioGridRow ───────────────────────────────────────────────────────────
interface ScenarioGridRowProps {
  row: number
  cells: [string | null, string | null]
  scenarioId: number
  totalPanes: number
  height: number
  onMovePane: (paneId: string, toRow: number, toCol: number, hint: 'left'|'right'|'top'|'bottom'|'center') => void
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
  onResizeRow: (deltaY: number, startH?: number) => void
  isLastRow: boolean
  draggedPaneId: string | null
}

const ScenarioGridRow = ({
  row, cells, scenarioId, totalPanes, height,
  onMovePane, onClosePane, onStartDrag, onEndDrag, onResizeRow, isLastRow, draggedPaneId,
}: ScenarioGridRowProps) => {
  const paneCount = cells.filter(Boolean).length
  if (paneCount === 0) return null

  const style = height === -1 ? { flex: 1 } : { height, flexShrink: 0 as const }

  return (
    <>
      <div
        className="flex overflow-hidden border border-border rounded-md bg-background"
        style={style}
        data-testid={`scenario-grid-row-${row}`}
        data-pane-grid-row="true"
      >
        {cells.map((paneId, colIndex) => {
          if (paneCount === 1 && colIndex === 1) return null
          return (
            <ScenarioGridCell
              key={colIndex}
              row={row}
              col={colIndex}
              paneId={paneId}
              scenarioId={scenarioId}
              totalPanes={totalPanes}
              rowPaneCount={paneCount}
              onMovePane={onMovePane}
              onClosePane={onClosePane}
              onStartDrag={onStartDrag}
              onEndDrag={onEndDrag}
              draggedPaneId={draggedPaneId}
            />
          )
        })}
      </div>
      {!isLastRow && <HorizontalPaneSplitter onDrag={onResizeRow} />}
    </>
  )
}

// ── ScenarioLayoutGrid (root) ──────────────────────────────────────────────────
interface ScenarioLayoutGridProps {
  scenarioId: number
}

export const ScenarioLayoutGrid = ({ scenarioId }: ScenarioLayoutGridProps) => {
  const useStore = getScenarioLayoutStore(scenarioId)
  const grid         = useStore((s) => s.grid)
  const panes        = useStore((s) => s.panes)
  const rowHeights   = useStore((s) => s.rowHeights)
  const movePane     = useStore((s) => s.movePane)
  const closePane    = useStore((s) => s.closePane)
  const setRowHeights = useStore((s) => s.setRowHeights)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null)

  const totalPanes = panes.size
  const nonEmptyRows = grid.filter((row) => row.some(Boolean))
  const rowCount = nonEmptyRows.length

  const handleStartDrag = useCallback((paneId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', paneId)
    setDraggedPaneId(paneId)
  }, [])

  const handleEndDrag = useCallback(() => setDraggedPaneId(null), [])

  const handleResizeRow = useCallback((rowIndex: number, dy: number, startH?: number) => {
    const rowElements = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-pane-grid-row="true"]') ?? [],
    )
    const splitterElements = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-testid="pane-row-splitter"]') ?? [],
    )
    const measuredHeights = rowElements.map((row) => row.getBoundingClientRect().height)
    const splitterTotalHeight = splitterElements.reduce(
      (sum, splitter) => sum + splitter.getBoundingClientRect().height,
      0,
    )
    const containerHeight =
      measuredHeights.reduce((sum, height) => sum + height, 0) + splitterTotalHeight

    setRowHeights(
      resizeRowHeights({
        rowHeights: useStore.getState().rowHeights,
        measuredHeights,
        draggedRowIndex: rowIndex,
        dy,
        fallbackHeight: startH,
        containerHeight,
        splitterTotalHeight,
      }),
    )
  }, [useStore, setRowHeights])

  return (
    <div ref={rootRef} className="flex flex-1 flex-col overflow-hidden gap-0 p-1">
      {nonEmptyRows.map((cells, rowIndex) => (
        <ScenarioGridRow
          key={rowIndex}
          row={rowIndex}
          cells={cells}
          scenarioId={scenarioId}
          totalPanes={totalPanes}
          height={rowHeights[rowIndex] ?? -1}
          onMovePane={movePane}
          onClosePane={closePane}
          onStartDrag={handleStartDrag}
          onEndDrag={handleEndDrag}
          onResizeRow={(dy, startH) => handleResizeRow(rowIndex, dy, startH)}
          isLastRow={rowIndex === rowCount - 1}
          draggedPaneId={draggedPaneId}
        />
      ))}
    </div>
  )
}
