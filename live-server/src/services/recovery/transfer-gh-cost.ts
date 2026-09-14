import type { Pool } from 'pg'
import { CostLibraryService } from '../cost/cost-library-service.js'
import { swapPolicySql } from './swap-gh-cost.js'

/**
 * Incremental GH pay for a one-way Roster transfer.
 *
 * A transfer removes the duty from the source crew and adds it to the receiving
 * crew. The cost driver is each crew's saved calendar-month credit against the
 * guaranteed-hours policy:
 *   receiving crew: Pay(before + added) − Pay(before)   (0 while still under GH)
 *   source crew:    Pay(before − removed) − Pay(before) (usually a saving)
 *
 * Like the swap/standby estimators this is a **GH-only** projection from saved
 * data; it is not a payroll posting and excludes non-pay disruption costs.
 */
export interface TransferCostContext {
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
}

// Pairing + per-crew assignment context. `role` distinguishes the crew losing the
// duty (source) from the candidate receiving it (target).
export const transferContextSql = `
 WITH crew_ids(role, crew_id) AS (VALUES ('source', $1::text), ('target', $3::text))
 SELECT ci.role, ci.crew_id, p.id AS pairing_id, p.base, c.division,
        to_char(s.departure, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS departure_at,
        to_char(s.arrival, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS arrival_at,
        to_char((s.departure AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS credit_month,
        to_char((s.arrival AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS end_month,
        s.credit / 60.0 AS pairing_credit,
        CASE WHEN ci.role = 'source' THEN r.removed_credit / 60.0 ELSE 0 END AS removed_credit,
        r.acting_rank, r.rank_count,
        (SELECT COUNT(*)::int FROM roster_flight rf
          WHERE rf.crew_id = ci.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0) AS assigned_rows,
        EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = ci.crew_id AND cb.base = p.base
                 AND cb.eff_dt <= s.departure::date AND (cb.exp_dt IS NULL OR cb.exp_dt >= s.arrival::date)) AS base_matches,
        ((SELECT COUNT(*) FROM roster_flight rf
           WHERE rf.crew_id = ci.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0) > 0
          AND NOT EXISTS (SELECT 1 FROM pairing_segment ps WHERE ps.pairing_id = p.id AND ps.is_deleted = 0
                           AND NOT EXISTS (SELECT 1 FROM roster_flight rf
                                            WHERE rf.crew_id = ci.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0
                                              AND rf.duty_seq = ps.duty_seq AND rf.seg_seq = ps.seg_seq))
        ) AS complete_assignment
   FROM crew_ids ci
   JOIN crew c ON c.crew_id = ci.crew_id
   JOIN pairing p ON p.id = $2::bigint AND p.is_deleted = 0
   JOIN airport a ON a.airport = p.base
   CROSS JOIN LATERAL (
     SELECT MIN(d.departure) departure, MAX(d.arrival) arrival,
            CASE WHEN BOOL_AND(d.credit IS NOT NULL) THEN SUM(d.credit) END credit
       FROM (SELECT duty_seq, MIN(sch_str_dt_utc) departure, MAX(sch_end_dt_utc) arrival,
                    CASE WHEN BOOL_AND(COALESCE(duty_act_credited_minutes, duty_sch_credited_minutes) IS NOT NULL)
                              AND COUNT(DISTINCT COALESCE(duty_act_credited_minutes, duty_sch_credited_minutes)) = 1
                         THEN MAX(COALESCE(duty_act_credited_minutes, duty_sch_credited_minutes)) END credit
               FROM pairing_segment WHERE pairing_id = p.id AND is_deleted = 0 GROUP BY duty_seq) d
   ) s
   CROSS JOIN LATERAL (
     SELECT CASE WHEN BOOL_AND(d.credit IS NOT NULL AND d.flying) THEN SUM(d.credit) END AS removed_credit,
            MIN(d.acting_rank) acting_rank,
            SUM(d.rank_count) + CASE WHEN COUNT(DISTINCT d.acting_rank) = 1 THEN 0 ELSE 1 END rank_count
       FROM (SELECT rf.duty_seq,
                    CASE WHEN BOOL_AND(COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes) IS NOT NULL)
                              AND COUNT(DISTINCT COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes)) = 1
                         THEN MAX(COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes)) END credit,
                    BOOL_AND(rf.assignment = 'FLY') flying, MIN(rf.roster_acting_rank) acting_rank,
                    CASE WHEN COUNT(DISTINCT rf.roster_acting_rank) = 1 THEN 0 ELSE 1 END rank_count
               FROM roster_flight rf LEFT JOIN pairing_segment ps
                 ON ps.pairing_id = rf.pairing_id AND ps.duty_seq = rf.duty_seq AND ps.seg_seq = rf.seg_seq AND ps.is_deleted = 0
              WHERE rf.crew_id = ci.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0 GROUP BY rf.duty_seq) d
   ) r`

