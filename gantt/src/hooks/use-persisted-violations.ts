import { useEffect } from 'react'
import { api } from '@/services/api'
import type { ViolationItem } from '@/services/rule-session-api'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useFilterStore } from '@/stores/filter-store'
import { useCrewStore } from '@/stores/crew-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { resolveViolationViewBounds } from '@/utils/violation-display-window'

interface ViolationEntry {
  ruleCode: string
  ruleInstance: string | null
  severity: number
  actualValue: number | null
  limitValue: number | null
  unit: string | null
  message: string
  startDt?: string | null
  endDt?: string | null
  windowStartDt?: string | null
  windowEndDt?: string | null
}

/** Map a DB row to the ViolationItem shape expected by the store */
function toViolationItem(e: ViolationEntry): ViolationItem {
  return {
    ruleCode:     e.ruleCode,
    ruleInstance: e.ruleInstance ?? null,
    ruleName:     e.ruleCode,      // ruleName not stored in rule_violation; fall back to code
    passed:      false,           // only violations (passed=false) are stored
    severity:    e.severity,
    actualValue: e.actualValue ?? 0,
    limitValue:  e.limitValue ?? 0,
    unit:        e.unit ?? '',
    message:     e.message,
    startDt:       e.startDt ?? null,
    endDt:         e.endDt ?? null,
    windowStartDt: e.windowStartDt ?? null,
    windowEndDt:   e.windowEndDt ?? null,
  }
}

interface ViolationsResponseItem {
  pairingId: number | null
  crewId: string
  groupCode: string
  checkResults: ViolationEntry[]
}

interface ViolationsApiResponse {
  code: number
  data: ViolationsResponseItem[]
  message: string
}

// Batch size for violations queries: 815 crew IDs in one ANY($1) clause takes > 60s
// on the remote WAN Postgres; 100 IDs per query completes in ~5-10s, and 8-9 batches
// running in parallel finish in the same 5-10s window.
const VIOLATIONS_BATCH = 100
const VIOLATIONS_TIMEOUT = 30_000

async function fetchPersistedViolations(
  crewIds: string[],
  groupCode: string,
  start: Date,
  end: Date,
): Promise<ViolationsResponseItem[]> {
  if (crewIds.length === 0) return []

  const sharedParams = {
    groupCode,
    // Official RP / dateRange only — no ±1 calendar-month expansion (that pulled
    // lead-in month findings into multi-RP views).
    start: start.toISOString(),
    end: end.toISOString(),
  }

  // Split into batches and run in parallel — a single 815-crew query exceeds WAN latency
  // budgets; batches of 100 are fast enough individually and finish concurrently.
  const batches: string[][] = []
  for (let i = 0; i < crewIds.length; i += VIOLATIONS_BATCH) {
    batches.push(crewIds.slice(i, i + VIOLATIONS_BATCH))
  }

  const batchResults = await Promise.all(
    batches.map((batch) => {
      const params = new URLSearchParams({ ...sharedParams, crewIds: batch.join(',') })
      // Use the shared `api` instance — it carries the Authorization header that auth-store
      // sets on login/restore. The shared interceptor already unwraps the { code, data }
      // envelope, so the response IS the violations array.
      return api.get(`/api/violations?${params}`, { timeout: VIOLATIONS_TIMEOUT }) as unknown as ViolationsResponseItem[]
    }),
  )

  return batchResults.flat()
}

/**
 * Fetches persisted violations from rule_violation table and writes them into
 * sessionViolationStore.persistedViolations (full replace per successful fetch).
 *
 * Triggers on:
 *  1. Initial mount (load existing violations for current view)
 *  2. Zustand subscription fires when selectedCrewIds.length changes (handles the case
 *     where React's re-render batching doesn't propagate the dep change to useEffect)
 *  3. 'violations:updated' custom WS event (violation_worker finished recomputing)
 */
/** Monotonic fetch id — stale in-flight responses must not replace a newer window. */
let persistedViolationsFetchSeq = 0

