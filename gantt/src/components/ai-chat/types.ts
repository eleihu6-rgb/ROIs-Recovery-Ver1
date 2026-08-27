export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiSortCriterion {
  column: string
  direction: 'asc' | 'desc'
}

export type AiAction =
  | { type: 'filter_crew'; divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[]; crewIds?: string[] }
  | {
      type: 'filter_pairing'
      bases?: string[]
      fleets?: string[]
      divisions?: string[]
      depArps?: string[]
      assignments?: string[]
      coverage?: Array<'open' | 'partial' | 'full' | 'over'>
      label?: string
      pairingIds?: string[]
    }
  | { type: 'filter_flight'; depArps?: string[]; arvArps?: string[]; fltNums?: string[]; fleets?: string[]; statuses?: string[] }
  | { type: 'sort_roster'; paneId: string; field?: string; direction?: 'asc' | 'desc'; criteria?: AiSortCriterion[] }
  | { type: 'reset_filters' }
  | { type: 'set_date_range'; start: string; end: string }
  | { type: 'prepare_pa_removal'; start: string; end: string; bases?: string[]; ranks?: string[]; crewIds?: string[] }
  // ── Phase 1 Live Roster mutations — stage into the draft store only, never Save/commit. ──
  | { type: 'move_task'; crewId: string; toCrewId: string; pairingLabel?: string; date?: string }
  | { type: 'swap_tasks'; crewIdA: string; crewIdB: string; date?: string; pairingLabelA?: string; pairingLabelB?: string }
  | { type: 'unassign_task'; crewId: string; pairingLabel?: string; date?: string }
  | {
      type: 'add_ground_task'
      crewIds: string[]
      assignment: string
      date: string
      endDate?: string
      startTime?: string
      endTime?: string
      comments?: string
    }

export interface ChatResponse {
  role: 'assistant'
  content: string
  actions: AiAction[]
}
