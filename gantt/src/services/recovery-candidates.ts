import type { RosterItem } from '@/types'
import type { CostLibraryBreakdownRow, RecoveryOptionMode } from './recovery-api'
import { isGroundTask, recoveryTriggerFor, type RecoveryTrigger } from './recovery-rules'
import { CROSS_BASE_DHD_COST_PER_MINUTE, DEFAULT_CROSS_BASE_RECOVERY_CONFIG, type CrossBaseRecoveryConfig } from '@/config/recovery-cross-base'

export interface RecoveryFlightSnapshot {
  id: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  fleet: string
  airline: string
  blockMinutes: number
}

export interface RecoveryPositioning {
  supportBase: string
  recoveryBase: string
  outbound: RecoveryFlightSnapshot
  inbound: RecoveryFlightSnapshot
  minFlightLeadHours: number
  /**
   * Upper bound on the positioning window (hours). The outbound DHD
   * departs at most this many hours before the Roster start, and the
   * inbound DHD departs at most this many hours after the Roster end.
   */
  maxFlightLeadHours: number
  reserveBeforeHours: number
  returnAfterHours: number
  dhdFlightCost: number
}

/** A destination-base recovery derived from an existing Pairing's leading/trailing DHD legs. */
export interface RecoveryDestinationSplit {
  destinationBase: string
  /** Pairing/Roster base after the leading DHD is removed. */
  adjustedPairingBase: string
  sourcePairingId: number
  createdPairingId: number
  /** False when the original Pairing has exactly one matching composition slot and is edited in place. */
  createsPairing: boolean
  actingRank: string
  middleFlightIds: number[]
  removedDhdFlightIds: number[]
  dhdCostSavings: number
}

/**
 * One flight of the affected Pairing as shown in the Flight Delay option.
 * `atdUtc`/`ataUtc` are the current actual times; `delayedAtdUtc`/`delayedAtaUtc`
 * are what Apply writes (equal to the current value when the segment needs no
 * delay).
 */
export interface RecoveryFlightDelaySegment {
  flightId: number
  fltNum: string
  depArp: string
  arvArp: string
  dutySeq: number
  segSeq: number
  stdUtc: string
  staUtc: string
  atdUtc: string
  ataUtc: string
  delayedAtdUtc: string
  delayedAtaUtc: string
}

/** Everything the Flight Delay option needs to render and to Apply. */
export interface RecoveryFlightDelayPlan {
  /** Earliest ATD the delay pushes the flights to = ground-task end + 61 minutes. */
  delayStartUtc: string
  /** Latest end of the source Crew's ground tasks overlapping the affected Pairing. */
  groundTaskEndUtc: string
  /** False when every segment already departs after `delayStartUtc` (no-op option). */
  changesAnything: boolean
  segments: RecoveryFlightDelaySegment[]
}

/** Pairing segment snapshot used to build the Flight Delay option. */
export interface RecoveryPairingSegmentSnapshot {
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltNum: string
  depArp: string
  arvArp: string
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc: string | null
  actEndDtUtc: string | null
}

export interface RecoveryAlertSnapshot {
  id: string
  ruleCode: string
  severity: number
  crewId: string
  pairingId: number
  flightDate: string
  flightNumber: string
  detail: string
  fleet?: string | null
  requiredRank?: string | null
}

export interface RecoveryCrewSnapshot {
  crewId: string
  crewName: string
  rank: string
  base: string
  division: string
  annualFlightMinutes: number
  fleetQuals: string[]
}

export interface RecoveryChange {
  crewId: string
  crewName: string
  rosterId: string
  pairingId: number | null
  before: string
  after: string
  changeType: 'cancel' | 'add' | 'keep'
  /** Optional sort key for Detail-dialog ordering. UTC ms since epoch, or null when unknown. */
  startTimeMs?: number | null
}
export interface RecoveryMetrics {
  affectedCrewCount: number
  cancelledRosterCount: number
  addedRosterCount: number
  changedRosterCount: number
  followOnImpactCount: number
  rosterStability: number
  /**
   * Direct cost priced entirely by the cost library (every component — transfer
   * base, cross-base, cross-division, cross-role, roster change penalty, follow-on
   * impact, DHD positioning — flows through cost_type revisions). `virtualCost`
   * is no longer a separate additive component; whatever a planner used to encode
   * in the hard-coded stability coefficient now lives in cost types 1015 / 1016.
   */
  directCost: number
  dhdFlightCost: number
  /** Positive amount of DHD cost avoided by reusing the first DHD's destination base. */
  dhdCostSavings?: number
  /**
   * Alias for `directCost`. Retained so existing UI / sort logic (which
   * historically compared `totalCost`) keeps working unchanged. Will always
   * equal `directCost` now that all stability penalties are priced by the
   * cost library.
   */
  totalCost: number
  currency: string
  /** P0-1 lite — per-component cost breakdown. Undefined when enrichment failed. */
  costBreakdown?: CostLibraryBreakdownRow[]
  /** P0-1 lite — notes from cost library (e.g. "Cross-division unpriced"). */
  costNotes?: string[]
  /** P0-1 lite — true if the cost-library enrichment call failed and we fell back to the hard-coded value. */
  costEnrichmentFailed?: boolean
}

export interface RecoveryOption {
  id: string
  mode: RecoveryOptionMode
  title: string
  targetCrewId: string
  targetCrewName: string
  sourceCrewId: string
  sourcePairingId: number
  targetPairingId: number | null
  standbyTaskId: number | null
  standbyWindow: string | null
  timeDistanceMinutes: number | null
  sameRank: boolean
  sameBase: boolean
  crossDivision: boolean
  crossRole: boolean
  localExecutable: boolean
  reasons: string[]
  /**
   * Soft constraints that do NOT block the option but must be shown to the planner.
   * Currently: aircraft-type (fleet) qualification mismatches — a crew that is not
   * qualified for the received Pairing's fleet stays selectable, with the mismatch
   * spelled out (requirement decision 2026-09-12).
   */
  warnings?: string[]
  /** Soft findings reported by the local legality preview (e.g. 8004 FLEET). */
  ruleWarnings?: string[]
  beforeItems: RosterItem[]
  afterItems: RosterItem[]
  changes: RecoveryChange[]
  metrics: RecoveryMetrics
  ruleCheck: 'pending' | 'passed' | 'failed' | 'not-run'
  ruleMessages: string[]
  positioning: RecoveryPositioning | null
  destinationSplit?: RecoveryDestinationSplit | null
  /** Flight Delay only — the affected Pairing's delayed flight plan. */
  flightDelay?: RecoveryFlightDelayPlan | null
  /** Child recovery decisions for a multi-alert combination option. */
  subOptions?: RecoveryOption[]
}

export interface RecoveryPreviewViolation {
  crewId: string
  pairingId: number | null
  ruleCode: string
  ruleInstance?: string | null
  scopeKey?: string | null
  message: string
  /** Overlap/duty window as returned by the legality preview API (rule 1001 uses it). */
  startDt?: string | null
  endDt?: string | null
  /**
   * Qualification dimension for 8004 findings as returned by the preview API:
   * `BASE` / `RANK` / `FLEET`. Aircraft type (`FLEET`) is a soft constraint.
   */
  dimension?: 'BASE' | 'RANK' | 'FLEET' | null
}

export interface RecoveryPlanGroup {
  id: 'roster' | 'standby' | 'cross-base' | 'swap-duty' | 'flight-delay' | 'mixed'
  title: string
  description: string
  options: RecoveryOption[]
  /** Candidates removed after simulated Rule validation, retained for diagnostics. */
  excludedOptions: RecoveryOption[]
}

/**
 * Per-candidate diagnostic explaining why a cross-base option did or did not
 * surface. Always populated when buildRecoveryPlans runs (cheap), regardless of
 * whether the option ends up in crossBase.options. Used by the Alert Center
 * Recovery dialog to log structured traces for offline analysis of empty
 * crossBase groups.
 */
export interface CrossBaseCandidateTrace {
  crewId: string
  crewName: string
  supportBase: string
  /** Rejected before the positioning search (e.g. rank/fleet/base mismatch). */
  hardRejection: string | null
  /** Number of DHD candidate flights seen from the `flight` table for the supportBase -> recoveryBase route in the loaded window. */
  candidateFlightCount: number
  /** Earliest candidate departure (UTC ISO) found in the loaded window for the outbound route. null when no candidate was visible. */
  earliestOutboundDep: string | null
  /** Latest candidate arrival (UTC ISO) found in the loaded window for the outbound route. null when no candidate was visible. */
  latestOutboundArv: string | null
  /** Positioning window the source Roster imposed on the outbound leg. */
  outboundWindow: { earliestDepUtc: string; latestDepUtc: string; latestArvUtc: string } | null
  /** Outbound filter outcomes (which constraint was the deal-breaker). */
  outboundFilterResult: 'matched' | 'no-candidate' | 'too-early' | 'too-late' | 'arrives-too-late'
  /** Outbound flight picked when matched. */
  outbound: RecoveryFlightSnapshot | null
  /** Inbound filter outcomes. */
  inboundFilterResult: 'matched' | 'no-candidate' | 'too-early' | 'too-late'
  inbound: RecoveryFlightSnapshot | null
  /** Cross-base positioning result (null if no positioning could be assembled). */
  positioningResult: 'ok' | 'no-outbound' | 'no-inbound'
  /** True when the candidate is free for the DHD positioning window (no overlap with loaded items, excluding the optional excludedPairingId). */
  freeForPositioning: boolean | null
  /** Loaded item count for this candidate (informational). */
  loadedItemCount: number
  /** True if the candidate was ultimately surfaced (crossBase.options includes them). */
  surfaced: boolean
  /** Mode(s) the candidate was surfaced under. */
  surfacedModes: ('cross-base-standby' | 'cross-base-swap' | 'cross-base-destination' | 'cross-base-direct')[]
}

export interface RecoveryPlans {
  alert: RecoveryAlertSnapshot
  /** All selected alerts represented by this plan. `alert` remains the first alert for compatibility. */
  alerts: RecoveryAlertSnapshot[]
  /**
   * Which alert type opened the dialog. `assignment-overlap` (Rule 1001) shows
   * standby → Swap duty → Flight Delay; `roster-qualification` (Rule 8004)
   * keeps the original roster / standby / cross-base set.
   */
  trigger: RecoveryTrigger
  roster: RecoveryPlanGroup
  standby: RecoveryPlanGroup
  crossBase: RecoveryPlanGroup
  /** Swap the affected Pairing with another Crew's later-reporting Pairing. */
  swapDuty: RecoveryPlanGroup
  /** Keep the original Crew and list every flight of the affected Pairing. */
  flightDelay: RecoveryPlanGroup
  /**
   * Mixed (best-per-alert) plan — only populated when `alerts.length > 1`. For
   * each selected alert we independently pick the cheapest executable option
   * across roster / standby / cross-base (each alert may use a different
   * method) and bundle the per-alert decisions into a single combined option
   * via `subOptions`. Single-alert plans always leave this empty.
   */
  mixed: RecoveryPlanGroup
  /** Per-candidate trace for the cross-base plan, always populated when buildRecoveryPlans runs. */
  crossBaseTrace: CrossBaseCandidateTrace[]
  /** Diagnostic context the cross-base trace was built against. */
  crossBaseContext: {
    sourceCrewId: string
    sourcePairingId: number | null
    recoveryBase: string | null
    requiredFleets: string[]
    sourceStartUtc: string | null
    sourceEndUtc: string | null
    loadedFlightCount: number
    loadedFlightWindow: { startDate: string; endDate: string } | null
  }
}


export interface BuildRecoveryPlansInput {
  items: RosterItem[]
  crews: RecoveryCrewSnapshot[]
  rankOrder: Map<string, number>
  /** Flights from the currently loaded Pairing details only. */
  flights?: RecoveryFlightSnapshot[]
  pairingCompositions?: RecoveryPairingCompositionSnapshot[]
  /** Segments of the loaded Pairings, used by the Flight Delay option. */
  pairingSegments?: RecoveryPairingSegmentSnapshot[]
  crossBaseConfig?: CrossBaseRecoveryConfig
  /** Injectable clock for deterministic expiry checks; defaults to the current instant. */
  now?: number
}

export interface RecoveryPairingCompositionSnapshot {
  pairingId: number
  actingRank: string
  plan: number
}

export const ROSTER_STABILITY_FORMULA =
  'round(max(0, min(100, 100 * (1 - (0.35*follow-on + 0.30*cancelled + 0.20*added + 0.15*changed) / max(1, loaded rosters)))), 2)'

interface RosterGroup {
  key: string
  crewId: string
  pairingId: number
  items: RosterItem[]
  start: number
  end: number
}

const finiteTime = (value: string | null | undefined): number => {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? time : 0
}

const groupKey = (crewId: string, pairingId: number): string => `${crewId}:${pairingId}`

const rosterLabel = (items: RosterItem[]): string => {
  const labels = [...new Set(items.map((item) => item.label || item.assignment || item.assignmentGroup).filter(Boolean))]
  return labels.join(' / ') || `Pairing #${items[0]?.pairingId ?? '—'}`
}

const buildGroups = (items: RosterItem[]): RosterGroup[] => {
  const map = new Map<string, RosterGroup>()
  for (const item of items) {
    if (item.pairingId == null || !item.schStrDtUtc || !item.schEndDtUtc) continue
    const pairingId = Number(item.pairingId)
    if (!Number.isFinite(pairingId) || pairingId <= 0) continue
    const key = groupKey(String(item.crewId), pairingId)
    const current = map.get(key)
    if (current) {
      current.items.push(item)
      current.start = Math.min(current.start, finiteTime(item.schStrDtUtc))
      current.end = Math.max(current.end, finiteTime(item.schEndDtUtc))
    } else {
      map.set(key, {
        key,
        crewId: String(item.crewId),
        pairingId,
        items: [item],
        start: finiteTime(item.schStrDtUtc),
        end: finiteTime(item.schEndDtUtc),
      })
    }
  }
  return [...map.values()]
}

/** A completed Roster is not a Recovery target once its latest task has ended. */
export const isRosterCompleted = (
  items: RosterItem[],
  crewId: string,
  pairingId: number,
  now = Date.now(),
): boolean => {
  const group = buildGroups(items).find((candidate) => candidate.crewId === String(crewId) && candidate.pairingId === Number(pairingId))
  return group != null && group.end < now
}

const overlaps = (a: RosterGroup, b: RosterGroup): boolean => a.start < b.end && a.end > b.start

const itemOverlapsGroup = (item: RosterItem, group: RosterGroup): boolean => {
  const start = finiteTime(item.schStrDtUtc)
  const end = finiteTime(item.schEndDtUtc)
  return start < group.end && end > group.start
}

/**
 * Recovery must leave the received complete Roster conflict-free.  This deliberately
 * evaluates every loaded Roster assignment (rather than only the closest one): the
 * current Live data is the complete candidate scope for this release.
 */
const hasAnyOverlapExcept = (items: RosterItem[], group: RosterGroup, ignoredPairingIds: Set<number>): boolean =>
  items.some((item) =>
    (item.pairingId == null || !ignoredPairingIds.has(Number(item.pairingId))) && itemOverlapsGroup(item, group),
  )

const previewViolationKey = (violation: RecoveryPreviewViolation): string => [
  violation.crewId,
  violation.pairingId ?? '',
  violation.ruleCode,
  violation.ruleInstance ?? '',
  violation.scopeKey ?? '',
  violation.message,
].join('|')

/**
 * A final Recovery candidate is valid only if it resolves the 8004 on every newly
 * received complete Roster and introduces no new legality result for an affected Crew.
 * Existing baseline violations are not relabelled as new, but an 8004 on a Roster that
 * changed Crew is always rejected.
 */
