import type { LegalityParamTable } from '@/types/legality'

export type ChangeEntry =
  | { type: 'EDIT'; tableIdx: number; rowIdx: number; colIdx: number; before: string; after: string }
  | { type: 'DEL';  tableIdx: number; rowIdx: number; row: string[] }
  | { type: 'ADD';  tableIdx: number; rowIdx: number }
  | { type: 'COPY'; tableIdx: number; fromRowIdx: number; newRowIdx: number }
  | { type: 'MOVE'; tableIdx: number; fromIdx: number; toIdx: number }

export interface EditingCell {
  tableIdx: number
  rowIdx: number
  draft: string[]
}

export interface EditingRowDialog {
  tableIdx: number
  rowIdx: number
  draft: string[]
}

export interface EditorState {
  tables: LegalityParamTable[]
  history: ChangeEntry[]
  editingCell: EditingCell | null
  editingRowDialog: EditingRowDialog | null
  deletingRow: { tableIdx: number; rowIdx: number } | null
  saving: boolean
  saveError: string | null
}

export type EditorAction =
  | { type: 'BEGIN_INLINE_EDIT'; tableIdx: number; rowIdx: number }
  | { type: 'UPDATE_DRAFT'; colIdx: number; value: string }
  | { type: 'CONFIRM_EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'BEGIN_DELETE'; tableIdx: number; rowIdx: number }
  | { type: 'CONFIRM_DELETE' }
  | { type: 'CANCEL_DELETE' }
  | { type: 'COPY_ROW'; tableIdx: number; rowIdx: number }
  | { type: 'MOVE_ROW'; tableIdx: number; rowIdx: number; direction: 'up' | 'down' }
  | { type: 'ADD_ROW'; tableIdx: number }
  | { type: 'BEGIN_DIALOG_EDIT'; tableIdx: number; rowIdx: number }
  | { type: 'UPDATE_DIALOG_DRAFT'; colIdx: number; value: string }
  | { type: 'CONFIRM_DIALOG_EDIT' }
  | { type: 'CANCEL_DIALOG_EDIT' }
  | { type: 'UNDO' }
  | { type: 'BEGIN_SAVE' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; error: string }

const cloneTables = (tables: LegalityParamTable[]): LegalityParamTable[] =>
  tables.map((t) => ({ header: [...t.header], rows: t.rows.map((r) => [...r]) }))

export const initEditorState = (tables: LegalityParamTable[]): EditorState => ({
  tables: cloneTables(tables),
  history: [],
  editingCell: null,
  editingRowDialog: null,
  deletingRow: null,
  saving: false,
  saveError: null,
})

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'BEGIN_INLINE_EDIT': {
      if (state.editingCell || state.editingRowDialog || state.deletingRow) return state
      return {
        ...state,
        editingCell: {
          tableIdx: action.tableIdx,
          rowIdx: action.rowIdx,
          draft: [...state.tables[action.tableIdx].rows[action.rowIdx]],
        },
      }
    }
    case 'UPDATE_DRAFT': {
      if (!state.editingCell) return state
      const draft = [...state.editingCell.draft]
      draft[action.colIdx] = action.value
      return { ...state, editingCell: { ...state.editingCell, draft } }
    }
    case 'CONFIRM_EDIT': {
      if (!state.editingCell) return state
      const { tableIdx, rowIdx, draft } = state.editingCell
      const original = state.tables[tableIdx].rows[rowIdx]
      const newHistory: ChangeEntry[] = []
      for (let ci = 0; ci < draft.length; ci++) {
        if (draft[ci] !== original[ci]) {
          newHistory.push({ type: 'EDIT', tableIdx, rowIdx, colIdx: ci, before: original[ci] ?? '', after: draft[ci] ?? '' })
        }
      }
      const newTables = cloneTables(state.tables)
      newTables[tableIdx].rows[rowIdx] = [...draft]
      return { ...state, tables: newTables, history: [...state.history, ...newHistory], editingCell: null }
    }
    case 'CANCEL_EDIT':
      return { ...state, editingCell: null }

    case 'BEGIN_DELETE': {
      if (state.editingCell || state.editingRowDialog || state.deletingRow) return state
      return { ...state, deletingRow: { tableIdx: action.tableIdx, rowIdx: action.rowIdx } }
    }
    case 'CONFIRM_DELETE': {
      if (!state.deletingRow) return state
      const { tableIdx, rowIdx } = state.deletingRow
      const row = [...state.tables[tableIdx].rows[rowIdx]]
      const newTables = cloneTables(state.tables)
      newTables[tableIdx].rows.splice(rowIdx, 1)
      return {
        ...state,
        tables: newTables,
        history: [...state.history, { type: 'DEL', tableIdx, rowIdx, row }],
        deletingRow: null,
      }
    }
    case 'CANCEL_DELETE':
      return { ...state, deletingRow: null }

    case 'COPY_ROW': {
      const newRowIdx = state.tables[action.tableIdx].rows.length
      const copiedRow = [...state.tables[action.tableIdx].rows[action.rowIdx]]
      const newTables = cloneTables(state.tables)
      newTables[action.tableIdx].rows.push(copiedRow)
      return {
        ...state,
        tables: newTables,
        history: [...state.history, { type: 'COPY', tableIdx: action.tableIdx, fromRowIdx: action.rowIdx, newRowIdx }],
      }
    }
    case 'MOVE_ROW': {
      const { tableIdx, rowIdx, direction } = action
      const toIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1
      if (toIdx < 0 || toIdx >= state.tables[tableIdx].rows.length) return state
      const newTables = cloneTables(state.tables)
      const rows = newTables[tableIdx].rows
      ;[rows[rowIdx], rows[toIdx]] = [rows[toIdx], rows[rowIdx]]
      return {
        ...state,
        tables: newTables,
        history: [...state.history, { type: 'MOVE', tableIdx, fromIdx: rowIdx, toIdx }],
      }
    }
    case 'ADD_ROW': {
      const colCount = state.tables[action.tableIdx].header.length
      const newRowIdx = state.tables[action.tableIdx].rows.length
      const newTables = cloneTables(state.tables)
      newTables[action.tableIdx].rows.push(Array(colCount).fill('') as string[])
      return {
        ...state,
        tables: newTables,
        history: [...state.history, { type: 'ADD', tableIdx: action.tableIdx, rowIdx: newRowIdx }],
        editingCell: {
          tableIdx: action.tableIdx,
          rowIdx: newRowIdx,
          draft: Array(colCount).fill('') as string[],
        },
      }
    }

    case 'BEGIN_DIALOG_EDIT': {
      if (state.editingCell || state.editingRowDialog || state.deletingRow) return state
      return {
        ...state,
        editingRowDialog: {
          tableIdx: action.tableIdx,
          rowIdx: action.rowIdx,
          draft: [...state.tables[action.tableIdx].rows[action.rowIdx]],
        },
      }
    }
    case 'UPDATE_DIALOG_DRAFT': {
      if (!state.editingRowDialog) return state
      const draft = [...state.editingRowDialog.draft]
      draft[action.colIdx] = action.value
      return { ...state, editingRowDialog: { ...state.editingRowDialog, draft } }
    }
    case 'CONFIRM_DIALOG_EDIT': {
      if (!state.editingRowDialog) return state
      const { tableIdx, rowIdx, draft } = state.editingRowDialog
      const original = state.tables[tableIdx].rows[rowIdx]
      const newHistory: ChangeEntry[] = []
      for (let ci = 0; ci < draft.length; ci++) {
        if (draft[ci] !== original[ci]) {
          newHistory.push({ type: 'EDIT', tableIdx, rowIdx, colIdx: ci, before: original[ci] ?? '', after: draft[ci] ?? '' })
        }
      }
      const newTables = cloneTables(state.tables)
      newTables[tableIdx].rows[rowIdx] = [...draft]
      return { ...state, tables: newTables, history: [...state.history, ...newHistory], editingRowDialog: null }
    }
    case 'CANCEL_DIALOG_EDIT':
      return { ...state, editingRowDialog: null }

    case 'UNDO': {
      if (state.history.length === 0) return state
      const last = state.history[state.history.length - 1]
      const newTables = cloneTables(state.tables)
      switch (last.type) {
        case 'EDIT':
          newTables[last.tableIdx].rows[last.rowIdx][last.colIdx] = last.before
          break
        case 'DEL':
          newTables[last.tableIdx].rows.splice(last.rowIdx, 0, [...last.row])
          break
        case 'ADD':
          newTables[last.tableIdx].rows.splice(last.rowIdx, 1)
          break
        case 'COPY':
          newTables[last.tableIdx].rows.splice(last.newRowIdx, 1)
          break
        case 'MOVE': {
          const rows = newTables[last.tableIdx].rows
          ;[rows[last.fromIdx], rows[last.toIdx]] = [rows[last.toIdx], rows[last.fromIdx]]
          break
        }
      }
      return { ...state, tables: newTables, history: state.history.slice(0, -1) }
    }

    case 'BEGIN_SAVE':
      return { ...state, saving: true, saveError: null }
    case 'SAVE_SUCCESS':
      return { ...state, saving: false, history: [] }
    case 'SAVE_ERROR':
      return { ...state, saving: false, saveError: action.error }

    default:
      return state
  }
}
