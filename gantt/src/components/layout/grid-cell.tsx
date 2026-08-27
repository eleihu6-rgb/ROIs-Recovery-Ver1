// gantt/src/components/layout/grid-cell.tsx

import { useState, useCallback } from 'react'
import { PaneWrapper } from './pane-wrapper'
import { AddPaneButton } from './add-pane-button'
import { DropIndicator } from './drop-indicator'
import { useLayoutStore } from '@/stores/layout-store'
import { useUiStore } from '@/stores/ui-store'
import { MAX_PANES } from '@/types/layout'

interface GridCellProps {
  row: number
  col: number
  paneId: string | null
  spanFull: boolean
  isLastRow: boolean
}

export const GridCell = ({ row, col, paneId, spanFull, isLastRow }: GridCellProps) => {
  const [dropIndicator, setDropIndicator] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)
  const movePane = useLayoutStore(s => s.movePane)
  const endDrag = useLayoutStore(s => s.endDrag)
  const totalPanes = useLayoutStore(s => s.getTotalPaneCount())
  const getRowPaneCount = useLayoutStore(s => s.getRowPaneCount)
  const getRowCount = useLayoutStore(s => s.getRowCount)

  // Handle drag events - MUST be defined before conditional return (React hooks rule)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!paneId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    // Calculate drop position based on mouse position in cell
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top
    const cellWidth = rect.width
    const cellHeight = rect.height

    const targetRowPanes = getRowPaneCount(row)
    const rowCount = getRowCount()

    // Determine drop indicator
    let position: 'top' | 'bottom' | 'left' | 'right' | null = null

    if (targetRowPanes === 1 && totalPanes > 1) {
      // Single-pane row: can split (left/right) or cross-row (top/bottom)
      // Bottom zone on last row can create new row
      if (relY < cellHeight * 0.25) {
        // Top: swap/insert above (only if not first row)
        position = row === 0 ? 'left' : 'top'
      } else if (relY > cellHeight * 0.75) {
        // Bottom: swap/insert below (or create new row on last row)
        position = 'bottom'
      } else if (relX < cellWidth / 2) {
        position = 'left'
      } else {
        position = 'right'
      }
    } else if (targetRowPanes === 2) {
      // Two-pane row: only top/bottom (cross-row)
      if (relY < cellHeight / 2) {
        position = row === 0 ? null : 'top'
      } else {
        position = 'bottom'
      }
    }

    setDropIndicator(position)
  }, [row, paneId, getRowPaneCount, getRowCount, totalPanes])

  const handleDragLeave = useCallback(() => {
    setDropIndicator(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!paneId) return
    e.preventDefault()
    const draggedPaneId = e.dataTransfer.getData('text/plain')

    if (draggedPaneId && draggedPaneId !== paneId) {
      // Pass dropHint directly to movePane
      // 'top' = insert above current row
      // 'bottom' = insert below current row (or create new row on last row)
      // 'left'/'right' = split within row
      const dropHint = dropIndicator ?? 'center'
      movePane(draggedPaneId, row, col, dropHint as 'left' | 'right' | 'center' | 'top' | 'bottom')
    }

    setDropIndicator(null)
    endDrag()
  }, [row, col, paneId, dropIndicator, movePane, endDrag])

  // Empty cell - show add pane button (return AFTER all hooks are called)
  if (!paneId) {
    return (
      <div
        className={`flex-1 flex items-center justify-center bg-muted/30 border border-border rounded cursor-pointer hover:bg-muted/50 transition-colors ${spanFull ? 'w-full' : ''}`}
        onClick={() => useUiStore.getState().openAddPaneMenu(row, col)}
      >
        <AddPaneButton />
      </div>
    )
  }

  return (
    <div
      className={`flex-1 flex overflow-hidden ${spanFull ? 'w-full' : 'border-r border-border last:border-r-0'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop indicator overlay */}
      {dropIndicator && (
        <DropIndicator position={dropIndicator} />
      )}

      {/* Pane content */}
      <PaneWrapper paneId={paneId} row={row} />
    </div>
  )
}