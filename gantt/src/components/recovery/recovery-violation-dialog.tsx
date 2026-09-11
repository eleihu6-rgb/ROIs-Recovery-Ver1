import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Loader2, Maximize2, Minimize2, ShieldAlert, Users } from 'lucide-react'
import { AppDialog, Button, Popover, PopoverContent, PopoverTrigger } from '@rois/ui'
import type { RosterItem } from '@/types'
import { useRosterStore } from '@/stores/roster-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useCrewStore } from '@/stores/crew-store'
import { useReferenceStore } from '@/stores/reference-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { buildRecoveryPairingPreview, useRecoveryPreviewStore } from '@/stores/recovery-preview-store'
import { useLegalityStore } from '@/stores/legality-store'
import { useFilterStore } from '@/stores/filter-store'
import { useDraftStore } from '@/stores/draft-store'
import { useLockStore } from '@/stores/lock-store'
import { legalityPreviewApi } from '@/services/legality-preview-api'
import { flightApi } from '@/services/flight-api'
import { buildRecoveryDraftPlan } from '@/services/recovery-draft'
import { recoveryTraceApi } from '@/services/recovery-api'
import { RecoveryCostBreakdownDialog } from './recovery-cost-breakdown-dialog'
import { buildRecoveryPlans, enrichPlansWithLibraryCosts, isRosterCompleted, recoveryRuleFailures, ROSTER_STABILITY_FORMULA, type CrossBaseCandidateTrace, type RecoveryAlertSnapshot, type RecoveryFlightSnapshot, type RecoveryLibraryCostFetcher, type RecoveryOption, type RecoveryPlans } from '@/services/recovery-candidates'
import { recoveryCostApi } from '@/services/recovery-api'
import { notify } from '@/utils/notify'
import { bringCrewIdsToTop } from '@/utils/bring-matches-to-top'

interface Props {
  open: boolean
  onClose: () => void
  /** One or more alerts selected in Alert Center. A single alert remains supported for hover recovery. */
  alert?: RecoveryAlertSnapshot | RecoveryAlertSnapshot[] | null
}

interface ViolationRow extends RecoveryAlertSnapshot {
  canRecover: boolean
}

const uniqueItems = (items: RosterItem[]): RosterItem[] => {
  const map = new Map<number, RosterItem>()
  for (const item of items) map.set(item.id, item)
  return [...map.values()]
}

const firstItemForPairing = (items: RosterItem[], crewId: string, pairingId: number): RosterItem | undefined =>
  items
    .filter((item) => item.crewId === crewId && Number(item.pairingId) === pairingId)
    .sort((a, b) => new Date(a.schStrDtUtc ?? 0).getTime() - new Date(b.schStrDtUtc ?? 0).getTime())[0]

const flightNumberOf = (item: RosterItem | undefined): string => {
  const label = item?.label ?? item?.assignment ?? ''
  return label.split(/\s+/)[0] || '—'
}

const crewNameOf = (crewId: string, crews: ReturnType<typeof useCrewStore.getState>['items']): string => {
  const crew = crews.find((entry) => entry.crew.crewId === crewId)?.crew
  return crew ? [crew.firstName, crew.middleName, crew.lastName].filter(Boolean).join(' ') : crewId
}

const itemFleetOf = (item: RosterItem | undefined, pairings: ReturnType<typeof usePairingStore.getState>['items']): string | null => {
  if (item?.fleetCode?.trim()) return item.fleetCode.trim()
  if (!item?.pairingId) return null
  return pairings.find((entry) => entry.pairing.id === item.pairingId)?.pairing.fleet ?? null
}