export const recoveryRuleFailures = (input: {
  option: Pick<RecoveryOption, 'mode' | 'sourceCrewId' | 'targetCrewId' | 'sourcePairingId' | 'targetPairingId' | 'destinationSplit'> & {
    subOptions?: RecoveryOption[]
  }
  before: RecoveryPreviewViolation[]
  after: RecoveryPreviewViolation[]
  /**
   * Window of the standby task a Callout Standby keeps. That task is the single
   * overlap a Recovery is allowed to create: the standby is the paper trail of the
   * callout (the Crew flies afterwards), and the requirement allows exactly this one
   * pair (crew-roster-recovery-requirements §7.2, "except the explicitly allowed
   * Callout SBY task").
   *
   * The legality preview cannot carry that marker for ground rows — the draft overlay
   * only replaces Pairing rows, so the retained standby reaches the engine with
   * `exception_code` still empty — therefore the gate drops precisely the 1001
   * violation whose overlap window sits inside this standby window. Genuine standby
   * overlaps (another SBY, a longer standby) stay blocked.
   */
  calloutStandbyWindow?: { startMs: number; endMs: number } | null
}): { failures: string[]; warnings: string[] } => {
  // Anchor "new violation" detection to the (crewId, pairingId) tuples this option
  // actually receives. Alerts on a different Crew or a different Pairing are not
  // introduced by this Recovery and must not filter the option out.
  const options = input.option.subOptions?.length ? input.option.subOptions : [input.option]
  const received = options.flatMap((option) => [
    { crewId: option.targetCrewId, pairingId: option.destinationSplit?.createdPairingId ?? option.sourcePairingId },
    ...((option.mode === 'swap' || option.mode === 'swap-duty' || option.mode === 'cross-base-swap') && option.targetPairingId != null
      ? [{ crewId: option.sourceCrewId, pairingId: option.targetPairingId }]
      : []),
  ])
  const receivedKeys = new Set(received.map((a) => `${a.crewId}|${a.pairingId ?? ''}`))
  const onReceivedAfter = input.after.filter((violation) => receivedKeys.has(`${violation.crewId}|${violation.pairingId ?? ''}`))
  const beforeKeys = new Set(input.before.map(previewViolationKey))
  const newViolations = onReceivedAfter.filter((violation) => !beforeKeys.has(previewViolationKey(violation)))
  const unresolved8004 = input.after.filter((violation) =>
    violation.ruleCode.trim().toUpperCase() === '8004' && received.some((assignment) =>
      String(assignment.crewId) === String(violation.crewId) && String(assignment.pairingId) === String(violation.pairingId)),
  )
  const calloutStandby = input.calloutStandbyWindow
  const isAllowedCalloutStandbyOverlap = (violation: RecoveryPreviewViolation): boolean => {
    if (!calloutStandby) return false
    if (violation.ruleCode.trim().toUpperCase() !== '1001') return false
    const start = violation.startDt ? new Date(violation.startDt).getTime() : Number.NaN
    const end = violation.endDt ? new Date(violation.endDt).getTime() : Number.NaN
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    const slackMs = 60_000
    return start >= calloutStandby.startMs - slackMs && end <= calloutStandby.endMs + slackMs
  }
  const messages = new Set<string>()
  const warningMessages = new Set<string>()
  // Aircraft type is a SOFT constraint (product decision 2026-09-12): an 8004
  // FLEET finding never blocks the option, it is surfaced as a warning. BASE and
  // RANK findings (and every other rule) keep blocking.
  const isFleetMismatch = (violation: RecoveryPreviewViolation): boolean =>
    violation.ruleCode.trim().toUpperCase() === '8004' && violation.dimension === 'FLEET'
  for (const violation of newViolations) {
    if (isAllowedCalloutStandbyOverlap(violation)) continue
    if (isFleetMismatch(violation)) warningMessages.add(`Fleet mismatch (8004): ${violation.message}`)
    else messages.add(`${violation.ruleCode}: ${violation.message}`)
  }
  for (const violation of unresolved8004) {
    if (isFleetMismatch(violation)) warningMessages.add(`Fleet mismatch (8004): ${violation.message}`)
    else messages.add(`8004: Crew ${violation.crewId} remains unqualified for Pairing ${violation.pairingId}.`)
  }
  return { failures: [...messages], warnings: [...warningMessages] }
}

const firstFollowingRoster = (groups: RosterGroup[], crewId: string, end: number, ignoredPairingIds: Set<number>): RosterGroup | null =>
  groups
    .filter((group) => group.crewId === crewId && !ignoredPairingIds.has(group.pairingId) && group.start >= end)
    .sort((a, b) => a.start - b.start || a.pairingId - b.pairingId)[0] ?? null

const affectsFirstFollowing = (groups: RosterGroup[], crewId: string, received: RosterGroup, ignoredPairingIds: Set<number>): boolean => {
  const next = firstFollowingRoster(groups, crewId, received.end, ignoredPairingIds)
  return next != null && overlaps(received, next)
}

const names = (crew: RecoveryCrewSnapshot | undefined, fallback: string): string => crew?.crewName || fallback

const qualifiesForFleet = (crew: RecoveryCrewSnapshot, fleet: string | null | undefined): boolean => {
  if (!fleet) return true
  const wanted = fleet.trim().toUpperCase()
  if (!wanted) return true
  // Fleet values are codes. A substring match would incorrectly accept 7M as 7M8.
  return crew.fleetQuals.some((value) => {
    const normalized = value.trim().toUpperCase()
    return normalized === wanted
  })
}

/**
 * Aircraft-type (fleet) qualification is a SOFT constraint in Recovery: a
 * mismatch never blocks the option, it is reported so the planner can decide.
 * Kept in one place so every method words it the same way.
 */
const fleetMismatchWarning = (crewRole: string, crewId: string, fleet: string, context?: string): string =>
  `Fleet mismatch: ${crewRole} ${crewId} is not qualified for aircraft type ${fleet}${context ? ` (${context})` : ''}.`

const cloneForCrew = (
  items: RosterItem[],
  crewId: string,
  mode: RecoveryOptionMode,
  rebaseBase?: string | null,
): RosterItem[] =>
  items.map((item) => ({
    ...item,
    crewId,
    isPending: true,
    isRecoveryAffected: true,
    isSwapped: isSwapLike(mode) ? 1 : item.isSwapped,
    // Cross-base (standby/swap/direct) and destination-base both re-base the
    // source Pairing to the new first/last airports after DHD positioning is
    // inserted. The recovered operating legs must therefore carry the
    // adjusted base, not the original Pairing base (which the source item
    // inherits from PG). Without this rewrite, the 8004 rule preview sees the
    // stale YVR base and rejects the option before the user can apply it.
    base: rebaseBase ?? item.base,
  }))

/**
 * Swap-shaped modes exchange two complete Rosters between two Crews, so the
 * after-state moves the source Pairing to the candidate Crew and returns the
 * candidate's Pairing to the source Crew. `swap-duty` is the Assignment Overlap
 * variant selected by later-report candidates.
 */
const isSwapLike = (mode: RecoveryOptionMode): boolean =>
  mode === 'swap' || mode === 'cross-base-swap' || mode === 'swap-duty'

const isDhdItem = (item: RosterItem): boolean =>
  [item.assignmentGroup, item.assignment, item.segAssignment].some((value) => value?.trim().toUpperCase() === 'DHD')

const splitSourceForDestination = (
  source: RosterGroup,
  targetCrew: RecoveryCrewSnapshot,
  optionId: string,
  sourceRankPlan: number | null,
): RecoveryDestinationSplit | null => {
  const ordered = [...source.items].sort((a, b) =>
    (a.dutySeq ?? 0) - (b.dutySeq ?? 0) || (a.segSeq ?? 0) - (b.segSeq ?? 0) || finiteTime(a.schStrDtUtc) - finiteTime(b.schStrDtUtc))
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  if (!first || !last || ordered.length < 3 || !isDhdItem(first) || !isDhdItem(last)) return null
  const middle = ordered.slice(1, -1).filter((item) => !isDhdItem(item) && item.fltId != null)
  const destinationBase = first.arvArp?.trim().toUpperCase() ?? ''
  const adjustedPairingBase = middle[0]?.depArp?.trim().toUpperCase() ?? ''
  if (!destinationBase || !adjustedPairingBase || targetCrew.base.trim().toUpperCase() !== destinationBase || middle.length === 0) return null
  // Destination-base recovery must preserve the source Crew's actual Acting
  // Rank. A missing source rank is not a valid recovery input.
  const actingRank = first.rosterActingRank || first.flightActingRank || ''
  if (!actingRank.trim()) return null
  const dhdCostSavings = [first, last].reduce((total, item) => {
    const duration = Math.max(0, Math.round((finiteTime(item.schEndDtUtc) - finiteTime(item.schStrDtUtc)) / 60000))
    return total + duration * CROSS_BASE_DHD_COST_PER_MINUTE
  }, 0)
  return {
    destinationBase,
    adjustedPairingBase,
    sourcePairingId: source.pairingId,
    createdPairingId: sourceRankPlan === 1 ? source.pairingId : syntheticId(`${optionId}:destination-pairing`),
    createsPairing: sourceRankPlan !== 1,
    actingRank,
    middleFlightIds: middle.map((item) => item.fltId!).filter((id, index, ids) => ids.indexOf(id) === index),
    removedDhdFlightIds: [first.fltId, last.fltId].filter((id): id is number => id != null),
    dhdCostSavings,
  }
}

const cloneForDestination = (items: RosterItem[], crewId: string, pairingId: number, adjustedPairingBase: string): RosterItem[] =>
  items.map((item, index) => ({
    ...item,
    id: syntheticId(`destination-task:${pairingId}:${item.id}:${index}`),
    crewId,
    pairingId,
    pairingLabel: `Destination-base recovery from Pairing #${Math.abs(pairingId)}`,
    // The original roster rows still carry the source Pairing base. Once the
    // leading DHD is removed, every row in the recovered Pairing must use the
    // adjusted Pairing base (the first operating flight's departure airport).
    base: adjustedPairingBase,
    isPending: true,
    isRecoveryAffected: true,
  }))

const syntheticId = (key: string): number => {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return -(Math.abs(hash) || 1)
}
const makeDhdItem = (
  flight: RecoveryFlightSnapshot,
  crewId: string,
  base: string,
  division: string,
  actingRank: string,
  pairingId: number,
  optionId: string,
  dutySeq: number,
  segSeq: number,
): RosterItem => ({
  id: syntheticId(`${optionId}:task:${flight.id}`),
  crewId,
  pairingId,
  pairingLabel: `DHD ${flight.fltNum}`,
  ver: 1,
  base,
  depArp: flight.depArp,
  arvArp: flight.arvArp,
  label: `${flight.fltNum} ${flight.depArp}-${flight.arvArp}`,
  assignmentGroup: 'DHD',
  assignment: 'DHD',
  role: 'CREW',
  subRole: null,
  source: 'RECOVERY',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: 'Cross-base Recovery DHD inserted into Duty boundary',
  score: null,
  workingHour: null,
  schStrDtUtc: flight.schDepDtUtc,
  schEndDtUtc: flight.schArvDtUtc,
  actStrDtUtc: flight.schDepDtUtc,
  actEndDtUtc: flight.schArvDtUtc,
  fltId: flight.id,
  fltDt: flight.schDepDtUtc.slice(0, 10),
  fleetCode: flight.fleet,
  dutySeq,
  segSeq,
  division,
  flightActingRank: actingRank,
  rosterActingRank: actingRank,
  activeRank: actingRank,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  dpMin: null,
  tagSet: null,
  exceptionCode: null,
  dutyActCreditedMinutes: null,
  dutyRefTz: null,
  actRestMin: null,
  segAssignment: 'DHD',
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
  isPending: true,
  isRecoveryAffected: true,
})

/**
 * Build the inbound/outbound DHD Roster items for a Cross-base positioning option.
 *
 * Refactor (Duty-inserted DHD):
 *   - DHD rows belong to the source Pairing (`sourcePairingId`) instead of
 *     synthesized half-ring Pairings. The receiving Crew inherits the
 *     positioning via the source Pairing roster_flight rows.
 *   - dutySeq is computed from the source roster's existing duty boundary:
 *       outbound => min(dutySeq) - 1   (or 0 when the source has no rows)
 *       inbound  => max(dutySeq) + 1
 *     This keeps the positioning flights visually attached to the Pairing's
 *     first/last duty in the Gantt while the row identity remains stable.
 */
const makeDhdItems = (
  positioning: RecoveryPositioning,
  targetCrew: RecoveryCrewSnapshot,
  actingRank: string,
  optionId: string,
  sourcePairingId: number,
  sourceItems: RosterItem[],
): RosterItem[] => {
  const sorted = [...sourceItems].sort((a, b) =>
    (a.dutySeq ?? 0) - (b.dutySeq ?? 0) || (a.segSeq ?? 0) - (b.segSeq ?? 0))
  const firstDuty = sorted[0]?.dutySeq
  const lastDuty = sorted[sorted.length - 1]?.dutySeq
  const outboundDutySeq = typeof firstDuty === 'number' ? firstDuty - 1 : 0
  const inboundDutySeq = typeof lastDuty === 'number' ? lastDuty + 1 : (outboundDutySeq + 1)
  return [
    makeDhdItem(
      positioning.outbound,
      targetCrew.crewId,
      positioning.supportBase,
      targetCrew.division,
      actingRank,
      sourcePairingId,
      optionId,
      outboundDutySeq,
      1,
    ),
    makeDhdItem(
      positioning.inbound,
      targetCrew.crewId,
      positioning.supportBase,
      targetCrew.division,
      actingRank,
      sourcePairingId,
      optionId,
      inboundDutySeq,
      1,
    ),
  ]
}