export function usePersistedViolations() {
  // Use the TOOLBAR's active rule group (useRuleCheckStore.ruleGroupCode — the one the
  // RuleGroupSelector shows/controls). Post Model-B drop, the toolbar group source moved
  // from rule_group (group_code) → the default RULE workset id ('103'); the persisted
  // result tables' rule_group_code column now holds that workset-id string. The default
  // fallback below mirrors getDefaultRuleGroupCode (workset 103).
  // `||` (not `??`) so the empty-string initial value also falls back before the
  // selector resolves the default.
  const groupCode = useRuleCheckStore((s) => s.ruleGroupCode || '103')
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedRosterPeriodRange = useFilterStore((s) => s.selectedRosterPeriodRange)
  const replacePersistedViolations = useSessionViolationStore((s) => s.replacePersistedViolations)

  const doFetch = async (currentGroupCode: string) => {
    // Read fresh from the store — the React re-render for selectedCrewIds sometimes doesn't
    // reach this useEffect on slow-load paths (React concurrent-mode batching can defer the
    // re-render after the Zustand store update, so the closure captures stale []). Reading
    // directly from getState() always gives the current value.
    const currentCrewIds = useCrewStore.getState().selectedCrewIds
    const filterState = useFilterStore.getState()
    const viewBounds = resolveViolationViewBounds(
      filterState.dateRange,
      filterState.selectedRosterPeriodRange,
    )
    const fetchId = ++persistedViolationsFetchSeq
    try {
      const items = await fetchPersistedViolations(
        currentCrewIds,
        currentGroupCode,
        viewBounds.start,
        viewBounds.end,
      )
      if (fetchId !== persistedViolationsFetchSeq) {
        console.info(`[PersistedViolations] stale fetch discarded (id=${fetchId}, latest=${persistedViolationsFetchSeq})`)
        return
      }
      // pairing_id is a bigint → JSON-serialized as a STRING by the API. The store
      // and roster items key pairings by NUMBER, so coerce here — otherwise the
      // string key never matches (bell + Alert Center crew attribution both fail).
      const entries = items
        .filter((item): item is ViolationsResponseItem & { pairingId: number } => item.pairingId !== null)
        .map((item) => ({
          crewId: item.crewId,
          pairingId: Number(item.pairingId),
          violations: item.checkResults.map(toViolationItem),
        }))
      replacePersistedViolations(entries)
      // Visible breadcrumb (not silent) so an empty Alert Center can be diagnosed from the
      // console: confirms the fetch ran, with what group/crew count, and how many landed.
      console.info(`[PersistedViolations] group=${currentGroupCode} crew=${currentCrewIds.length} → ${items.length} groups, ${entries.length} pairings replaced`)
    } catch (err) {
      // Non-fatal, but DON'T swallow — log so a failed fetch (401/404/shape) is visible.
      console.warn(`[PersistedViolations] fetch failed (group=${currentGroupCode}, crew=${currentCrewIds.length}):`, err)
    }
  }

  // Fetch on mount and whenever group or date range changes.
  // Also subscribe directly to the Zustand store for selectedCrewIds changes: this fires
  // when crew loads regardless of React rendering (bypasses the batching issue where React
  // defers the re-render and the useEffect never sees the new selectedCrewIds value).
  useEffect(() => {
    void doFetch(groupCode)

    let prevLength = useCrewStore.getState().selectedCrewIds.length
    const unsub = useCrewStore.subscribe((state) => {
      const newLength = state.selectedCrewIds.length
      if (newLength !== prevLength) {
        prevLength = newLength
        if (newLength > 0) void doFetch(groupCode)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    groupCode,
    dateRange.start,
    dateRange.end,
    selectedRosterPeriodRange?.startMs,
    selectedRosterPeriodRange?.endMs,
  ])

  // Re-fetch when violation_worker signals a recompute finished
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ groupCode: string }>).detail
      // Only refetch if the update is for our current group code
      if (detail.groupCode === groupCode) {
        void doFetch(groupCode)
      }
    }
    window.addEventListener('violations:updated', handler)
    return () => window.removeEventListener('violations:updated', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    groupCode,
    dateRange.start,
    dateRange.end,
    selectedRosterPeriodRange?.startMs,
    selectedRosterPeriodRange?.endMs,
  ])
}
