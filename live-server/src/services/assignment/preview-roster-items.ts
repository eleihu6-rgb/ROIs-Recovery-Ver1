import type { PreviewRosterItem } from '../rule/legality-preview.js'

/**
 * Builds the `PreviewRosterItem[]` for one hypothetical "assign this pairing to
 * this crew" draft, from the pairing's persisted segments.
 *
 * Extracted from `auto-assign-service.expandAccepted` so the auto-assign planner
 * and the Best-fit crew planner ask the Rust rule engine about an assignment in
 * exactly ONE shape. A second, slightly different placeholder builder would let
 * the two features disagree about what "crew C takes pairing P" means.
 *
 * IDs are negative and process-local: negative Pairing/roster ids belong to this
 * preview only, which is what `previewDraftLegality` expects for focus pairing
 * narrowing.
 */

let syntheticId = -1
export const nextPreviewItemId = (): number => syntheticId--

export interface PreviewPairingSource {
  id: number
  base: string
  division: string
  assignment: string
  assignmentGroup: string | null
}

export interface PreviewSegmentRow {
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltDt: string | Date | null
  fltNum: string
  depArp: string
  arvArp: string
  segAssignment: string | null
  schStrDtUtc: string | Date
  schEndDtUtc: string | Date
  actStrDtUtc: string | Date | null
  actEndDtUtc: string | Date | null
  schCreditedMinutesSeg: string | number | null
}

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

export const buildPairingPreviewItems = (
  pairing: PreviewPairingSource,
  segments: PreviewSegmentRow[],
  crewId: string,
  actingRank: string,
): PreviewRosterItem[] =>
  segments.map((seg) => ({
    id: nextPreviewItemId(),
    crewId,
    pairingId: pairing.id,
    base: pairing.base,
    label: `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`,
    assignmentGroup: pairing.assignmentGroup ?? 'FLY',
    assignment: seg.segAssignment ?? pairing.assignment,
    division: pairing.division,
    flightActingRank: actingRank,
    rosterActingRank: actingRank,
    dutySeq: seg.dutySeq,
    segSeq: seg.segSeq,
    fltId: seg.fltId,
    fltDt: toIso(seg.fltDt),
    schStrDtUtc: toIso(seg.schStrDtUtc),
    schEndDtUtc: toIso(seg.schEndDtUtc),
    actStrDtUtc: toIso(seg.actStrDtUtc),
    actEndDtUtc: toIso(seg.actEndDtUtc),
    schCreditedMinutes: seg.schCreditedMinutesSeg ?? null,
    source: 'MA',
  }))

/**
 * Payable pairing credit in minutes: duty-level credited minutes counted once per
 * duty (mirrors `gantt/src/utils/pairing-credit.ts#pairingCreditedMinutes` and the
 * `codever` expression in `manday-tool`). This is the value the guarantee/standby
 * cost calculators expect as `addedCredit` — NOT block hours.
 */
export const pairingCreditMinutes = (segments: PreviewSegmentRow[]): number => {
  const byDuty = new Map<number, number>()
  for (const seg of segments) {
    const credit = Number(seg.schCreditedMinutesSeg ?? 0)
    if (!Number.isFinite(credit)) continue
    byDuty.set(seg.dutySeq, Math.max(byDuty.get(seg.dutySeq) ?? 0, credit))
  }
  let total = 0
  for (const value of byDuty.values()) total += value
  return Math.round(total)
}