const buildAfterItems = (
  allItems: RosterItem[],
  source: RosterGroup,
  target: RosterGroup | null,
  targetCrewId: string,
  targetCrew: RecoveryCrewSnapshot,
  mode: RecoveryOptionMode,
  standbyTaskId: number | null,
  positioning: RecoveryPositioning | null,
  destinationSplit: RecoveryDestinationSplit | null,
  flightDelay: RecoveryFlightDelayPlan | null,
  optionId: string,
): RosterItem[] => {
  if (mode === 'flight-delay') {
    // Flight Delay keeps the original Crew and every assignment; only the
    // affected Pairing's ATD/ATA move to the delayed values.
    const delayedByFlightId = new Map((flightDelay?.segments ?? []).map((segment) => [segment.flightId, segment]))
    return allItems.map((item) => {
      const delayed = item.fltId != null ? delayedByFlightId.get(Number(item.fltId)) : undefined
      return {
        ...item,
        ...(delayed ? { actStrDtUtc: delayed.delayedAtdUtc, actEndDtUtc: delayed.delayedAtaUtc } : {}),
        isRecoveryAffected: source.items.some((entry) => entry.id === item.id),
      }
    })
  }
  const sourceIds = new Set(source.items.map((item) => item.id))
  const targetIds = isSwapLike(mode) ? new Set(target?.items.map((item) => item.id) ?? []) : new Set<number>()
  const kept = allItems.filter((item) => !sourceIds.has(item.id) && !targetIds.has(item.id))
  if (mode === 'cross-base-destination' && destinationSplit) {
    const ordered = [...source.items].sort((a, b) =>
      (a.dutySeq ?? 0) - (b.dutySeq ?? 0) || (a.segSeq ?? 0) - (b.segSeq ?? 0) || finiteTime(a.schStrDtUtc) - finiteTime(b.schStrDtUtc))
    const middle = ordered.slice(1, -1).filter((item) => !isDhdItem(item))
    const moved = cloneForDestination(
      middle,
      targetCrewId,
      destinationSplit.createdPairingId,
      destinationSplit.adjustedPairingBase,
    )
    return [...kept, ...moved]
  }
  if (isSwapLike(mode) && target) {
    // A Roster keeps the Pairing's operating base when its Crew changes. Only
    // the synthetic DHD items use the support Crew's base.
    // Cross-base-swap also re-bases the source Pairing to the support Base,
    // so the moved source items get the adjusted base too. The returned target
    // items keep their own Pairing base (target Pairing.base is not changed).
    const movedBase = positioning?.outbound?.depArp?.trim().toUpperCase() || null
    const moved = cloneForCrew(source.items, targetCrewId, mode, movedBase)
    const returned = cloneForCrew(target.items, source.crewId, mode)
    const dhdItems = positioning ? makeDhdItems(positioning, targetCrew, source.items[0]?.rosterActingRank || source.items[0]?.flightActingRank || 'CREW', optionId, source.pairingId, source.items) : []
    return [...kept, ...moved, ...returned, ...dhdItems]
  }
  // Cross-base standby/direct: source Pairing is re-based to the support Base
  // (the outbound DHD's departure airport) because the candidate Crew is
  // based there, not at the original Pairing base. The 8004 rule preview
  // reads roster_flight.base directly, so we must reflect the rebased value
  // in the afterItems passed to /api/legality/preview-draft.
  const movedBase = positioning?.outbound?.depArp?.trim().toUpperCase() || null
  const moved = cloneForCrew(source.items, targetCrewId, mode, movedBase)
  const dhdItems = positioning ? makeDhdItems(positioning, targetCrew, source.items[0]?.rosterActingRank || source.items[0]?.flightActingRank || 'CREW', optionId, source.pairingId, source.items) : []
  return kept.map((item) =>
    item.crewId === targetCrewId && item.pairingId == null && item.id === standbyTaskId
      // The retained standby is a CALLED-OUT standby: mark it exactly the way the
      // Draft commit writes it (`exceptionCode: 'CALLOUT_STANDBY'`), because rule
      // 1001 treats that exception code — not a competing assignment — as the one
      // allowed overlap of a Recovery (see requirement §7.2).
      ? { ...item, isCalloutStandby: true, exceptionCode: 'CALLOUT_STANDBY' }
      : item,
  ).concat(moved, dhdItems)
}

const firstItemStartMs = (items: RosterItem[]): number | null => {
  for (const item of items) {
    const ms = finiteTime(item.schStrDtUtc)
    if (Number.isFinite(ms)) return ms
  }
  return null
}

/**
 * Sort the change list for the Detail dialog table by start time. Entries with
 * unknown start time fall back to the original push order (stable). This makes
 * the Before/After read chronologically: DHD-out -> operating leg(s) -> DHD-in.
 */
const sortChangesByStartTime = (changes: RecoveryChange[]): RecoveryChange[] => {
  const indexed = changes.map((change, originalIndex) => ({ change, originalIndex }))
  indexed.sort((a, b) => {
    const aMs = a.change.startTimeMs
    const bMs = b.change.startTimeMs
    if (aMs == null && bMs == null) return a.originalIndex - b.originalIndex
    if (aMs == null) return 1
    if (bMs == null) return -1
    if (aMs !== bMs) return aMs - bMs
    return a.originalIndex - b.originalIndex
  })
  return indexed.map((entry) => entry.change)
}

const buildChanges = (
  source: RosterGroup,
  target: RosterGroup | null,
  crewsById: Map<string, RecoveryCrewSnapshot>,
  targetCrewId: string,
  mode: RecoveryOptionMode,
  positioning: RecoveryPositioning | null,
  destinationSplit: RecoveryDestinationSplit | null,
  flightDelay: RecoveryFlightDelayPlan | null,
): RecoveryChange[] => {
  const sourceName = names(crewsById.get(source.crewId), source.crewId)
  const targetName = names(crewsById.get(targetCrewId), targetCrewId)
  const sourceBefore = rosterLabel(source.items)
  const sourceAfter = target ? rosterLabel(target.items) : 'Released / no assigned Roster'
  const sourceStartMs = firstItemStartMs(source.items)
  const targetStartMs = target ? firstItemStartMs(target.items) : null
  const isSwap = isSwapLike(mode)
  if (mode === 'flight-delay') {
    // Keep-the-Crew option: one row per affected flight with the current and the
    // delayed actual times, no ownership change.
    return sortChangesByStartTime((flightDelay?.segments ?? []).map((segment) => ({
      crewId: source.crewId,
      crewName: sourceName,
      rosterId: `R${source.pairingId}`,
      pairingId: source.pairingId,
      before: `Flight ${segment.fltNum} · ATD ${segment.atdUtc} · ATA ${segment.ataUtc}`,
      after: `Flight ${segment.fltNum} · ATD ${segment.delayedAtdUtc} · ATA ${segment.delayedAtaUtc} · delayed (Crew ${source.crewId} retained)`,
      changeType: 'keep' as const,
      startTimeMs: finiteTime(segment.stdUtc) || null,
    })))
  }
  if (mode === 'cross-base-destination' && destinationSplit) {
    return sortChangesByStartTime([{
      crewId: source.crewId,
      crewName: sourceName,
      rosterId: `R${source.pairingId}`,
      pairingId: source.pairingId,
      before: sourceBefore,
      after: destinationSplit.createsPairing
        ? `Released · first/last DHD split to new Pairing #${Math.abs(destinationSplit.createdPairingId)}`
        : 'Released · first/last DHD removed from original Pairing',
      changeType: 'cancel',
      startTimeMs: sourceStartMs,
    }, {
      crewId: targetCrewId,
      crewName: targetName,
      rosterId: `R${Math.abs(destinationSplit.createdPairingId)}`,
      pairingId: destinationSplit.createdPairingId,
      before: 'No assigned Roster in loaded data',
      after: `${rosterLabel(source.items.slice(1, -1).filter((item) => !isDhdItem(item)))} · Acting Rank ${destinationSplit.actingRank}${destinationSplit.createsPairing ? ' · new Pairing' : ' · original Pairing modified'}`,
      changeType: 'add',
      startTimeMs: targetStartMs,
    }])
  }
  const changes: RecoveryChange[] = [{
    crewId: source.crewId,
    crewName: sourceName,
    rosterId: `R${source.pairingId}`,
    pairingId: source.pairingId,
    before: sourceBefore,
    after: isSwap && target ? sourceAfter : 'Released / no assigned Roster',
    changeType: 'cancel',
    startTimeMs: sourceStartMs,
  }, {
    crewId: targetCrewId,
    crewName: targetName,
    rosterId: `R${source.pairingId}`,
    pairingId: source.pairingId,
    before: target ? rosterLabel(target.items) : 'No assigned Roster in loaded data',
    after: sourceBefore,
    changeType: 'add',
    startTimeMs: sourceStartMs,
  }]
  if (isSwap && target) {
    changes.push({
      crewId: targetCrewId,
      crewName: targetName,
      rosterId: `R${target.pairingId}`,
      pairingId: target.pairingId,
      before: rosterLabel(target.items),
      after: sourceBefore,
      changeType: 'cancel',
      startTimeMs: targetStartMs,
    }, {
      crewId: source.crewId,
      crewName: sourceName,
      rosterId: `R${target.pairingId}`,
      pairingId: target.pairingId,
      before: sourceAfter,
      after: rosterLabel(target.items),
      changeType: 'add',
      startTimeMs: targetStartMs,
    })
  }
  if ((mode === 'cross-base-standby' || mode === 'cross-base-swap' || mode === 'cross-base-direct') && positioning) {
    changes.push({
      crewId: targetCrewId,
      crewName: targetName,
      rosterId: `DHD-${positioning.outbound.fltNum}`,
      pairingId: null,
      before: 'No positioning Roster',
      after: `${positioning.outbound.fltNum} ${positioning.outbound.depArp}-${positioning.outbound.arvArp} · DHD`,
      changeType: 'add',
      startTimeMs: finiteTime(positioning.outbound.schDepDtUtc) || null,
    }, {
      crewId: targetCrewId,
      crewName: targetName,
      rosterId: `DHD-${positioning.inbound.fltNum}`,
      pairingId: null,
      before: 'No positioning Roster',
      after: `${positioning.inbound.fltNum} ${positioning.inbound.depArp}-${positioning.inbound.arvArp} · DHD`,
      changeType: 'add',
      startTimeMs: finiteTime(positioning.inbound.schDepDtUtc) || null,
    })
  }
  return sortChangesByStartTime(changes)
}
const buildMetrics = (
  source: RosterGroup,
  target: RosterGroup | null,
  allGroups: RosterGroup[],
  targetCrew: RecoveryCrewSnapshot,
  sourceCrew: RecoveryCrewSnapshot,
  mode: RecoveryOptionMode,
  positioning: RecoveryPositioning | null,
  destinationSplit: RecoveryDestinationSplit | null,
): RecoveryMetrics => {
  if (mode === 'flight-delay') {
    // Keeping the original Crew changes no Roster; the option only surfaces the
    // affected Pairing's flights (and later the delay cost) for the planner.
    return {
      affectedCrewCount: 1,
      cancelledRosterCount: 0,
      addedRosterCount: 0,
      changedRosterCount: 0,
      followOnImpactCount: 0,
      rosterStability: 100,
      directCost: 0,
      dhdFlightCost: 0,
      dhdCostSavings: 0,
      totalCost: 0,
      currency: 'CNY',
    }
  }
  const changed = isSwapLike(mode) ? 2 : 1
  const affectedCrewCount = 2
  const destinationItems = mode === 'cross-base-destination'
    ? source.items.filter((item) => !isDhdItem(item))
    : source.items
  const received = {
    ...source,
    items: destinationItems,
    start: Math.min(...destinationItems.map((item) => finiteTime(item.schStrDtUtc))),
    end: Math.max(...destinationItems.map((item) => finiteTime(item.schEndDtUtc))),
  }
  const followOnImpactCount =
    (affectsFirstFollowing(allGroups, targetCrew.crewId, received, new Set([source.pairingId, ...(target ? [target.pairingId] : [])])) ? 1 : 0) +
    (isSwapLike(mode) && target && affectsFirstFollowing(allGroups, sourceCrew.crewId, target, new Set([source.pairingId, target.pairingId])) ? 1 : 0)
  const crossBase = sourceCrew.base && targetCrew.base && sourceCrew.base !== targetCrew.base ? 1 : 0
  const crossDivision = sourceCrew.division && targetCrew.division && sourceCrew.division !== targetCrew.division ? 1 : 0
  const crossRole = sourceCrew.rank !== targetCrew.rank ? 1 : 0
  const dhdFlightCost = positioning?.dhdFlightCost ?? 0
  const dhdCostSavings = destinationSplit?.dhdCostSavings ?? 0
  // Direct cost is now computed entirely by the cost library through
  // `enrichPlansWithLibraryCosts`. The value assembled here is only a
  // non-library fallback (used if the cost-library HTTP call fails) so the UI
  // can still render *some* number — and we keep the historical hard-coded
  // coefficients so the fallback roughly matches the legacy behaviour.
  // The bridge (`live-server/src/routes/recovery/recovery-cost.ts`) prices
  // every component (incl. the stability-penalty 1015/1016 types) so the
  // final `directCost` always equals `sum(breakdown.amount)`.
  const directCost = (mode === 'standby' || mode === 'cross-base-standby' ? 3200 : mode === 'swap' || mode === 'cross-base-swap' ? 1500 : 900) + crossBase * 1600 + crossDivision * 2200 + crossRole * 1200 + dhdFlightCost - dhdCostSavings
  const loadedRosterCount = Math.max(1, allGroups.length)
  // Keep the score aligned with the documented weighted model. Each count is
  // measured against the same loaded-Roster evaluation scope for comparison.
  const penalty =
    (0.30 * changed) +
    (0.20 * changed) +
    (0.15 * changed) +
    (0.35 * followOnImpactCount)
  const rosterStability = Math.max(0, Math.min(100, 100 - (100 * penalty) / loadedRosterCount))
  return {
    affectedCrewCount,
    cancelledRosterCount: changed,
    addedRosterCount: changed,
    changedRosterCount: changed,
    followOnImpactCount,
    rosterStability: Math.round(rosterStability * 100) / 100,
    directCost,
    dhdFlightCost,
    dhdCostSavings,
    // `totalCost` is now an alias of `directCost` — both fields carry the
    // cost-library-priced total. Sorting / display logic that reads
    // `totalCost` continues to work without modification.
    totalCost: directCost,
    currency: 'CNY',
  }
}

const makeOption = (
  input: {
    allItems: RosterItem[]
    allGroups: RosterGroup[]
    source: RosterGroup
    target: RosterGroup | null
    targetCrew: RecoveryCrewSnapshot
    sourceCrew: RecoveryCrewSnapshot
    mode: RecoveryOptionMode
    standbyTaskId: number | null
    standbyWindow: string | null
    timeDistanceMinutes: number | null
    sameRank: boolean
    sameBase: boolean
    crossDivision: boolean
    crossRole: boolean
    reasons: string[]
    warnings?: string[]
    positioning: RecoveryPositioning | null
    destinationSplit: RecoveryDestinationSplit | null
    flightDelay?: RecoveryFlightDelayPlan | null
  },
): RecoveryOption => {
  const { source, target, targetCrew, sourceCrew, mode } = input
  const isSwap = isSwapLike(mode)
  const flightDelay = input.flightDelay ?? null
  const optionId = `${mode}-${source.pairingId}-${targetCrew.crewId}-${target?.pairingId ?? input.standbyTaskId ?? 'none'}`
  const afterItems = buildAfterItems(input.allItems, source, target, targetCrew.crewId, targetCrew, mode, input.standbyTaskId, input.positioning, input.destinationSplit, flightDelay, optionId)
  const affectedItemIds = new Set([
    ...source.items.map((item) => item.id),
    ...(target?.items.map((item) => item.id) ?? []),
    ...(input.standbyTaskId != null ? [input.standbyTaskId] : []),
  ])
  const beforeItems = input.allItems.map((item) => affectedItemIds.has(item.id) ? { ...item, isRecoveryAffected: true } : item)
  const crewsById = new Map<string, RecoveryCrewSnapshot>([[sourceCrew.crewId, sourceCrew], [targetCrew.crewId, targetCrew]])
  return {
    id: `${mode}-${source.pairingId}-${targetCrew.crewId}-${target?.pairingId ?? input.standbyTaskId ?? 'none'}`,
    mode,
    title: mode === 'standby' ? `Callout ${targetCrew.crewId}` : mode === 'swap' ? `Swap with ${targetCrew.crewId}` : mode === 'swap-duty' ? `Swap duty with ${targetCrew.crewId}` : mode === 'flight-delay' ? `Flight Delay · keep ${sourceCrew.crewId}` : mode === 'cross-base-standby' ? `Cross-base Callout ${targetCrew.crewId}` : mode === 'cross-base-swap' ? `Cross-base Swap ${targetCrew.crewId}` : mode === 'cross-base-destination' ? `Destination-base Split ${targetCrew.crewId}` : mode === 'cross-base-direct' ? `Cross-base Direct Assign ${targetCrew.crewId}` : `Transfer to ${targetCrew.crewId}`,
    targetCrewId: targetCrew.crewId,
    targetCrewName: targetCrew.crewName,
    sourceCrewId: sourceCrew.crewId,
    sourcePairingId: source.pairingId,
    targetPairingId: isSwap ? (target?.pairingId ?? null) : null,
    standbyTaskId: input.standbyTaskId,
    standbyWindow: input.standbyWindow,
    timeDistanceMinutes: input.timeDistanceMinutes,
    sameRank: input.sameRank,
    sameBase: input.sameBase,
    crossDivision: input.crossDivision,
    crossRole: input.crossRole,
    // Swap duty carries no hard filter: it is executable as soon as the
    // two-way base/fleet/rank-seat match passes (`reasons` empty), exactly like
    // the other roster methods. Flight Delay is executable once a real delay
    // exists — it needs no crew-ownership rule check.
    localExecutable: input.reasons.length === 0,
    reasons: input.reasons,
    warnings: input.warnings ?? [],
    beforeItems,
    afterItems,
    changes: buildChanges(source, target, crewsById, targetCrew.crewId, mode, input.positioning, input.destinationSplit, flightDelay),
    metrics: buildMetrics(source, target, input.allGroups, targetCrew, sourceCrew, mode, input.positioning, input.destinationSplit),
    // Flight Delay edits flight times only, so the crew-ownership rule preview
    // does not apply to it; the flight-edit cascade validates it on Save.
    ruleCheck: mode === 'flight-delay' || input.reasons.length > 0 ? 'not-run' : 'pending',
    ruleMessages: [],
    positioning: input.positioning,
    destinationSplit: input.destinationSplit,
    flightDelay,
  }
}