export const transferMonthlyCreditSql = `
 SELECT crew_id, SUM(credit) / 60.0 AS before_credit FROM crew_manday_fd_daily
 WHERE crew_id = ANY($1::text[]) AND crew_base_dt >= ($2 || '-01')::date
   AND crew_base_dt < (($2 || '-01')::date + INTERVAL '1 month') GROUP BY crew_id`

const hours = (value: number) => {
  const minutes = Math.round(value * 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

/** One-way transfer GH estimate: receiving crew's incremental pay plus any source saving. */
export async function calculateTransferGhCost(pool: Pool, context: TransferCostContext) {
  if (context.sourceCrewId === context.targetCrewId) throw new Error('A transfer requires two different crews.')
  const { rows } = await pool.query(transferContextSql, [context.sourceCrewId, context.sourcePairingId, context.targetCrewId])
  const source = rows.find((row) => row.role === 'source')
  const target = rows.find((row) => row.role === 'target')
  if (!source || !target) throw new Error('Transfer GH pricing requires the source assignment and the receiving crew.')
  if (source.division !== 'P' || target.division !== 'P') throw new Error('Transfer GH pricing currently supports pilot (division P) Rosters only.')
  if (!source.complete_assignment || !source.base_matches) throw new Error('Transfer GH pricing requires the source crew to hold the complete base-matched pairing assignment.')
  if (Number(target.assigned_rows) !== 0) throw new Error('Transfer GH pricing requires a receiving crew that is not already assigned to the pairing.')
  if (!target.base_matches) throw new Error('Transfer GH pricing requires the receiving crew to be based at the pairing base.')
  if (Number(source.rank_count) !== 0 || Number(target.rank_count) !== 0) throw new Error('Transfer GH pricing requires a single acting rank on every duty.')
  const month = source.credit_month
  if (!month || target.credit_month !== month || source.end_month !== month || target.end_month !== month) throw new Error('Transfer GH pricing requires the pairing to sit inside one base-local calendar month.')
  if (source.pairing_credit == null || source.removed_credit == null || !Number.isFinite(Number(source.pairing_credit)) || !Number.isFinite(Number(source.removed_credit))) throw new Error('Saved pairing or removed duty credit is unavailable.')
  const { rows: monthly } = await pool.query(transferMonthlyCreditSql, [[context.sourceCrewId, context.targetCrewId], month])
  const creditOf = (crewId: string): number | null => {
    const value = monthly.find((row) => row.crew_id === crewId)?.before_credit
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null
    return Number(value)
  }
  const targetBefore = creditOf(context.targetCrewId)
  // A crew with no saved credit rows has no recorded flying in the month, so the
  // receiving baseline is a genuine 0h (it cannot already be over the GH floor).
  // That is different from a pricing gap: adding the duty still prices through
  // the guarantee calculator and simply stays under the floor.
  const targetBeforeCredit = targetBefore ?? 0
  // The source saving is optional: a crew with a duty but no saved baseline cannot
  // have that duty removed arithmetically, so the saving is reported as excluded
  // rather than guessed.
  const sourceBefore = creditOf(context.sourceCrewId)
  const { rows: policies } = await pool.query(swapPolicySql, [source.departure_at, source.arrival_at])
  const policy = policies[0]
  if (!policy) throw new Error('No default GH policy is effective for the transferred pairing.')
  const service = new CostLibraryService(pool)
  const addedCredit = Number(source.pairing_credit)
  const removedCredit = Number(source.removed_credit)
  const sourceSavingReason = sourceBefore == null
    ? 'excluded — no saved calendar-month credit baseline for that crew'
    : removedCredit > sourceBefore + 1e-9
      // The manday daily credit for the released duty can be lower than the
      // pairing duty credit (different credit grains). Removing more than the
      // saved baseline would be arithmetic fiction, so the saving is dropped
      // (it can only overstate the quote) and the gap is reported.
      ? `excluded — released duty credit ${hours(removedCredit)} exceeds the crew's saved ${hours(sourceBefore)} baseline`
      : null
  const targetResult = await service.calculate(Number(policy.id), { beforeCredit: targetBeforeCredit, removedCredit: 0, addedCredit })
  const sourceResult = sourceSavingReason == null
    ? await service.calculate(Number(policy.id), { beforeCredit: sourceBefore!, removedCredit, addedCredit: 0 })
    : null
  const rowsOut = [
    {
      label: `Crew ${context.targetCrewId} — incremental GH pay`,
      typeCode: 1002,
      calculatorCode: 'guarantee',
      revisionId: Number(policy.id),
      quantity: 1,
      amount: targetResult.amount,
      status: targetResult.status,
      currencyCode: targetResult.currencyCode,
    },
    ...(sourceResult
      ? [{
          label: `Crew ${context.sourceCrewId} — released-duty GH saving`,
          typeCode: 1002,
          calculatorCode: 'guarantee',
          revisionId: Number(policy.id),
          quantity: 1,
          amount: sourceResult.amount,
          status: sourceResult.status,
          currencyCode: sourceResult.currencyCode,
        }]
      : []),
  ]
  const priced = targetResult.status === 'priced' && targetResult.amount != null
    && rowsOut.every((row) => row.status === 'priced' && row.amount != null)
    && new Set(rowsOut.map((row) => row.currencyCode)).size === 1
  const notes = [
    `Transfer GH estimate · calendar month ${month} · saved planned roster credit (not RP MCred).`,
    `Crew ${context.targetCrewId} receives ${hours(addedCredit)}: credit before ${hours(targetBeforeCredit)} → after ${hours(targetBeforeCredit + addedCredit)} (HH:MM)${targetBefore == null ? ' — no saved credit rows for the month, baseline 0h' : ''}.`,
    ...(sourceResult
      ? [`Crew ${context.sourceCrewId} releases ${hours(removedCredit)}: credit before ${hours(sourceBefore!)} → after ${hours(sourceBefore! - removedCredit)} (HH:MM).`]
      : [`Crew ${context.sourceCrewId} released-duty saving ${sourceSavingReason}.`]),
    `Pay(after) − Pay(before) per crew through the Cost Library guarantee calculator. Default GH revision ${policy.id}; ${policy.currency_code} ${policy.unit_price}/h; tiers ${JSON.stringify(policy.params_json.tiers)}.`,
    'Incremental GH pay only: excludes roster-change fees, passenger, transport and other operational costs. Default library policy, not a verified individual employment contract. Not payroll posting, legality, medical fitness or crew-acceptance approval.',
  ]
  return {
    directCost: priced ? Math.round(rowsOut.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100 : null,
    currency: String(policy.currency_code),
    breakdown: rowsOut,
    notes,
  }
}
