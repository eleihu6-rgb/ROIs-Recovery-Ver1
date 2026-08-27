import { spawn } from 'node:child_process'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { isFresh, type LegalityStatusRow } from './legality-freshness.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'

// Orchestration for persisted scenario legality: freshness check + concurrency-deduped
// trigger of the Rust compute (scripts/scenario-legality.mjs). The compute engine itself is
// Rust (rule-engine-rs), spawned as a detached child — see
// docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md §5c.

export type EnsureState = 'READY' | 'COMPUTING' | 'FAILED'

/** Spawn the (Rust-backed) scenario legality compute for one scenario, detached. */
function spawnCompute(fastify: FastifyInstance, scenarioId: number, airlineSchema?: string): void {
  // live-server runs with cwd = live-server/, so the script path is relative to it.
  const script = path.resolve(process.cwd(), 'scripts/scenario-legality.mjs')
  const child = spawn(process.execPath, [script, String(scenarioId)], {
    detached: true,
    stdio: 'ignore',
    // The detached script publishes a completion signal; it needs the airline schema
    // (WS channel) to route the broadcast to the right clients.
    env: airlineSchema ? { ...process.env, WS_AIRLINE_SCHEMA: airlineSchema } : process.env,
  })
  child.on('error', (err) =>
    fastify.log.error({ err, scenarioId }, 'scenario legality compute spawn failed'),
  )
  // Backstop: the script itself flips status to FAILED on a caught compute error, but a child
  // that dies before/outside that catch (e.g. killed, or an error thrown after the try block)
  // would otherwise leave status pinned at COMPUTING forever — the "spins forever" failure mode
  // (mirrors spawnLiveRecheck's exit backstop in services/rule/legality-recheck.ts).
  child.on('exit', (code) => {
    if (code === 0) return
    fastify.log.error({ code, scenarioId }, 'scenario legality compute exited non-zero')
    void fastify.pgPool
      .query(
        `update ${scenarioSchema()}.legality_status set status='FAILED', error_text=$2, updated_at=now()
           where scenario_id=$1 and status='COMPUTING'`,
        [scenarioId, `compute process exited with code ${code}`],
      )
      .catch((err) => fastify.log.error({ err, scenarioId }, 'failed to flip legality_status to FAILED'))
  })
  child.unref()
}

/**
 * Ensure scenario legality is fresh. Returns 'READY' when stored violations are current
 * (caller may read them), or 'COMPUTING' when a (deduped) compute was triggered or is
 * already running. Concurrency is serialized with a per-scenario advisory lock so only one
 * caller wins the COMPUTING flip and spawns the compute.
 */
export interface EnsureLegalityResult {
  state: EnsureState
  paramsStale: boolean
  /** Last successful compute time (null until the first READY), for the alert dialog's status line. */
  computedAt: string | null
  /** Set when state is 'FAILED' — the compute error message, for the alert dialog's status line. */
  errorText: string | null
}

const isSeedLegalityScenario = (meta: { status: string | null; file_type: string | null }, loadedRosterCount: number): boolean =>
  loadedRosterCount === 0
  && meta.file_type === 'RO'
  && (meta.status === 'DRAFT' || meta.status === 'FAILED')

export async function ensureLegality(
  fastify: FastifyInstance,
  scenarioId: number,
  options?: { airlineSchema?: string },
): Promise<EnsureLegalityResult> {
  const pool = fastify.pgPool
  const live = liveSchema()
  const scenario = scenarioSchema()
  const meta = (
    await pool.query<{ ruleset_id: number; status: string | null; file_type: string | null }>(
      `select ruleset_id, status, file_type from ${live}.scenario where id = $1`,
      [scenarioId],
    )
  ).rows[0]
  if (!meta) throw new Error(`scenario ${scenarioId} not found`)
  const loadedRosterCount = Number((
    await pool.query<{ n: number }>(
      `select count(*)::int as n from ${scenario}.roster_flight where scenario_id = $1 and is_deleted = 0`,
      [scenarioId],
    )
  ).rows[0]?.n ?? 0)
  const seedLegality = isSeedLegalityScenario(meta, loadedRosterCount)
  const initialRosterVersion = seedLegality ? 1 : 0

  const client = await pool.connect()
  let won = false
  let paramsStale = false
  let computedAt: string | null = null
  let errorText: string | null = null
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock($1)', [scenarioId])
    // snapshot the scenario's ruleset id (= workset id) at compute time
    await client.query(
      `insert into ${scenario}.legality_status (scenario_id, ruleset_id, roster_version)
         values ($1, $2, $3)
       on conflict (scenario_id) do nothing`,
      [scenarioId, meta.ruleset_id, initialRosterVersion],
    )
    if (seedLegality) {
      await client.query(
        `update ${scenario}.legality_status
            set roster_version = greatest(roster_version, 1),
                status = case
                  when status = 'READY' and computed_version < 1 then 'STALE'
                  else status
                end,
                updated_at = now()
          where scenario_id = $1 and roster_version < 1`,
        [scenarioId],
      )
    }
    const cur = (
      await client.query<
        LegalityStatusRow & { params_stale: boolean; computed_at: Date | null; error_text: string | null }
      >(
        `select status, computed_version, roster_version, params_stale, computed_at, error_text
           from ${scenario}.legality_status where scenario_id = $1`,
        [scenarioId],
      )
    ).rows[0]
    if (seedLegality && cur.roster_version < 1) {
      cur.roster_version = 1
      if (cur.status === 'READY' && cur.computed_version < 1) cur.status = 'STALE'
    }
    paramsStale = cur.params_stale
    computedAt = cur.computed_at ? cur.computed_at.toISOString() : null
    errorText = cur.error_text
    if (isFresh(cur)) {
      await client.query('commit')
      return { state: 'READY', paramsStale, computedAt, errorText: null }
    }
    if (cur.status === 'FAILED') {
      await client.query('commit')
      return { state: 'FAILED', paramsStale, computedAt, errorText }
    }
    const flip = await client.query(
      `update ${scenario}.legality_status set status = 'COMPUTING', updated_at = now()
        where scenario_id = $1 and status <> 'COMPUTING' and computed_version <> roster_version
        returning scenario_id`,
      [scenarioId],
    )
    won = flip.rowCount === 1
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }

  if (won) spawnCompute(fastify, scenarioId, options?.airlineSchema)
  return { state: 'COMPUTING', paramsStale, computedAt, errorText: null }
}

/** Force a recompute regardless of freshness, clearing the params_stale flag. Used by the
 *  manual "Recheck" on out-of-window scenarios. */
export async function forceRecompute(fastify: FastifyInstance, scenarioId: number): Promise<EnsureState> {
  await fastify.pgPool.query(
    `update ${scenarioSchema()}.legality_status set status='COMPUTING', params_stale=false,
        computed_version = computed_version - 1, updated_at = now() where scenario_id = $1`,
    [scenarioId],
  )
  spawnCompute(fastify, scenarioId)
  return 'COMPUTING'
}
