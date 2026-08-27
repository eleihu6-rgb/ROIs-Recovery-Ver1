import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useCrewMemoStore } from '@/stores/crew-memo-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { crewMemoApi } from '@/services/crew-memo-api'
import { api } from '@/services/api'
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'
import { crewBaseForId, filterGroundTaskAssignments, localToUtc } from '@/components/roster/ground-task-dialog'
import { notify } from '@/utils/notify'
import type { PaneType } from '@/types'
import type { RosterItem, CreateGroundTaskInput } from '@/types/roster'
import type { AssignmentOption } from '@/components/roster/ground-task-dialog'
import type { AiAction } from './types'

/** Whitelist mapping the action's logical paneId to a concrete pane-store PaneType. */
const SORT_PANES: Record<string, PaneType> = {
  roster: 'roster-main',
  'roster-main': 'roster-main',
}

const ROSTER_SORT_FIELDS = new Set(['crewId', 'seniority', 'rank', 'base', 'mcred', 'mdo'])

const normalizeRosterSortCriteria = (action: Extract<AiAction, { type: 'sort_roster' }>) => {
  const raw = action.criteria?.length
    ? action.criteria
    : action.field
      ? [{ column: action.field, direction: action.direction ?? 'asc' }]
      : []

  return raw
    .filter((c) => ROSTER_SORT_FIELDS.has(c.column))
    .map((c) => ({
      column: c.column,
      direction: c.direction === 'desc' ? 'desc' as const : 'asc' as const,
    }))
}

/**
 * Resolve a human-legible crew reference (crewId + optional pairing label / calendar date) to
 * the concrete RosterItem row(s) it refers to in the currently-loaded Live main roster pane.
 * Mirrors what a manual drag-drop already requires: the crew and its duty must be rendered on
 * the roster before an operation can touch it. Multiple rows come back together only when they
 * belong to the SAME pairing (multi-segment duty) — anything else is reported as ambiguous.
 */
function resolveCrewTasks(
  crewId: string,
  ref: { pairingLabel?: string; date?: string },
): { items: RosterItem[] } | { error: string } {
  const pane = useRosterStore.getState().main
  if (!pane.crewList.some((c) => c.crewId === crewId)) {
    return { error: `Crew ${crewId} is not currently loaded into the roster — load them into the roster first.` }
  }
  const all = pane.rosterItems.filter((i) => i.crewId === crewId)
  if (all.length === 0) {
    return { error: `Crew ${crewId} has no duty currently loaded on the roster.` }
  }

  let candidates = all
  if (ref.pairingLabel) {
    const label = ref.pairingLabel.trim().toUpperCase()
    candidates = all.filter((i) => (i.pairingLabel ?? '').toUpperCase() === label)
    if (candidates.length === 0) {
      return { error: `Crew ${crewId} has no pairing "${ref.pairingLabel}" currently loaded.` }
    }
  } else if (ref.date) {
    const tz = useTimezoneStore.getState().timezone
    const dayStart = calendarDateToUtcMidnight(ref.date, tz)
    const dayEnd = endOfCalendarDayUtc(ref.date, tz)
    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
      return { error: `Could not parse date "${ref.date}".` }
    }
    candidates = all.filter((i) => {
      if (!i.schStrDtUtc || !i.schEndDtUtc) return false
      const s = new Date(i.schStrDtUtc).getTime()
      const e = new Date(i.schEndDtUtc).getTime()
      return s < dayEnd.getTime() && e > dayStart.getTime()
    })
    if (candidates.length === 0) {
      return { error: `Crew ${crewId} has no duty on ${ref.date}.` }
    }
  }

  // A "unit" is either one whole pairing (all its loaded segments) or one ground task row.
  const pairingIds = new Set(candidates.filter((i) => i.pairingId != null).map((i) => i.pairingId))
  const groundTaskCount = candidates.filter((i) => i.pairingId == null).length
  if (pairingIds.size + groundTaskCount > 1) {
    return {
      error: `Crew ${crewId} has more than one duty matching that reference — name a pairing label or a specific date to disambiguate.`,
    }
  }
  return { items: candidates }
}

