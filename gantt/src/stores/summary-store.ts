import { create } from 'zustand'

/** Summary data for a single day in the summary bar */
export interface DaySummary {
  date: string                                  // YYYY-MM-DD
  totalCrew: number
  byRank: Record<string, number>                // rank -> count
  byAssignmentGroup: AssignmentGroupSummary[]
}

/** One assignment group's count and color for a given day */
export interface AssignmentGroupSummary {
  assignmentGroup: string
  count: number
  color: string
  percentage: number                            // 0-100
}

interface SummaryStore {
  /** Summary data keyed by date string */
  dailySummaries: Map<string, DaySummary>
  loading: boolean

  /** Compute summaries from current roster data */
  computeSummaries: (rosterItems: { assignmentGroup: string; crewId: string; schStrDtUtc: string | null }[]) => void

  /** Get summary for a specific date */
  getSummary: (date: string) => DaySummary | undefined

  /** Clear summaries */
  clear: () => void
}

/** Default color mapping for common assignment groups */
const GROUP_COLORS: Record<string, string> = {
  FLT: '#3b82f6',    // blue
  OFF: '#22c55e',    // green
  SBY: '#eab308',    // yellow
  TRN: '#a855f7',    // purple
  GND: '#f97316',    // orange
  LVE: '#06b6d4',    // cyan
}

const getGroupColor = (group: string): string =>
  GROUP_COLORS[group] ?? '#6b7280'  // gray fallback

export const useSummaryStore = create<SummaryStore>((set, get) => ({
  dailySummaries: new Map(),
  loading: false,

  computeSummaries: (rosterItems) => {
    const dateMap = new Map<string, { crews: Set<string>; groups: Map<string, Set<string>>; ranks: Map<string, Set<string>> }>()

    for (const item of rosterItems) {
      if (!item.schStrDtUtc) continue
      const date = item.schStrDtUtc.slice(0, 10)

      let entry = dateMap.get(date)
      if (!entry) {
        entry = { crews: new Set(), groups: new Map(), ranks: new Map() }
        dateMap.set(date, entry)
      }

      entry.crews.add(item.crewId)

      const group = item.assignmentGroup
      if (!entry.groups.has(group)) entry.groups.set(group, new Set())
      entry.groups.get(group)!.add(item.crewId)
    }

    const summaries = new Map<string, DaySummary>()
    for (const [date, entry] of dateMap) {
      const totalCrew = entry.crews.size
      const byAssignmentGroup: AssignmentGroupSummary[] = []

      for (const [group, crewSet] of entry.groups) {
        byAssignmentGroup.push({
          assignmentGroup: group,
          count: crewSet.size,
          color: getGroupColor(group),
          percentage: totalCrew > 0 ? Math.round((crewSet.size / totalCrew) * 100) : 0,
        })
      }

      // Sort by count descending
      byAssignmentGroup.sort((a, b) => b.count - a.count)

      summaries.set(date, {
        date,
        totalCrew,
        byRank: {},  // To be enriched when crew data is available
        byAssignmentGroup,
      })
    }

    set({ dailySummaries: summaries })
  },

  getSummary: (date) => get().dailySummaries.get(date),

  clear: () => set({ dailySummaries: new Map() }),
}))