const sortedCrewCandidates = (
  candidates: RecoveryOption[],
  crewsById: Map<string, RecoveryCrewSnapshot>,
  sourceCrew: RecoveryCrewSnapshot,
): RecoveryOption[] => [...candidates].sort((a, b) => {
  // KPI ranking from docs/requirements/recovery-refactor-prompt.md §2.11:
  // cost → stability → follow-on impact → annual flight minutes → time distance.
  // Lower directCost sorts first; ties break on the next documented criterion.
  const directCost = a.metrics.directCost - b.metrics.directCost
  if (directCost !== 0) return directCost
  const ar = crewsById.get(a.targetCrewId)
  const br = crewsById.get(b.targetCrewId)
  const rank = Number(a.sameRank) - Number(b.sameRank)
  if (rank !== 0) return -rank
  const base = Number(a.sameBase) - Number(b.sameBase)
  if (base !== 0) return -base
  const follow = a.metrics.followOnImpactCount - b.metrics.followOnImpactCount
  if (follow !== 0) return follow
  const hours = (ar?.annualFlightMinutes ?? 0) - (br?.annualFlightMinutes ?? 0)
  if (hours !== 0) return hours
  const distance = (a.timeDistanceMinutes ?? Number.MAX_SAFE_INTEGER) - (b.timeDistanceMinutes ?? Number.MAX_SAFE_INTEGER)
  if (distance !== 0) return distance
  return a.targetCrewId.localeCompare(b.targetCrewId) || sourceCrew.crewId.localeCompare(a.sourceCrewId)
})

const snapshotFlightsFromItems = (items: RosterItem[]): RecoveryFlightSnapshot[] => {
  const seen = new Set<number>()
  return items.flatMap((item) => {
    if (item.fltId == null || seen.has(item.fltId) || !item.schStrDtUtc || !item.schEndDtUtc) return []
    seen.add(item.fltId)
    return [{
      id: item.fltId,
      fltNum: (item.label || item.assignment || `FLT-${item.fltId}`).split(/\s+/)[0],
      depArp: item.depArp || '',
      arvArp: item.arvArp || '',
      schDepDtUtc: item.schStrDtUtc,
      schArvDtUtc: item.schEndDtUtc,
      fleet: item.fleetCode || '',
      airline: '',
      blockMinutes: Math.max(0, Math.round((finiteTime(item.schEndDtUtc) - finiteTime(item.schStrDtUtc)) / 60000)),
    }]
  }).filter((flight) => flight.depArp && flight.arvArp)
}

interface PositioningTrace {
  /** All loaded flights matching the supportBase -> recoveryBase route (no time filter). */
  routeCandidates: RecoveryFlightSnapshot[]
  /** Earliest candidate departure (UTC ISO) found in the loaded flights for the outbound route. */
  earliestOutboundDep: string | null
  /** Latest candidate arrival (UTC ISO) found in the loaded flights for the outbound route. */
  latestOutboundArv: string | null
  /** The exact window the outbound filter applied (informational). */
  outboundWindow: { earliestDepUtc: string; latestDepUtc: string; latestArvUtc: string }
  /** Why the outbound filter rejected (or 'matched'). */
  outboundResult: 'matched' | 'no-candidate' | 'too-early' | 'too-late' | 'arrives-too-late'
  /** The picked outbound flight, when matched. */
  outbound: RecoveryFlightSnapshot | null
  /** Why the inbound filter rejected (or 'matched'). */
  inboundResult: 'matched' | 'no-candidate' | 'too-early' | 'too-late'
  /** The picked inbound flight, when matched. */
  inbound: RecoveryFlightSnapshot | null
}

interface PositioningOutcome {
  positioning: RecoveryPositioning | null
  trace: PositioningTrace
}

/**
 * Compute the DHD positioning (outbound + inbound) for a support crew, and
 * capture a trace explaining why the candidate did or did not match. The trace
 * is always populated, even when no positioning is found, so empty crossBase
 * groups can be diagnosed offline.
 */
const positioningForWithTrace = (
  flights: RecoveryFlightSnapshot[],
  source: RosterGroup,
  supportBase: string,
  recoveryBase: string,
  now: number,
  config: CrossBaseRecoveryConfig,
): PositioningOutcome => {
  const minLeadMs = config.minFlightLeadHours * 3600000
  const maxLeadMs = config.maxFlightLeadHours * 3600000
  const outboundWindow = {
    earliestDepUtc: new Date(Math.max(now + minLeadMs, source.start - maxLeadMs)).toISOString(),
    latestDepUtc: new Date(source.start - maxLeadMs).toISOString(),
    latestArvUtc: new Date(source.start - config.reserveBeforeHours * 3600000).toISOString(),
  }
  // All loaded flights on the supportBase -> recoveryBase route, regardless of time.
  const routeCandidates = flights
    .filter((flight) => flight.depArp.toUpperCase() === supportBase.toUpperCase()
      && flight.arvArp.toUpperCase() === recoveryBase.toUpperCase())
  const earliestOutboundDep = routeCandidates.length
    ? routeCandidates.reduce((acc, f) => (finiteTime(f.schDepDtUtc) < finiteTime(acc.schDepDtUtc) ? f : acc)).schDepDtUtc
    : null
  const latestOutboundArv = routeCandidates.length
    ? routeCandidates.reduce((acc, f) => (finiteTime(f.schArvDtUtc) > finiteTime(acc.schArvDtUtc) ? f : acc)).schArvDtUtc
    : null

  // Outbound: the support crew must arrive at recoveryBase BEFORE the source
  // Roster starts (with reserveBeforeHours buffer), and the flight must depart
  // within the lead window (between minLeadHours from now and maxLeadHours
  // before the source Roster start).
  const matchingOutbound = flights
    .filter((flight) => flight.depArp.toUpperCase() === supportBase.toUpperCase()
      && flight.arvArp.toUpperCase() === recoveryBase.toUpperCase()
      && finiteTime(flight.schDepDtUtc) >= now + minLeadMs
      && finiteTime(flight.schDepDtUtc) >= source.start - maxLeadMs
      && finiteTime(flight.schArvDtUtc) <= source.start - config.reserveBeforeHours * 3600000)
    .sort((a, b) => finiteTime(a.schDepDtUtc) - finiteTime(b.schDepDtUtc))
  const outbound = matchingOutbound[0] ?? null

  let outboundResult: PositioningTrace['outboundResult'] = 'matched'
  if (!outbound) {
    if (routeCandidates.length === 0) {
      outboundResult = 'no-candidate'
    } else {
      // Classify the closest candidate so the trace tells the user WHY.
      const byDep = [...routeCandidates].sort((a, b) => finiteTime(a.schDepDtUtc) - finiteTime(b.schDepDtUtc))
      const earliest = byDep[0]
      const latestArvOk = byDep.some((f) => finiteTime(f.schArvDtUtc) <= source.start - config.reserveBeforeHours * 3600000)
      if (!latestArvOk) {
        // All candidates arrive after the latest acceptable arrival window.
        outboundResult = 'arrives-too-late'
      } else if (finiteTime(earliest.schDepDtUtc) > source.start - maxLeadMs) {
        // Earliest candidate is later than the maxLead window => it leaves too late.
        outboundResult = 'too-late'
      } else if (finiteTime(earliest.schDepDtUtc) < now + minLeadMs) {
        // Earliest candidate leaves sooner than the minLead window (and the next ones leave even later) => too early.
        outboundResult = 'too-early'
      } else {
        outboundResult = 'no-candidate'
      }
    }
  }

  // Inbound: only meaningful when an outbound was found.
  let inbound: RecoveryFlightSnapshot | null = null
  let inboundResult: PositioningTrace['inboundResult'] = 'no-candidate'
  if (outbound) {
    const inboundCandidates = flights
      .filter((flight) => flight.id !== outbound.id
        && flight.depArp.toUpperCase() === recoveryBase.toUpperCase()
        && flight.arvArp.toUpperCase() === supportBase.toUpperCase())
    const matchingInbound = inboundCandidates
      .filter((flight) => finiteTime(flight.schDepDtUtc) >= source.end + config.returnAfterHours * 3600000
        && finiteTime(flight.schDepDtUtc) <= source.end + maxLeadMs)
      .sort((a, b) => finiteTime(a.schDepDtUtc) - finiteTime(b.schDepDtUtc))
    inbound = matchingInbound[0] ?? null
    if (inbound) {
      inboundResult = 'matched'
    } else if (inboundCandidates.length === 0) {
      inboundResult = 'no-candidate'
    } else {
      const byDep = [...inboundCandidates].sort((a, b) => finiteTime(a.schDepDtUtc) - finiteTime(b.schDepDtUtc))
      const earliest = byDep[0]
      if (finiteTime(earliest.schDepDtUtc) < source.end + config.returnAfterHours * 3600000) {
        inboundResult = 'too-early'
      } else if (finiteTime(earliest.schDepDtUtc) > source.end + maxLeadMs) {
        inboundResult = 'too-late'
      } else {
        inboundResult = 'no-candidate'
      }
    }
  }

  const trace: PositioningTrace = {
    routeCandidates,
    earliestOutboundDep,
    latestOutboundArv,
    outboundWindow,
    outboundResult,
    outbound,
    inboundResult,
    inbound,
  }
  if (!outbound || !inbound) {
    return { positioning: null, trace }
  }
  return {
    positioning: {
      supportBase,
      recoveryBase,
      outbound,
      inbound,
      minFlightLeadHours: config.minFlightLeadHours,
      maxFlightLeadHours: config.maxFlightLeadHours,
      reserveBeforeHours: config.reserveBeforeHours,
      returnAfterHours: config.returnAfterHours,
      dhdFlightCost: (outbound.blockMinutes + inbound.blockMinutes) * CROSS_BASE_DHD_COST_PER_MINUTE,
    },
    trace,
  }
}

// Back-compat wrapper used by the cross-base loop. Always use the trace variant
// (`positioningForWithTrace`) directly so the per-candidate trace is captured.
const positioningFor = (
  flights: RecoveryFlightSnapshot[],
  source: RosterGroup,
  supportBase: string,
  recoveryBase: string,
  now: number,
  config: CrossBaseRecoveryConfig,
): RecoveryPositioning | null =>
  positioningForWithTrace(flights, source, supportBase, recoveryBase, now, config).positioning


const crewFreeForPositioning = (
  items: RosterItem[],
  crewId: string,
  positioning: RecoveryPositioning,
  excludedPairingId: number | null,
): boolean => {
  const start = finiteTime(positioning.outbound.schDepDtUtc)
  const end = finiteTime(positioning.inbound.schArvDtUtc)
  return !items.some((item) => item.crewId === crewId
    && (item.pairingId == null || Number(item.pairingId) !== excludedPairingId)
    && item.assignmentGroup?.toUpperCase() !== 'SBY'
    && finiteTime(item.schStrDtUtc) < end
    && finiteTime(item.schEndDtUtc) > start)
}

/** Delay applied after the overlapping ground task ends before the flights may depart. */
export const FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES = 61

const msOrNull = (value: string | null | undefined): number | null => {
  const ms = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(ms) ? ms : null
}

const isoFromMs = (ms: number): string => new Date(ms).toISOString()

/** The delay-relevant fields of one flight segment (before the plan is computed). */
export type RecoveryFlightDelayInputSegment = Omit<RecoveryFlightDelaySegment, 'delayedAtdUtc' | 'delayedAtaUtc'>

/**
 * Flight Delay plan for an Assignment Overlap (Rule 1001).
 *
 * Every flight of the affected Pairing must leave after the Crew's overlapping
 * ground task, so the earliest ATD is `groundTaskEnd + 61 minutes`. Two floors
 * keep the result flyable and predictable:
 *   1. a segment never departs earlier than it originally did (a delay must not
 *      become an advance), and
 *   2. consecutive segments keep their original turnaround (gap), so the pairing
 *      shape — and therefore its duty/rest legality — is preserved instead of
 *      collapsing every segment onto the same new departure time.
 *
 * Returns null when the plan cannot be built (no ground task end, no segments,
 * or a segment without usable times / block duration).
 */
export const planFlightDelay = (input: {
  segments: RecoveryFlightDelayInputSegment[]
  groundTaskEndUtc: string | null | undefined
}): RecoveryFlightDelayPlan | null => {
  const groundTaskEnd = msOrNull(input.groundTaskEndUtc)
  if (groundTaskEnd == null) return null
  const ordered = [...input.segments].sort((a, b) =>
    a.dutySeq - b.dutySeq || a.segSeq - b.segSeq)
  if (ordered.length === 0) return null

  const parsed: Array<{ segment: RecoveryFlightDelayInputSegment; std: number; sta: number; atd: number; ata: number }> = []
  for (const segment of ordered) {
    const std = msOrNull(segment.stdUtc)
    const sta = msOrNull(segment.staUtc)
    const atd = msOrNull(segment.atdUtc) ?? std
    const ata = msOrNull(segment.ataUtc) ?? sta
    if (std == null || sta == null || atd == null || ata == null || ata <= atd) return null
    parsed.push({ segment, std, sta, atd, ata })
  }

  const delayStart = groundTaskEnd + FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES * 60_000
  const segments: RecoveryFlightDelaySegment[] = []
  let changesAnything = false
  let previousDelayedAta: number | null = null
  for (const [index, entry] of parsed.entries()) {
    // Original turnaround between this segment and the previous one (negative
    // gaps cannot be preserved and are floored at zero).
    const originalGap = index === 0
      ? 0
      : Math.max(0, entry.atd - parsed[index - 1].ata)
    const earliestAtd = Math.max(
      delayStart,
      entry.atd,
      previousDelayedAta == null ? Number.NEGATIVE_INFINITY : previousDelayedAta + originalGap,
    )
    const delayedAtd = earliestAtd
    const delayedAta = delayedAtd + (entry.ata - entry.atd)
    if (delayedAtd !== entry.atd) changesAnything = true
    segments.push({
      ...entry.segment,
      stdUtc: isoFromMs(entry.std),
      staUtc: isoFromMs(entry.sta),
      atdUtc: isoFromMs(entry.atd),
      ataUtc: isoFromMs(entry.ata),
      delayedAtdUtc: isoFromMs(delayedAtd),
      delayedAtaUtc: isoFromMs(delayedAta),
    })
    previousDelayedAta = delayedAta
  }

  return {
    delayStartUtc: isoFromMs(delayStart),
    groundTaskEndUtc: isoFromMs(groundTaskEnd),
    changesAnything,
    segments,
  }
}

