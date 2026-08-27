import { useEffect, useRef } from 'react'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { usePaneStore } from '@/stores/pane-store'
import type { RosterItem } from '@/types'
import { format } from 'date-fns'

// Rule-check debounce timings (ms). First load waits longer so the first paint
// settles before the expensive full-roster check runs (§First-Paint); incremental
// edits and rule-group switches react faster.
const FIRST_LOAD_CHECK_DELAY_MS = 1500
const INCREMENTAL_CHECK_DELAY_MS = 500
const RULE_GROUP_SWITCH_DELAY_MS = 300

/**
 * Watch roster data changes and trigger rule checks.
 * - First load: full check all crews
 * - Subsequent changes: incremental check changed crews only
 * - Rule group switch: full re-check
 */
export const useRuleCheck = () => {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(0)
  const prevItemsRef = useRef<RosterItem[]>([])
  const prevCountRef = useRef(0)
  const prevRuleGroupRef = useRef('')

  const mainItems = useRosterStore((s) => s.main.rosterItems)
  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
  const ruleGroupCode = useRuleCheckStore((s) => s.ruleGroupCode)

  // Roster data changes → trigger check
  useEffect(() => {
    if (mainItems.length === 0 || selectedCrewIds.length === 0) return

    const isFirstLoad = prevCountRef.current === 0 && mainItems.length > 0
    const prevItems = prevItemsRef.current
    prevItemsRef.current = mainItems
    prevCountRef.current = mainItems.length

    // Determine which crews to check
    let crewsToCheck: string[]

    if (isFirstLoad) {
      // First load: check all crews
      crewsToCheck = selectedCrewIds

      // Load authoritative violations from DB
      const { dateRange } = usePaneStore.getState()
      const { ruleGroupCode, loadAuthoritative } = useRuleCheckStore.getState()
      void loadAuthoritative(
        selectedCrewIds,
        format(dateRange.start, 'yyyy-MM-dd'),
        format(dateRange.end, 'yyyy-MM-dd'),
        ruleGroupCode,
      )
    } else if (prevItems === mainItems) {
      // Same reference, no change
      return
    } else {
      // Incremental: only changed crews
      crewsToCheck = findChangedCrews(prevItems, mainItems)
      if (crewsToCheck.length === 0) return
    }

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Skip if a check is already in flight — the active flow (assign-pairing's
      // lock-before-addOp, a save legality check, or an open confirm dialog)
      // owns the `checking` flag and will release it. Running checkCrews here
      // would race: its runChecks takes ~1s, and on completion it sets
      // `checking: false` — opening a brief window where the toolbar's
      // Save/Undo light up before the active flow's confirm dialog appears
      // (SIT regression: drag pairing → crew row, 8004/001 violation).
      if (useRuleCheckStore.getState().checking) return
      useRuleCheckStore.getState().checkCrews(crewsToCheck, mainItems)
    }, isFirstLoad ? FIRST_LOAD_CHECK_DELAY_MS : INCREMENTAL_CHECK_DELAY_MS)

    return () => clearTimeout(timerRef.current)
  }, [mainItems, selectedCrewIds])

  // Rule group switch → full re-check
  useEffect(() => {
    if (!prevRuleGroupRef.current) {
      prevRuleGroupRef.current = ruleGroupCode
      return
    }
    if (prevRuleGroupRef.current === ruleGroupCode) return
    prevRuleGroupRef.current = ruleGroupCode

    if (mainItems.length === 0 || selectedCrewIds.length === 0) return

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (useRuleCheckStore.getState().checking) return
      useRuleCheckStore.getState().checkCrews(selectedCrewIds, mainItems)
    }, RULE_GROUP_SWITCH_DELAY_MS)
  }, [ruleGroupCode, mainItems, selectedCrewIds])
}

const findChangedCrews = (prev: RosterItem[], curr: RosterItem[]): string[] => {
  const changed = new Set<string>()
  const prevMap = new Map<number, RosterItem>()
  const currMap = new Map<number, RosterItem>()
  for (const item of prev) prevMap.set(item.id, item)
  for (const item of curr) currMap.set(item.id, item)

  for (const item of curr) {
    const old = prevMap.get(item.id)
    if (!old) {
      changed.add(item.crewId)
    } else if (
      old.crewId !== item.crewId ||
      old.schStrDtUtc !== item.schStrDtUtc ||
      old.schEndDtUtc !== item.schEndDtUtc ||
      old.pairingId !== item.pairingId ||
      old.assignmentGroup !== item.assignmentGroup ||
      old.dutySeq !== item.dutySeq
    ) {
      changed.add(old.crewId)
      changed.add(item.crewId)
    }
  }

  for (const item of prev) {
    if (!currMap.has(item.id)) changed.add(item.crewId)
  }

  return [...changed]
}
