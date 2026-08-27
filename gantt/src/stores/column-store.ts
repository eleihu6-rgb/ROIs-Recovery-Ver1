import { create } from 'zustand'
import type { ColumnConfig, PaneType } from '@/types'

const STORAGE_KEY = 'gantt-column-config'

/**
 * Bump when DEFAULT column layout changes (visibility or width).
 * Stored configs with an older version are reset to defaults.
 *
 * v5: force-migrate clients stuck at v4 with a pre-Base pairing column array
 * (the Base column shipped at v4, but users who had persisted a v4 config without
 * it were not reset — see Scen-2013). v5 resets every such client to defaults.
 * v6: rename M* stat columns to Rp* (MCred→RpCred, MDO→RpDO, MBH→RpBH) for the
 * roster-period grain; widths nudged to fit the wider labels.
 */
const COLUMN_SCHEMA_VERSION = 6

/** Default columns for Roster panes — keys match panelRows.values in roster-pane.tsx
 *  Visible: CrewId / Rank / Base / Sen / MCred / MDO (total ≈ 246px, fits default 260px panel).
 */
const DEFAULT_ROSTER_COLUMNS: ColumnConfig[] = [
  { key: 'crewId',    label: 'CrewId', width: 54, visible: true,  order: 1,  row: 1 },
  { key: 'rank',      label: 'Rank',   width: 36, visible: true,  order: 2,  row: 1 },
  { key: 'base',      label: 'Base',   width: 36, visible: true,  order: 3,  row: 1 },
  { key: 'seniority', label: 'Sen',    width: 38, visible: true,  order: 4,  row: 1 },
  { key: 'mcred',     label: 'RpCred', width: 50, visible: true,  order: 5,  row: 1 },
  { key: 'mdo',       label: 'RpDO',   width: 40, visible: true,  order: 6,  row: 1 },
  { key: 'ybh',       label: 'YBH',    width: 52, visible: false, order: 7,  row: 1 },
  { key: 'fleet',     label: 'Fleet',  width: 50, visible: false, order: 8,  row: 1 },
  { key: 'mbh',       label: 'RpBH',   width: 50, visible: false, order: 9,  row: 1 },
  { key: 'yal',       label: 'YAL',    width: 50, visible: false, order: 10, row: 1 },
  { key: 'mal',       label: 'MAL',    width: 50, visible: false, order: 11, row: 1 },
  { key: 'ydo',       label: 'YDO',    width: 50, visible: false, order: 12, row: 1 },
]
// Note: crewName is no longer a column — it is rendered as bottomRowKey spanning the full row 2 strip.

/** Default columns for Pairing pane — two-line layout: top row has 5 cols, bottom row has Comp spanning all */
const DEFAULT_PAIRING_COLUMNS: ColumnConfig[] = [
  { key: 'pairingId', label: 'Pairing', width: 54, visible: true,  order: 1, row: 1 },
  { key: 'base',      label: 'Base',    width: 36, visible: true,  order: 2, row: 1 },
  { key: 'type',      label: 'Tp',      width: 32, visible: true,  order: 3, row: 1 },
  { key: 'fleet',     label: 'Fleet',   width: 60, visible: true,  order: 4, row: 1 },
  { key: 'blh',       label: 'BLH',     width: 52, visible: false, order: 5, row: 1 },
  { key: 'cred',      label: 'Cred',    width: 52, visible: true,  order: 6, row: 1 },
]

/** Default columns for Flight pane — keys match panelRows.values in flight-pane.tsx */
const DEFAULT_FLIGHT_COLUMNS: ColumnConfig[] = [
  { key: 'regNo', label: 'RegNo', width: 70, visible: true, order: 1, row: 1 },
  { key: 'fleet', label: 'Fleet', width: 60, visible: true, order: 2, row: 1 },
]

/** Default columns for Scenario Roster pane — visible: CrewId/Rank/Base/Sen/MCred/MDO (≈246px). */
const DEFAULT_SCENARIO_ROSTER_COLUMNS: ColumnConfig[] = [
  { key: 'crewId',    label: 'CrewId', width: 54, visible: true,  order: 1, row: 1 },
  { key: 'rank',      label: 'Rank',   width: 36, visible: true,  order: 2, row: 1 },
  { key: 'base',      label: 'Base',   width: 36, visible: true,  order: 3, row: 1 },
  { key: 'seniority', label: 'Sen',    width: 38, visible: true,  order: 4, row: 1 },
  { key: 'mcred',     label: 'RpCred', width: 50, visible: true,  order: 5, row: 1 },
  { key: 'mdo',       label: 'RpDO',   width: 40, visible: true,  order: 6, row: 1 },
  { key: 'ybh',       label: 'YBH',    width: 52, visible: false, order: 7, row: 1 },
]