/**
 * Segments of the affected Pairing, preferring the loaded Pairing pane detail
 * (full `pairing_segment` rows) and falling back to the Roster rows, which are
 * the only source left when the Pairing of a finished Roster is out of the
 * loaded window.
 */
const flightDelaySegmentsFor = (
  source: RosterGroup,
  pairingSegments: RecoveryPairingSegmentSnapshot[] | undefined,
): RecoveryFlightDelayInputSegment[] => {
  const fromPairing = (pairingSegments ?? [])
    .filter((segment) => Number(segment.pairingId) === source.pairingId && segment.fltId != null)
    .map((segment) => ({
      flightId: Number(segment.fltId),
      fltNum: segment.fltNum?.trim() || '—',
      depArp: segment.depArp?.trim().toUpperCase() ?? '',
      arvArp: segment.arvArp?.trim().toUpperCase() ?? '',
      dutySeq: segment.dutySeq,
      segSeq: segment.segSeq,
      stdUtc: segment.schStrDtUtc ?? '',
      staUtc: segment.schEndDtUtc ?? '',
      atdUtc: segment.actStrDtUtc ?? segment.schStrDtUtc ?? '',
      ataUtc: segment.actEndDtUtc ?? segment.schEndDtUtc ?? '',
    }))
  if (fromPairing.length > 0) return fromPairing
  return source.items
    .filter((item) => item.fltId != null && item.schStrDtUtc && item.schEndDtUtc)
    .map((item) => ({
      flightId: Number(item.fltId),
      // Roster labels look like "1888 YVR-LAX" — keep only the flight number,
      // the airports have their own columns.
      fltNum: item.label?.trim().split(/\s+/)[0] || item.assignment?.trim() || '—',
      depArp: item.depArp?.trim().toUpperCase() ?? '',
      arvArp: item.arvArp?.trim().toUpperCase() ?? '',
      dutySeq: item.dutySeq ?? 0,
      segSeq: item.segSeq ?? 0,
      stdUtc: item.schStrDtUtc ?? '',
      staUtc: item.schEndDtUtc ?? '',
      atdUtc: item.actStrDtUtc ?? item.schStrDtUtc ?? '',
      ataUtc: item.actEndDtUtc ?? item.schEndDtUtc ?? '',
    }))
}

