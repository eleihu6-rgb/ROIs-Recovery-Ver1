import type { Pool } from 'pg'
import { CostLibraryService } from '../cost/cost-library-service.js'

export interface SwapCostContext {
  sourceCrewId: string
  sourcePairingId: number
  targetCrewId: string
  targetPairingId: number
}

// Read complete saved pairings, not caller-supplied credit or one credit per leg.
export const swapContextSql = `
 WITH participants(crew_id, pairing_id) AS (VALUES ($1::text, $2::bigint), ($3::text, $4::bigint))
 SELECT x.crew_id, p.id AS pairing_id, p.base, c.division,
        to_char(s.departure, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS departure_at,
        to_char(s.arrival, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS arrival_at,
        to_char((s.departure AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS credit_month,
        to_char((s.arrival AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS end_month,
        s.credit / 60.0 AS pairing_credit, r.credit / 60.0 AS removed_credit,
        r.acting_rank, r.rank_count,
        (SELECT array_agg(flt_id ORDER BY flt_id) FROM pairing_segment WHERE pairing_id = p.id AND is_deleted = 0)
          = (SELECT array_agg(flt_id ORDER BY flt_id) FROM roster_flight WHERE crew_id = x.crew_id AND pairing_id = p.id AND is_deleted = 0)
          AND NOT EXISTS (SELECT 1 FROM roster_flight rf WHERE rf.crew_id = x.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0
            AND NOT EXISTS (SELECT 1 FROM pairing_segment ps WHERE ps.pairing_id = rf.pairing_id AND ps.flt_id = rf.flt_id
                             AND ps.duty_seq = rf.duty_seq AND ps.seg_seq = rf.seg_seq AND ps.is_deleted = 0)) AS complete_assignment,
        EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = x.crew_id AND cb.base = p.base
                 AND cb.eff_dt <= s.departure::date AND (cb.exp_dt IS NULL OR cb.exp_dt >= s.arrival::date)) AS base_matches
   FROM participants x
   JOIN crew c ON c.crew_id = x.crew_id
   JOIN pairing p ON p.id = x.pairing_id AND p.is_deleted = 0
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
     SELECT CASE WHEN BOOL_AND(d.credit IS NOT NULL AND d.flying) THEN SUM(d.credit) END credit,
            MIN(d.acting_rank) acting_rank, SUM(d.rank_count) + CASE WHEN COUNT(DISTINCT d.acting_rank) = 1 THEN 0 ELSE 1 END rank_count
       FROM (SELECT rf.duty_seq,
                    CASE WHEN BOOL_AND(COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes) IS NOT NULL)
                              AND COUNT(DISTINCT COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes)) = 1
                         THEN MAX(COALESCE(ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes)) END credit,
                    BOOL_AND(rf.assignment = 'FLY') flying, MIN(rf.roster_acting_rank) acting_rank,
                    CASE WHEN COUNT(DISTINCT rf.roster_acting_rank) = 1 THEN 0 ELSE 1 END rank_count
               FROM roster_flight rf LEFT JOIN pairing_segment ps
                 ON ps.pairing_id = rf.pairing_id AND ps.duty_seq = rf.duty_seq AND ps.seg_seq = rf.seg_seq AND ps.is_deleted = 0
              WHERE rf.crew_id = x.crew_id AND rf.pairing_id = p.id AND rf.is_deleted = 0 GROUP BY rf.duty_seq) d
   ) r`

export const swapMonthlyCreditSql = `
 SELECT crew_id, SUM(credit) / 60.0 AS before_credit FROM crew_manday_fd_daily
 WHERE crew_id = ANY($1::text[]) AND crew_base_dt >= ($2 || '-01')::date
   AND crew_base_dt < (($2 || '-01')::date + INTERVAL '1 month') GROUP BY crew_id`

export const swapPolicySql = `
 SELECT r.id, r.currency_code, r.params_json, r.unit_price
 FROM cost_type t JOIN cost_instance i ON i.cost_type_id = t.id
 JOIN cost_revision r ON r.cost_instance_id = i.id
 WHERE t.type_code = 1002 AND i.instance_no = 1 AND r.calculator_code = 'guarantee'
   AND r.effective_from <= $1::timestamp
   AND (r.effective_to IS NULL OR r.effective_to > $2::timestamp)
 ORDER BY r.revision_no DESC LIMIT 1`

