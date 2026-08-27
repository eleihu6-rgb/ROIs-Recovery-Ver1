import { create } from 'zustand'

/** A single undoable/redoable action */
export interface HistoryAction {
  id: string
  type: 'move' | 'swap' | 'add' | 'remove' | 'update'
  timestamp: number
  undo: () => Promise<void>
  redo: () => Promise<void>
  description: string
}

interface HistoryStore {
  undoStack: HistoryAction[]
  redoStack: HistoryAction[]

  /** Push a new action onto the undo stack (clears redo stack) */
  push: (action: HistoryAction) => void

  /** Undo the most recent action */
  undo: () => Promise<void>

  /** Redo the most recently undone action */
  redo: () => Promise<void>

  /** Whether undo is available */
  canUndo: boolean

  /** Whether redo is available */
  canRedo: boolean

  /** Clear all history */
  clear: () => void
}

const MAX_HISTORY = 50

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  push: (action) => {
    set((state) => {
      const newStack = [action, ...state.undoStack].slice(0, MAX_HISTORY)
      return {
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      }
    })
  },

  undo: async () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return

    const [action, ...rest] = undoStack
    await action.undo()

    set((state) => ({
      undoStack: rest,
      redoStack: [action, ...state.redoStack],
      canUndo: rest.length > 0,
      canRedo: true,
    }))
  },

  redo: async () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return

    const [action, ...rest] = redoStack
    await action.redo()

    set((state) => ({
      undoStack: [action, ...state.undoStack],
      redoStack: rest,
      canUndo: true,
      canRedo: rest.length > 0,
    }))
  },

  clear: () => {
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false })
  },
}))