const buildSingleRecoveryPlans = (input: BuildRecoveryPlansInput & { alert: RecoveryAlertSnapshot }): RecoveryPlans => {
  const groups = buildGroups(input.items)
  const now = input.now ?? Date.now()
  const activeGroups = groups.filter((group) => group.end >= now)
  const sourceCrew = input.crews.find((crew) => crew.crewId === input.alert.crewId) ?? {
    crewId: input.alert.crewId, crewName: input.alert.crewId, rank: '', base: '', division: '', annualFlightMinutes: 0, fleetQuals: [],
  }
  // Rule 8004 keeps the original strategy set; Rule 1001 (Assignment Overlap)
  // switches the dialog to standby → Swap duty → Flight Delay.
  const trigger: RecoveryTrigger = recoveryTriggerFor(input.alert.ruleCode) ?? 'roster-qualification'
  // An Assignment Overlap alert frequently refers to a Pairing that has already
  // ended (the planner reviews yesterday's overlap). The 1001 strategy must still
  // resolve that Roster — otherwise the dialog opens with no options at all —
  // while 8004 keeps its "finished Roster is not a Recovery target" rule.
  const sourceScope = trigger === 'assignment-overlap' ? groups : activeGroups
  const source = sourceScope.find((group) => group.crewId === input.alert.crewId && group.pairingId === input.alert.pairingId)
  if (!source) {
    const completed = groups.some((group) => group.crewId === input.alert.crewId && group.pairingId === input.alert.pairingId && group.end < now)
    const description = completed
      ? 'The affected Roster has ended and does not require recovery.'
      : 'The affected complete Roster is not present in the currently loaded Live data.'
    const empty = (id: RecoveryPlanGroup['id'], title: string): RecoveryPlanGroup => ({ id, title, description, options: [], excludedOptions: [] })
    return {
      alert: input.alert,
      alerts: [input.alert],
      trigger,
      roster: empty('roster', 'Roster transfer or exchange'),
      standby: empty('standby', 'Standby Crew callout'),
      crossBase: empty('cross-base', 'Cross-base positioning'),
      swapDuty: empty('swap-duty', 'Swap duty'),
      flightDelay: empty('flight-delay', 'Flight Delay'),
      mixed: emptyMixedGroup(),
      crossBaseTrace: [],
      crossBaseContext: {
        sourceCrewId: input.alert.crewId,
        sourcePairingId: input.alert.pairingId,
        recoveryBase: null,
        requiredFleets: input.alert.fleet ? [input.alert.fleet] : [],
        sourceStartUtc: null,
        sourceEndUtc: null,
        loadedFlightCount: 0,
        loadedFlightWindow: null,
      },
    }
  }

  // TODO(decision-C): Rank downgrade as soft filter + KPI penalty.
  // Currently every recovery mode (transfer / swap / standby / destination /
  // cross-base) hard-skips a target Crew whose rank is below requiredOrder or
  // has no rank mapping (see reasons.push('... Rank is lower than the required
  // Rank or has no rank mapping.')). The refactor prompt suggests a softer
  // policy: keep the candidate, surface it in the plan list, and apply a
  // rankGap-based penalty in metrics.directCost so KPI ranking can still
  // Build a per-Crew index of items so the per-target hot loop does
  // not run an O(N) filter over the loaded roster for every candidate (the
  // dialog loads ~1500-2000 items; without this, 150 candidates x 4 filters
  // = ~900k comparisons vs ~150 x 6 items per crew). Hoist source items too
  // so source-crew and target-crew lookups share the same map.
  const itemsByCrew = new Map<string, RosterItem[]>()
  const sourceItems: RosterItem[] = []
  for (const item of input.items) {
    const crewId = String(item.crewId)
    if (crewId === String(source.crewId)) sourceItems.push(item)
    const list = itemsByCrew.get(crewId)
    if (list) list.push(item)
    else itemsByCrew.set(crewId, [item])
  }
  const itemsOf = (crewId: string): RosterItem[] => itemsByCrew.get(crewId) ?? []
  // prefer rank-matched crews. Defer until the wider ranking rework lands.
  const crewsById = new Map(input.crews.map((crew) => [crew.crewId, crew]))
  const requiredOrder = input.rankOrder.get((input.alert.requiredRank || source.items[0]?.flightActingRank || '').toUpperCase())
  const requiredFleets = [...new Set([
    input.alert.fleet,
    ...source.items.map((item) => item.fleetCode),
  ].map((value) => value?.trim().toUpperCase()).filter((value): value is string => Boolean(value)))]
  const rosterOptions: RecoveryOption[] = []
  const targetCrews = input.crews.filter((crew) => crew.crewId !== source.crewId)
  // Swap-duty candidates are also drawn from the same scope: the business-date
  // condition (not "still active") decides which Pairings qualify.
  const targetGroups = sourceScope.filter((group) => group.crewId !== source.crewId && group.pairingId !== source.pairingId)

  for (const targetCrew of targetCrews) {
    if (trigger !== 'roster-qualification') break
    const targetGroupsForCrew = targetGroups.filter((group) => group.crewId === targetCrew.crewId)
    const targetRoster = targetGroupsForCrew.sort((a, b) => Math.abs(a.start - source.start) - Math.abs(b.start - source.start))[0] ?? null
    const sameRank = !!sourceCrew.rank && sourceCrew.rank.toUpperCase() === targetCrew.rank.toUpperCase()
    const sameBase = !!sourceCrew.base && sourceCrew.base.toUpperCase() === targetCrew.base.toUpperCase()
    const crossDivision = !!sourceCrew.division && !!targetCrew.division && sourceCrew.division !== targetCrew.division
    const crossRole = !!sourceCrew.rank && !!targetCrew.rank && sourceCrew.rank !== targetCrew.rank
    const targetOrder = input.rankOrder.get(targetCrew.rank.toUpperCase())
    const targetItems = itemsOf(targetCrew.crewId)
    const baseReasons: string[] = []
    if (requiredOrder != null && (targetOrder == null || targetOrder > requiredOrder)) baseReasons.push('Target Crew Rank is lower than the required Rank or has no rank mapping.')
    const missingFleet = requiredFleets.find((fleet) => !qualifiesForFleet(targetCrew, fleet))
    // Aircraft type is a SOFT constraint: the candidate stays listed and applyable,
    // the mismatch is displayed instead of blocking it.
    const warnings: string[] = []
    if (missingFleet) warnings.push(fleetMismatchWarning('Target Crew', targetCrew.crewId, missingFleet))

    // Direct transfer retains all target Crew Roster assignments, so none may overlap
    // the received Roster. Invalid candidates are excluded instead of presented as plans.
    if (baseReasons.length === 0 && !hasAnyOverlapExcept(targetItems, source, new Set())) {
      rosterOptions.push(makeOption({
        allItems: input.items, allGroups: activeGroups, source, target: targetRoster, targetCrew, sourceCrew, mode: 'transfer', standbyTaskId: null,
        standbyWindow: null, timeDistanceMinutes: targetRoster ? Math.round(Math.abs(targetRoster.start - source.start) / 60000) : null,
        sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings, positioning: null, destinationSplit: null,
      }))
    }

    if (targetRoster) {
      const targetHasConflict = hasAnyOverlapExcept(targetItems, source, new Set([targetRoster.pairingId]))
      const sourceHasConflict = hasAnyOverlapExcept(
        sourceItems,
        targetRoster,
        new Set([source.pairingId]),
      )
      if (baseReasons.length === 0 && !targetHasConflict && !sourceHasConflict) {
        rosterOptions.push(makeOption({
          allItems: input.items, allGroups: activeGroups, source, target: targetRoster, targetCrew, sourceCrew, mode: 'swap', standbyTaskId: null,
          standbyWindow: null, timeDistanceMinutes: Math.round(Math.abs(targetRoster.start - source.start) / 60000),
          sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings, positioning: null, destinationSplit: null,
        }))
      }
    }
  }

  const standbyOptions: RecoveryOption[] = []
  const sourceStart = source.start
  const standbyByCrew = new Map<string, RosterItem>()
  for (const item of input.items) {
    if (item.assignmentGroup?.toUpperCase() !== 'SBY' || item.crewId === source.crewId) continue
    const start = finiteTime(item.schStrDtUtc)
    const end = finiteTime(item.schEndDtUtc)
    if (start <= sourceStart && sourceStart <= end) {
      const previous = standbyByCrew.get(item.crewId)
      if (!previous || finiteTime(previous.schStrDtUtc) > start) standbyByCrew.set(item.crewId, item)
    }
  }
  for (const [targetCrewId, standbyTask] of standbyByCrew) {
    const targetCrew = crewsById.get(targetCrewId)
    if (!targetCrew) continue
    const sameRank = !!sourceCrew.rank && sourceCrew.rank.toUpperCase() === targetCrew.rank.toUpperCase()
    const sameBase = !!sourceCrew.base && sourceCrew.base.toUpperCase() === targetCrew.base.toUpperCase()
    const crossDivision = !!sourceCrew.division && !!targetCrew.division && sourceCrew.division !== targetCrew.division
    const crossRole = !!sourceCrew.rank && !!targetCrew.rank && sourceCrew.rank !== targetCrew.rank
    const targetOrder = input.rankOrder.get(targetCrew.rank.toUpperCase())
    const reasons: string[] = []
    if (requiredOrder != null && (targetOrder == null || targetOrder > requiredOrder)) reasons.push('Standby Crew Rank is lower than the required Rank or has no rank mapping.')
    const missingFleet = requiredFleets.find((fleet) => !qualifiesForFleet(targetCrew, fleet))
    const warnings: string[] = []
    if (missingFleet) warnings.push(fleetMismatchWarning('Standby Crew', targetCrew.crewId, missingFleet))
    // The one explicit overlap exception is the SBY task selected for this callout.
    // A second SBY task, ground task, or any Roster that overlaps remains disqualifying.
    const otherTasks = itemsOf(targetCrewId).filter((item) => item.id !== standbyTask.id)
    if (otherTasks.some((item) => itemOverlapsGroup(item, source))) reasons.push('Standby Crew has another loaded task overlapping the recovery Roster.')
    if (reasons.length === 0) {
      standbyOptions.push(makeOption({
        allItems: input.items, allGroups: activeGroups, source, target: null, targetCrew, sourceCrew, mode: 'standby', standbyTaskId: standbyTask.id,
        standbyWindow: `${standbyTask.schStrDtUtc ?? ''} - ${standbyTask.schEndDtUtc ?? ''}`,
        timeDistanceMinutes: null, sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings, positioning: null, destinationSplit: null,
      }))
    }
  }

  // ── Swap duty (Assignment Overlap / Rule 1001) ──────────────────────────────
  // Swap the affected flying Pairing with another Crew's Pairing that reports
  // LATER than the overlapping ground task. Hard filters (1-4) remove a
  // candidate entirely; a failed two-way base/fleet/rank-seat match (5-7) keeps
  // the candidate in the list but marks it unavailable.
  const swapDutyOptions: RecoveryOption[] = []
  // Latest end of the source Crew's ground tasks overlapping the affected
  // Pairing. Drives both the Swap-duty "reports later" filter and the Flight
  // Delay "+61 minutes" delay start.
  const groundOverlapEnd = trigger === 'assignment-overlap'
    ? input.items
      .filter((item) => String(item.crewId) === source.crewId
        && isGroundTask(item)
        && finiteTime(item.schStrDtUtc) < source.end
        && finiteTime(item.schEndDtUtc) > source.start)
      .reduce((latest, item) => Math.max(latest, finiteTime(item.schEndDtUtc)), Number.NEGATIVE_INFINITY)
    : Number.NEGATIVE_INFINITY
  if (trigger === 'assignment-overlap') {
    const businessDate = (
      input.alert.flightDate && input.alert.flightDate !== '—'
        ? input.alert.flightDate
        : source.items[0]?.fltDt ?? source.items[0]?.schStrDtUtc?.slice(0, 10) ?? ''
    ).slice(0, 10)
    const sourceDivision = (source.items.find((item) => item.division)?.division ?? '').trim().toUpperCase()
    const sourceBaseCode = (source.items.find((item) => item.base)?.base ?? sourceCrew.base ?? '').trim().toUpperCase()
    const sourceFleetCode = (source.items.find((item) => item.fleetCode)?.fleetCode ?? input.alert.fleet ?? '').trim().toUpperCase()
    const sourceRankSeat = (source.items[0]?.rosterActingRank ?? source.items[0]?.flightActingRank ?? '').trim().toUpperCase()

    for (const candidate of targetGroups) {
      const candidateCrew = crewsById.get(candidate.crewId)
      // 1. candidate Crew exists in the snapshot and is not the source Crew.
      if (!candidateCrew) continue
      // 3. candidate Pairing starts on the current Recovery business date.
      const candidateStartDate = (candidate.items[0]?.fltDt ?? candidate.items[0]?.schStrDtUtc?.slice(0, 10) ?? '').slice(0, 10)
      if (!businessDate || candidateStartDate !== businessDate) continue
      // 4. candidate Pairing reports (window start) later than the ground task end.
      if (Number.isFinite(groundOverlapEnd) && candidate.start <= groundOverlapEnd) continue

      const reasons: string[] = []
      // 5-7. two-way base / fleet / rank-seat match. Base and rank-seat stay hard
      // filters; the aircraft type is a SOFT constraint (see `warnings` below).
      const candidateDivision = (candidate.items.find((item) => item.division)?.division ?? candidateCrew.division ?? '').trim().toUpperCase()
      const candidateBaseCode = (candidate.items.find((item) => item.base)?.base ?? candidateCrew.base ?? '').trim().toUpperCase()
      const candidateFleetCode = (candidate.items.find((item) => item.fleetCode)?.fleetCode ?? '').trim().toUpperCase()
      const candidateRankSeat = (candidate.items[0]?.rosterActingRank ?? candidate.items[0]?.flightActingRank ?? '').trim().toUpperCase()
      const candidateOrder = input.rankOrder.get(candidateCrew.rank.toUpperCase())
      const candidateRankSeatOk = candidateRankSeat !== '' && candidateOrder != null
        && (input.rankOrder.get(candidateRankSeat) == null || candidateOrder <= input.rankOrder.get(candidateRankSeat)!)
      const sourceRankSeatOk = sourceRankSeat !== '' && requiredOrder != null
        && (input.rankOrder.get(sourceRankSeat) == null || requiredOrder <= input.rankOrder.get(sourceRankSeat)!)
      const returnPairingMatches = sourceDivision !== '' && sourceDivision === candidateDivision
        && sourceBaseCode !== '' && sourceBaseCode === candidateBaseCode
        && candidateRankSeatOk && sourceRankSeatOk
      if (!returnPairingMatches) {
        reasons.push("The return pairing does not match both crews' base and rank seat.")
      } else {
        // 8. re-check both directions for other task conflicts after the swap.
        const candidateHasConflict = hasAnyOverlapExcept(itemsOf(candidate.crewId), source, new Set([candidate.pairingId]))
        const sourceHasConflict = hasAnyOverlapExcept(sourceItems, candidate, new Set([source.pairingId]))
        if (candidateHasConflict || sourceHasConflict) {
          reasons.push('The swap would overlap another task for one of the two Crews.')
        }
      }

      // Aircraft type mismatch never blocks the swap: the candidate Crew must be
      // qualified for the Pairing it receives and vice versa, so report both
      // directions when they do not match.
      const warnings: string[] = []
      if (sourceFleetCode !== '' && !qualifiesForFleet(candidateCrew, sourceFleetCode)) {
        warnings.push(fleetMismatchWarning('Crew', candidateCrew.crewId, sourceFleetCode, `receives Pairing ${source.pairingId}`))
      }
      if (candidateFleetCode !== '' && !qualifiesForFleet(sourceCrew, candidateFleetCode)) {
        warnings.push(fleetMismatchWarning('Crew', sourceCrew.crewId, candidateFleetCode, `receives Pairing ${candidate.pairingId}`))
      }

      swapDutyOptions.push(makeOption({
        allItems: input.items,
        allGroups: activeGroups,
        source,
        target: candidate,
        targetCrew: candidateCrew,
        sourceCrew,
        mode: 'swap-duty',
        standbyTaskId: null,
        standbyWindow: null,
        timeDistanceMinutes: Math.round(Math.abs(candidate.start - source.start) / 60000),
        sameRank: sourceRankSeat !== '' && sourceRankSeat === candidateRankSeat,
        sameBase: sourceBaseCode !== '' && sourceBaseCode === candidateBaseCode,
        crossDivision: sourceDivision !== '' && sourceDivision !== candidateDivision,
        crossRole: sourceRankSeat !== '' && sourceRankSeat !== candidateRankSeat,
        reasons,
        warnings,
        positioning: null,
        destinationSplit: null,
      }))
    }
  }

  // ── Flight Delay (Assignment Overlap / Rule 1001) ───────────────────────────
  // Keeps the original Crew and lists every flight of the affected Pairing;
  // Apply pushes their ATD/ATA past the overlapping ground task.
  let flightDelayOptions: RecoveryOption[] = []
  if (trigger === 'assignment-overlap') {
    const delayPlan = planFlightDelay({
      segments: flightDelaySegmentsFor(source, input.pairingSegments),
      groundTaskEndUtc: Number.isFinite(groundOverlapEnd) ? new Date(groundOverlapEnd).toISOString() : null,
    })
    const reasons: string[] = []
    if (!Number.isFinite(groundOverlapEnd)) reasons.push('No overlapping ground task remains for this Pairing; no delay is required.')
    else if (!delayPlan) reasons.push('The affected Pairing has no loaded flight segment that can be delayed.')
    else if (!delayPlan.changesAnything) reasons.push('Every flight already departs after the overlapping ground task; no delay is required.')
    flightDelayOptions = [makeOption({
      allItems: input.items,
      allGroups: activeGroups,
      source,
      target: null,
      targetCrew: sourceCrew,
      sourceCrew,
      mode: 'flight-delay',
      standbyTaskId: null,
      standbyWindow: null,
      timeDistanceMinutes: null,
      sameRank: true,
      sameBase: true,
      crossDivision: false,
      crossRole: false,
      reasons,
      positioning: null,
      destinationSplit: null,
      flightDelay: delayPlan,
    })]
  }

  const crossBaseOptions: RecoveryOption[] = []
  const crossBaseConfig = input.crossBaseConfig ?? DEFAULT_CROSS_BASE_RECOVERY_CONFIG
  const loadedFlights = input.flights ?? snapshotFlightsFromItems(input.items)
  const recoveryBase = (source.items.find((item) => item.base)?.base || sourceCrew.base || '').trim()
  const crossBaseTrace: CrossBaseCandidateTrace[] = []
  const sourceStartUtc = source.start ? new Date(source.start).toISOString() : null
  const sourceEndUtc = source.end ? new Date(source.end).toISOString() : null

  // Destination-base recovery uses DHD legs already present at the edges of the
  // affected Pairing. The receiving Crew only receives the middle operating legs,
  // so qualification and occupancy are checked against that reduced Roster window.
  const sourceActingRank = source.items[0]?.rosterActingRank || source.items[0]?.flightActingRank || ''
  const sourceRankPlan = input.pairingCompositions
    ?.find((composition) => composition.pairingId === source.pairingId
      && composition.actingRank.trim().toUpperCase() === sourceActingRank.trim().toUpperCase())?.plan ?? null
  for (const targetCrew of targetCrews) {
    if (trigger !== 'roster-qualification') break
    const optionId = `cross-base-destination-${source.pairingId}-${targetCrew.crewId}`
    const destinationSplit = splitSourceForDestination(source, targetCrew, optionId, sourceRankPlan)
    if (!destinationSplit) continue
    const destinationItems = [...source.items]
      .sort((a, b) => (a.dutySeq ?? 0) - (b.dutySeq ?? 0) || (a.segSeq ?? 0) - (b.segSeq ?? 0))
      .slice(1, -1)
      .filter((item) => !isDhdItem(item))
    const destinationGroup: RosterGroup = {
      key: groupKey(targetCrew.crewId, destinationSplit.createdPairingId),
      crewId: targetCrew.crewId,
      pairingId: destinationSplit.createdPairingId,
      items: destinationItems,
      start: Math.min(...destinationItems.map((item) => finiteTime(item.schStrDtUtc))),
      end: Math.max(...destinationItems.map((item) => finiteTime(item.schEndDtUtc))),
    }
    const targetItems = itemsOf(targetCrew.crewId)
    const targetOrder = input.rankOrder.get(targetCrew.rank.toUpperCase())
    const sameRank = !!sourceCrew.rank && sourceCrew.rank.toUpperCase() === targetCrew.rank.toUpperCase()
    const crossDivision = !!sourceCrew.division && !!targetCrew.division && sourceCrew.division !== targetCrew.division
    const crossRole = !!sourceCrew.rank && !!targetCrew.rank && sourceCrew.rank !== targetCrew.rank
    const reasons: string[] = []
    if (requiredOrder != null && (targetOrder == null || targetOrder > requiredOrder)) reasons.push('Destination Crew Rank is lower than the required Rank or has no rank mapping.')
    const destinationFleets = [...new Set(destinationItems.map((item) => item.fleetCode?.trim().toUpperCase()).filter((fleet): fleet is string => Boolean(fleet)))]
    const missingFleet = destinationFleets.find((fleet) => !qualifiesForFleet(targetCrew, fleet))
    const warnings: string[] = []
    if (missingFleet) warnings.push(fleetMismatchWarning('Destination Crew', targetCrew.crewId, missingFleet))
    if (hasAnyOverlapExcept(targetItems, destinationGroup, new Set())) reasons.push('Destination Crew has an existing task overlapping the split Roster.')
    if (reasons.length > 0) continue
    crossBaseOptions.push(makeOption({
      allItems: input.items,
      allGroups: activeGroups,
      source,
      target: null,
      targetCrew,
      sourceCrew,
      mode: 'cross-base-destination',
      standbyTaskId: null,
      standbyWindow: null,
      timeDistanceMinutes: null,
      sameRank,
      sameBase: false,
      crossDivision,
      crossRole,
      reasons,
      warnings,
      positioning: null,
      destinationSplit,
    }))
  }

  if (recoveryBase) {
    for (const targetCrew of targetCrews) {
      if (trigger !== 'roster-qualification') break
      const supportBase = (targetCrew.base || '').trim()
      const trace: CrossBaseCandidateTrace = {
        crewId: targetCrew.crewId,
        crewName: targetCrew.crewName,
        supportBase,
        hardRejection: null,
        candidateFlightCount: 0,
        earliestOutboundDep: null,
        latestOutboundArv: null,
        outboundWindow: null,
        outboundFilterResult: 'no-candidate',
        outbound: null,
        inboundFilterResult: 'no-candidate',
        inbound: null,
        positioningResult: 'no-outbound',
        freeForPositioning: null,
        loadedItemCount: itemsOf(targetCrew.crewId).length,
        surfaced: false,
        surfacedModes: [],
      }
      if (!supportBase) { trace.hardRejection = 'empty-base'; crossBaseTrace.push(trace); continue }
      if (supportBase.toUpperCase() === recoveryBase.toUpperCase()) { trace.hardRejection = 'same-base-as-source'; crossBaseTrace.push(trace); continue }
      const baseReasons: string[] = []
      const targetOrder = input.rankOrder.get(targetCrew.rank.toUpperCase())
      if (requiredOrder != null && (targetOrder == null || targetOrder > requiredOrder)) {
        baseReasons.push('Support Crew Rank is lower than the required Rank or has no rank mapping.')
      }
      const missingFleet = requiredFleets.find((fleet) => !qualifiesForFleet(targetCrew, fleet))
      // Fleet stays soft for the support Crew too: rank is the hard gate below.
      const warnings: string[] = []
      if (missingFleet) warnings.push(fleetMismatchWarning('Support Crew', targetCrew.crewId, missingFleet))
      if (baseReasons.length > 0) {
        trace.hardRejection = baseReasons.join(' | ')
        crossBaseTrace.push(trace)
        continue
      }

      const outcome = positioningForWithTrace(loadedFlights, source, supportBase, recoveryBase, now, crossBaseConfig)
      const { positioning } = outcome
      const { trace: pt } = outcome
      trace.candidateFlightCount = pt.routeCandidates.length
      trace.earliestOutboundDep = pt.earliestOutboundDep
      trace.latestOutboundArv = pt.latestOutboundArv
      trace.outboundWindow = pt.outboundWindow
      trace.outboundFilterResult = pt.outboundResult
      trace.outbound = pt.outbound
      trace.inboundFilterResult = pt.inboundResult
      trace.inbound = pt.inbound
      trace.positioningResult = positioning ? 'ok' : (!pt.outbound ? 'no-outbound' : 'no-inbound')
      if (!positioning) { crossBaseTrace.push(trace); continue }
      const sameRank = !!sourceCrew.rank && sourceCrew.rank.toUpperCase() === targetCrew.rank.toUpperCase()
      const sameBase = false
      const crossDivision = !!sourceCrew.division && !!targetCrew.division && sourceCrew.division !== targetCrew.division
      const crossRole = !!sourceCrew.rank && !!targetCrew.rank && sourceCrew.rank !== targetCrew.rank
      const targetItems = itemsOf(targetCrew.crewId)
      const standbyTasks = targetItems.filter((item) => item.pairingId == null && item.assignmentGroup?.toUpperCase() === 'SBY'
        && finiteTime(item.schStrDtUtc) <= source.start && source.start <= finiteTime(item.schEndDtUtc))
      const targetGroupsForCrew = activeGroups.filter((group) => group.crewId === targetCrew.crewId)

      // Cross-base Callout SBY: SBY remains assigned and may overlap the DHD/Roster window.
      const freeCallout = crewFreeForPositioning(input.items, targetCrew.crewId, positioning, null)
      if (standbyTasks.length > 0 && freeCallout) {
        crossBaseOptions.push(makeOption({
          allItems: input.items, allGroups: activeGroups, source, target: null, targetCrew, sourceCrew,
          mode: 'cross-base-standby', standbyTaskId: standbyTasks[0].id,
           standbyWindow: `${standbyTasks[0].schStrDtUtc ?? ''} - ${standbyTasks[0].schEndDtUtc ?? ''}`,
           timeDistanceMinutes: null, sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings, positioning, destinationSplit: null,
        }))
        trace.surfacedModes.push('cross-base-standby')
      }

      // Cross-base Swap: each loaded complete Roster is a separate option. Its
      // Roster is removed from the support Crew before occupancy is checked.
      for (const targetRoster of targetGroupsForCrew) {
        const freeForSwap = crewFreeForPositioning(input.items, targetCrew.crewId, positioning, targetRoster.pairingId)
        if (!freeForSwap) continue
        const targetHasConflict = hasAnyOverlapExcept(targetItems, source, new Set([targetRoster.pairingId]))
        const sourceHasConflict = hasAnyOverlapExcept(sourceItems, targetRoster, new Set([source.pairingId]))
        if (targetHasConflict || sourceHasConflict) continue
        crossBaseOptions.push(makeOption({
          allItems: input.items, allGroups: activeGroups, source, target: targetRoster, targetCrew, sourceCrew,
           mode: 'cross-base-swap', standbyTaskId: null, standbyWindow: null,
           timeDistanceMinutes: Math.round(Math.abs(targetRoster.start - source.start) / 60000),
           sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings, positioning, destinationSplit: null,
        }))
        trace.surfacedModes.push('cross-base-swap')
      }

      // Cross-base Direct: candidate has no active FLY roster and no SBY task,
      // but is free in the positioning window. Send DHD in, execute the source
      // Pairing's operating legs, DHD back. This is the only path that surfaces
      // a cross-base option for crews whose future is currently empty (e.g.
      // 1568/247 on 9.10-9.16 — no FLY pairings after 6.22, only GRD days).
      if (trace.surfacedModes.length === 0) {
        // Fleet check for the direct mode: a mismatch is reported as a warning
        // (soft constraint) instead of rejecting the candidate.
        const sourceFleets = [...new Set(source.items
          .map((item) => item.fleetCode?.trim().toUpperCase())
          .filter((fleet): fleet is string => Boolean(fleet)))]
        const missingSourceFleet = sourceFleets.find((fleet) => !qualifiesForFleet(targetCrew, fleet))
        const directWarnings = missingSourceFleet
          ? [...warnings, fleetMismatchWarning('Crew', targetCrew.crewId, missingSourceFleet)]
          : warnings
        // Conflict re-check (same window, no exclusion since the candidate has
        // no active roster to swap out anyway).
        const directFree = crewFreeForPositioning(input.items, targetCrew.crewId, positioning, null)
        if (directFree) {
          crossBaseOptions.push(makeOption({
            allItems: input.items, allGroups: activeGroups, source, target: null, targetCrew, sourceCrew,
            mode: 'cross-base-direct', standbyTaskId: null, standbyWindow: null,
            timeDistanceMinutes: null, sameRank, sameBase, crossDivision, crossRole, reasons: [], warnings: directWarnings, positioning, destinationSplit: null,
          }))
          trace.surfacedModes.push('cross-base-direct')
        } else {
          trace.hardRejection = trace.hardRejection
            ? trace.hardRejection + ' | Direct: positioning window conflicts with existing Roster'
            : 'Direct: positioning window conflicts with existing Roster'
        }
      }
      // Record actual positioning-window freedom (not just "any mode surfaced").
      // The "no mode available" case (no SBY, no active roster) is now distinct
      // from "conflicts in the positioning window" — surfacedModes only counts
      // when a real option was emitted.
      const positioningFree = positioning
        ? crewFreeForPositioning(input.items, targetCrew.crewId, positioning, null)
        : null
      trace.freeForPositioning = positioningFree
      trace.surfaced = trace.surfacedModes.length > 0
      crossBaseTrace.push(trace)
    }
  }

  const crossBaseContext = {
    sourceCrewId: source.crewId,
    sourcePairingId: source.pairingId,
    recoveryBase: recoveryBase || null,
    requiredFleets: [...requiredFleets],
    sourceStartUtc,
    sourceEndUtc,
    loadedFlightCount: loadedFlights.length,
    loadedFlightWindow: loadedFlights.length > 0
      ? {
          startDate: new Date(Math.min(...loadedFlights.map((f) => finiteTime(f.schDepDtUtc)))).toISOString(),
          endDate: new Date(Math.max(...loadedFlights.map((f) => finiteTime(f.schDepDtUtc)))).toISOString(),
        }
      : null,
  }

  return {
    alert: input.alert,
    alerts: [input.alert],
    trigger,
    roster: {
      id: 'roster',
      title: 'Roster transfer or exchange',
      description: 'Complete Roster transfer is preferred; exchange candidates are ordered by rank, base, next-task impact, annual flight time and start-time proximity.',
      options: sortedCrewCandidates(rosterOptions, crewsById, sourceCrew),
      excludedOptions: [],
    },
    standby: {
      id: 'standby',
      title: 'Standby Crew callout',
      description: 'The original SBY ground task is retained. A matching SBY task is marked Callout Standby in the preview.',
      options: sortedCrewCandidates(standbyOptions, crewsById, sourceCrew),
      excludedOptions: [],
    },
    crossBase: {
      id: 'cross-base',
      title: 'Cross-base positioning',
      description: 'Use a qualified Crew from another base and add outbound and return DHD half-ring Pairings around the recovered Roster.',
      options: sortedCrewCandidates(crossBaseOptions, crewsById, sourceCrew),
      excludedOptions: [],
    },
    swapDuty: {
      id: 'swap-duty',
      title: 'Swap duty',
      description: 'Exchange the affected Pairing with another Crew Pairing that reports after the overlapping ground task.',
      options: sortedCrewCandidates(swapDutyOptions, crewsById, sourceCrew),
      excludedOptions: [],
    },
    flightDelay: {
      id: 'flight-delay',
      title: 'Flight Delay',
      description: 'Keep the original Crew and handle the disruption by delaying the affected Pairing flights.',
      options: flightDelayOptions,
      excludedOptions: [],
    },
    // Single-alert plans never surface mixed recovery (one alert trivially
    // picks itself) — leave it empty so the UI hides the leaf in the tree.
    mixed: emptyMixedGroup(),
    crossBaseTrace,
    crossBaseContext,
  }
}