/** Reuses the same live dictionary + filter the ground-task dialog uses, so the AI never validates against a stale/hardcoded assignment list. */
async function resolveGroundTaskAssignment(name: string): Promise<{ assignment: string } | { error: string }> {
  const options = filterGroundTaskAssignments((await api.get('/api/assignment')) as AssignmentOption[])
  const match = options.find((o) => o.assignment.toUpperCase() === name.trim().toUpperCase())
  if (!match) {
    const valid = options.map((o) => o.assignment).join(', ')
    return { error: `"${name}" is not a valid ground-task assignment. Valid options: ${valid}` }
  }
  return { assignment: match.assignment }
}

/**
 * Apply ONE AI action to the relevant Zustand store. Store mutation only — never
 * triggers a data reload (the hook centralizes a single refreshAllPanes() after all
 * actions are applied). Returns a short English confirmation chip, or null to skip.
 */
export async function dispatchAiAction(action: AiAction): Promise<string | null> {
  switch (action.type) {
    case 'filter_crew': {
      const { type: _type, ...rest } = action
      useFilterStore.getState().setCrewFilter(rest)
      return `Filtered crew (${summarize(rest)})`
    }
    case 'filter_pairing': {
      const { type: _type, ...rest } = action
      useFilterStore.getState().setPairingFilter(rest)
      return `Filtered pairings (${summarize(rest)})`
    }
    case 'filter_flight': {
      const { type: _type, ...rest } = action
      useFilterStore.getState().setFlightFilter(rest)
      return `Filtered flights (${summarize(rest)})`
    }
    case 'sort_roster': {
      const pane = SORT_PANES[action.paneId]
      if (!pane) return null
      const criteria = normalizeRosterSortCriteria(action)
      if (criteria.length === 0) return null
      usePaneStore.getState().setSortCriteria(pane, criteria)
      return `Sorted roster by ${criteria.map((c) => `${c.column} ${c.direction}`).join(', ')}`
    }
    case 'reset_filters': {
      useFilterStore.getState().resetFilters()
      return 'Cleared all filters'
    }
    case 'set_date_range': {
      // Same convention as typing into the toolbar DateRangePicker: the calendar
      // dates are interpreted in the current DISPLAY timezone (timezone-store).
      const tz = useTimezoneStore.getState().timezone
      const start = calendarDateToUtcMidnight(action.start, tz)
      const end = endOfCalendarDayUtc(action.end, tz)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
      useFilterStore.getState().setDateRange(start, end)
      return `Date range ${action.start} → ${action.end}`
    }
    case 'prepare_pa_removal': {
      // READ-ONLY: write the de-assignment plan as type=3 memos, then refresh the
      // note icons on the board. Async (API) — fire and reflect via toast + store.
      const tz = useTimezoneStore.getState().timezone
      const from = calendarDateToUtcMidnight(action.start, tz).toISOString()
      const to = endOfCalendarDayUtc(action.end, tz).toISOString()
      void crewMemoApi
        .preparePaRemoval({ bases: action.bases, ranks: action.ranks, crewIds: action.crewIds, from, to })
        .then((res) => {
          notify.success(`PA-removal marked: ${res.written} duties across ${res.crewCount} crew`)
          // Refetch memos for the actually-loaded roster crew (the pane watches this).
          useCrewMemoStore.getState().bumpRefresh()
        })
        .catch((e) => notify.error(`PA-removal failed: ${(e as Error).message}`))
      return 'Marking pre-assignment removal plan…'
    }
    // ── Phase 1 Live Roster mutations — always paneId 'main' (the R'Bot panel only ──
    // ── operates on the Live main roster); every call below stages into the draft ──
    // ── store exactly like a manual drag, never Saves/commits on its own. ──
    case 'move_task': {
      const resolved = resolveCrewTasks(action.crewId, { pairingLabel: action.pairingLabel, date: action.date })
      if ('error' in resolved) return resolved.error
      if (!useRosterStore.getState().main.crewList.some((c) => c.crewId === action.toCrewId)) {
        return `Crew ${action.toCrewId} is not currently loaded into the roster — load them into the roster first.`
      }
      const roster = useRosterStore.getState()
      let moved = 0
      for (const item of resolved.items) {
        const result = await roster.moveTask('main', item.id, action.toCrewId)
        if (result) moved++
      }
      if (moved === 0) return `Could not move crew ${action.crewId}'s duty to ${action.toCrewId}.`
      return `Moved crew ${action.crewId}'s duty (${moved} row${moved > 1 ? 's' : ''}) to crew ${action.toCrewId}`
    }
    case 'swap_tasks': {
      const resolvedA = resolveCrewTasks(action.crewIdA, { pairingLabel: action.pairingLabelA, date: action.date })
      if ('error' in resolvedA) return resolvedA.error
      const resolvedB = resolveCrewTasks(action.crewIdB, { pairingLabel: action.pairingLabelB, date: action.date })
      if ('error' in resolvedB) return resolvedB.error
      if (resolvedA.items.length > 1 || resolvedB.items.length > 1) {
        return 'Swap only supports single duties right now — a multi-segment pairing matched. Name a pairing label to pick one duty, or move each crew individually.'
      }
      const ok = await useRosterStore.getState().swapTasks('main', resolvedA.items[0].id, resolvedB.items[0].id)
      if (!ok) return `Could not swap crew ${action.crewIdA} and crew ${action.crewIdB}.`
      return `Swapped duties between crew ${action.crewIdA} and crew ${action.crewIdB}`
    }
    case 'unassign_task': {
      const resolved = resolveCrewTasks(action.crewId, { pairingLabel: action.pairingLabel, date: action.date })
      if ('error' in resolved) return resolved.error
      const pairingId = resolved.items[0].pairingId
      const roster = useRosterStore.getState()
      if (pairingId != null) {
        await roster.removeTasksByPairingAndCrew('main', pairingId, action.crewId)
      } else {
        for (const item of resolved.items) await roster.removeTask('main', item.id)
      }
      return `Removed crew ${action.crewId} from ${resolved.items[0].pairingLabel ?? 'their duty'}`
    }
    case 'add_ground_task': {
      const assignmentResult = await resolveGroundTaskAssignment(action.assignment)
      if ('error' in assignmentResult) return assignmentResult.error

      const knownCrewIds = new Set(useCrewStore.getState().items.map((c) => c.crew.crewId))
      const missing = action.crewIds.filter((id) => !knownCrewIds.has(id))
      if (missing.length > 0) return `Unknown crew id(s): ${missing.join(', ')}`

      // Single shared depArp/arvArp for the whole selection, defaulted from the first crew's
      // base — same convention the manual dialog uses (crewBaseForId(prefill?.crewId)).
      const tz = useTimezoneStore.getState().timezone
      const base = crewBaseForId(action.crewIds[0])
      const startDtUtc = action.startTime
        ? localToUtc(action.date, action.startTime, tz)
        : calendarDateToUtcMidnight(action.date, tz).toISOString()
      const endDtUtc = action.endTime
        ? localToUtc(action.endDate ?? action.date, action.endTime, tz)
        : endOfCalendarDayUtc(action.endDate ?? action.date, tz).toISOString()

      const data: CreateGroundTaskInput = {
        crewIds: action.crewIds,
        assignment: assignmentResult.assignment,
        depArp: base,
        arvArp: base,
        startDtUtc,
        endDtUtc,
        comments: action.comments,
      }
      const created = await useRosterStore.getState().addGroundTask('main', data)
      if (!created || created.length === 0) return `Could not create the ground task for ${action.crewIds.join(', ')}.`
      return `Added "${assignmentResult.assignment}" for ${created.length} of ${action.crewIds.length} crew`
    }
    default:
      return null
  }
}

function summarize(rest: Record<string, unknown>): string {
  return (
    Object.entries(rest)
      .filter(([, v]) => v != null && (!Array.isArray(v) || v.length > 0))
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
      .join(' · ') || 'no change'
  )
}
