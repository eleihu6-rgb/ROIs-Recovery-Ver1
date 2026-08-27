import { create } from 'zustand'
import type { PaneType, RosterItem, PairingItem, FlightItem } from '@/types'

type DragItem = RosterItem | PairingItem | FlightItem

interface DragStore {
  isDragging: boolean
  sourcePane: PaneType | null
  sourceItem: DragItem | null
  targetPane: PaneType | null
  targetCrewId: number | null
  dropPosition: { x: number; y: number } | null

  /** Begin a drag operation */
  startDrag: (sourcePane: PaneType, item: DragItem) => void

  /** Update the current drag target as cursor moves */
  updateTarget: (targetPane: PaneType, crewId: number | null, pos: { x: number; y: number }) => void

  /** Commit the drag operation — actual move/assign is handled by the caller */
  endDrag: () => DragResult | null

  /** Cancel drag without committing */
  cancelDrag: () => void
}

/** Result returned by endDrag for the caller to process */
export interface DragResult {
  sourcePane: PaneType
  sourceItem: DragItem
  targetPane: PaneType
  targetCrewId: number | null
  dropPosition: { x: number; y: number }
}

export const useDragStore = create<DragStore>((set, get) => ({
  isDragging: false,
  sourcePane: null,
  sourceItem: null,
  targetPane: null,
  targetCrewId: null,
  dropPosition: null,

  startDrag: (sourcePane, item) => {
    set({
      isDragging: true,
      sourcePane,
      sourceItem: item,
      targetPane: null,
      targetCrewId: null,
      dropPosition: null,
    })
  },

  updateTarget: (targetPane, crewId, pos) => {
    set({ targetPane, targetCrewId: crewId, dropPosition: pos })
  },

  endDrag: () => {
    const { sourcePane, sourceItem, targetPane, targetCrewId, dropPosition } = get()
    if (!sourcePane || !sourceItem || !targetPane || !dropPosition) {
      // Invalid drag — reset
      set({
        isDragging: false,
        sourcePane: null,
        sourceItem: null,
        targetPane: null,
        targetCrewId: null,
        dropPosition: null,
      })
      return null
    }

    const result: DragResult = {
      sourcePane,
      sourceItem,
      targetPane,
      targetCrewId,
      dropPosition,
    }

    set({
      isDragging: false,
      sourcePane: null,
      sourceItem: null,
      targetPane: null,
      targetCrewId: null,
      dropPosition: null,
    })

    return result
  },

  cancelDrag: () => {
    set({
      isDragging: false,
      sourcePane: null,
      sourceItem: null,
      targetPane: null,
      targetCrewId: null,
      dropPosition: null,
    })
  },
}))