const toViolationRows = (
  items: RosterItem[],
  crews: ReturnType<typeof useCrewStore.getState>['items'],
  pairings: ReturnType<typeof usePairingStore.getState>['items'],
  ruleViolations: ReturnType<typeof useRuleCheckStore.getState>['violations'],
  persisted: ReturnType<typeof useSessionViolationStore.getState>['displayViolations'],
): ViolationRow[] => {
  const rows: ViolationRow[] = []
  const seen = new Set<string>()
  const add = (ruleCode: string, severity: number, crewId: string | undefined, pairingId: number | null, detail: string, id: string, ruleInstance?: string | null) => {
    if (!crewId || pairingId == null || ruleCode === '') return
    const item = firstItemForPairing(items, crewId, pairingId)
    const key = `${crewId}|${pairingId}|${ruleCode}|${ruleInstance ?? ''}|${detail}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({
      id,
      ruleCode,
      severity,
      crewId,
      pairingId,
      flightDate: item?.fltDt ?? item?.schStrDtUtc?.slice(0, 10) ?? '—',
      flightNumber: flightNumberOf(item),
      detail,
      fleet: itemFleetOf(item, pairings),
      requiredRank: item?.flightActingRank || null,
      canRecover: ruleCode === '8004' && !isRosterCompleted(items, crewId, pairingId),
    })
  }

  for (const [key, values] of ruleViolations) {
    for (const violation of values) {
      if (violation.targetType === 'pairing') {
        const pairingId = Number(violation.targetId)
        const ownerIds = violation.crewId
          ? [violation.crewId]
          : [...new Set(items.filter((item) => item.pairingId === pairingId).map((item) => item.crewId))]
        for (const crewId of ownerIds) add(violation.ruleCode, violation.severity, crewId, pairingId, violation.message, `live-${key}`, null)
      } else if (violation.targetType === 'crew' && violation.anchorPairingId != null) {
        add(violation.ruleCode, violation.severity, String(violation.targetId), violation.anchorPairingId, violation.message, `live-${key}`, null)
      }
    }
  }
  for (const [pairingId, values] of persisted) {
    for (const violation of values) {
      if (violation.passed) continue
      const ownerIds = violation.crewId
        ? [violation.crewId]
        : [...new Set(items.filter((item) => item.pairingId === pairingId).map((item) => item.crewId))]
      for (const crewId of ownerIds) add(violation.ruleCode, violation.severity, crewId, pairingId, violation.message, `persisted-${crewId}-${pairingId}`, violation.ruleInstance)
    }
  }
  return rows.sort((a, b) => b.severity - a.severity || a.ruleCode.localeCompare(b.ruleCode) || a.crewId.localeCompare(b.crewId))
}

const metric = (label: string, value: string | number) => (
  <div className="min-w-0">
    <div className="text-2xs text-muted-foreground">{label}</div>
    <div className="truncate text-xs font-semibold tabular-nums text-foreground">{value}</div>
  </div>
)

const money = (value: number, currency: string = 'CNY'): string => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(value)

const optionBadge = (option: RecoveryOption): string => {
  if (option.ruleCheck === 'pending') return 'Checking'
  if (option.ruleCheck === 'passed' && option.localExecutable) return 'Executable'
  if (option.ruleCheck === 'failed') return 'Rule failed'
  return 'Blocked'
}

const updatePlanGroupOption = (
  group: RecoveryPlans['roster'],
  optionId: string,
  fn: (option: RecoveryOption) => RecoveryOption,
): RecoveryPlans['roster'] => {
  let found = false
  const updateTree = (option: RecoveryOption): RecoveryOption => {
    if (option.id === optionId) {
      found = true
      return fn(option)
    }
    if (!option.subOptions?.length) return option

    const children = option.subOptions.map(updateTree)
    if (!found || children.every((child, index) => child === option.subOptions?.[index])) return option

    // A combined option is checked as one unit. Keep its visible status and
    // diagnostics consistent with all child decisions when a child is updated.
    const ruleMessages = [...new Set(children.flatMap((child) => child.ruleMessages))]
    const localExecutable = children.every((child) => child.localExecutable)
    const ruleCheck = children.some((child) => child.ruleCheck === 'failed')
      ? 'failed'
      : children.every((child) => child.ruleCheck === 'passed')
        ? 'passed'
        : children.some((child) => child.ruleCheck === 'pending')
          ? 'pending'
          : option.ruleCheck
    return { ...option, subOptions: children, localExecutable, ruleCheck, ruleMessages }
  }

  const option = group.options.find((candidate) => candidate.id === optionId
    || candidate.subOptions?.some((child) => child.id === optionId))
  const nextOptions = group.options.map(updateTree)
  if (!found && !option) return group
  const next = found
    ? nextOptions.find((candidate) => candidate.id === option!.id) ?? option
    : fn(option!)
  if (!next) return group
  // A candidate that fails the simulated Rule check must not remain selectable.
  // Keep it in a diagnostics-only list so the UI can explain why it disappeared.
  if (next.ruleCheck === 'failed' || !next.localExecutable) {
    return {
      ...group,
      options: nextOptions.filter((candidate) => candidate.id !== next.id),
      excludedOptions: [...group.excludedOptions.filter((candidate) => candidate.id !== next.id), next],
    }
  }
  return { ...group, options: nextOptions }
}

const updateOption = (plans: RecoveryPlans, optionId: string, fn: (option: RecoveryOption) => RecoveryOption): RecoveryPlans => ({
  ...plans,
  roster: updatePlanGroupOption(plans.roster, optionId, fn),
  standby: updatePlanGroupOption(plans.standby, optionId, fn),
  crossBase: updatePlanGroupOption(plans.crossBase, optionId, fn),
})

const currentFleetQuals = (crew: ReturnType<typeof useCrewStore.getState>['items'][number]['crew']): string[] => {
  // quals.fleetQuals and panelFleets are both current-effective server values. Do
  // not fall back to historical fleet rows because an expired qualification could
  // incorrectly surface a Recovery candidate that 8004 rejects for the Roster date.
  const values = crew.quals?.fleetQuals?.length ? crew.quals.fleetQuals : (crew.panelFleets ?? [])
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

type RecoveryPlanType = RecoveryPlans['roster']['id']

const planForType = (plans: RecoveryPlans, planType: RecoveryPlanType): RecoveryPlans['roster'] => {
  if (planType === 'mixed') return plans.mixed
  return planType === 'cross-base' ? plans.crossBase : plans[planType]
}

const allOptions = (plans: RecoveryPlans): RecoveryOption[] => [
  ...plans.roster.options,
  ...plans.standby.options,
  ...plans.crossBase.options,
  // Include filtered candidates so `previewedOption` / `executionOption`
  // lookups succeed when the user opens a Filtered-tab row in the Detail
  // dialog and then invokes Preview. Filtered options are not directly
  // selectable, so this only widens lookup, not the executable surface.
  ...plans.roster.excludedOptions,
  ...plans.standby.excludedOptions,
  ...plans.crossBase.excludedOptions,
]

const planTone = (planType: RecoveryPlanType) => planType === 'roster'
  ? {
      section: 'border-sky-500/45',
      header: 'bg-sky-500/[0.06]',
      badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
      dot: 'bg-sky-500',
      row: 'bg-sky-500/[0.035]',
      selectedRow: 'bg-sky-500/[0.10]',
    }
  : planType === 'standby' ? {
      section: 'border-amber-500/50',
      header: 'bg-amber-500/[0.08]',
      badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
      row: 'bg-amber-500/[0.045]',
      selectedRow: 'bg-amber-500/[0.12]',
    }
  : planType === 'mixed' ? {
      // Mixed (best-per-alert) recovery uses an indigo/violet tone to
      // visually distinguish it from the three single-method groups.
      section: 'border-indigo-500/55',
      header: 'bg-indigo-500/[0.08]',
      badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      dot: 'bg-indigo-500',
      row: 'bg-indigo-500/[0.045]',
      selectedRow: 'bg-indigo-500/[0.12]',
    }
  : {
      section: 'border-teal-500/55',
      header: 'bg-teal-500/[0.08]',
      badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
      dot: 'bg-teal-500',
      row: 'bg-teal-500/[0.045]',
      selectedRow: 'bg-teal-500/[0.12]',
    }

/**
 * Fetch candidate DHD flights for Cross-base positioning from the `flight` table.
 *
 * The source Pairing's loaded list view does NOT carry segments, so we cannot
 * derive DHD candidates from `pairing-store`. Instead we query the
 * `/api/flight` (flat / `grouping: 'none'`) endpoint for the date window that
 * covers every source Roster ± 1 day (the 2-6h positioning lead allowed by
 * `crossBaseConfig.maxFlightLeadHours` is well within a 24h buffer).
 *
 * The user-supplied domain correction: DHD candidates are flights the support
 * crew would take AS PASSENGERS, so they do NOT need to come from a roster
 * assignment of another Crew, and they do NOT need to match the recovered
 * Pairing's fleet. Only the route (depArp -> arvArp) and the scheduled time
 * window are constrained.
 */
async function fetchRecoveryFlights(
  selected: ViolationRow[],
  items: RosterItem[],
  dateRange: { start: Date; end: Date },
): Promise<RecoveryFlightSnapshot[]> {
  const targetPairingIds = new Set(selected.map((row) => Number(row.pairingId)).filter((value) => Number.isFinite(value)))
  if (targetPairingIds.size === 0) return []

  // Compute the date window from the source Roster items. The 1-day buffer
  // covers the 2-6h positioning lead (maxFlightLeadHours).
  const sourceStarts: number[] = []
  const sourceEnds: number[] = []
  for (const item of items) {
    if (item.pairingId == null || !targetPairingIds.has(Number(item.pairingId))) continue
    const start = item.schStrDtUtc ? new Date(item.schStrDtUtc).getTime() : NaN
    const end = item.schEndDtUtc ? new Date(item.schEndDtUtc).getTime() : NaN
    if (Number.isFinite(start)) sourceStarts.push(start)
    if (Number.isFinite(end)) sourceEnds.push(end)
  }
  if (sourceStarts.length === 0 || sourceEnds.length === 0) return []

  // Compute the date window from the source Roster items. The window is
  // [earliest source Roster start - 2 days, latest source Roster end + 2 days]
  // so that DHD positioning flights (which may precede or follow the recovered
  // Roster by up to 2 days) are all candidates. The ±2 day buffer also covers
  // the 2-6h positioning lead (maxFlightLeadHours) for any of the candidate
  // positioning flights.
  const twoDayMs = 2 * 24 * 3600 * 1000
  const earliest = new Date(Math.min(...sourceStarts) - twoDayMs)
  const latest = new Date(Math.max(...sourceEnds) + twoDayMs)
  // Snap to YYYY-MM-DD so the date range is inclusive on both ends.
  const startDate = earliest.toISOString().slice(0, 10)
  const endDate = latest.toISOString().slice(0, 10)

  try {
    const response = await flightApi.listFlat({
      startDate,
      endDate,
      // 0 = return all matching rows in SQL (no in-memory pagination). The
      // tight window above keeps the row count bounded (~hundreds per day).
      pageSize: 0,
    })
    return response.items
      .filter((flight) => !flight.isCancelled && flight.depArp && flight.arvArp)
      .map((flight) => ({
        id: flight.id,
        fltNum: flight.fltNum,
        depArp: flight.depArp,
        arvArp: flight.arvArp,
        schDepDtUtc: flight.schDepDtUtc,
        schArvDtUtc: flight.schArvDtUtc,
        fleet: flight.fleet ?? '',
        airline: flight.airline ?? '',
        blockMinutes: flight.blkMin ?? 0,
      }))
  } catch (err) {
    // Best-effort: a failed flight fetch must not block Roster / Standby plans
    // from being generated. Cross-base options simply fall back to no candidates.
    notify.warning(`Failed to load DHD candidate flights: ${err instanceof Error ? err.message : 'unknown error'}. Cross-base options will be unavailable for this plan.`)
    return []
  }
}


/**
 * Persist the cross-base diagnostic record to .dev-logs/recovery-cross-base-trace.jsonl
 * via the live-server /api/recovery/debug-trace endpoint. Used to analyse WHY
 * a 8004 alert's cross-base plan ended up empty. Failure is logged to console
 * but must not block the UI.
 */
async function logCrossBaseTrace(
  plans: RecoveryPlans,
  selected: ViolationRow[],
  loadedCrewCount: number,
  loadedFlightCount: number,
  loadedItemCount: number,
): Promise<void> {
  if (selected.length === 0) return
  const firstAlert = plans.alert
  const crossBaseContext = plans.crossBaseContext
  const crossBaseOptions = plans.crossBase.options
  // Strip heavy fields (routeCandidates on each trace can be 100s of flights)
  // before posting — keep only the diagnostic primitives.
  const trace = plans.crossBaseTrace.map((entry) => ({
    crewId: entry.crewId,
    crewName: entry.crewName,
    supportBase: entry.supportBase,
    hardRejection: entry.hardRejection,
    candidateFlightCount: entry.candidateFlightCount,
    earliestOutboundDep: entry.earliestOutboundDep,
    latestOutboundArv: entry.latestOutboundArv,
    outboundWindow: entry.outboundWindow,
    outboundFilterResult: entry.outboundFilterResult,
    outboundFlight: entry.outbound
      ? { id: entry.outbound.id, fltNum: entry.outbound.fltNum, depArp: entry.outbound.depArp, arvArp: entry.outbound.arvArp, schDepDtUtc: entry.outbound.schDepDtUtc, schArvDtUtc: entry.outbound.schArvDtUtc, fleet: entry.outbound.fleet, blockMinutes: entry.outbound.blockMinutes }
      : null,
    inboundFilterResult: entry.inboundFilterResult,
    inboundFlight: entry.inbound
      ? { id: entry.inbound.id, fltNum: entry.inbound.fltNum, depArp: entry.inbound.depArp, arvArp: entry.inbound.arvArp, schDepDtUtc: entry.inbound.schDepDtUtc, schArvDtUtc: entry.inbound.schArvDtUtc, fleet: entry.inbound.fleet, blockMinutes: entry.inbound.blockMinutes }
      : null,
    positioningResult: entry.positioningResult,
    freeForPositioning: entry.freeForPositioning,
    loadedItemCount: entry.loadedItemCount,
    surfaced: entry.surfaced,
    surfacedModes: entry.surfacedModes,
  }))
  const record = {
    source: 'gantt-recovery-dialog',
    alert: {
      ruleCode: firstAlert.ruleCode,
      crewId: firstAlert.crewId,
      pairingId: firstAlert.pairingId,
      flightDate: firstAlert.flightDate,
      fleet: firstAlert.fleet,
      requiredRank: firstAlert.requiredRank,
    },
    selectedAlertCount: selected.length,
    loadedCrewCount,
    loadedFlightCount,
    loadedItemCount,
    crossBaseContext,
    crossBaseOptionCount: crossBaseOptions.length,
    crossBaseOptionModes: crossBaseOptions.map((option) => option.mode),
    crossBaseTrace: trace,
  }
  try {
    // Use a dedicated client (recoveryTraceApi) that forwards the Bearer token
    // from the shared `api` instance but does NOT call `onUnauthorized`. The
    // trace POST is best-effort: a 401 or 5xx must never trigger a logout or block
    // the recovery UI; it only causes this diagnostic to be skipped.
    await recoveryTraceApi.post('/api/recovery/debug-trace', record)
  } catch (err) {
    console.warn('[recovery] cross-base trace POST error', err)
  }
}
export const RecoveryViolationDialog = ({ open, onClose, alert = null }: Props) => {
  const mainItems = useRosterStore((s) => s.main.rosterItems)
  const subItems = useRosterStore((s) => s.sub.rosterItems)
  const pairings = usePairingStore((s) => s.items)
  const crews = useCrewStore((s) => s.items)
  const crewStatsMap = useCrewStore((s) => s.crewStatsMap)
  const ranks = useReferenceStore((s) => s.ranks)
  const ruleViolations = useRuleCheckStore((s) => s.violations)
  const persistedViolations = useSessionViolationStore((s) => s.displayViolations)
  const rulesetId = useLegalityStore((s) => s.selectedId)
  const dateRange = useFilterStore((s) => s.dateRange)
  const setPreview = useRecoveryPreviewStore((s) => s.setPreview)
  const setPreviewView = useRecoveryPreviewStore((s) => s.setView)
  const clearPreview = useRecoveryPreviewStore((s) => s.clear)
  const recoveryPreviewOptionId = useRecoveryPreviewStore((s) => s.optionId)
  const addDraftOp = useDraftStore((s) => s.addOp)
  const [plans, setPlans] = useState<RecoveryPlans | null>(null)
  const [selectedRow, setSelectedRow] = useState<ViolationRow | null>(null)
  const [selectedPlanType, setSelectedPlanType] = useState<RecoveryPlans['roster']['id']>('roster')
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [executionOptionId, setExecutionOptionId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [costBreakdownOption, setCostBreakdownOption] = useState<RecoveryOption | null>(null)
  const [applying, setApplying] = useState(false)
  const [building, setBuilding] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [previewedOptionId, setPreviewedOptionId] = useState<string | null>(null)
  const selectedAlerts = useMemo(() => Array.isArray(alert) ? alert : alert ? [alert] : [], [alert])

  const items = useMemo(() => uniqueItems([...mainItems, ...subItems]), [mainItems, subItems])
  const rows = useMemo(() => toViolationRows(items, crews, pairings, ruleViolations, persistedViolations), [items, crews, pairings, ruleViolations, persistedViolations])
  const rankOrder = useMemo(() => new Map(ranks.map((rank) => [rank.rank.toUpperCase(), rank.displayOrder])), [ranks])
  // ── Tree highlight: the plan group with the lowest minimum total cost.
  // Surfaced as "★" in both the PlanTree (left rail) and PlanSummary (top
  // of right column) so the user always knows which method is the cheapest.
  // Mixed is included in the comparison only when it's visible (alerts > 1)
  // so single-alert flows don't get a misleading "mixed is cheapest" hint.
  const bestGroupId = useMemo<RecoveryPlans['roster']['id'] | null>(() => {
    if (!plans) return null
    const rows = plans.alerts.length > 1
      ? [plans.roster, plans.standby, plans.crossBase, plans.mixed]
      : [plans.roster, plans.standby, plans.crossBase]
    let bestId: RecoveryPlans['roster']['id'] | null = null
    let bestCost = Number.POSITIVE_INFINITY
    for (const group of rows) {
      const min = minOptionCost(group.options)
      if (min != null && min < bestCost) { bestCost = min; bestId = group.id }
    }
    return bestId
  }, [plans])
  const selectedPlan = plans ? planForType(plans, selectedPlanType) : null
  const selectedOption = useMemo(() => {
    if (!selectedPlan || !selectedOptionId) return null
    // Search both the active and the filtered (Rule-checked out) lists so the
    // Detail dialog opens for Filtered-tab rows too — their option objects are
    // moved into `excludedOptions` by `updatePlanGroupOption` and would
    // otherwise be unreachable from the detail-view lookup.
    return selectedPlan.options.find((option) => option.id === selectedOptionId)
      ?? selectedPlan.excludedOptions.find((option) => option.id === selectedOptionId)
      ?? null
  }, [selectedPlan, selectedOptionId])
  const executionOption = useMemo(() => {
    if (!plans || !executionOptionId) return null
    return allOptions(plans).find((option) => option.id === executionOptionId) ?? null
  }, [plans, executionOptionId])
  const previewedOption = useMemo(() => {
    if (!plans || !previewedOptionId) return null
    return allOptions(plans).find((option) => option.id === previewedOptionId) ?? null
  }, [plans, previewedOptionId])

  useEffect(() => {
    if (!open) {
      setPlans(null)
      setSelectedRow(null)
      setSelectedPlanType('roster')
      setSelectedOptionId(null)
      setExecutionOptionId(null)
      setDetailOpen(false)
      setPreviewCollapsed(false)
      setPreviewedOptionId(null)
      clearPreview()
    }
  }, [open, clearPreview])

  useEffect(() => {
    // Reset in the main Live toolbar can clear the preview while this compact panel is open.
    if (recoveryPreviewOptionId === null) {
      setPreviewCollapsed(false)
      setPreviewedOptionId(null)
    }
  }, [recoveryPreviewOptionId])

  const buildPlans = async (selectedRows: ViolationRow[]) => {
    const selected = selectedRows.filter((row) => row.ruleCode === '8004' && row.pairingId != null && row.canRecover)
    if (selected.length === 0) {
      notify.info('Select at least one active 8004 alert to generate recovery options.')
      return
    }
    setBuilding(true)
    setSelectedOptionId(null)
    setExecutionOptionId(null)
    // Cross-base positioning needs candidates from ANY base - a YEG-based
    // support crew typically has NO items in the current 7d Live window, but
    // they are still valid as an inbound-DHD candidate (their
    // crewFreeForPositioning check returns true with an empty overlap set).
    // Pass the full loaded crew list; per-plan-type scoping happens inside
    // buildRecoveryPlans.
    const sourceCrewIds = new Set(selected.map((row) => row.crewId))
    const crewSnapshots = crews
      .filter((entry) => !sourceCrewIds.has(entry.crew.crewId))
      .map((entry) => ({
        crewId: entry.crew.crewId,
        crewName: crewNameOf(entry.crew.crewId, crews),
        rank: entry.crew.panelRank ?? entry.crew.ranks?.[0]?.rank ?? '',
        base: entry.crew.panelBase ?? entry.crew.bases?.[0]?.base ?? '',
        division: entry.crew.division,
        annualFlightMinutes: crewStatsMap.get(entry.crew.crewId)?.ybh ?? items.find((item) => item.crewId === entry.crew.crewId)?.ybh ?? 0,
        fleetQuals: currentFleetQuals(entry.crew),
      }))
    // Cross-base positioning inserts DHD flights into the source Pairing duties, so
    // it needs candidate DHD legs from the `flight` table (NOT from the loaded
    // Pairing list, which doesn't carry segments). Query a window covering the
    // source Roster ± 1 day to cover the 2-6h positioning lead allowed by the
    // cross-base config. Fleet is intentionally NOT filtered — the DHD crew is
    // travelling as a passenger, the leg is a flight-level attribute and the crew
    // is not required to hold that fleet qualification for a DHD seat.
    const recoveryFlights = await fetchRecoveryFlights(selected, items, dateRange)
    const buildInput = {
      items,
      crews: crewSnapshots,
      rankOrder,
      flights: recoveryFlights,
      pairingCompositions: pairings.flatMap((entry) => (entry.pairing.composition ?? []).map((composition) => ({
        pairingId: entry.pairing.id,
        actingRank: composition.rank,
        plan: composition.plan,
      }))),
    }
    const next = selected.length === 1
      ? buildRecoveryPlans({ ...buildInput, alert: selected[0] })
      : buildRecoveryPlans({ ...buildInput, alerts: selected })
    // Refresh every option's directCost from the cost library so the UI
    // surfaces configured tariff prices instead of the hard-coded
    // constants. Falls back to the original costs on network error so a
    // cost-library outage never blanks the recovery dialog.
    const libraryFetcher: RecoveryLibraryCostFetcher = async (inputs) => {
      const response = await recoveryCostApi.postBatch(inputs)
      return response.results.map((row) => ({
        directCost: row.directCost,
        currency: row.currency,
        breakdown: row.breakdown,
        notes: row.notes,
      }))
    }
    const enriched = await enrichPlansWithLibraryCosts(next, buildInput.items, libraryFetcher)
    setPlans(enriched)

    // Persist the cross-base diagnostic to .dev-logs/recovery-cross-base-trace.jsonl
    // (via the live-server /api/recovery/debug-trace endpoint) so an empty
    // cross-base group can be analysed offline. Fire-and-forget - failure to log
    // must NOT block the UI. The trace is always populated by buildRecoveryPlans,
    // so even successful cross-base options are recorded for tuning.
    void logCrossBaseTrace(enriched, selected, crewSnapshots.length, recoveryFlights.length, items.length)
    const initialPlan = enriched.roster.options.length > 0 ? enriched.roster : enriched.standby.options.length > 0 ? enriched.standby : enriched.crossBase
    setSelectedPlanType(initialPlan.id)
    const first = initialPlan.options.find((option) => option.localExecutable) ?? initialPlan.options[0]
    setSelectedOptionId(first?.id ?? null)
    setPreviewCollapsed(false)
    setPreviewedOptionId(null)
    clearPreview()
    setBuilding(false)
  }

  useEffect(() => {
    if (!open || selectedAlerts.length === 0) return
    void buildPlans(selectedAlerts.map((selectedAlert) => ({ ...selectedAlert, canRecover: true })))
  }, [open, selectedAlerts])

  const selectOption = (option: RecoveryOption) => {
    setSelectedOptionId(option.id)
  }

  const selectPlanType = (planType: RecoveryPlans['roster']['id']) => {
    if (!plans) return
    const plan = planForType(plans, planType)
    setSelectedPlanType(planType)
    const first = plan.options.find((option) => option.localExecutable) ?? plan.options[0] ?? null
    setSelectedOptionId(first?.id ?? null)
  }

  const selectExecutionOption = (option: RecoveryOption, checked: boolean) => {
    if (!checked) {
      setExecutionOptionId((current) => current === option.id ? null : current)
      return
    }
    setExecutionOptionId(option.id)
    setSelectedPlanType(option.mode === 'standby' ? 'standby' : option.mode === 'cross-base-standby' || option.mode === 'cross-base-swap' || option.mode === 'cross-base-destination' || option.mode === 'cross-base-direct' ? 'cross-base' : 'roster')
    selectOption(option)
  }

  const previewInLive = (option: RecoveryOption) => {
    setSelectedOptionId(option.id)
    // Preview is also the active execution selection. This keeps Apply available while
    // the compact Preview panel is open, while the checkbox remains the visible source
    // of truth when the user returns to the options panel.
    if (option.localExecutable) setExecutionOptionId(option.id)
    setPreviewedOptionId(option.id)
    setPreview(option.id, option.afterItems, option.beforeItems, buildRecoveryPairingPreview(option, pairings))
    setPreviewView('compare')
    setDetailOpen(false)
    setPreviewCollapsed(true)
    const leafOptions = option.subOptions?.length ? option.subOptions : [option]
    void bringCrewIdsToTop([...new Set(leafOptions.flatMap((candidate) => [candidate.sourceCrewId, candidate.targetCrewId]))], 'main', 'replace')
    notify.info(`Previewing ${option.title} in Live Gantt. Before and after rosters are shown.`)
  }

  const apply = async () => {
    if (!executionOption || !executionOption.localExecutable || executionOption.ruleCheck !== 'passed') return
    setApplying(true)
    try {
      const leafOptions = executionOption.subOptions?.length ? executionOption.subOptions : [executionOption]
      const sourceLoaded = leafOptions.every((option) => items.some((item) => item.crewId === option.sourceCrewId && Number(item.pairingId) === option.sourcePairingId))
      const targetLoaded = leafOptions.every((option) => !['swap', 'cross-base-swap'].includes(option.mode) || (option.targetPairingId != null && items.some((item) => item.crewId === option.targetCrewId && Number(item.pairingId) === option.targetPairingId)))
      if (!sourceLoaded || !targetLoaded) throw new Error('The selected Roster is no longer in the loaded Live data. Reopen Recovery and regenerate options.')
      const plan = buildRecoveryDraftPlan(executionOption, items)
      const locked = await useLockStore.getState().acquireLocks(plan.affectedCrewIds, plan.affectedPairingIds)
      if (!locked) throw new Error('Unable to lock the affected Crew or Roster. Refresh and try again.')
      for (const operation of plan.operations) {
        const affectedPairingIds = operation.type === 'update'
          ? []
          : operation.type === 'cross-base-recovery'
            ? plan.affectedPairingIds
          : operation.type === 'remove-pairing-from-crew' || operation.type === 'assign-pairing'
            ? [operation.pairingId!]
            : []
        const affectedCrewIds = operation.type === 'remove-pairing-from-crew'
          ? [operation.crewId!]
          : operation.type === 'cross-base-recovery'
            ? plan.affectedCrewIds
          : operation.type === 'assign-pairing'
            ? [operation.crewId!]
            : operation.type === 'update'
              ? [executionOption.targetCrewId]
              : plan.affectedCrewIds
        addDraftOp(operation, affectedCrewIds, affectedPairingIds)
      }
      useRosterStore.getState().recomputeDraftPane('main')
      clearPreview()
      setPreviewCollapsed(false)
      setPreviewedOptionId(null)
      notify.success('Recovery option applied to the unsaved Gantt draft. Use Save to commit it.')
      onClose()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Recovery option failed')
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || detailOpen || applying) return
      if (!executionOption || !executionOption.localExecutable || executionOption.ruleCheck !== 'passed') return
      event.preventDefault()
      void apply()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, detailOpen, applying, executionOption, apply])

  const checkOption = async (option: RecoveryOption) => {
    if (!option.localExecutable || option.ruleCheck !== 'pending') return
    if (!plans?.alerts.length) return
    try {
      const leafOptions = option.subOptions?.length ? option.subOptions : [option]
      const affectedCrewIds = [...new Set(leafOptions.flatMap((candidate) => [candidate.sourceCrewId, candidate.targetCrewId]))]
      const focusPairingIds = [...new Set(leafOptions.flatMap((candidate) => [
        candidate.sourcePairingId,
        ...(candidate.targetPairingId != null ? [candidate.targetPairingId] : []),
        ...(candidate.destinationSplit?.createsPairing ? [candidate.destinationSplit.createdPairingId] : []),
      ]))]
      const beforeItems = items.filter((item) => affectedCrewIds.includes(item.crewId))
      const afterItems = option.afterItems.filter((item) => affectedCrewIds.includes(item.crewId) && item.assignmentGroup?.toUpperCase() !== 'DHD')
      const before = await legalityPreviewApi.checkDraft({
        contextType: 'live',
        rulesetId: rulesetId ?? undefined,
        affectedCrewIds,
        afterItems: beforeItems,
        focusPairingIds,
        rpFrom: dateRange.start.toISOString().slice(0, 10),
        rpTo: dateRange.end.toISOString().slice(0, 10),
      })
      const after = await legalityPreviewApi.checkDraft({
        contextType: 'live',
        rulesetId: rulesetId ?? undefined,
        affectedCrewIds,
        afterItems,
        focusPairingIds,
        rpFrom: dateRange.start.toISOString().slice(0, 10),
        rpTo: dateRange.end.toISOString().slice(0, 10),
      })
      const ruleMessages = recoveryRuleFailures({ option, before: before.violations, after: after.violations })
      setPlans((current) => current ? updateOption(current, option.id, (currentOption) => ({
        ...currentOption,
        ruleCheck: ruleMessages.length === 0 ? 'passed' : 'failed',
        localExecutable: currentOption.localExecutable && ruleMessages.length === 0,
        ruleMessages,
      })) : current)
    } catch (err) {
      setPlans((current) => current ? updateOption(current, option.id, (currentOption) => ({
        ...currentOption,
        ruleCheck: 'failed',
        localExecutable: false,
        ruleMessages: [err instanceof Error ? err.message : 'Rule preview failed'],
      })) : current)
    }
  }

  useEffect(() => {
    if (!plans) return
    // Top-level options own the Rule result for a combined recovery. Child
    // options are descriptive details and must not be checked independently.
    const pending = [plans.roster, plans.standby, plans.crossBase]
      .flatMap((group) => group.options)
      .filter((option) => option.ruleCheck === 'pending' && option.localExecutable)
    if (pending.length === 0) return
    void Promise.all(pending.map(checkOption))
    // checkOption intentionally reads the current loaded snapshot captured for this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans?.alert.id])

  const applyButtonTitle = 'Apply the selected Crew to the unsaved Gantt draft. Use Gantt Save (Ctrl+S) to commit.'
  const applyShortcutLabel = 'Ctrl/Cmd + Enter'
  const executionLabel = executionOption?.subOptions?.length
    ? `Selected combined option · ${executionOption.subOptions.length} Crew decisions`
    : executionOption
      ? `Selected Crew ${executionOption.targetCrewId}`
      : `Check one recovery option`

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose() }}
      data-testid="recovery-violation-dialog"
      className={previewCollapsed
        ? 'sm:max-w-[min(430px,calc(100vw-2rem))]'
        : 'sm:max-w-[min(1420px,97vw)]'}
      icon={<ShieldAlert className="h-4 w-4" />}
      title={<span className="flex min-w-0 items-center gap-2"><span className="truncate">{previewCollapsed ? 'Recovery Preview' : (alert ? 'Recovery' : 'Violation')}</span><span className="truncate text-2xs font-normal opacity-75">{previewCollapsed ? 'Live Gantt is showing before and after' : 'Loaded Live data only'}</span></span>}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      footerClassName="py-1"
      modal={!previewCollapsed}
      footer={previewCollapsed && previewedOption
         ? <div className="flex w-full items-center justify-between gap-2"><span className="truncate text-2xs text-muted-foreground">Preview only · not saved · {applyShortcutLabel} to Apply</span><div className="flex shrink-0 gap-2"><Button variant="ghost" className="h-7 gap-1 px-2" onClick={() => setPreviewCollapsed(false)} data-testid="recovery-return-to-options"><Maximize2 className="h-3.5 w-3.5" />Options</Button><span title={applyButtonTitle}><Button className="h-7 gap-1.5 px-3" disabled={applying || !executionOption || !executionOption.localExecutable || executionOption.ruleCheck !== 'passed'} onClick={() => void apply()} aria-keyshortcuts="Control+Enter Meta+Enter" data-testid="recovery-apply-preview"><CheckCircle2 className="h-3.5 w-3.5" />{applying ? 'Applying...' : 'Apply'}</Button></span><Button variant="ghost" className="h-7 px-2" onClick={() => { clearPreview(); onClose() }}>Close</Button></div></div>
          : <div className="flex w-full items-center justify-between gap-2"><span className="text-2xs text-muted-foreground">{executionLabel} · {applyShortcutLabel} to Apply</span><div className="flex gap-2"><Button variant="ghost" className="h-7 px-2" onClick={onClose}>Close</Button><span title={applyButtonTitle}><Button className="h-7 gap-1.5 px-3" disabled={applying || !executionOption || !executionOption.localExecutable || executionOption.ruleCheck !== 'passed'} onClick={() => void apply()} aria-keyshortcuts="Control+Enter Meta+Enter" data-testid="recovery-apply"><CheckCircle2 className="h-3.5 w-3.5" />{applying ? 'Applying...' : 'Apply selected option'}</Button></span></div></div>}
    >
      {previewCollapsed && previewedOption ? <div className="p-3" data-testid="recovery-preview-dock">
        <div className="flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{previewedOption.title}</div>
            <div className="mt-1 text-2xs leading-4 text-muted-foreground">The Live Gantt shows the original roster and the selected recovery roster together. The preview remains in memory only.</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-2xs">
           {metric('Affected Crew', previewedOption.subOptions?.length ? [...new Set(previewedOption.subOptions.flatMap((candidate) => [candidate.sourceCrewId, candidate.targetCrewId]))].join(', ') : previewedOption.targetCrewId)}
          {metric('Method', previewedOption.mode === 'standby' ? 'Callout SBY' : 'Roster transfer / swap')}
          {metric('Roster impact', previewedOption.metrics.changedRosterCount)}
          {metric('Total cost', money(previewedOption.metrics.totalCost, previewedOption.metrics.currency))}
        </div>
        <Button variant="ghost" className="mt-3 h-7 gap-1 px-2 text-2xs" onClick={() => setPreviewCollapsed(false)} data-testid="recovery-expand-options"><Minimize2 className="h-3.5 w-3.5" />Return to recovery options</Button>
      </div> : <div className={alert
        ? 'flex h-[min(92vh,920px)] min-h-0 flex-1 flex-col'
        : 'grid h-[min(92vh,920px)] min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(150px,0.4fr)_minmax(0,1.6fr)] lg:min-h-[680px] lg:grid-cols-[minmax(0,0.45fr)_minmax(0,1.85fr)] lg:grid-rows-1'}>
        {!alert && <section className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
            <div><div className="text-xs font-semibold text-foreground">Loaded violations</div><div className="text-2xs text-muted-foreground">{rows.length} item{rows.length === 1 ? '' : 's'}</div></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? <div className="flex h-48 items-center justify-center px-6 text-center text-xs text-muted-foreground">No violations in the currently loaded Live data.</div> : (
              <table className="w-full border-collapse text-2xs" data-testid="recovery-violation-table">
                <thead className="sticky top-0 z-10 bg-muted/95"><tr className="border-b border-border text-left text-3xs uppercase tracking-wide text-muted-foreground"><th className="px-2 py-1">Rule ID</th><th className="px-2 py-1">CrewID</th><th className="px-2 py-1">PairingID</th><th className="px-2 py-1">Flight date</th><th className="px-2 py-1">Flight</th><th className="px-2 py-1">Detail</th><th className="px-2 py-1">Recovery</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={`${row.id}-${row.crewId}-${row.pairingId}`} className={["border-b border-border/50 align-top", selectedRow?.id === row.id ? 'bg-primary/10' : 'hover:bg-accent/40'].join(' ')}>
                  <td className="whitespace-nowrap px-2 py-1 font-mono font-semibold">{row.ruleCode}</td><td className="whitespace-nowrap px-2 py-1 font-mono">{row.crewId}</td><td className="whitespace-nowrap px-2 py-1 font-mono">{row.pairingId}</td><td className="whitespace-nowrap px-2 py-1">{row.flightDate}</td><td className="whitespace-nowrap px-2 py-1 font-medium">{row.flightNumber}</td><td className="min-w-0 px-2 py-1 text-muted-foreground"><span className="line-clamp-2">{row.detail}</span></td><td className="px-2 py-1">{row.canRecover ? <button type="button" title="Recovery (Ctrl/Cmd+R)" aria-keyshortcuts="Control+R Meta+R" className="inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-3xs font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => void buildPlans([row])} data-testid="recovery-button"><ArrowRight className="h-3 w-3" /><span><span className="underline underline-offset-2">R</span>ecovery</span></button> : <span className="text-muted-foreground">—</span>}</td>
                </tr>)}</tbody>
              </table>
            )}
          </div>
        </section>}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!plans && <div className="flex h-full min-h-[480px] items-center justify-center px-10 text-center text-xs text-muted-foreground"><div><AlertTriangle className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />Select an 8004 violation to generate complete-Roster recovery options.</div></div>}
          {building && <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Generating recovery options...</div>}
          {plans && !building && <div className="flex min-h-0 min-w-0 flex-1 gap-1.5 overflow-hidden p-2">
            {/* ── Left rail: recovery method tree (full height) ─────────────
                The tree is independently scrollable so it stays visible
                even when the right side's PlanGroup takes most of the
                vertical space. Selecting a leaf here drives the same
                `selectPlanType` as before, so the right column re-renders
                the summary + PlanGroup for the new group. */}
            <PlanTree
              plans={plans}
              selectedPlanType={selectedPlanType}
              bestGroupId={bestGroupId}
              onSelect={selectPlanType}
            />
            {/* ── Right column: alert + summary (top) + PlanGroup option list (bottom) ── */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
              <div className="shrink-0 border border-destructive/30 bg-destructive/[0.035] p-2"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold">{plans.alerts.length > 1 ? `${plans.alerts.length} selected alerts · combined recovery` : `Rule ${plans.alert.ruleCode} · ${plans.alert.flightNumber}`}<span className="font-mono text-2xs font-normal text-muted-foreground">{[...new Set(plans.alerts.map((entry) => entry.crewId))].length} Crew · {[...new Set(plans.alerts.map((entry) => entry.pairingId))].length} Roster</span></div><div className="mt-0.5 text-3xs leading-3 text-muted-foreground line-clamp-1">{plans.alerts.length > 1 ? 'Each option contains one complete recovery decision for every selected alert. Conflicting Crew/Roster assignments are filtered out.' : plans.alert.detail}</div></div></div></div>
              <PlanSummary
                plans={plans}
                selectedPlanType={selectedPlanType}
                bestGroupId={bestGroupId}
              />
              {selectedPlan && <PlanGroup group={selectedPlan} selectedOptionId={selectedOptionId} executionOptionId={executionOptionId} onSelect={selectOption} onToggleExecution={selectExecutionOption} onDetail={(option) => { selectOption(option); setDetailOpen(true) }} onPreview={previewInLive} onShowCostBreakdown={setCostBreakdownOption} />}
              <div className="shrink-0 text-3xs text-muted-foreground/60">Stability: <span className="font-mono">{ROSTER_STABILITY_FORMULA}</span></div>
            </div>
          </div>}
        </section>
      </div>}

      {detailOpen && selectedOption && <AppDialog open={detailOpen} onOpenChange={setDetailOpen} data-testid="recovery-detail-dialog" className="sm:max-w-[min(1050px,94vw)]" icon={<Eye className="h-4 w-4" />} title={`Recovery detail · ${selectedOption.title}${selectedOption.positioning ? ' · DHD positioning' : ''}`} bodyClassName="p-0" footer={<div className="flex w-full items-center justify-between gap-2"><Button className="h-7 gap-1 px-2" onClick={() => previewInLive(selectedOption)}><Eye className="h-3.5 w-3.5" />Preview</Button><Button variant="ghost" className="h-7 px-2" onClick={() => setDetailOpen(false)}>Close</Button></div>}>
        <div className="p-3"><div className="mb-3 grid grid-cols-3 gap-3 border-b border-border pb-3 sm:grid-cols-5">{metric('Crew impact', selectedOption.metrics.affectedCrewCount)}{metric('Roster impact', selectedOption.metrics.changedRosterCount)}{metric('Stability', `${selectedOption.metrics.rosterStability}%`)}{metric('Cost', money(selectedOption.metrics.totalCost, selectedOption.metrics.currency))}</div><div className="mb-2 grid grid-cols-2 gap-2 text-2xs text-muted-foreground sm:grid-cols-3"><div>Cancelled rosters: <span className="font-semibold text-foreground">{selectedOption.metrics.cancelledRosterCount}</span></div><div>Added rosters: <span className="font-semibold text-foreground">{selectedOption.metrics.addedRosterCount}</span></div><div>Follow-on impact: <span className="font-semibold text-foreground">{selectedOption.metrics.followOnImpactCount}</span></div></div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold text-foreground">Before / after complete Roster changes</div><div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground" aria-label="Roster change color legend"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Before</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />After</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Cancelled</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" />Added</span></div></div><div className="overflow-auto"><table className="w-full border-collapse text-xs"><thead className="bg-muted/70 text-left text-2xs text-muted-foreground"><tr><th className="px-2 py-2">CrewID</th><th className="px-2 py-2">Roster</th><th className="px-2 py-2">PairingID</th><th className="px-2 py-2"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />Before</span></th><th className="px-2 py-2"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />After</span></th><th className="px-2 py-2">Change</th></tr></thead><tbody>{selectedOption.changes.map((change, index) => <tr key={`${change.crewId}-${change.rosterId}-${index}`} className="border-b border-border/50"><td className="px-2 py-2 font-mono">{change.crewId}</td><td className="px-2 py-2 font-mono">{change.rosterId}</td><td className="px-2 py-2 font-mono">{change.pairingId ?? '—'}</td><td className="max-w-56 border-l-2 border-sky-500 bg-sky-500/10 px-2 py-2 text-sky-800 dark:text-sky-100">{change.before}</td><td className="max-w-56 border-l-2 border-emerald-500 bg-emerald-500/10 px-2 py-2 text-emerald-800 dark:text-emerald-100">{change.after}</td><td className="px-2 py-2"><span className={changeTypeClass(change.changeType)}>{changeTypeLabel(change.changeType)}</span></td></tr>)}</tbody></table></div><div className="mt-3 flex items-center gap-2 text-2xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Callout Standby retains the original SBY task and marks it with a yellow C indicator in the Live Gantt preview.</div></div>
      </AppDialog>}
      <RecoveryCostBreakdownDialog
        open={costBreakdownOption !== null}
        onOpenChange={(open) => { if (!open) setCostBreakdownOption(null) }}
        planTitle={costBreakdownOption?.title ?? ''}
        breakdown={costBreakdownOption?.metrics.costBreakdown}
        notes={costBreakdownOption?.metrics.costNotes}
        currency={costBreakdownOption?.metrics.currency ?? 'CNY'}
        total={costBreakdownOption?.metrics.directCost ?? 0}
        enrichmentFailed={costBreakdownOption?.metrics.costEnrichmentFailed === true}
        testIdPrefix="recovery-option-cost"
      />
    </AppDialog>
  )
}

const PlanGroup = ({ group, selectedOptionId, executionOptionId, onSelect, onToggleExecution, onDetail, onPreview, onShowCostBreakdown }: { group: RecoveryPlans['roster']; selectedOptionId: string | null; executionOptionId: string | null; onSelect: (option: RecoveryOption) => void; onToggleExecution: (option: RecoveryOption, checked: boolean) => void; onDetail: (option: RecoveryOption) => void; onPreview: (option: RecoveryOption) => void; onShowCostBreakdown: (option: RecoveryOption) => void }) => {
  const tone = planTone(group.id)
  const excludedCount = group.excludedOptions.length
  const isExecutable = (option: RecoveryOption): boolean => option.localExecutable && option.ruleCheck === 'passed'
  const executableOptions = group.options.filter(isExecutable)
  const [filter, setFilter] = useState<'all' | 'executable' | 'filtered'>('all')
  // Reset to 'all' when the user switches between Roster / Standby / Cross-base methods
  // so they always start by seeing the full candidate set.
  useEffect(() => { setFilter('all') }, [group.id])
  const visibleOptions: RecoveryOption[] = filter === 'all'
    ? group.options
    : filter === 'executable'
      ? executableOptions
      : []
  const visibleFiltered: RecoveryOption[] = filter === 'filtered' ? group.excludedOptions : []
  const isFilteredTab = filter === 'filtered'
  return (
    <section className={["flex min-h-0 min-w-0 flex-1 flex-col border border-l-4 bg-card", tone.section].join(' ')} data-testid={`recovery-options-${group.id}`}>
      <div className={['shrink-0 border-b border-border px-2.5 py-1.5', tone.header].join(' ')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><span className={['h-2 w-2 rounded-full', tone.dot].join(' ')} />{group.title}</div>
          <span className="text-2xs tabular-nums text-muted-foreground">{group.options.length} available · {excludedCount} filtered</span>
        </div>
        <div className="mt-0.5 text-2xs text-muted-foreground">{group.description}</div>
        <div className="mt-1.5 inline-flex h-6 items-center gap-0.5 rounded border border-border bg-background p-0.5" data-testid={`recovery-options-filter-${group.id}`} role="tablist" aria-label="Option filter">
          {([
            { key: 'all', label: `All (${group.options.length})` },
            { key: 'executable', label: `Executable (${executableOptions.length})` },
            { key: 'filtered', label: `Filtered (${excludedCount})` },
          ] as const).map((entry) => {
            const active = filter === entry.key
            const toneClass = active
              ? `${tone.badge} shadow-sm`
              : 'text-muted-foreground hover:text-foreground'
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-pressed={active}
                onClick={() => setFilter(entry.key)}
                data-testid={`recovery-options-filter-${group.id}-${entry.key}`}
                className={['inline-flex h-5 items-center rounded px-1.5 text-3xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60', toneClass].join(' ')}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
      </div>
      {visibleOptions.length === 0 && !isFilteredTab ? <div className="min-h-0 flex-1 px-3 py-3 text-xs text-muted-foreground">{filter === 'executable' ? 'No executable Crew in this plan. Try a different recovery method or check the Filtered tab.' : 'No executable candidates in the current loaded data range.'}</div> : null}
      {isFilteredTab && visibleFiltered.length === 0 ? <div className="min-h-0 flex-1 px-3 py-3 text-xs text-muted-foreground">No options were filtered out by Rule check. Every candidate in this plan is potentially executable.</div> : null}
      {(visibleOptions.length > 0 || (isFilteredTab && visibleFiltered.length > 0)) && <div className="min-h-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 hidden grid-cols-[minmax(220px,1fr)_60px_60px_80px_100px_180px] gap-2 border-b border-border bg-background/95 px-3 py-1.5 text-3xs uppercase tracking-wide text-muted-foreground backdrop-blur sm:grid">
          <span className="border-r border-border/60 pr-2">Crew / option</span><span className="text-center">Cancel</span><span className="text-center">Add</span><span className="text-center">Stability</span><span className="text-center">Cost</span><span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-border/70">{visibleOptions.map((option) => {
          const selected = selectedOptionId === option.id
          const executionSelected = executionOptionId === option.id
          const executable = isExecutable(option)
          return <div key={option.id} className={["border-l-2 p-3", tone.section, selected ? tone.selectedRow : tone.row].join(' ')}>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_60px_60px_80px_100px_180px] sm:items-center">
              <div className="flex min-w-0 items-start gap-2">
                <label className="mt-0.5 flex shrink-0 items-center text-2xs text-muted-foreground" title="Select this Crew for execution">
                  <input type="checkbox" checked={executionSelected} disabled={!executable} onChange={(event) => onToggleExecution(option, event.target.checked)} aria-label={`Execute recovery with Crew ${option.targetCrewId}`} data-testid={`recovery-crew-checkbox-${option.targetCrewId}`} className="h-3.5 w-3.5 accent-primary" />
                  <span className="sr-only">Execute with Crew {option.targetCrewId}</span>
                </label>
                <button type="button" className="min-w-0 text-left" onClick={() => onSelect(option)}>
                  <div className="flex flex-wrap items-center gap-1.5 text-2xs font-semibold text-foreground"><span>{option.title}</span><span className={["rounded px-1.5 py-0.5 text-2xs", executable ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : option.ruleCheck === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'].join(' ')}>{optionBadge(option)}</span></div>
                  <div className="mt-0.5 text-3xs text-muted-foreground">{option.targetCrewId} · {option.sameRank ? 'same rank' : 'rank adjustment'} · {option.sameBase ? 'same base' : 'cross base'}{option.timeDistanceMinutes != null ? ` · ${option.timeDistanceMinutes} min start gap` : ''}</div>
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 border-t border-border/60 pt-1 sm:contents sm:border-0 sm:pt-0">
                <span className="sm:hidden text-2xs text-muted-foreground">Cancel <b className="text-foreground">{option.metrics.cancelledRosterCount}</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Add <b className="text-foreground">{option.metrics.addedRosterCount}</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Stability <b className="text-foreground">{option.metrics.rosterStability}%</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Cost <button type="button" className="font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => onShowCostBreakdown(option)} data-testid={`recovery-cost-button-${option.id}`}>{money(option.metrics.totalCost, option.metrics.currency)}</button></span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.cancelledRosterCount}</span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.addedRosterCount}</span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.rosterStability}%</span>
                <button type="button" className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline sm:block" onClick={() => onShowCostBreakdown(option)} data-testid={`recovery-cost-button-${option.id}`}>{money(option.metrics.totalCost, option.metrics.currency)}</button>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1 border-t border-border/60 pt-1 sm:border-0 sm:pt-0">
                <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-3xs font-medium text-foreground hover:bg-accent" onClick={() => onPreview(option)} data-testid={`recovery-preview-${option.id}`}><Eye className="h-3.5 w-3.5" />Preview</button>
                <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-3xs font-medium text-foreground hover:bg-accent" onClick={() => onDetail(option)} data-testid="recovery-detail"><Eye className="h-3.5 w-3.5" />Detail</button>
                <span className={selected ? ['h-2 w-2 rounded-full', tone.dot].join(' ') : 'h-2 w-2 rounded-full bg-border'} aria-hidden="true" />
              </div>
            </div>
            {option.subOptions && option.subOptions.length > 0 && <div className="mt-2 space-y-1 rounded border border-border/70 bg-background/60 p-2" data-testid={`recovery-suboptions-${option.id}`}>
              <div className="text-2xs font-semibold text-foreground">Crew decisions in this combined option</div>
              {option.subOptions.map((child) => <div key={child.id} className="grid gap-1 border-t border-border/50 pt-1 text-2xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                <span className="font-mono text-foreground">{child.sourceCrewId} → {child.targetCrewId}</span>
                <span className="text-muted-foreground">{child.mode === 'standby' || child.mode === 'cross-base-standby' ? 'Callout SBY' : child.mode === 'swap' || child.mode === 'cross-base-swap' ? 'Roster swap' : child.mode === 'cross-base-destination' ? 'Destination-base pairing' : child.mode === 'cross-base-direct' ? 'Cross-base direct' : 'Roster transfer'}</span>
                <span className="text-right tabular-nums text-muted-foreground">Cancel {child.metrics.cancelledRosterCount} · Add {child.metrics.addedRosterCount} · {money(child.metrics.totalCost, child.metrics.currency)}</span>
              </div>)}
            </div>}
            {option.ruleMessages.length > 0 && <div className="mt-2 flex items-start gap-1.5 text-2xs text-destructive"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{option.ruleMessages.join(' ')}</span></div>}
            {option.mode === 'standby' && option.standbyWindow && <div className="mt-2 text-2xs text-amber-700">SBY window: {option.standbyWindow} · original SBY retained · Callout icon in preview</div>}
            {option.destinationSplit && <div className="mt-2 grid gap-1 text-2xs text-indigo-700 dark:text-indigo-300 sm:grid-cols-2">
              <span>Destination base: <b>{option.destinationSplit.destinationBase}</b> · Acting Rank: <b>{option.destinationSplit.actingRank}</b></span>
              <span>{option.destinationSplit.createsPairing ? 'New Pairing' : 'Original Pairing modified'} · Composition plan 1 · DHD saving: <b>{money(option.destinationSplit.dhdCostSavings, option.metrics.currency)}</b></span>
            </div>}
            {option.positioning && <div className="mt-2 grid gap-1 text-2xs text-teal-700 dark:text-teal-300 sm:grid-cols-2">
              <span>Support base: <b>{option.positioning.supportBase}</b> · Recovery base: <b>{option.positioning.recoveryBase}</b></span>
              <span>DHD: <b>{option.positioning.outbound.fltNum}</b> outbound / <b>{option.positioning.inbound.fltNum}</b> return · {money(option.metrics.dhdFlightCost, option.metrics.currency)}</span>
            </div>}
          </div>
        })}
        {visibleFiltered.map((option) => {
          const selected = selectedOptionId === option.id
          return <div key={option.id} className={["border-l-2 p-3 opacity-95", tone.section, selected ? tone.selectedRow : tone.row].join(' ')} data-testid={`recovery-filtered-row-${option.id}`}>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_56px_56px_72px_88px_120px] sm:items-center">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-rose-500" title="Filtered by Rule check (cannot be applied)">
                  <ShieldAlert className="h-3.5 w-3.5" />
                </span>
                <button type="button" className="min-w-0 text-left" onClick={() => onSelect(option)}>
                  <div className="flex flex-wrap items-center gap-1.5 text-2xs font-semibold text-foreground"><span>{option.title}</span><span className={['rounded px-1.5 py-0.5 text-2xs', option.ruleCheck === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'].join(' ')}>{optionBadge(option)}</span></div>
                  <div className="mt-0.5 text-3xs text-muted-foreground">{option.targetCrewId} · {option.sameRank ? 'same rank' : 'rank adjustment'} · {option.sameBase ? 'same base' : 'cross base'}{option.timeDistanceMinutes != null ? ` · ${option.timeDistanceMinutes} min start gap` : ''}</div>
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 border-t border-border/60 pt-1 sm:contents sm:border-0 sm:pt-0">
                <span className="sm:hidden text-2xs text-muted-foreground">Cancel <b className="text-foreground">{option.metrics.cancelledRosterCount}</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Add <b className="text-foreground">{option.metrics.addedRosterCount}</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Stability <b className="text-foreground">{option.metrics.rosterStability}%</b></span>
                <span className="sm:hidden text-2xs text-muted-foreground">Cost <button type="button" className="font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => onShowCostBreakdown(option)} data-testid={`recovery-cost-button-${option.id}`}>{money(option.metrics.totalCost, option.metrics.currency)}</button></span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.cancelledRosterCount}</span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.addedRosterCount}</span>
                <span className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums sm:block">{option.metrics.rosterStability}%</span>
                <button type="button" className="hidden border-l border-border/50 px-1.5 text-center text-2xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline sm:block" onClick={() => onShowCostBreakdown(option)} data-testid={`recovery-cost-button-${option.id}`}>{money(option.metrics.totalCost, option.metrics.currency)}</button>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1 border-t border-border/60 pt-1 sm:border-0 sm:pt-0">
                <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-3xs font-medium text-foreground hover:bg-accent" onClick={() => onDetail(option)} data-testid={`recovery-detail-${option.id}`}><Eye className="h-3.5 w-3.5" />Detail</button>
                <span className={selected ? ['h-2 w-2 rounded-full', tone.dot].join(' ') : 'h-2 w-2 rounded-full bg-border'} aria-hidden="true" />
              </div>
            </div>
            {option.ruleMessages.length > 0 && <div className="mt-2 flex items-start gap-1.5 text-2xs text-destructive"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{option.ruleMessages.join(' ')}</span></div>}
          </div>
        })}
        </div>
      </div>}
      {excludedCount > 0 && !isFilteredTab && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="absolute right-2 top-2 z-20 inline-flex h-6 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 text-2xs font-semibold text-rose-700 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:text-rose-300"
              data-testid={`recovery-filtered-trigger-${group.id}`}
              aria-label={`Show ${excludedCount} options filtered by rule check`}
            >
              <ShieldAlert className="h-3 w-3" />
              Filtered: {excludedCount}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={6}
            className="w-[min(420px,90vw)] p-0"
            data-testid={`recovery-filtered-${group.id}`}
          >
            <div className="border-b border-rose-500/20 bg-rose-500/[0.08] px-3 py-2">
              <div className="flex items-center gap-1.5 text-2xs font-semibold text-rose-700 dark:text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                Filtered after Rule check: {excludedCount}
              </div>
              <div className="mt-0.5 text-2xs text-muted-foreground">Tip: switch to the Filtered tab above to inspect each filtered option in the main list.</div>
            </div>
            <div className="max-h-72 overflow-auto px-3 py-2 text-2xs">
              {group.excludedOptions.map((option) => (
                <div key={option.id} className="border-b border-border/40 py-1.5 last:border-b-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-foreground">{option.targetCrewId}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{option.title}</span>
                  </div>
                  <div className="mt-0.5 text-rose-700 dark:text-rose-300">
                    {option.ruleMessages.join(' ') || 'Rule check failed'}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </section>
  )
}

const changeTypeLabel = (changeType: RecoveryOption['changes'][number]['changeType']): string => {
  if (changeType === 'cancel') return 'Cancelled'
  if (changeType === 'add') return 'Added'
  return 'Kept'
}

const changeTypeClass = (changeType: RecoveryOption['changes'][number]['changeType']): string => {
  if (changeType === 'cancel') return 'inline-flex rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-2xs font-medium text-rose-700 dark:text-rose-300'
  if (changeType === 'add') return 'inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300'
  return 'inline-flex rounded border border-slate-400/20 bg-slate-500/10 px-1.5 py-0.5 text-2xs font-medium text-slate-700 dark:text-slate-300'
}

const bestCost = (group: RecoveryPlans['roster']): string => {
  const executable = group.options.filter((option) => option.ruleCheck === 'passed' && option.localExecutable)
  const candidates = executable.length > 0 ? executable : group.options
  if (candidates.length === 0) return '—'
  const min = candidates.reduce((best, option) => option.metrics.totalCost < best.metrics.totalCost ? option : best)
  return money(min.metrics.totalCost, min.metrics.currency)
}

/**
 * PlanTree — left rail: full-height scrollable tree of recovery methods.
 *
 * Replaces the old PlanComparison's left column. Two groupings:
 *   - "By strategy" — roster / standby / cross-base
 *   - "By cost tier" — buckets each method by its minimum option cost
 *
 * The cheapest method is annotated with "★" in both groupings. Selecting a
 * leaf drives the parent `selectPlanType`, which re-renders the right
 * column's PlanSummary + PlanGroup.
 */
const PlanTree = ({
  plans,
  selectedPlanType,
  bestGroupId,
  onSelect,
}: {
  plans: RecoveryPlans
  selectedPlanType: RecoveryPlans['roster']['id']
  bestGroupId: RecoveryPlans['roster']['id'] | null
  onSelect: (planType: RecoveryPlans['roster']['id']) => void
}) => {
  // Mixed recovery is only meaningful for multi-alert plans (one alert
  // always trivially picks itself). Hide the leaf in the tree when
  // alerts.length <= 1 so single-alert flows (right-click → Recovery, single
  // Alert Center row) never expose a no-op entry.
  const rows = plans.alerts.length > 1
    ? [plans.roster, plans.standby, plans.crossBase, plans.mixed]
    : [plans.roster, plans.standby, plans.crossBase]
  const costTiers = useMemo(() => {
    const tiers = [
      { key: 'free', label: '¥0', test: (cost: number) => cost === 0 },
      { key: 'low', label: '¥0–10k', test: (cost: number) => cost > 0 && cost <= 10000 },
      { key: 'mid', label: '¥10k–50k', test: (cost: number) => cost > 10000 && cost <= 50000 },
      { key: 'high', label: '¥50k+', test: (cost: number) => cost > 50000 },
    ]
    return tiers.map((tier) => ({
      ...tier,
      groups: rows
        .map((group) => ({ group, minCost: minOptionCost(group.options) }))
        .filter((entry) => entry.minCost != null && tier.test(entry.minCost)),
    }))
  }, [rows])
  return (
    <nav
      className="flex w-[240px] shrink-0 flex-col border border-border bg-muted/15"
      aria-label="Recovery method tree"
      data-testid="recovery-plan-tree"
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="text-xs font-semibold text-foreground">Recovery methods</div>
        <div className="mt-0.5 text-2xs text-muted-foreground">Pick a strategy or cost tier; the cheapest is marked ★.</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">By strategy</div>
        <ul className="mb-3 space-y-0.5" role="tree">
          {rows.map((group) => {
            const selected = selectedPlanType === group.id
            const best = group.id === bestGroupId
            return (
              <li key={group.id} role="treeitem" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => onSelect(group.id)}
                  data-testid={`recovery-plan-filter-${group.id}`}
                  className={[
                    'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
                    selected ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-accent/60',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={['h-1.5 w-1.5 shrink-0 rounded-full', planTone(group.id).dot].join(' ')} aria-hidden="true" />
                    <span className="truncate">{group.title}</span>
                    {best && <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-2xs font-bold text-emerald-700 dark:text-emerald-300">★</span>}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">{group.options.length}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">By cost tier</div>
        <ul className="space-y-0.5" role="tree">
          {costTiers.map((tier) => (
            <li key={tier.key} role="treeitem">
              <div className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-foreground">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">▾</span>
                  <span>{tier.label}</span>
                </span>
                <span className="font-mono text-2xs text-muted-foreground tabular-nums">{tier.groups.length}</span>
              </div>
              <ul className="ml-3 space-y-0.5 border-l border-border pl-2">
                {tier.groups.length === 0 && (
                  <li className="px-2 py-0.5 text-2xs text-muted-foreground/60">—</li>
                )}
                {tier.groups.map(({ group, minCost }) => {
                  const selected = selectedPlanType === group.id
                  const best = group.id === bestGroupId
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(group.id)}
                        className={[
                          'flex w-full items-center justify-between gap-2 rounded px-2 py-0.5 text-left text-2xs transition-colors',
                          selected ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        ].join(' ')}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={['h-1 w-1 shrink-0 rounded-full', planTone(group.id).dot].join(' ')} aria-hidden="true" />
                          <span className="truncate">{group.title}</span>
                          {best && <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-2xs font-bold text-emerald-700 dark:text-emerald-300">★</span>}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">{money(minCost ?? 0)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-border pt-2 text-2xs text-muted-foreground">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">★</span> = lowest total cost across all plans.
        </div>
      </div>
    </nav>
  )
}

/**
 * PlanSummary — top-of-right-column card showing the currently selected
 * method's aggregate stats (options count, executable count, filtered count,
 * best cost). The cheapest method overall is highlighted with the green
 * "★ Best cost" badge. This card sits above PlanGroup so the user can
 * always see at a glance what method they're browsing.
 */
const PlanSummary = ({
  plans,
  selectedPlanType,
  bestGroupId,
}: {
  plans: RecoveryPlans
  selectedPlanType: RecoveryPlans['roster']['id']
  bestGroupId: RecoveryPlans['roster']['id'] | null
}) => {
  const rows = plans.alerts.length > 1
    ? [plans.roster, plans.standby, plans.crossBase, plans.mixed]
    : [plans.roster, plans.standby, plans.crossBase]
  const group = rows.find((g) => g.id === selectedPlanType) ?? rows[0]
  const selected = selectedPlanType === group.id
  const tone = planTone(group.id)
  const executableCount = group.options.filter((option) => option.ruleCheck === 'passed' && option.localExecutable).length
  const groupMin = minOptionCost(group.options)
  const isBest = group.id === bestGroupId
  return (
    <article
      data-testid={`recovery-plan-detail-${group.id}`}
      className={[
        'relative shrink-0 rounded border-2 p-3 text-left transition-[border-color,background-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        isBest
          ? 'border-emerald-500/55 bg-emerald-500/[0.05] shadow-[0_0_0_3px_rgba(16,185,129,0.08)]'
          : selected ? `${tone.section} ${tone.selectedRow} shadow-sm` : 'border-border bg-background',
      ].join(' ')}
    >
      {isBest && (
        <span className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white shadow-sm">
          ★ Best cost · {money(groupMin ?? 0)}
        </span>
      )}
      <span className="flex items-start justify-between gap-2 pl-1">
        <span className="flex min-w-0 items-start gap-2">
          <span className={['mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', tone.dot].join(' ')} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground">{group.title}</span>
            <span className="mt-1 block text-2xs leading-4 text-muted-foreground">{group.description}</span>
          </span>
        </span>
        <span className={['shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold', selected ? tone.badge : 'bg-muted text-muted-foreground'].join(' ')}>{selected ? 'Selected' : 'Choose'}</span>
      </span>
      <span className="mt-3 grid grid-cols-4 gap-2 border-t border-border/60 pt-2 pl-1 text-2xs">
        <span><span className="block text-muted-foreground">Options</span><span className="font-semibold tabular-nums text-foreground">{group.options.length}</span></span>
        <span><span className="block text-muted-foreground">Executable</span><span className="font-semibold tabular-nums text-foreground">{executableCount}</span></span>
        <span><span className="block text-muted-foreground">Filtered</span><span className="font-semibold tabular-nums text-foreground">{group.excludedOptions.length}</span></span>
        <span><span className="block text-muted-foreground">Best cost</span><span className={['font-semibold tabular-nums', isBest ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'].join(' ')}>{bestCost(group)}</span></span>
      </span>
    </article>
  )
}

// ── Helpers used by the tree + detail view ─────────────────────────────
const minOptionCost = (options: RecoveryOption[]): number | null => {
  let best: number | null = null
  for (const option of options) {
    const cost = option.metrics?.totalCost
    if (typeof cost !== 'number' || !Number.isFinite(cost)) continue
    if (best == null || cost < best) best = cost
  }
  return best
}