type ColumnMap = Record<PaneType, ColumnConfig[]>

/** Cache for getVisibleColumns to avoid returning new arrays when data hasn't changed */
const visibleColumnsCache = new Map<PaneType, { source: ColumnConfig[]; result: ColumnConfig[] }>()

const getDefaultColumns = (): ColumnMap => ({
  'roster-main':     structuredClone(DEFAULT_ROSTER_COLUMNS),
  'roster-sub':      structuredClone(DEFAULT_ROSTER_COLUMNS),
  'pairing':         structuredClone(DEFAULT_PAIRING_COLUMNS),
  'flight':          structuredClone(DEFAULT_FLIGHT_COLUMNS),
  'scenario-roster': structuredClone(DEFAULT_SCENARIO_ROSTER_COLUMNS),
  // 'scenario-pairing' exists only as a sort-state key in pane-store; columns are
  // read via getColumns('pairing'), so it mirrors the pairing column defaults.
  'scenario-pairing': structuredClone(DEFAULT_PAIRING_COLUMNS),
  'scenario-flight':  structuredClone(DEFAULT_FLIGHT_COLUMNS),
})

interface ColumnStore {
  columns: ColumnMap

  /** Get columns for a specific pane */
  getColumns: (paneType: PaneType) => ColumnConfig[]

  /** Get visible columns for a pane, sorted by order */
  getVisibleColumns: (paneType: PaneType) => ColumnConfig[]

  /** Update a column config */
  updateColumn: (paneType: PaneType, key: string, updates: Partial<ColumnConfig>) => void

  /** Reorder columns */
  reorderColumns: (paneType: PaneType, columns: ColumnConfig[]) => void

  /** Reset columns for a pane to defaults */
  resetColumns: (paneType: PaneType) => void

  /** Load from localStorage */
  loadFromStorage: () => void

  /** Save to localStorage */
  saveToStorage: () => void
}

export const useColumnStore = create<ColumnStore>((set, get) => ({
  columns: getDefaultColumns(),

  getColumns: (paneType) => get().columns[paneType],

  getVisibleColumns: (paneType) => {
    const source = get().columns[paneType]
    const cached = visibleColumnsCache.get(paneType)
    if (cached && cached.source === source) return cached.result
    const result = source.filter((c) => c.visible).sort((a, b) => a.order - b.order)
    visibleColumnsCache.set(paneType, { source, result })
    return result
  },

  updateColumn: (paneType, key, updates) => {
    set((state) => {
      const updated = state.columns[paneType].map((c) =>
        c.key === key ? { ...c, ...updates } : c,
      )
      const newColumns = { ...state.columns, [paneType]: updated }
      return { columns: newColumns }
    })
    get().saveToStorage()
  },

  reorderColumns: (paneType, columns) => {
    set((state) => ({
      columns: { ...state.columns, [paneType]: columns },
    }))
    get().saveToStorage()
  },

  resetColumns: (paneType) => {
    const defaults = getDefaultColumns()
    set((state) => ({
      columns: { ...state.columns, [paneType]: defaults[paneType] },
    }))
    get().saveToStorage()
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const rawParsed = JSON.parse(raw) as Record<string, unknown>
      const defaults = getDefaultColumns()

      // Versioned format: { v: number, cols: ColumnMap }
      // Unversioned (old) format: { 'roster-main': [...], ... } — treated as v1.
      const storedVersion = typeof rawParsed['v'] === 'number' ? rawParsed['v'] : 1
      if (storedVersion < COLUMN_SCHEMA_VERSION) {
        // Schema changed — reset all columns to new defaults.
        set({ columns: defaults })
        get().saveToStorage()
        return
      }

      const parsed = (rawParsed['cols'] ?? rawParsed) as Partial<ColumnMap>
      const merged: ColumnMap = {
        'roster-main':     parsed['roster-main']     ?? defaults['roster-main'],
        'roster-sub':      parsed['roster-sub']      ?? defaults['roster-sub'],
        'pairing':         parsed['pairing']         ?? defaults['pairing'],
        'flight':          parsed['flight']          ?? defaults['flight'],
        'scenario-roster': parsed['scenario-roster'] ?? defaults['scenario-roster'],
        'scenario-pairing': parsed['scenario-pairing'] ?? defaults['scenario-pairing'],
        'scenario-flight':  parsed['scenario-flight']  ?? defaults['scenario-flight'],
      }
      set({ columns: merged })
    } catch {
      // Ignore corrupt localStorage data
    }
  },

  saveToStorage: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: COLUMN_SCHEMA_VERSION, cols: get().columns }))
    } catch {
      // Ignore storage full errors
    }
  },
}))
