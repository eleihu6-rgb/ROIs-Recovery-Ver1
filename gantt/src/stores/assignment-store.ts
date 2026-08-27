import { create } from 'zustand'
import { api } from '@/services/api'

/** Assignment group from database */
export interface AssignmentGroupItem {
  assignmentGroup: string
  name: string
  color: string | null
}

interface AssignmentRecord {
  assignment: string
  colorHex: string
}

interface AssignmentStore {
  /** All assignment groups loaded from API */
  groups: AssignmentGroupItem[]
  /** Color map: assignment_group code → hex color */
  colorMap: Map<string, string>
  /** Color map: individual assignment code → hex color (from assignment.color_hex) */
  assignmentColorMap: Map<string, string>
  /** Whether data is loaded */
  loaded: boolean

  /** Fetch assignment groups and individual assignment colors from API */
  fetchGroups: () => Promise<void>
  /** Get color for an assignment group (with fallback) */
  getColor: (group: string) => string
  /** Get color for an individual assignment code, falling back to group color */
  getAssignmentColor: (assignment: string | null, group: string) => string
  /** Get all groups for dropdown/select */
  getGroups: () => AssignmentGroupItem[]
  /** Check if a group is flight-related (needs rule checking) */
  isFlightGroup: (group: string) => boolean
}

/** Default colors as fallback if API hasn't loaded yet */
const DEFAULT_COLORS: Record<string, string> = {
  FLT: '#3b82f6',
  DHD: '#60a5fa',
  GND: '#a855f7',
  TRN: '#22c55e',
  SBY: '#f97316',
  LVE: '#9ca3af',
  ADM: '#ec4899',
}

/**
 * Fallback colors keyed by individual assignment code.
 * Used when assignmentColorMap is not yet populated (e.g. API error, cold cache).
 * roster_flight stores 'GRD' as assignment_group for reserve/standby tasks,
 * but 'GRD' doesn't exist in the assignment_group table → group-level fallback fails.
 * These per-code constants fill that gap.
 */
const ASSIGNMENT_FALLBACK_COLORS: Record<string, string> = {
  RES:  '#66CDAA',
  SBY:  '#66CDAA',
  ASBY: '#20B2AA',
  SSB:  '#20B2AA',
}

/** Groups that require rule checking (flight-related duties) */
const FLIGHT_GROUPS = new Set(['FLT', 'DHD'])

export const useAssignmentStore = create<AssignmentStore>((set, get) => ({
  groups: [],
  colorMap: new Map(),
  assignmentColorMap: new Map(),
  loaded: false,

  fetchGroups: async () => {
    try {
      const [groupData, assignmentData] = await Promise.all([
        api.get('/api/assignment/group') as Promise<AssignmentGroupItem[]>,
        api.get('/api/assignment') as Promise<AssignmentRecord[]>,
      ])
      const colorMap = new Map<string, string>()
      for (const g of groupData) {
        if (g.color) colorMap.set(g.assignmentGroup, g.color)
      }
      const assignmentColorMap = new Map<string, string>()
      for (const a of assignmentData) {
        if (a.colorHex) assignmentColorMap.set(a.assignment, `#${a.colorHex}`)
      }
      set({ groups: groupData, colorMap, assignmentColorMap, loaded: true })
    } catch {
      // Use defaults if API fails
      const colorMap = new Map(Object.entries(DEFAULT_COLORS))
      set({ colorMap, loaded: true })
    }
  },

  getColor: (group) => {
    const { colorMap } = get()
    return colorMap.get(group) ?? DEFAULT_COLORS[group] ?? '#6b7280'
  },

  getAssignmentColor: (assignment, group) => {
    const { assignmentColorMap, colorMap } = get()
    if (assignment) {
      const c = assignmentColorMap.get(assignment) ?? ASSIGNMENT_FALLBACK_COLORS[assignment]
      if (c) return c
    }
    return colorMap.get(group) ?? DEFAULT_COLORS[group] ?? '#6b7280'
  },

  getGroups: () => get().groups,

  isFlightGroup: (group) => FLIGHT_GROUPS.has(group),
}))
