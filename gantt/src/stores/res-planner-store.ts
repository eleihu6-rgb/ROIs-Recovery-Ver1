// gantt/src/stores/res-planner-store.ts
//
// RES Pairing Planner store — multi-select assignments (PRAM/PRMM/PRPM/…).
// Cell key: date + base + assignment (not AM/PM binary).
import { create } from 'zustand'

export type ResPlannerTab = 'define' | 'review' | 'manage'
export type ResDivision = 'P' | 'C'
export type ResSelMode = 'day' | 'range' | 'dow'

/** One rank+plan pair inside a cell's composition. */
export interface ResCellComposition {
  rank: string
  plan: number
}

/** Backend-contract cell: one (date × base × assignment) entry. */
export interface ResPlannerCell {
  date: string
  base: string
  assignment: string
  window: { start: string; end: string }
  composition: ResCellComposition[]
}

/** One selectable RES call type from dictionary.RES_CALL_TYPE. */
export interface ResCallOption {
  dictCode: string
  assignment: string
  start: string
  end: string
  crosses: boolean
}

/** Plan brush: division → assignment → base → rank → plan count. */
export type ResBrush = Record<
  'P' | 'C',
  Record<string, Record<string, Record<string, number>>>
>

/** Ranks for each division. */
export const DIVISION_RANKS: Record<'P' | 'C', string[]> = {
  P: ['CA', 'FO'],
  C: ['IFD', 'FA'],
}

/** Static fallback options when dictionary has not loaded yet. */
export const FALLBACK_CALL_OPTIONS: Record<'P' | 'C', ResCallOption[]> = {
  P: [
    { dictCode: 'P_AM', assignment: 'PRAM', start: '04:00', end: '16:00', crosses: false },
    { dictCode: 'P_MM', assignment: 'PRMM', start: '10:00', end: '22:00', crosses: false },
    { dictCode: 'P_PM', assignment: 'PRPM', start: '14:00', end: '23:59', crosses: false },
  ],
  C: [
    { dictCode: 'C_AM', assignment: 'CRAM', start: '03:00', end: '15:00', crosses: false },
    { dictCode: 'C_PM', assignment: 'CRPM', start: '10:00', end: '22:00', crosses: false },
  ],
}

const DEFAULT_BASES = ['YVR', 'YEG', 'YYZ']

const emptyRankPlans = (division: ResDivision): Record<string, number> =>
  Object.fromEntries(DIVISION_RANKS[division].map((r) => [r, 0]))

const defaultBrushForDivision = (division: ResDivision, assignments: string[]): Record<string, Record<string, Record<string, number>>> => {
  const out: Record<string, Record<string, Record<string, number>>> = {}
  for (const code of assignments) {
    out[code] = {}
    for (const base of DEFAULT_BASES) {
      out[code][base] = emptyRankPlans(division)
      // Sensible non-zero defaults for pilot/cabin (same spirit as old brush).
      if (division === 'P') {
        out[code][base] = { CA: 5, FO: 5 }
      } else {
        out[code][base] = { IFD: 2, FA: 6 }
      }
    }
  }
  return out
}

const buildDefaultBrush = (): ResBrush => ({
  P: defaultBrushForDivision('P', FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment)),
  C: defaultBrushForDivision('C', FALLBACK_CALL_OPTIONS.C.map((o) => o.assignment)),
})

export interface ResPlannerResult {
  created: number
  skipped: number
  codes: string[]
}

interface ResPlannerState {
  isOpen: boolean
  open: () => void
  close: () => void

  lastResult: ResPlannerResult | null
  setLastResult: (result: ResPlannerResult | null) => void

  tab: ResPlannerTab
  setTab: (tab: ResPlannerTab) => void

  division: ResDivision
  setDivision: (division: ResDivision) => void

  focusBase: string
  setFocusBase: (base: string) => void

  dateRange: { start: string; end: string } | null
  setDateRange: (range: { start: string; end: string } | null) => void

  selMode: ResSelMode
  setSelMode: (mode: ResSelMode) => void

  dow: number[]
  setDow: (dow: number[]) => void

  days: string[]
  setDays: (days: string[]) => void

  rangeStart: string | null
  setRangeStart: (date: string | null) => void

  rangeEnd: string | null
  setRangeEnd: (date: string | null) => void

  /** Options from RES_CALL_TYPE (+ assignment fixed windows overlaid when loaded). */
  callOptions: Record<'P' | 'C', ResCallOption[]>
  setCallOptions: (division: ResDivision, options: ResCallOption[]) => void

  /** Multi-selected assignment codes for the active division. */
  selectedAssignments: string[]
  toggleAssignment: (code: string) => void
  setSelectedAssignments: (codes: string[]) => void

