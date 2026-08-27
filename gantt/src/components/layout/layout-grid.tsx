// gantt/src/components/layout/layout-grid.tsx

import { useCallback, useRef } from 'react'
import { GridRow } from './grid-row'
import { resizeRowHeights } from './row-resize'
import { useLayoutStore } from '@/stores/layout-store'

/**
 * Root layout container - dynamic rows (1-4 rows).
 * Renders GridRow components for each non-empty row.
 * Empty rows are filtered out; row heights follow Scenario parity (flex or fixed px).
 */
export const LayoutGrid = () => {
  const grid = useLayoutStore((s) => s.grid)
  const rowHeights = useLayoutStore((s) => s.rowHeights)
  const setRowHeights = useLayoutStore((s) => s.setRowHeights)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Filter to only non-empty rows
  const nonEmptyRows = grid.filter((row) => row.some(Boolean))
  const rowCount = nonEmptyRows.length

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
        rowHeights: useLayoutStore.getState().rowHeights,
        measuredHeights,
        draggedRowIndex: rowIndex,
        dy,
        fallbackHeight: startH,
        containerHeight,
        splitterTotalHeight,
      }),
    )
  }, [setRowHeights])

  return (
    <div ref={rootRef} className="flex flex-1 flex-col overflow-hidden gap-0 p-1">
      {nonEmptyRows.map((cells, rowIndex) => (
        <GridRow
          key={rowIndex}
          row={rowIndex}
          cells={cells}
          isLastRow={rowIndex === rowCount - 1}
          height={rowHeights[rowIndex] ?? -1}
          onResizeRow={(dy, startH) => handleResizeRow(rowIndex, dy, startH)}
        />
      ))}
    </div>
  )
}
