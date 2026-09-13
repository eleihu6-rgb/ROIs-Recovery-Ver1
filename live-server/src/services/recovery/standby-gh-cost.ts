import type { Pool } from 'pg'
import { CostLibraryService } from '../cost/cost-library-service.js'

export interface StandbyCostContext { crewId: string; pairingId: number; standbyTaskId: number }

// Static, parameterized SQL. Credit is duty-grained, not summed once per leg.
export const standbyContextSql = `
 SELECT rf.assignment, rf.crew_id, c.division,
        to_char(rf.sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS report_at,
        to_char(s.departure, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS departure_at,
        to_char((s.departure AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS credit_month,
        to_char((s.arrival AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS end_month,
        to_char((rf.sch_str_dt_utc AT TIME ZONE 'UTC') AT TIME ZONE a.zone_id, 'YYYY-MM') AS standby_month,
        COALESCE(rf.act_credited_minutes, rf.sch_credited_minutes, ass.fixed_credit_min, 0) / 60.0 AS baseline_standby_credit,
        s.pairing_credit / 60.0 AS pairing_credit
   FROM roster_flight rf
   JOIN crew c ON c.crew_id = rf.crew_id
   JOIN assignment ass ON ass.assignment = rf.assignment
   JOIN pairing p ON p.id = $2 AND p.is_deleted = 0
   JOIN airport a ON a.airport = p.base
   CROSS JOIN LATERAL (
     SELECT MIN(d.departure) departure, MAX(d.arrival) arrival, CASE WHEN BOOL_AND(d.credit IS NOT NULL) THEN SUM(d.credit) END pairing_credit
       FROM (SELECT duty_seq, MIN(sch_str_dt_utc) departure, MAX(sch_end_dt_utc) arrival,
                    MAX(COALESCE(duty_act_credited_minutes, duty_sch_credited_minutes)) credit
               FROM pairing_segment WHERE pairing_id = p.id AND is_deleted = 0 GROUP BY duty_seq) d
   ) s
  WHERE rf.id = $3 AND rf.crew_id = $1 AND rf.pairing_id IS NULL AND rf.is_deleted = 0
    AND rf.dep_arp = p.base AND rf.arv_arp = p.base
    AND rf.sch_str_dt_utc <= p.sch_str_dt_utc AND rf.sch_end_dt_utc >= p.sch_str_dt_utc`

export const standbyPolicySql = `
 SELECT r.id, r.gh_policy_revision_id, r.currency_code, gh.params_json AS gh_params, gh.unit_price AS gh_hourly_rate
 FROM cost_type t JOIN cost_instance i ON i.cost_type_id = t.id
 JOIN cost_revision r ON r.cost_instance_id = i.id
 JOIN cost_revision gh ON gh.id = r.gh_policy_revision_id
 WHERE t.type_code = 1003 AND i.instance_no = 1 AND r.calculator_code = 'standby'
   AND r.effective_from <= $1::timestamp
   AND (r.effective_to IS NULL OR r.effective_to > $1::timestamp)
   AND gh.effective_from <= $1::timestamp
   AND (gh.effective_to IS NULL OR gh.effective_to > $1::timestamp)
 ORDER BY r.revision_no DESC LIMIT 1`

export async function calculateStandbyGhCost(pool: Pool, context: StandbyCostContext) {
  const { rows } = await pool.query(standbyContextSql, [context.crewId, context.pairingId, context.standbyTaskId])
  const row = rows[0]
  if (!row || row.assignment !== 'ASBY' || row.division !== 'P') throw new Error('Airport standby pricing requires a saved pilot ASBY at the pairing base covering report time.')
  if (!row.credit_month || row.credit_month !== row.end_month || row.credit_month !== row.standby_month) throw new Error('Airport standby GH pricing currently requires one calendar month.')
  if (row.pairing_credit == null) throw new Error('Pairing duty credit is unavailable.')
  const monthly = await pool.query(
    `SELECT SUM(credit) / 60.0 AS before_credit FROM crew_manday_fd_daily
      WHERE crew_id = $1 AND crew_base_dt >= ($2 || '-01')::date
        AND crew_base_dt < (($2 || '-01')::date + INTERVAL '1 month')`, [context.crewId, row.credit_month])
  if (monthly.rows[0]?.before_credit == null) throw new Error('Saved calendar-month crew credit is unavailable; recompute credit first.')
  const { rows: policies } = await pool.query(standbyPolicySql, [row.departure_at])
  const policy = policies[0]
  if (!policy) throw new Error('No effective airport standby policy with a pinned GH policy.')
  const inputs = { beforeCredit: Number(monthly.rows[0].before_credit), baselineStandbyCredit: Number(row.baseline_standby_credit), pairingCredit: Number(row.pairing_credit), reportAt: row.report_at, departureAt: row.departure_at }
  const result = await new CostLibraryService(pool).calculate(Number(policy.id), inputs)
  const hours = (value: unknown): string => { const m = Math.round(Number(value) * 60); return Number.isFinite(m) ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : 'unavailable' }
  const value = (label: string) => hours(result.breakdown.find(x => x.label === label)?.value)
  return {
    directCost: result.amount, currency: result.currencyCode,
    breakdown: [{ label: 'Airport standby — incremental GH pay', typeCode: 1003, calculatorCode: 'standby', revisionId: Number(policy.id), quantity: 1, amount: result.amount, status: result.status, currencyCode: result.currencyCode }],
    notes: [
      `Crew ${context.crewId} · calendar month ${row.credit_month} · saved planned roster credit (not RP MCred).`,
      `GH ${policy.gh_params.guaranteeHours}h · credit before ${value('Before credit')} → after ${value('After credit')} (HH:MM).`,
      `Pairing credit ${hours(inputs.pairingCredit)} + callout standby credit ${value('Standby credit')} − already credited standby ${hours(inputs.baselineStandbyCredit)} (HH:MM).`,
      `Pay(after) − Pay(before); standby revision ${policy.id}, pinned GH revision ${policy.gh_policy_revision_id}. No fixed day-off recall fee added.`,
      `Policy rate ${policy.currency_code} ${policy.gh_hourly_rate}/h; GH tiers ${JSON.stringify(policy.gh_params.tiers)}.`,
      'Projected payable credit uses the standby policy, not a promise that retained ASBY roster credit is rewritten on Apply. Estimate from saved data only; excludes non-pay disruption costs and is not a legality or crew-acceptance approval.',
    ],
  }
}
