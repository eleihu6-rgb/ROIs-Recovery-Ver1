import { createContext, useContext } from 'react'
import type { CrossPaneDragHandler } from './interactions/drag-handler'

const DragContext = createContext<CrossPaneDragHandler | null>(null)

export const DragProvider = DragContext.Provider

export const useCrossPaneDrag = (): CrossPaneDragHandler | null => {
  return useContext(DragContext)
}
