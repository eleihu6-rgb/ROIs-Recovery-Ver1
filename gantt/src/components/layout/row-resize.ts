export interface ResizeRowHeightsInput {
  rowHeights: number[]
  measuredHeights: number[]
  draggedRowIndex: number
  dy: number
  fallbackHeight?: number
  minHeight?: number
  containerHeight: number
  splitterTotalHeight?: number
}

/**
 * Materialize visible rows above the dragged splitter into their measured DOM heights
 * before applying a resize. Once a splitter is dragged, it only redistributes
 * height between its adjacent upper and lower rows; other visible rows stay fixed.
 */
export const resizeRowHeights = ({
  rowHeights,
  measuredHeights,
  draggedRowIndex,
  dy,
  fallbackHeight,
  minHeight = 80,
  containerHeight,
  splitterTotalHeight = 0,
}: ResizeRowHeightsInput): number[] => {
  const next = rowHeights.map((height, index) => {
    if (height !== -1) return height
    const measured = measuredHeights[index]
    if (Number.isFinite(measured) && measured > 0) {
      return Math.max(minHeight, Math.round(measured))
    }
    return minHeight
  })

  const lowerRowIndex = draggedRowIndex + 1
  if (lowerRowIndex >= next.length) {
    return next
  }

  const measuredDraggedHeight = measuredHeights[draggedRowIndex]
  const baseHeight = Number.isFinite(measuredDraggedHeight) && measuredDraggedHeight > 0
    ? Math.max(minHeight, Math.round(measuredDraggedHeight))
    : Math.max(minHeight, next[draggedRowIndex] ?? fallbackHeight ?? minHeight)

  const reservedAbove = next
    .slice(0, draggedRowIndex)
    .reduce((sum, height) => sum + Math.max(minHeight, height), 0)

  const reservedBelow = next
    .slice(lowerRowIndex + 1)
    .reduce((sum, height) => sum + Math.max(minHeight, height), 0)

  const adjacentPairHeight = Math.max(
    minHeight * 2,
    Math.floor(containerHeight - splitterTotalHeight - reservedAbove - reservedBelow),
  )

  const maxHeight = Math.max(
    minHeight,
    adjacentPairHeight - minHeight,
  )

  next[draggedRowIndex] = Math.max(minHeight, Math.min(maxHeight, baseHeight + dy))
  next[lowerRowIndex] = Math.max(minHeight, adjacentPairHeight - next[draggedRowIndex])
  return next
}