const recoveryOptionRosterKeys = (option: RecoveryOption): string[] => [
  `${option.sourceCrewId}:${option.sourcePairingId}`,
  ...(isSwapLike(option.mode) && option.targetPairingId != null
    ? [`${option.targetCrewId}:${option.targetPairingId}`]
    : []),
]

const recoveryChangedItems = (option: RecoveryOption): RosterItem[] => option.afterItems.filter((item) =>
  item.isRecoveryAffected === true || (item.id === option.standbyTaskId && item.isCalloutStandby === true),
)

/** Merge independent single-alert snapshots without letting one child erase another. */
const mergeRecoveryAfterItems = (baseline: RosterItem[], options: RecoveryOption[]): RosterItem[] => {
  const merged = new Map(baseline.map((item) => [item.id, item]))
  for (const option of options) {
    const beforeIds = option.beforeItems
      .filter((item) => item.isRecoveryAffected === true || item.id === option.standbyTaskId)
      .map((item) => item.id)
    for (const id of beforeIds) merged.delete(id)
    for (const item of recoveryChangedItems(option)) merged.set(item.id, item)
  }
  return [...merged.values()]
}

const mergeRecoveryBeforeItems = (baseline: RosterItem[], options: RecoveryOption[]): RosterItem[] => {
  const affectedIds = new Set(options.flatMap((option) => option.beforeItems
    .filter((item) => item.isRecoveryAffected === true || item.id === option.standbyTaskId)
    .map((item) => item.id)))
  return baseline.map((item) => affectedIds.has(item.id) ? { ...item, isRecoveryAffected: true } : item)
}

const recoveryRosterOverlap = (items: RosterItem[]): boolean => {
  const groups = new Map<string, Array<{ pairingId: number; start: number; end: number }>>()
  for (const item of items) {
    if (item.pairingId == null || item.assignmentGroup?.toUpperCase() === 'SBY') continue
    const start = finiteTime(item.schStrDtUtc)
    const end = finiteTime(item.schEndDtUtc)
    if (end <= start) continue
    const key = `${item.crewId}:${item.pairingId}`
    const current = groups.get(key)
    if (current) {
      current[0].start = Math.min(current[0].start, start)
      current[0].end = Math.max(current[0].end, end)
    } else {
      groups.set(key, [{ pairingId: Number(item.pairingId), start, end }])
    }
  }
  const byCrew = new Map<string, Array<{ pairingId: number; start: number; end: number }>>()
  for (const [key, values] of groups) {
    const crewId = key.slice(0, key.lastIndexOf(':'))
    const value = values[0]
    const current = byCrew.get(crewId)
    if (current) current.push(value)
    else byCrew.set(crewId, [value])
  }
  for (const values of byCrew.values()) {
    values.sort((a, b) => a.start - b.start || a.pairingId - b.pairingId)
    for (let index = 1; index < values.length; index += 1) {
      if (values[index - 1].end > values[index].start) return true
    }
  }
  return false
}

const receivedItemsForOption = (option: RecoveryOption): RosterItem[] => {
  const assignments = [
    { crewId: option.targetCrewId, pairingId: option.destinationSplit?.createdPairingId ?? option.sourcePairingId },
    ...((option.mode === 'swap' || option.mode === 'cross-base-swap') && option.targetPairingId != null
      ? [{ crewId: option.sourceCrewId, pairingId: option.targetPairingId }]
      : []),
  ]
  return option.afterItems.filter((item) => assignments.some((assignment) =>
    item.crewId === assignment.crewId && Number(item.pairingId) === assignment.pairingId))
}

const combinationConflicts = (options: RecoveryOption[]): string[] => {
  const reasons: string[] = []
  const rosterOwners = new Set<string>()
  for (const option of options) {
    for (const key of recoveryOptionRosterKeys(option)) {
      if (rosterOwners.has(key)) reasons.push(`Roster ${key.split(':')[1]} is selected by more than one recovery decision.`)
      rosterOwners.add(key)
    }
  }
  if (recoveryRosterOverlap(options.flatMap(receivedItemsForOption))) reasons.push('The combined option assigns overlapping Rosters to the same Crew.')
  return [...new Set(reasons)]
}

const combineRecoveryMetrics = (options: RecoveryOption[], loadedRosterCount: number): RecoveryMetrics => {
  const affectedCrewCount = new Set(options.flatMap((option) => [option.sourceCrewId, option.targetCrewId])).size
  const cancelledRosterCount = options.reduce((sum, option) => sum + option.metrics.cancelledRosterCount, 0)
  const addedRosterCount = options.reduce((sum, option) => sum + option.metrics.addedRosterCount, 0)
  const changedRosterCount = options.reduce((sum, option) => sum + option.metrics.changedRosterCount, 0)
  const followOnImpactCount = options.reduce((sum, option) => sum + option.metrics.followOnImpactCount, 0)
  const directCost = options.reduce((sum, option) => sum + option.metrics.directCost, 0)
  const dhdFlightCost = options.reduce((sum, option) => sum + option.metrics.dhdFlightCost, 0)
  const dhdCostSavings = options.reduce((sum, option) => sum + (option.metrics.dhdCostSavings ?? 0), 0)
  const penalty = 0.30 * cancelledRosterCount + 0.20 * addedRosterCount + 0.15 * changedRosterCount + 0.35 * followOnImpactCount
  const rosterStability = Math.round(Math.max(0, Math.min(100, 100 - (100 * penalty) / Math.max(1, loadedRosterCount))) * 100) / 100
  return {
    affectedCrewCount,
    cancelledRosterCount,
    addedRosterCount,
    changedRosterCount,
    followOnImpactCount,
    rosterStability,
    directCost,
    dhdFlightCost,
    dhdCostSavings,
    // `totalCost` mirrors `directCost` (see `buildMetrics` note). The combined
    // option's own `costBreakdown` is assembled by `enrichPlansWithLibraryCosts`
    // from the child breakdowns so it still sums back to this `directCost`.
    totalCost: directCost,
    currency: 'CNY',
  }
}

const combineRecoveryOptions = (
  groups: RecoveryPlanGroup[],
  baselineItems: RosterItem[],
): RecoveryOption[] => {
  // Filter out alerts whose plan has no options for this mode (e.g. one
  // alert has standby candidates but another doesn't). The combined plan
  // then covers only the alerts that actually have options; the rest are
  // surfaced separately via `buildRecoveryPlans` so the UI can warn the
  // user that those alerts need a different recovery method.
  const viableGroups = groups.filter((group) => group.options.length > 0)
  const coveredAlertIndices = new Set<number>()
  groups.forEach((group, index) => {
    if (group.options.length > 0) coveredAlertIndices.add(index)
  })
  if (viableGroups.length === 0) return []
  const combinations: RecoveryOption[][] = [[]]
  // Keep the Cartesian expansion bounded; every option is still built from
  // complete child choices and the UI reports no partial combination as valid.
  for (const group of viableGroups) {
    const next: RecoveryOption[][] = []
    for (const partial of combinations) {
      for (const option of group.options) {
        const candidate = [...partial, option]
        if (combinationConflicts(candidate).length === 0) next.push(candidate)
        if (next.length >= 500) break
      }
      if (next.length >= 500) break
    }
    combinations.splice(0, combinations.length, ...next)
  }
  const loadedRosterCount = new Set(baselineItems
    .filter((item) => item.pairingId != null && item.assignmentGroup?.toUpperCase() !== 'SBY')
    .map((item) => `${item.crewId}:${item.pairingId}`)).size
  return combinations.map((children) => {
    const first = children[0]
    const afterItems = mergeRecoveryAfterItems(baselineItems, children)
    const reasons = combinationConflicts(children)
    const executable = children.every((option) => option.localExecutable && option.ruleCheck !== 'failed') && reasons.length === 0
    return {
      ...first,
      id: `combined-${viableGroups[0].id}-${children.map((option) => option.id).join('__')}`,
      title: `Combined recovery · ${children.map((option) => `${option.sourceCrewId} → ${option.targetCrewId}`).join(' · ')}`,
      localExecutable: executable,
      reasons,
      beforeItems: mergeRecoveryBeforeItems(baselineItems, children),
      afterItems,
      changes: children.flatMap((option) => option.changes),
      metrics: combineRecoveryMetrics(children, loadedRosterCount),
      ruleCheck: executable ? 'pending' : 'not-run',
      ruleMessages: reasons,
      positioning: null,
      destinationSplit: null,
      subOptions: children,
    }
  })
}

/**
 * Build one recovery plan for one or more loaded alerts. Single-alert calls
 * retain the existing candidate shape; multi-alert calls add a combination
 * layer whose options are complete child decisions.
 */
export const buildRecoveryPlans = (input: BuildRecoveryPlansInput & {
  alert?: RecoveryAlertSnapshot
  alerts?: RecoveryAlertSnapshot[]
}): RecoveryPlans => {
  const alerts = [...new Map((input.alerts?.length ? input.alerts : input.alert ? [input.alert] : [])
    .map((alert) => [`${alert.crewId}:${alert.pairingId}:${alert.ruleCode}:${alert.id}`, alert] as const)).values()]
  if (alerts.length === 0) throw new Error('At least one recovery alert is required.')
  if (alerts.length === 1) {
    const single = buildSingleRecoveryPlans({ ...input, alert: alerts[0] })
    return { ...single, mixed: emptyMixedGroup() }
  }

  const childPlans = alerts.map((alert) => buildSingleRecoveryPlans({ ...input, alert }))
  const makeGroup = (id: RecoveryPlanGroup['id'], key: 'roster' | 'standby' | 'crossBase', title: string, description: string): RecoveryPlanGroup => {
    const perAlertGroups = childPlans.map((plan) => plan[key])
    const missingAlerts = alerts
      .map((alert, index) => ({ alert, index, plan: childPlans[index] }))
      .filter(({ plan }) => plan[key].options.length === 0)
      .map(({ alert }) => `${alert.crewId}@${alert.pairingId ?? 'n/a'}`)
    const baseDescription = `${description} Combined across ${alerts.length} selected alerts.`
    const fullDescription = missingAlerts.length === 0
      ? baseDescription
      : `${baseDescription} ${missingAlerts.length} alert(s) have no ${key} option: ${missingAlerts.join(', ')} — those alerts need a different method (use Mixed recovery).`
    return {
      id,
      title,
      description: fullDescription,
      options: combineRecoveryOptions(perAlertGroups, input.items),
      excludedOptions: [],
    }
  }
  return {
    alert: alerts[0],
    alerts,
    // Combined (multi-alert) recovery keeps the original 8004 strategy set;
    // Swap duty / Flight Delay are single-alert options for now.
    trigger: 'roster-qualification',
    roster: makeGroup('roster', 'roster', 'Roster transfer or exchange', 'Each option contains one complete recovery decision per selected alert.'),
    standby: makeGroup('standby', 'standby', 'Standby Crew callout', 'Each option contains one complete recovery decision per selected alert.'),
    crossBase: makeGroup('cross-base', 'crossBase', 'Cross-base positioning', 'Each option contains one complete recovery decision per selected alert.'),
    swapDuty: emptyPlanGroup('swap-duty', 'Swap duty', 'Swap duty is available for a single Assignment Overlap alert.'),
    flightDelay: emptyPlanGroup('flight-delay', 'Flight Delay', 'Flight Delay is available for a single Assignment Overlap alert.'),
    // Mixed (best-per-alert) — each alert independently picks the cheapest
    // executable option across roster / standby / cross-base.
    mixed: buildMixedGroup(alerts, childPlans, input.items),
      // Multi-alert combined plans are not a single cross-base group; aggregate the per-alert
    // traces so the Recovery dialog can still log a cross-base trace for the combined flow.
    crossBaseTrace: childPlans.flatMap((plan) => plan.crossBaseTrace),
    crossBaseContext: {
      sourceCrewId: alerts[0].crewId,
      sourcePairingId: alerts[0].pairingId,
      recoveryBase: childPlans[0]?.crossBaseContext.recoveryBase ?? null,
      requiredFleets: [...new Set(childPlans.flatMap((plan) => plan.crossBaseContext.requiredFleets))],
      sourceStartUtc: childPlans[0]?.crossBaseContext.sourceStartUtc ?? null,
      sourceEndUtc: childPlans[0]?.crossBaseContext.sourceEndUtc ?? null,
      loadedFlightCount: childPlans.reduce((acc, plan) => acc + plan.crossBaseContext.loadedFlightCount, 0),
      loadedFlightWindow: childPlans[0]?.crossBaseContext.loadedFlightWindow ?? null,
    },
  }
}

