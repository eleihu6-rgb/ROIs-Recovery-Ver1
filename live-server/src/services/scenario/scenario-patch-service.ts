// live-server/src/services/scenario/scenario-patch-service.ts
import { gzipSync } from 'node:zlib'
import type pg from 'pg'
import { engineServerClient } from '../engine-server-client.js'
import { parseSections } from './scenario-result-service.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { resolvePartitions, type ResolvedPartitions, type ScenarioPointers } from './scenario-partition.js'

export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number | null
  /** Resolved pairing-composition slot rank; written to roster_flight.roster_acting_rank. */
  rosterActingRank?: string
  toCrewId?: string
  startDtUtc?: string
  endDtUtc?: string
  assignmentGroup?: string
  assignment?: string
}

type Queryable = Pick<pg.Pool, 'query'>

const loadScenarioPointers = async (
  db: Queryable,
  scenarioId: number,
): Promise<ScenarioPointers> => {
  const result = await db.query<{
    id: number
    pairing_scenario_id: number
    flight_scenario_id: number
  }>(
    `SELECT id,
            COALESCE(pairing_scenario_id, 0)::int AS pairing_scenario_id,
            COALESCE(flight_scenario_id, 0)::int AS flight_scenario_id
       FROM ${liveSchema()}.scenario
      WHERE id = $1`,
    [scenarioId],
  )
  if (!result.rowCount) {
    throw Object.assign(new Error(`Scenario ${scenarioId} not found`), { statusCode: 404 })
  }
  const row = result.rows[0]
  return {
    id: Number(row.id),
    pairingScenarioId: Number(row.pairing_scenario_id),
    flightScenarioId: Number(row.flight_scenario_id),
  }
}

const partitionsForScenario = async (
  db: Queryable,
  scenarioId: number,
): Promise<ResolvedPartitions> => resolvePartitions(await loadScenarioPointers(db, scenarioId))

/**
 * Validate mutable patches before scenario roster data is changed. The UI hides deletes
 * for immutable sources, but patch-output is an authenticated write endpoint
 * and must enforce the same rule server-side.
 */
export async function validateScenarioRosterPatches(
  pool: pg.Pool,
  scenarioId: number,
  patches: AssignmentPatch[],
): Promise<void> {
  const table = `${scenarioSchema()}.roster_flight`
  const partitions = await partitionsForScenario(pool, scenarioId)
  for (const patch of patches) {
    if (patch.op === 'add') {
      if (patch.pairingId == null) {
        throw Object.assign(new Error(`Scenario add patches require a pairing (crew ${patch.crewId})`), { statusCode: 409 })
      }
      // Pairing geometry may live in live (pairing_scenario_id=0) or a frozen scenario copy.
      // crew has no is_deleted column (status is the employment flag).
      const result = await pool.query(
        `SELECT 1
           FROM ${liveSchema()}.crew c
           JOIN ${partitions.pairingTable} p
             ON p.scenario_id = $4::bigint
            AND p.id = $3::bigint
            AND p.is_deleted = 0
          WHERE c.crew_id = $2::varchar
            AND NOT EXISTS (
              SELECT 1 FROM ${table} rf
               WHERE rf.scenario_id = $1::bigint
                 AND rf.crew_id = $2::varchar
                 AND rf.pairing_id = $3::bigint
                 AND rf.is_deleted = 0
            )
          LIMIT 1`,
        [scenarioId, patch.crewId, patch.pairingId, partitions.pairingPart],
      )
      if (result.rowCount === 0) {
        throw Object.assign(new Error(`Scenario pairing can only be assigned to a valid unassigned crew (crew ${patch.crewId}, pairing ${patch.pairingId})`), { statusCode: 409 })
      }
      continue
    }

    if (patch.op !== 'remove' && patch.op !== 'reassign') continue
    if (patch.op === 'reassign' && patch.pairingId == null) {
      throw Object.assign(new Error(`Only CR or MA roster assignments can be reassigned (crew ${patch.crewId})`), { statusCode: 409 })
    }

    const result = patch.pairingId != null
      ? await pool.query(
        `SELECT 1
           FROM ${table}
          WHERE scenario_id = $1
            AND crew_id = $2
            AND pairing_id = $3
            AND source IN ('CR','MA')
            AND is_deleted = 0
          LIMIT 1`,
        [scenarioId, patch.crewId, patch.pairingId],
      )
      : await pool.query(
        `SELECT 1
           FROM ${table}
          WHERE scenario_id = $1
            AND crew_id = $2
            AND pairing_id IS NULL
            AND sch_str_dt_utc = $3
            AND sch_end_dt_utc = $4
            AND assignment_group = $5
            AND assignment = $6
            AND source IN ('CR','MA')
            AND is_deleted = 0
          LIMIT 1`,
        [
          scenarioId,
          patch.crewId,
          patch.startDtUtc,
          patch.endDtUtc,
          patch.assignmentGroup,
          patch.assignment,
        ],
      )

    if (result.rowCount === 0) {
      const action = patch.op === 'reassign' ? 'reassigned' : 'removed'
      const message = patch.pairingId != null
        ? `Only CR roster assignments can be ${action} (crew ${patch.crewId}, pairing ${patch.pairingId})`
        : `Only CR ground tasks can be ${action} (crew ${patch.crewId})`
      throw Object.assign(new Error(message), { statusCode: 409 })
    }
  }
}

