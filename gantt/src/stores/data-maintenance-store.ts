import { create } from 'zustand'
import type { DataPageId, DataEntityId, DataChange, DataValidationIssue, DataPageRow } from '@/types/data-maintenance'
import { validateChanges } from '@/utils/data-validation'
import { pushSnapshot } from '@/utils/data-change-history'

interface CrewFilter {
  crewId: string
  name: string
  rank: string
  base: string
  qualification: string
  team: string
  expiryScope: string
  expiryMode: 'current' | 'expired' | 'expiring_in_days' | 'range'
  expiryDays: number
  referenceDate: string
}

interface DataMaintenanceStore {
  // Navigation
  selectedPage: DataPageId | null
  setSelectedPage: (page: DataPageId) => void

  // Loaded rows per entity (from server, not draft)
  loadedRows: Partial<Record<DataEntityId, DataPageRow[]>>
  setLoadedRows: (entityId: DataEntityId, rows: DataPageRow[]) => void

  // Draft: pending changes (unsaved)
  draftChanges: DataChange[]

  // Undo/redo stacks
  undoStack: DataChange[][]
  redoStack: DataChange[][]

  // Client-side validation issues
  clientIssues: DataValidationIssue[]

  // Commands
  applyChange: (change: DataChange) => void
  undo: () => void
  redo: () => void
  discardAll: () => void

  // Validation
  validateDraft: () => DataValidationIssue[]

  // Helpers
  isDirty: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  hasBlockingErrors: () => boolean

  // Crew filter state for Crew Master page
  crewFilter: CrewFilter
  setCrewFilter: (filter: Partial<CrewFilter>) => void

  // Selected crew for sub-resource loading
  selectedCrewId: string | null
  setSelectedCrewId: (crewId: string | null) => void
}

const DEFAULT_CREW_FILTER: CrewFilter = {
  crewId: '',
  name: '',
  rank: '',
  base: '',
  qualification: '',
  team: '',
  expiryScope: 'all',
  expiryMode: 'current',
  expiryDays: 30,
  referenceDate: new Date().toISOString().split('T')[0],
}

export const useDataMaintenanceStore = create<DataMaintenanceStore>((set, get) => ({
  // Navigation
  selectedPage: null,
  setSelectedPage: (page) => set({ selectedPage: page }),

  // Loaded rows
  loadedRows: {},
  setLoadedRows: (entityId, rows) =>
    set((state) => ({ loadedRows: { ...state.loadedRows, [entityId]: rows } })),

  // Draft state
  draftChanges: [],
  undoStack: [],
  redoStack: [],
  clientIssues: [],

  // Commands
  applyChange: (change) => {
    const { draftChanges, undoStack } = get()
    const newUndoStack = pushSnapshot(undoStack, draftChanges)
    const newDraftChanges = [...draftChanges, change]
    const issues = validateChanges(newDraftChanges)
    set({
      undoStack: newUndoStack,
      draftChanges: newDraftChanges,
      redoStack: [],
      clientIssues: issues,
    })
  },

  undo: () => {
    const { undoStack, draftChanges, redoStack } = get()
    if (undoStack.length === 0) return
    const snapshot = undoStack[undoStack.length - 1]
    const newUndoStack = undoStack.slice(0, undoStack.length - 1)
    const newRedoStack = pushSnapshot(redoStack, draftChanges)
    const issues = validateChanges(snapshot)
    set({
      undoStack: newUndoStack,
      draftChanges: snapshot,
      redoStack: newRedoStack,
      clientIssues: issues,
    })
  },

  redo: () => {
    const { redoStack, draftChanges, undoStack } = get()
    if (redoStack.length === 0) return
    const snapshot = redoStack[redoStack.length - 1]
    const newRedoStack = redoStack.slice(0, redoStack.length - 1)
    const newUndoStack = pushSnapshot(undoStack, draftChanges)
    const issues = validateChanges(snapshot)
    set({
      redoStack: newRedoStack,
      draftChanges: snapshot,
      undoStack: newUndoStack,
      clientIssues: issues,
    })
  },

  discardAll: () => {
    set({
      draftChanges: [],
      undoStack: [],
      redoStack: [],
      clientIssues: [],
    })
  },

  validateDraft: () => {
    const { draftChanges } = get()
    const issues = validateChanges(draftChanges)
    set({ clientIssues: issues })
    return issues
  },

  // Helpers
  isDirty: () => get().draftChanges.length > 0,
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  hasBlockingErrors: () => get().clientIssues.some((i) => i.severity === 'error'),

  // Crew filter
  crewFilter: DEFAULT_CREW_FILTER,
  setCrewFilter: (filter) =>
    set((state) => ({ crewFilter: { ...state.crewFilter, ...filter } })),

  // Selected crew
  selectedCrewId: null,
  setSelectedCrewId: (crewId) => set({ selectedCrewId: crewId }),
}))
