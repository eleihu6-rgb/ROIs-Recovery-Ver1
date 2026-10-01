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
  /** Show the L2 plan card for everything pending (R'Bot then saves only after the user approves). */
  | { type: 'save_changes' }
  /** Undo the last N draft changes (draft only, nothing saved). */
  | { type: 'undo_changes'; count: number }
  /** Open the Live Recovery dialog for recoverable alerts (8004 / 1001 / 3007), optionally scoped. */
  | { type: 'recover_violation'; crewId?: string; ruleCode?: string; pairing?: string; date?: string }
  /** Open "Recovery — open seats" for one pairing with an open position. */
  | { type: 'recover_open_pairing'; pairing: string; date?: string }
  /** Open Best-fit crew for named pairings, or the open pairings in view when none are named. */
  | { type: 'best_fit_crew'; pairings: string[]; date?: string; ranks?: string[] }
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
  /** Open the Pairing Build Automation dialog pre-filled from the chat order. */
  | {
      type: 'build_pairings'
      base: string
      start: string
      end: string
      fleets?: string[]
      composition?: Array<{ rank: string; plan: number }>
      rules?: {
        checkinMin?: number
        debriefMin?: number
        restMin?: number
        maxDutyBlockMin?: number
        singleLegExemption?: boolean
      }
    }
  /** Open the Auto-assign open pairings dialog for the named crew (stages a draft). */
  | { type: 'auto_assign_pairings'; crewIds: string[]; start: string; end: string }

export interface ChatResponse {
  role: 'assistant'
  content: string
  actions: AiAction[]
}