/**
 * Keep the DB-backed Scenario Gantt source in sync with output patches.
 * Scenario roster rows are soft-deleted to preserve the loader's audit/history
 * contract; all DB Gantt queries already exclude is_deleted rows.
 */
export async function applyScenarioRosterPatches(
  pool: pg.Pool,
  scenarioId: number,
  patches: AssignmentPatch[],
  updatedBy: string,
): Promise<void> {
  const client = await pool.connect()
  const table = `${scenarioSchema()}.roster_flight`
  const partitions = await partitionsForScenario(pool, scenarioId)
  const affectedPairingIds = new Set<number>()
  try {
    await client.query('BEGIN')
    for (const patch of patches) {
      if (patch.op === 'remove' && patch.pairingId != null) {
        affectedPairingIds.add(patch.pairingId)
        await client.query(
          `UPDATE ${table}
              SET is_deleted = 1, updated_by = $4, updated_at = now()
            WHERE scenario_id = $1
              AND crew_id = $2
              AND pairing_id = $3
              AND source IN ('CR','MA')
              AND is_deleted = 0`,
          [scenarioId, patch.crewId, patch.pairingId, updatedBy],
        )
      } else if (patch.op === 'remove') {
        await client.query(
          `UPDATE ${table}
              SET is_deleted = 1, updated_by = $7, updated_at = now()
            WHERE scenario_id = $1
              AND crew_id = $2
              AND pairing_id IS NULL
              AND sch_str_dt_utc = $3
              AND sch_end_dt_utc = $4
              AND assignment_group = $5
              AND assignment = $6
              AND source IN ('CR','MA')
              AND is_deleted = 0`,
          [
            scenarioId,
            patch.crewId,
            patch.startDtUtc,
            patch.endDtUtc,
            patch.assignmentGroup,
            patch.assignment,
            updatedBy,
          ],
        )
      } else if (patch.op === 'reassign' && patch.pairingId != null && patch.toCrewId) {
        affectedPairingIds.add(patch.pairingId)
        await client.query(
          `UPDATE ${table}
              SET crew_id = $4,
                  roster_acting_rank = COALESCE($6, roster_acting_rank),
                  flight_acting_rank = COALESCE($6, flight_acting_rank),
                  updated_by = $5, updated_at = now()
            WHERE scenario_id = $1
              AND crew_id = $2
              AND pairing_id = $3
              AND source IN ('CR','MA')
              AND is_deleted = 0`,
          [scenarioId, patch.crewId, patch.pairingId, patch.toCrewId, updatedBy, patch.rosterActingRank ?? null],
        )
      } else if (patch.op === 'add' && patch.pairingId != null) {
        affectedPairingIds.add(patch.pairingId)
        // Re-assign after remove: revive soft-deleted CR rows (same crew+pairing).
        const undeleted = await client.query(
          `UPDATE ${table}
              SET is_deleted = 0,
                  roster_acting_rank = COALESCE($5, roster_acting_rank),
                  flight_acting_rank = COALESCE($5, flight_acting_rank),
                  updated_by = $4, updated_at = now()
            WHERE scenario_id = $1
              AND crew_id = $2
              AND pairing_id = $3
              AND source IN ('CR','MA')
              AND is_deleted = 1`,
          [scenarioId, patch.crewId, patch.pairingId, updatedBy, patch.rosterActingRank ?? null],
        )
        if ((undeleted.rowCount ?? 0) === 0) {
          // Fresh assign: copy segment rows from the scenario's pairing partition
          // (live when pairing_scenario_id=0, else frozen scenario copy).
          await client.query(
            `INSERT INTO ${table} (
                scenario_id, crew_id, pairing_id, live_id, base, label,
                assignment_group, assignment, role, source,
                flight_acting_rank, roster_acting_rank, division,
                flt_id, duty_seq, seg_seq, flt_dt,
                sch_str_dt_utc, sch_end_dt_utc,
                sch_credited_minutes, act_credited_minutes,
                dep_arp, arv_arp, created_by, updated_by
              )
              SELECT $1::bigint, $2::varchar, p.id, NULL, p.base,
                     COALESCE(NULLIF(ps.flt_num, ''), p.pairing_label),
                     CASE WHEN upper(btrim(ps.seg_assignment)) IN ('DH', 'DHD') THEN 'DHD' ELSE COALESCE(p.assignment_group, 'FLT') END,
                     p.assignment, NULL, 'MA',
                     COALESCE($6::varchar, ''), $6::varchar, p.division,
                     ps.flt_id, ps.duty_seq, ps.seg_seq, ps.flt_dt,
                     ps.sch_str_dt_utc, ps.sch_end_dt_utc,
                     ps.duty_act_credited_minutes, ps.duty_act_credited_minutes,
                     ps.dep_arp, ps.arv_arp, $4::varchar, $4::varchar
                FROM ${partitions.pairingTable} p
                JOIN ${partitions.segmentTable} ps
                  ON ps.scenario_id = p.scenario_id
                 AND ps.pairing_id = p.id
                 AND ps.is_deleted = 0
               WHERE p.scenario_id = $5::bigint
                 AND p.id = $3::bigint
                 AND p.is_deleted = 0
                 AND NOT EXISTS (
                   SELECT 1 FROM ${table} rf
                    WHERE rf.scenario_id = $1::bigint
                      AND rf.crew_id = $2::varchar
                      AND rf.pairing_id = $3::bigint
                      AND rf.is_deleted = 0
                 )`,
            [scenarioId, patch.crewId, patch.pairingId, updatedBy, partitions.pairingPart, patch.rosterActingRank ?? null],
          )
        }
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  // Only mutate frozen scenario composition copies — never write fill back into live
  // pairing_composition when pairing_scenario_id=0 (shared across scenarios).
  if (affectedPairingIds.size > 0 && partitions.pairingPart !== 0) {
    await pool.query(
      `UPDATE ${partitions.compositionTable} pc
          SET fill = (
            SELECT COUNT(DISTINCT rf.crew_id)
              FROM ${table} rf
             WHERE rf.scenario_id = $1
               AND rf.pairing_id = pc.pairing_id
               AND rf.roster_acting_rank = pc.acting_rank
               AND rf.is_deleted = 0
          ),
              updated_by = $2,
              updated_at = now()
        WHERE pc.scenario_id = $4
          AND pc.pairing_id = ANY($3::bigint[])
          AND pc.is_deleted = 0`,
      [scenarioId, updatedBy, [...affectedPairingIds], partitions.pairingPart],
    )
  }

  // Scenario legality is keyed by the scenario's own ruleset_id. Any manual
  // roster patch invalidates the persisted Rust result and must be recomputed
  // against the complete ruleset, not just the edited pairing.
  await pool.query(
    `update ${scenarioSchema()}.legality_status
        set roster_version = roster_version + 1,
            status = 'STALE',
            updated_at = now()
      where scenario_id = $1`,
    [scenarioId],
  )
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rebuildSections(
  sections: Record<string, Record<string, string>[]>,
  patchCount: number,
): string {
  const modifiedAt = new Date().toISOString()
  const parts: string[] = [
    `## MODIFIED_AT\nmodified_at,patch_count\n${modifiedAt},${patchCount}\n`,
  ]
  for (const [name, rows] of Object.entries(sections)) {
    if (name === 'MODIFIED_AT') continue
    if (rows.length === 0) { parts.push(`## ${name}\n`); continue }
    const cols = Object.keys(rows[0])
    const header = cols.join(',')
    const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
    parts.push(`## ${name}\n${header}\n${body}\n`)
  }
  return parts.join('\n')
}

export async function applyOutputPatch(
  taskId: string,
  scenarioId: number,
  patches: AssignmentPatch[],
  token: string,
  airline: string,
): Promise<void> {
  const outputGz = await engineServerClient.fetchResultFile(taskId, token, airline, scenarioId)
  const sections = parseSections(outputGz)

  let assignments: Record<string, string>[] = sections['ASSIGNMENTS'] ?? []

  for (const patch of patches) {
    if (patch.op === 'remove') {
      if (patch.pairingId != null) {
        assignments = assignments.filter(
          (a) => !(a['crew_id'] === patch.crewId && a['pairing_id'] === String(patch.pairingId)),
        )
      }
    } else if (patch.op === 'add' && patch.pairingId != null) {
      assignments.push({ crew_id: patch.crewId, pairing_id: String(patch.pairingId) })
    } else if (patch.op === 'reassign' && patch.toCrewId) {
      if (patch.pairingId == null) continue
      assignments = assignments.map((a) =>
        a['crew_id'] === patch.crewId && a['pairing_id'] === String(patch.pairingId)
          ? { ...a, crew_id: patch.toCrewId! }
          : a,
      )
    }
  }

  sections['ASSIGNMENTS'] = assignments
  let roster = sections['ROSTER'] ?? []
  for (const patch of patches) {
    if (patch.op !== 'remove' || patch.pairingId != null) continue
    roster = roster.filter((r) => !(
      r['crew_id'] === patch.crewId &&
      r['sch_str_dt_utc'] === patch.startDtUtc &&
      r['sch_end_dt_utc'] === patch.endDtUtc &&
      r['assignment_group'] === patch.assignmentGroup &&
      r['assignment'] === patch.assignment
    ))
  }
  sections['ROSTER'] = roster
  const newContent = rebuildSections(sections, patches.length)
  const newGz = gzipSync(Buffer.from(newContent, 'utf-8'))

  await engineServerClient.writeOutputFile(taskId, newGz, token, airline)
}
