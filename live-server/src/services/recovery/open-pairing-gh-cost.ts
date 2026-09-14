import type { Pool } from 'pg'
import { CostLibraryService } from '../cost/cost-library-service.js'
import { swapContextSql, swapMonthlyCreditSql, swapPolicySql } from './swap-gh-cost.js'

export interface OpenPairingCostContext { crewId: string; pairingId: number; donorPairingId?: number }

/** Same guarantee calculator as standby/transfer; no fictional releasing crew. */
export async function calculateOpenPairingGhCost(pool: Pool, context: OpenPairingCostContext) {
  if (context.donorPairingId === context.pairingId) throw new Error('Donor and open pairing must differ.')
  const { rows } = await pool.query(swapContextSql, [context.crewId, context.pairingId, context.crewId, context.donorPairingId ?? context.pairingId])
  const target = rows.find(row => Number(row.pairing_id) === context.pairingId)
  const donor = context.donorPairingId ? rows.find(row => Number(row.pairing_id) === context.donorPairingId) : undefined
  if (!target || target.division !== 'P' || !target.base_matches) throw new Error('Open pairing pricing requires a saved same-base pilot and pairing.')
  if (context.donorPairingId && (!donor || !donor.complete_assignment || !donor.base_matches || donor.base !== target.base || donor.division !== target.division || Number(donor.rank_count) !== 0)) throw new Error('Move-up pricing requires the complete saved same-base pilot donor assignment.')
  const relevant = donor ? [target, donor] : [target]
  if (!target.credit_month || relevant.some(row => row.credit_month !== target.credit_month || row.end_month !== target.credit_month)) throw new Error('Open pairing GH pricing requires one base-local calendar month.')
  const addedCredit = Number(target.pairing_credit)
  const removedCredit = donor ? Number(donor.removed_credit) : 0
  if (target.pairing_credit == null || (donor && donor.removed_credit == null) || !Number.isFinite(addedCredit) || !Number.isFinite(removedCredit)) throw new Error('Saved duty credit is unavailable.')
  const assigned = await pool.query('SELECT 1 FROM roster_flight WHERE crew_id = $1 AND pairing_id = $2 AND is_deleted = 0 LIMIT 1', [context.crewId, context.pairingId])
  if (assigned.rows.length) throw new Error('Crew is already assigned to the target pairing.')
  const monthly = await pool.query(swapMonthlyCreditSql, [[context.crewId], target.credit_month])
  const rawCredit = monthly.rows.find(row => row.crew_id === context.crewId)?.before_credit
  if (rawCredit == null || !Number.isFinite(Number(rawCredit))) throw new Error('Saved calendar-month credit is unavailable; recompute credit first.')
  const beforeCredit = Number(rawCredit)
  if (beforeCredit < removedCredit) throw new Error('Removed duty credit exceeds the saved baseline; recompute credit first.')
  const starts = relevant.map(row => row.departure_at).sort()
  const ends = relevant.map(row => row.arrival_at).sort()
  const policies = await pool.query(swapPolicySql, [starts[0], ends.at(-1)])
  const policy = policies.rows[0]
  if (!policy) throw new Error('No effective guarantee policy covers the received and removed duties.')
  const result = await new CostLibraryService(pool).calculate(Number(policy.id), { beforeCredit, removedCredit, addedCredit })
  return {
    directCost: result.amount, currency: result.currencyCode,
    breakdown: [{ label: `Crew ${context.crewId} — incremental GH pay`, typeCode: 1002, calculatorCode: 'guarantee', revisionId: Number(policy.id), quantity: 1, amount: result.amount, status: result.status, currencyCode: result.currencyCode }],
    notes: [`Calendar month ${target.credit_month}: ${beforeCredit.toFixed(2)}h − ${removedCredit.toFixed(2)}h + ${addedCredit.toFixed(2)}h. Pay(after) − Pay(before).`,
      ...(donor ? [`Donor pairing ${context.donorPairingId} loses this crew. Remaining donor vacancy: Partial recovery.`] : []),
      'Saved calendar-month credit; GH estimate excludes unconfigured non-pay disruption costs.'],
  }
}