  cells: ResPlannerCell[]
  setCells: (cells: ResPlannerCell[]) => void
  mergeCells: (incoming: ResPlannerCell[]) => void
  clearCells: () => void

  brush: ResBrush
  setBrushValue: (
    division: ResDivision,
    assignment: string,
    base: string,
    rank: string,
    value: number,
  ) => void
  ensureBrushBase: (assignment: string, base: string) => void

  /** Per-assignment editable windows (session override; not written back to DB). */
  windows: Record<string, { start: string; end: string }>
  setAssignmentWindow: (assignment: string, window: { start: string; end: string }) => void
  ensureWindowsFromOptions: () => void
}

export const useResPlannerStore = create<ResPlannerState>()((set, get) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  lastResult: null,
  setLastResult: (lastResult) => set({ lastResult }),

  tab: 'define',
  setTab: (tab) => set({ tab }),

  division: 'P',
  setDivision: (division) => {
    const opts = get().callOptions[division]
    const defaults = opts.map((o) => o.assignment)
    set({
      division,
      selectedAssignments: defaults,
    })
    get().ensureWindowsFromOptions()
  },

  focusBase: 'ALL',
  setFocusBase: (focusBase) => set({ focusBase }),

  dateRange: null,
  setDateRange: (dateRange) => set({ dateRange }),

  selMode: 'dow',
  setSelMode: (selMode) => set({ selMode }),

  dow: [1],
  setDow: (dow) => set({ dow }),

  days: [],
  setDays: (days) => set({ days }),

  rangeStart: null,
  setRangeStart: (rangeStart) => set({ rangeStart }),

  rangeEnd: null,
  setRangeEnd: (rangeEnd) => set({ rangeEnd }),

  callOptions: {
    P: [...FALLBACK_CALL_OPTIONS.P],
    C: [...FALLBACK_CALL_OPTIONS.C],
  },
  setCallOptions: (division, options) => {
    set((s) => {
      const nextOpts = { ...s.callOptions, [division]: options }
      const codes = options.map((o) => o.assignment)
      const selected = s.selectedAssignments.filter((c) => codes.includes(c))
      return {
        callOptions: nextOpts,
        selectedAssignments:
          division === s.division
            ? (selected.length > 0 ? selected : codes)
            : s.selectedAssignments,
      }
    })
    get().ensureWindowsFromOptions()
  },

  selectedAssignments: FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
  toggleAssignment: (code) => {
    set((s) => {
      const has = s.selectedAssignments.includes(code)
      const selectedAssignments = has
        ? s.selectedAssignments.filter((c) => c !== code)
        : [...s.selectedAssignments, code]
      return { selectedAssignments }
    })
  },
  setSelectedAssignments: (selectedAssignments) => set({ selectedAssignments }),

  cells: [],
  setCells: (cells) => set({ cells }),
  mergeCells: (incoming) => {
    const existing = get().cells.filter(
      (c) => !incoming.some(
        (n) => n.date === c.date && n.base === c.base && n.assignment === c.assignment,
      ),
    )
    set({ cells: [...existing, ...incoming] })
  },
  clearCells: () => set({ cells: [] }),

  brush: buildDefaultBrush(),
  setBrushValue: (division, assignment, base, rank, value) => {
    set((s) => {
      const next = JSON.parse(JSON.stringify(s.brush)) as ResBrush
      if (!next[division][assignment]) next[division][assignment] = {}
      if (!next[division][assignment][base]) {
        next[division][assignment][base] = emptyRankPlans(division)
      }
      next[division][assignment][base][rank] = value
      return { brush: next }
    })
  },
  ensureBrushBase: (assignment, base) => {
    set((s) => {
      const next = JSON.parse(JSON.stringify(s.brush)) as ResBrush
      for (const div of ['P', 'C'] as const) {
        if (!next[div][assignment]) next[div][assignment] = {}
        if (!next[div][assignment][base]) {
          next[div][assignment][base] = emptyRankPlans(div)
        }
      }
      return { brush: next }
    })
  },

  windows: Object.fromEntries(
    [...FALLBACK_CALL_OPTIONS.P, ...FALLBACK_CALL_OPTIONS.C].map((o) => [
      o.assignment,
      { start: o.start, end: o.end },
    ]),
  ),
  setAssignmentWindow: (assignment, window) => {
    set((s) => ({
      windows: { ...s.windows, [assignment]: window },
    }))
  },
  ensureWindowsFromOptions: () => {
    set((s) => {
      const windows = { ...s.windows }
      for (const div of ['P', 'C'] as const) {
        for (const opt of s.callOptions[div]) {
          if (!windows[opt.assignment]) {
            windows[opt.assignment] = { start: opt.start, end: opt.end }
          }
        }
      }
      return { windows }
    })
  },
}))