/** Empty mixed group — populated only when alerts.length > 1. */
const emptyMixedGroup = (): RecoveryPlanGroup => ({
  id: 'mixed',
  title: 'Mixed recovery (best per alert)',
  description: 'Each selected alert independently picks its cheapest executable option.',
  options: [],
  excludedOptions: [],
})

const emptyPlanGroup = (id: RecoveryPlanGroup['id'], title: string, description: string): RecoveryPlanGroup => ({
  id,
  title,
  description,
  options: [],
  excludedOptions: [],
})

/**
 * Ordered, trigger-aware list of the plan groups the Recovery dialog shows.
 * Assignment Overlap (Rule 1001) shows standby → Swap duty → Flight Delay;
 * aircraft qualification (Rule 8004) keeps roster → standby → cross-base
 * (plus mixed for multi-alert runs).
 */
export const visiblePlanGroups = (plans: RecoveryPlans): RecoveryPlanGroup[] =>
  plans.trigger === 'assignment-overlap'
    ? [plans.standby, plans.swapDuty, plans.flightDelay]
    : plans.alerts.length > 1
      ? [plans.roster, plans.standby, plans.crossBase, plans.mixed]
      : [plans.roster, plans.standby, plans.crossBase]

/**
 * Re-compute `directCost` / `currency` for every option (and each sub-option
 * inside combined options) by delegating to the cost library via the supplied
 * batch fetcher. Combined options have their directCost re-summed from the
 * enriched child options so the totals stay consistent. Each group is then
 * re-sorted by the new directCost so the cheapest library-priced option
 * stays at the top.
 *
 * The fetcher signature intentionally matches `recoveryCostApi.postBatch` so
 * the dialog can pass it through directly. The default fetcher falls back to
 * `null` directCost (preserving the original hard-coded cost) on error so a
 * network blip never blanks the UI.
 */
export interface RecoveryLibraryCostInput {
  mode: RecoveryOptionMode
  crossBase: number
  crossDivision: number
  crossRole: number
  changed: number
  followOnImpactCount: number
  dhdOutboundSectors: number
  dhdFlightCost: number
  dhdCostSavings: number
}

export interface RecoveryLibraryCostResult {
  directCost: number | null
  currency: string
  /** Per-component breakdown (forwarded to `option.metrics.costBreakdown` by enrichPlansWithLibraryCosts). */
  breakdown: CostLibraryBreakdownRow[]
  /** Free-form notes from the cost library (forwarded to `option.metrics.costNotes`). */
  notes: string[]
}

export const optionToLibraryCostInput = (
  option: Pick<RecoveryOption, 'mode' | 'metrics' | 'positioning'>,
): RecoveryLibraryCostInput => {
  // `directCost` components mirror what `buildMetrics` already computes:
  //   crossBase (1 if mode starts with `cross-base`)
  //   crossDivision (1 if `metrics.crossDivision` is set; kept 0/1 for the
  //     library's `quantity` calculator)
  //   crossRole (1 if `mode === 'swap' || mode === 'cross-base-swap'`)
  //   changed (1 for transfer/standby, 2 for swap variants)
  //   followOnImpactCount (passed straight through)
  //   dhdOutboundSectors (1 if the option carries a `positioning` block —
  //     the library treats each sector the same; the DHD flight cost is
  //     subtracted in a final manual adjustment)
  const isSwap = option.mode === 'swap' || option.mode === 'cross-base-swap'
  const isCrossBase = option.mode.startsWith('cross-base')
  return {
    mode: option.mode,
    crossBase: isCrossBase ? 1 : 0,
    crossDivision: option.metrics.followOnImpactCount >= 0 && option.mode.includes('cross-division') ? 1 : 0,
    crossRole: isSwap ? 1 : 0,
    changed: isSwap ? 2 : 1,
    followOnImpactCount: option.metrics.followOnImpactCount,
    dhdOutboundSectors: option.positioning ? 1 : 0,
    dhdFlightCost: option.metrics.dhdFlightCost,
    dhdCostSavings: option.metrics.dhdCostSavings ?? 0,
  }
}

const recomputeMetricsForOption = (
  option: RecoveryOption,
  result: RecoveryLibraryCostResult,
): RecoveryOption => {
  const directCost = result.directCost ?? option.metrics.directCost
  const currency = result.directCost == null ? option.metrics.currency : result.currency
  return {
    ...option,
    metrics: {
      ...option.metrics,
      directCost,
      currency,
      // `totalCost` mirrors `directCost` — see `buildMetrics`.
      totalCost: directCost,
      costBreakdown: result.breakdown,
      costNotes: result.notes,
      costEnrichmentFailed: result.directCost == null,
    },
  }
}

const recomputeCombinedMetrics = (subOptions: RecoveryOption[], baselineItems: RosterItem[]): RecoveryMetrics => {
  if (subOptions.length === 0) {
    return {
      affectedCrewCount: 0,
      cancelledRosterCount: 0,
      addedRosterCount: 0,
      changedRosterCount: 0,
      followOnImpactCount: 0,
      rosterStability: 0,
      directCost: 0,
      dhdFlightCost: 0,
      dhdCostSavings: 0,
      totalCost: 0,
      currency: 'CNY',
    }
  }
  const cancelledRosterCount = subOptions.reduce((sum, o) => sum + o.metrics.cancelledRosterCount, 0)
  const addedRosterCount = subOptions.reduce((sum, o) => sum + o.metrics.addedRosterCount, 0)
  const changedRosterCount = subOptions.reduce((sum, o) => sum + o.metrics.changedRosterCount, 0)
  const followOnImpactCount = subOptions.reduce((sum, o) => sum + o.metrics.followOnImpactCount, 0)
  const directCost = subOptions.reduce((sum, o) => sum + o.metrics.directCost, 0)
  const dhdFlightCost = subOptions.reduce((sum, o) => sum + o.metrics.dhdFlightCost, 0)
  const dhdCostSavings = subOptions.reduce((sum, o) => sum + (o.metrics.dhdCostSavings ?? 0), 0)
  const loadedRosterCount = Math.max(1, baselineItems.length ? new Set(baselineItems.map((i) => `${i.crewId}:${i.pairingId}`)).size : subOptions.length)
  const penalty = 0.30 * cancelledRosterCount + 0.20 * addedRosterCount + 0.15 * changedRosterCount + 0.35 * followOnImpactCount
  const rosterStability = Math.round(Math.max(0, Math.min(100, 100 - (100 * penalty) / loadedRosterCount)) * 100) / 100
  return {
    affectedCrewCount: subOptions.length,
    cancelledRosterCount,
    addedRosterCount,
    changedRosterCount,
    followOnImpactCount,
    rosterStability,
    directCost,
    dhdFlightCost,
    dhdCostSavings,
    // `totalCost` mirrors `directCost` — see `buildMetrics`. The combined
    // option's breakdown is the concatenation of every child's breakdown.
    totalCost: directCost,
    currency: subOptions[0].metrics.currency,
  }
}

const resortGroupByDirectCost = (group: RecoveryPlanGroup): RecoveryPlanGroup => {
  const ranked = [...group.options].sort((a, b) => {
    const dc = a.metrics.directCost - b.metrics.directCost
    if (dc !== 0) return dc
    return a.id.localeCompare(b.id)
  })
  return { ...group, options: ranked, excludedOptions: group.excludedOptions }
}

export type RecoveryLibraryCostFetcher = (inputs: RecoveryLibraryCostInput[]) => Promise<RecoveryLibraryCostResult[]>

const emptyLibraryFetcher: RecoveryLibraryCostFetcher = async () => []

/**
 * Enrich a freshly built `RecoveryPlans` with cost-library-priced directCost
 * values. Replaces `metrics.directCost` and `metrics.currency` for every
 * option (including sub-options of combined options) and re-sorts each
 * group so the cheapest library-priced option is first.
 */
export const enrichPlansWithLibraryCosts = async (
  plans: RecoveryPlans,
  baselineItems: RosterItem[],
  fetcher: RecoveryLibraryCostFetcher = emptyLibraryFetcher,
): Promise<RecoveryPlans> => {
  const flatten = (option: RecoveryOption): RecoveryOption[] =>
    option.subOptions && option.subOptions.length > 0 ? option.subOptions.flatMap(flatten) : [option]

  const allOptions: RecoveryOption[] = [
    ...plans.roster.options.flatMap(flatten),
    ...plans.standby.options.flatMap(flatten),
    ...plans.crossBase.options.flatMap(flatten),
    ...plans.swapDuty.options.flatMap(flatten),
    ...plans.flightDelay.options.flatMap(flatten),
    ...plans.mixed.options.flatMap(flatten),
  ]
  if (allOptions.length === 0) return plans

  const inputs = allOptions.map(optionToLibraryCostInput)
  let results: RecoveryLibraryCostResult[]
  try {
    results = await fetcher(inputs)
  } catch {
    // Mark every leaf as failed so the UI can show the "unavailable" hint.
    const markFailed = (option: RecoveryOption): RecoveryOption => {
      if (option.subOptions && option.subOptions.length > 0) {
        return { ...option, subOptions: option.subOptions.map(markFailed) }
      }
      return {
        ...option,
        metrics: { ...option.metrics, costEnrichmentFailed: true },
      }
    }
    return {
      ...plans,
      roster: { ...plans.roster, options: plans.roster.options.map(markFailed) },
      standby: { ...plans.standby, options: plans.standby.options.map(markFailed) },
      crossBase: { ...plans.crossBase, options: plans.crossBase.options.map(markFailed) },
      swapDuty: { ...plans.swapDuty, options: plans.swapDuty.options.map(markFailed) },
      flightDelay: { ...plans.flightDelay, options: plans.flightDelay.options.map(markFailed) },
      mixed: { ...plans.mixed, options: plans.mixed.options.map(markFailed) },
    }
  }
  if (results.length !== allOptions.length) {
    return plans
  }

  let cursor = 0
  const enrichLeaf = (option: RecoveryOption): RecoveryOption => {
    if (option.subOptions && option.subOptions.length > 0) {
      const enrichedSubs = option.subOptions.map(enrichLeaf)
      const metrics = recomputeCombinedMetrics(enrichedSubs, baselineItems)
      return { ...option, subOptions: enrichedSubs, metrics }
    }
    const result = results[cursor++] ?? { directCost: null, currency: option.metrics.currency, breakdown: [], notes: [] }
    return recomputeMetricsForOption(option, result)
  }
  const enrichGroup = (group: RecoveryPlanGroup): RecoveryPlanGroup => ({
    ...resortGroupByDirectCost({
      ...group,
      options: group.options.map(enrichLeaf),
    }),
  })
  return {
    ...plans,
    roster: enrichGroup(plans.roster),
    standby: enrichGroup(plans.standby),
    crossBase: enrichGroup(plans.crossBase),
    swapDuty: enrichGroup(plans.swapDuty),
    flightDelay: enrichGroup(plans.flightDelay),
    mixed: enrichGroup(plans.mixed),
  }
}

/**
 * Mixed recovery — best-per-alert combination.
 *
 * For each selected alert, independently pick the lowest-total-cost
 * executable option across roster / standby / cross-base. Different alerts
 * are allowed to use different methods (e.g. alert A uses roster transfer,
 * alert B uses standby callout) — that's the whole point. Bundle the
 * per-alert choices into a single combined option via `subOptions` so the
 * UI can render it like other combined plans.
 *
 * Conflict filtering: if any picked option conflicts (overlapping Roster
 * assignment, same target Crew) with another, the mixed option is marked
 * non-executable and its ruleMessages list the conflicts. Diagnostics for
 * each alert's chosen method are preserved in `subOptions[*].metrics`.
 */
const buildMixedGroup = (
  alerts: RecoveryAlertSnapshot[],
  childPlans: RecoveryPlans[],
  baselineItems: RosterItem[],
): RecoveryPlanGroup => {
  const picks: RecoveryOption[] = []
  const missingAlertIndices: number[] = []
  alerts.forEach((alert, index) => {
    const plan = childPlans[index]
    if (!plan) { missingAlertIndices.push(index); return }
    const candidates = [
      ...plan.roster.options,
      ...plan.standby.options,
      ...plan.crossBase.options,
    ]
    const executable = candidates.filter(
      (option) => option.localExecutable && option.ruleCheck !== 'failed' && option.ruleCheck !== 'not-run',
    )
    if (executable.length === 0) {
      // Fall back to any non-failed option so the user still sees why no
      // fully-executable mixed plan exists for this alert.
      const fallback = candidates
        .filter((option) => option.ruleCheck !== 'failed')
        .sort((a, b) => pickCost(a) - pickCost(b))[0]
      if (fallback) picks.push({ ...fallback, id: `mixed-${index}-${fallback.id}` })
      else missingAlertIndices.push(index)
      return
    }
    const best = [...executable].sort((a, b) => pickCost(a) - pickCost(b))[0]
    picks.push({ ...best, id: `mixed-${index}-${best.id}` })
  })
  if (picks.length === 0) {
    return {
      ...emptyMixedGroup(),
      description: missingAlertIndices.length === alerts.length
        ? 'No alert has any executable option yet. Recheck Legality and retry.'
        : `Mixed recovery requires every alert to surface at least one option; ${missingAlertIndices.length} alert(s) have none.`,
    }
  }
  const loadedRosterCount = new Set(baselineItems
    .filter((item) => item.pairingId != null && item.assignmentGroup?.toUpperCase() !== 'SBY')
    .map((item) => `${item.crewId}:${item.pairingId}`)).size
  const reasons = combinationConflicts(picks)
  const executable = picks.every((option) => option.localExecutable && option.ruleCheck !== 'failed') && reasons.length === 0
  const mixed: RecoveryOption = {
    ...picks[0],
    id: `mixed-${picks.map((option) => option.id).join('__')}`,
    title: `Mixed recovery · ${picks.map((option) => `${option.sourceCrewId} → ${option.targetCrewId} (${describeMethod(option)})`).join(' · ')}`,
    localExecutable: executable,
    reasons,
    beforeItems: mergeRecoveryBeforeItems(baselineItems, picks),
    afterItems: mergeRecoveryAfterItems(baselineItems, picks),
    changes: picks.flatMap((option) => option.changes),
    metrics: combineRecoveryMetrics(picks, loadedRosterCount),
    ruleCheck: executable ? 'pending' : 'not-run',
    ruleMessages: reasons,
    positioning: null,
    destinationSplit: null,
    subOptions: picks,
  }
  return {
    id: 'mixed',
    title: 'Mixed recovery (best per alert)',
    description: executable
      ? `Each alert picks its cheapest executable option independently — ${picks.length}/${alerts.length} alerts covered${missingAlertIndices.length ? `, ${missingAlertIndices.length} skipped` : ''}.`
      : `Mixed plan not executable: ${reasons[0] ?? 'option conflicts'}${missingAlertIndices.length ? ` (${missingAlertIndices.length} alert(s) had no executable option)` : ''}.`,
    options: [mixed],
    excludedOptions: [],
  }
}

const pickCost = (option: RecoveryOption): number => {
  const cost = option.metrics?.totalCost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : Number.POSITIVE_INFINITY
}

const describeMethod = (option: RecoveryOption): string => {
  switch (option.mode) {
    case 'standby':
      return 'Standby callout'
    case 'cross-base-standby':
    case 'cross-base-swap':
    case 'cross-base-destination':
    case 'cross-base-direct':
      return 'Cross-base'
    case 'transfer':
    case 'swap':
    default:
      return 'Roster transfer'
  }
}