const hours = (value: number) => {
  const minutes = Math.round(value * 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

/** Narrow saved same-base pilot swap GH estimate, not total operational cost. */
export async function calculateSwapGhCost(pool: Pool, context: SwapCostContext) {
  if (context.sourceCrewId === context.targetCrewId || context.sourcePairingId === context.targetPairingId) throw new Error('Swap requires two different crews and pairings.')
  const { rows } = await pool.query(swapContextSql, [context.sourceCrewId, context.sourcePairingId, context.targetCrewId, context.targetPairingId])
  const source = rows.find(row => row.crew_id === context.sourceCrewId && Number(row.pairing_id) === context.sourcePairingId)
  const target = rows.find(row => row.crew_id === context.targetCrewId && Number(row.pairing_id) === context.targetPairingId)
  if (!source || !target || rows.some(row => !row.complete_assignment || !row.base_matches || row.division !== 'P' || Number(row.rank_count) !== 0)
    || !source.acting_rank || source.acting_rank !== target.acting_rank || source.base !== target.base) {
    throw new Error('Swap GH pricing requires complete saved same-base, same-rank pilot pairing assignments.')
  }
  const month = source.credit_month
  if (!month || rows.some(row => row.credit_month !== month || row.end_month !== month)) throw new Error('Swap GH pricing currently requires both pairings in one base-local calendar month.')
  if (rows.some(row => row.pairing_credit == null || row.removed_credit == null
    || !Number.isFinite(Number(row.pairing_credit)) || !Number.isFinite(Number(row.removed_credit))
    || Number(row.pairing_credit) < 0 || Number(row.removed_credit) < 0)) throw new Error('Saved pairing duty credit is unavailable.')
  const { rows: monthly } = await pool.query(swapMonthlyCreditSql, [[context.sourceCrewId, context.targetCrewId], month])
  const before = (crewId: string) => {
    const value = monthly.find(row => row.crew_id === crewId)?.before_credit
    if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Saved calendar-month crew credit is unavailable; recompute credit first.')
    return Number(value)
  }
  const dates = rows.map(row => row.departure_at).sort()
  const ends = rows.map(row => row.arrival_at).sort()
  const { rows: policies } = await pool.query(swapPolicySql, [dates[0], ends.at(-1)])
  const policy = policies[0]
  if (!policy) throw new Error('No default GH policy is effective throughout both swap pairings.')
  const service = new CostLibraryService(pool)
  const sides = [target, source].map((row, index) => ({
    crewId: String(row.crew_id),
    inputs: { beforeCredit: before(row.crew_id), removedCredit: Number(row.removed_credit), addedCredit: Number((index === 0 ? source : target).pairing_credit) },
  }))
  const results = await Promise.all(sides.map(side => service.calculate(Number(policy.id), side.inputs)))
  const complete = results.every(result => result.status === 'priced' && result.amount != null && Number.isFinite(result.amount))
    && new Set(results.map(result => result.currencyCode)).size === 1
  const summaries = sides.map(side => `Crew ${side.crewId} · GH ${policy.params_json.guaranteeHours}h · credit before ${hours(side.inputs.beforeCredit)} → after ${hours(side.inputs.beforeCredit - side.inputs.removedCredit + side.inputs.addedCredit)} (HH:MM); remove ${hours(side.inputs.removedCredit)}, add ${hours(side.inputs.addedCredit)}.`)
  return {
    directCost: complete ? Math.round(results.reduce((sum, result) => sum + result.amount!, 0) * 100) / 100 : null,
    currency: String(policy.currency_code),
    breakdown: results.map((result, index) => ({ label: `Crew ${sides[index].crewId} — incremental GH pay`, typeCode: 1002, calculatorCode: 'guarantee', revisionId: Number(policy.id), quantity: 1, amount: result.amount, status: result.status, currencyCode: result.currencyCode })),
    notes: [
      `Swap GH estimate · calendar month ${month} · saved planned roster credit (not RP MCred).`,
      ...summaries,
      `Sum of both crews' Pay(after) − Pay(before), including any savings. Default GH revision ${policy.id}; ${policy.currency_code} ${policy.unit_price}/h; tiers ${JSON.stringify(policy.params_json.tiers)}.`,
      'Incremental GH pay only: excludes roster-change fees, passenger, transport and other operational costs. Default library policy, not a verified individual employment contract. Not payroll posting, legality, medical fitness or crew-acceptance approval.',
    ],
  }
}
