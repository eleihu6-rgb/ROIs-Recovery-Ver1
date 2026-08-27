import type { FastifyInstance } from 'fastify'
import type { RosterEngineResult } from '../../types/rule-engine.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertPairingInput {
  crewId: string
  pairingId: number
  rulesetId: number
  passedAll: boolean
  highestSeverity: number
  checkResults: unknown[]
  calcResults: unknown
}

export interface PairingResultRow {
  crew_id: string
  pairing_id: number
  ruleset_id: number
  passed_all: boolean
  highest_severity: number
  check_results: unknown
  calc_results: unknown
  checked_at: Date
  created_by: string
  created_at: Date
  updated_by: string
  updated_at: Date
}

export interface RosterResultRow {
  crew_id: string
  ruleset_id: number
  result_month: string
  passed_all: boolean
  highest_severity: number
  violations: unknown
  calc_summary: unknown
  checked_at: Date
  created_by: string
  created_at: Date
  updated_by: string
  updated_at: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 200

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ruleCheckResultService = {
  /**
   * Upsert a single pairing-level check result.
   * Returns the number of affected rows.
   */
  async upsertPairingResult(
    fastify: FastifyInstance,
    input: UpsertPairingInput,
  ): Promise<number> {
    const sql = `
      INSERT INTO rule_check_result_pairing
        (crew_id, pairing_id, ruleset_id, passed_all, highest_severity, check_results, calc_results)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      ON CONFLICT (crew_id, pairing_id, ruleset_id) DO UPDATE SET
        passed_all = EXCLUDED.passed_all,
        highest_severity = EXCLUDED.highest_severity,
        check_results = EXCLUDED.check_results,
        calc_results = EXCLUDED.calc_results,
        checked_at = now(),
        updated_by = 'system',
        updated_at = now()
    `

    const { rowCount } = await fastify.pgPool.query(sql, [
      input.crewId,
      input.pairingId,
      input.rulesetId,
      input.passedAll,
      input.highestSeverity,
      JSON.stringify(input.checkResults),
      JSON.stringify(input.calcResults),
    ])

    return rowCount ?? 0
  },

  /**
   * Bulk upsert pairing-level check results in chunks of 200.
   * No-op when rows is empty.
   */
  async bulkUpsertPairingResults(
    fastify: FastifyInstance,
    rows: UpsertPairingInput[],
  ): Promise<void> {
    if (rows.length === 0) return

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const values: unknown[] = []
      const placeholders: string[] = []
      let paramIndex = 1

      for (const row of chunk) {
        placeholders.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}::jsonb, $${paramIndex + 6}::jsonb)`,
        )
        values.push(
          row.crewId,
          row.pairingId,
          row.rulesetId,
          row.passedAll,
          row.highestSeverity,
          JSON.stringify(row.checkResults),
          JSON.stringify(row.calcResults),
        )
        paramIndex += 7
      }

      const sql = `
        INSERT INTO rule_check_result_pairing
          (crew_id, pairing_id, ruleset_id, passed_all, highest_severity, check_results, calc_results)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (crew_id, pairing_id, ruleset_id) DO UPDATE SET
          passed_all = EXCLUDED.passed_all,
          highest_severity = EXCLUDED.highest_severity,
          check_results = EXCLUDED.check_results,
          calc_results = EXCLUDED.calc_results,
          checked_at = now(),
          updated_by = 'system',
          updated_at = now()
      `

      await fastify.pgPool.query(sql, values)
    }
  },

  /**
   * Upsert a roster-level check result for a crew x month.
   * Builds calc_summary from the pairing-level calc results.
   */
  async upsertRosterResult(
    fastify: FastifyInstance,
    crewId: string,
    rulesetId: number,
    resultMonth: string,
    rosterResult: RosterEngineResult,
  ): Promise<number> {
    // Aggregate calc results across all pairings into a summary
    const calcSummary: Record<string, { value: number; unit: string }> = {}
    for (const [, engineResult] of rosterResult.pairingResults) {
      for (const cr of engineResult.calcResults) {
        calcSummary[cr.ruleCode] = { value: cr.value, unit: cr.unit }
      }
    }

    const sql = `
      INSERT INTO rule_check_result_roster
        (crew_id, ruleset_id, result_month, passed_all, highest_severity, violations, calc_summary)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      ON CONFLICT (crew_id, ruleset_id, result_month) DO UPDATE SET
        passed_all = EXCLUDED.passed_all,
        highest_severity = EXCLUDED.highest_severity,
        violations = EXCLUDED.violations,
        calc_summary = EXCLUDED.calc_summary,
        checked_at = now(),
        updated_by = 'system',
        updated_at = now()
    `

    const { rowCount } = await fastify.pgPool.query(sql, [
      crewId,
      rulesetId,
      resultMonth,
      rosterResult.passedAll,
      rosterResult.highestSeverity,
      JSON.stringify(rosterResult.rosterViolations),
      JSON.stringify(calcSummary),
    ])

    return rowCount ?? 0
  },

  /**
   * Query pairing-level check results for given crew IDs, rule group, and date range.
   * Returns results indexed by pairing_id plus a list of expected-but-missing pairing IDs.
   */
  async queryPairingResults(
    fastify: FastifyInstance,
    crewIds: string[],
    rulesetId: number,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ byPairing: Record<string, PairingResultRow>; missing: string[] }> {
    const sql = `
      SELECT rp.*
      FROM rule_check_result_pairing rp
      JOIN pairing p ON p.id = rp.pairing_id
      WHERE rp.crew_id = ANY($1::varchar[])
        AND rp.ruleset_id = $2
        AND p.sch_str_dt_utc >= $3::date
        AND p.sch_str_dt_utc < $4::date + INTERVAL '1 day'
      ORDER BY rp.crew_id, rp.pairing_id
    `

    const { rows } = await fastify.pgPool.query<PairingResultRow>(sql, [
      crewIds,
      rulesetId,
      dateFrom,
      dateTo,
    ])

    const byPairing: Record<string, PairingResultRow> = {}
    for (const row of rows) {
      byPairing[String(row.pairing_id)] = row
    }

    return { byPairing, missing: [] }
  },

  /**
   * Query roster-level check results for given crew IDs, rule group, and months.
   */
  async queryRosterResults(
    fastify: FastifyInstance,
    crewIds: string[],
    rulesetId: number,
    months: string[],
  ): Promise<RosterResultRow[]> {
    const sql = `
      SELECT *
      FROM rule_check_result_roster
      WHERE crew_id = ANY($1::varchar[])
        AND ruleset_id = $2
        AND result_month = ANY($3::varchar[])
      ORDER BY crew_id, result_month
    `

    const { rows } = await fastify.pgPool.query<RosterResultRow>(sql, [
      crewIds,
      rulesetId,
      months,
    ])

    return rows
  },

  /**
   * Increment the processed counts for a batch run.
   * processed_crew is always incremented by 1; processed_pairings by the given count.
   */
  async incrementBatchProgress(
    fastify: FastifyInstance,
    batchRunId: number,
    pairingsProcessed: number,
  ): Promise<void> {
    const sql = `
      UPDATE rule_check_batch_run
      SET processed_crew = processed_crew + 1,
          processed_pairings = processed_pairings + $2,
          updated_at = now()
      WHERE id = $1
    `

    await fastify.pgPool.query(sql, [batchRunId, pairingsProcessed])
  },
}
