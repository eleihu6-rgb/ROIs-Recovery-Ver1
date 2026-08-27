// live-server/src/services/rule/legality-recheck.ts
// Pure resolution of which rosters a rule-param change affects, plus windowed
// invalidation helpers (in-window = force recompute, out-of-window = soft flag)
// and a detached live-recheck spawn. Wired into the rule PATCH path in Task 5.

import { spawn } from 'node:child_process'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { getOrCreateCounter, getOrCreateHistogram } from '../../utils/metrics.js'
import { liveSchemaName, liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { resolveFiliale } from '../../utils/filiale.js'
import { withPrefix } from '../../utils/redis-key-prefix.js'

// Live legality recheck observability (P2). Labels are low-cardinality: `group` is the rule
// group code (bounded), `status` is started|done|failed. No roster/crew data is ever labeled.
const recheckTotal = getOrCreateCounter({
  name: 'rois_live_server_legality_recheck_total',
  help: 'Live legality recheck spawns by group and status (started|done|failed).',
  labelNames: ['group', 'status'],
})
const recheckDuration = getOrCreateHistogram({
  name: 'rois_live_server_legality_recheck_duration_seconds',
  help: 'Live legality recheck child wall-clock duration in seconds by group.',
  labelNames: ['group'],
  buckets: [1, 5, 15, 30, 60, 120, 300, 600],
})
const recheckRuleCount = getOrCreateHistogram({
  name: 'rois_live_server_legality_recheck_rule_count',
  help: 'Rule codes recomputed per recheck (0 = whole group) by group.',
  labelNames: ['group'],
  buckets: [0, 1, 2, 4, 9, 14],
})
const recheckRangeDays = getOrCreateHistogram({
  name: 'rois_live_server_legality_recheck_range_days',
  help: 'Recheck date-range span in days by group.',
  labelNames: ['group'],
  buckets: [7, 31, 62, 92, 184, 366],
})

/** Whole-day span between two YYYY-MM-DD dates (0 on parse failure). */
const rangeDaysBetween = (from: string, to: string): number => {
  const f = new Date(`${from}T00:00:00Z`).getTime()
  const t = new Date(`${to}T00:00:00Z`).getTime()
  if (Number.isNaN(f) || Number.isNaN(t)) return 0
  return Math.max(0, Math.round((t - f) / 86_400_000))
}

/**
 * Resolve the workset's own division (workset.division) for a numeric ruleset id, so the
 * live legality recheck runs against the right crew pool: 103 = Pilot 'P', 637 = Cabin 'C'.
 * Returns null when the group isn't a known workset id (spawn falls back to the script
 * default division 'P').
 */
async function resolveWorksetDivision(fastify: FastifyInstance, groupCode: string): Promise<'P' | 'C' | null> {
  const id = Number(groupCode)
  if (!Number.isInteger(id) || id <= 0) return null
  try {
    const r = await fastify.pgPool.query<{ division: string }>(
      'SELECT division FROM workset WHERE id = $1',
      [id],
    )
    const d = r.rows[0]?.division
    return d === 'P' || d === 'C' ? d : null
  } catch (err) {
    fastify.log.warn({ err, worksetId: id }, 'resolveWorksetDivision failed — defaulting to script division')
    return null
  }
}

export interface AffectedRosters {
  affectsLiveDefault: boolean
  liveWorksetIds: number[]
  inWindowScenarioIds: number[]
  outOfWindowScenarioIds: number[]
  scenarioCount: number
}

/**
 * Which engine rules must be recomputed when a given rule-table entry's params change.
 * Derived from the read-dependencies in legality-recheck-core.mjs (each rule reads its own
 * params; a few also read a definition / another rule's params):
 *   - 7504 reads 7503's WOCL window      → editing 7503 also rechecks 7504
 *   - 7501, 7508 & 7503 read the 2014 local-night definition → editing 2014 rechecks all three
 *   - 7505 & 7507 read the 2015 DO Start Time definition → editing 2015 rechecks both
 * A changed rule NOT in this map (e.g. an unknown definition) falls back to a whole-group
 * recheck (null) so we never silently leave dependents stale.
 */
const RULE_RECHECK_DEPS: Record<string, string[]> = {
  '8002': ['8002'],
  '8056': ['8056'],
  '8071': ['8071'],
  '8072': ['8072'],
  '8030': ['8030'],
  '8004': ['8004'],
  '7505': ['7505'],
  '7507': ['7507'],
  '7506': ['7506'],
  '7509': ['7509'],
  '7501': ['7501'],
  '7508': ['7508'],
  '7503': ['7503', '7504'],
  '7504': ['7504'],
  '2014': ['7501', '7508', '7503'],
  '2015': ['7505', '7507', '1001'],
}

/**
 * Resolve the engine rule codes to recompute for a changed rule id.
 * Returns null when the change should trigger a full-group recheck (unknown/definition rule).
 */
export async function affectedRuleCodes(pool: Pick<Pool, 'query'>, ruleId: number): Promise<string[] | null> {
  const r = await pool.query(`select function from rule where id = $1`, [ruleId])
  const fn = r.rows[0] ? String((r.rows[0] as { function: number | string }).function) : null
  if (fn == null) return null
  return RULE_RECHECK_DEPS[fn] ?? null
}

export async function resolveAffected(pool: Pick<Pool, 'query'>, ruleId: number): Promise<AffectedRosters> {
  const ws = await pool.query(
    `select distinct rs.workset_id
       from rule_set rs
       join rule r on r.rule_id = rs.rule_id
      where r.id = $1`, [ruleId])
  const worksetIds = ws.rows.map((w: { workset_id: string }) => Number(w.workset_id))
  if (worksetIds.length === 0) {
    return { affectsLiveDefault: false, liveWorksetIds: [], inWindowScenarioIds: [], outOfWindowScenarioIds: [], scenarioCount: 0 }
  }

  // 受改法规影响的、当前启用的 LIVE workset —— live 自动刷新实际要重查的对象。
  // 不再用 workset 103 偏好（原 ORDER BY case when id=103 then 0 else 1 end, id limit 1）。
  const live = await pool.query(
    `select id from workset
      where id = any($1::bigint[])
        and category = 'RULE'
        and type like '%LIVE%'
        and enabled = true`, [worksetIds])
  const liveWorksetIds = live.rows.map((w: { id: string }) => Number(w.id))
  const affectsLiveDefault = liveWorksetIds.length > 0

  const sc = await pool.query(
    `select s.id,
            (s.end_dt_loc >= date_trunc('month', now())
             and s.str_dt_loc < date_trunc('month', now()) + interval '2 months') as in_window
       from ${liveSchema()}.scenario s
      where s.workset_id = any($1::bigint[]) and s.status = 'DONE'`, [worksetIds])
  const inWindowScenarioIds: number[] = []
  const outOfWindowScenarioIds: number[] = []
  for (const row of sc.rows as Array<{ id: string; in_window: boolean }>) {
    ;(row.in_window ? inWindowScenarioIds : outOfWindowScenarioIds).push(Number(row.id))
  }
  return { affectsLiveDefault, liveWorksetIds, inWindowScenarioIds, outOfWindowScenarioIds, scenarioCount: sc.rows.length }
}

/** In-window: force recompute on next open. */
export async function markScenariosStale(pool: Pick<Pool, 'query'>, scenarioIds: number[]): Promise<void> {
  if (scenarioIds.length === 0) return
  await pool.query(
    `update ${scenarioSchema()}.legality_status
        set computed_version = computed_version - 1, status = 'PENDING', params_stale = false, updated_at = now()
      where scenario_id = any($1::bigint[])`, [scenarioIds])
}

/** Out-of-window: soft flag only — no recompute on open, shows an "outdated" hint. */
export async function flagScenariosParamsStale(pool: Pick<Pool, 'query'>, scenarioIds: number[]): Promise<void> {
  if (scenarioIds.length === 0) return
  await pool.query(
    `update ${scenarioSchema()}.legality_status set params_stale = true, updated_at = now()
      where scenario_id = any($1::bigint[])`, [scenarioIds])
}

/**
 * Spawn the live recheck (detached) for the default group over a date range.
 * @param ruleCodes optional subset of rule codes to recompute (scoped recheck). Omit/empty →
 *   whole group. A single-rule param change passes just that rule (+ dependents) so the
 *   recheck recomputes one rule (~seconds) instead of all 9 (~minutes).
 */
export function spawnLiveRecheck(
  fastify: FastifyInstance, groupCode: string, from: string, to: string, ruleCodes?: string[] | null,
  focus?: { focusStartSecs: number; focusEndSecs: number; focusCrewIds: string[] } | null,
): void {
  void spawnLiveRecheckResolved(fastify, groupCode, from, to, ruleCodes, focus).catch((err) => {
    fastify.log.error({ err }, 'live legality recheck spawn failed before child start')
  })
}

type RosterPeriod = { rp_start: string; rp_end: string }

/** Resolve the smallest RP range covering the mutation, with a three-RP fallback. */
async function mutationRefreshWindow(
  fastify: FastifyInstance,
  timestamps: number[],
): Promise<{ from: string; to: string }> {
  const day = 86_400_000
  const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10)
  const from = timestamps.length ? isoDate(Math.min(...timestamps)) : null
  const to = timestamps.length ? isoDate(Math.max(...timestamps)) : null

  try {
    const periods = await fastify.pgPool.query<RosterPeriod>(
      `select rp_start, rp_end from roster_period
       where ($1::date is null or rp_end >= $1::date)
         and ($2::date is null or rp_start <= $2::date)
       order by rp_start`,
      [from, to],
    )
    if (periods.rows.length > 0) {
      return {
        from: isoDate(Math.min(...periods.rows.map((p) => new Date(p.rp_start).getTime()))),
        to: isoDate(Math.max(...periods.rows.map((p) => new Date(p.rp_end).getTime()))),
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, 'roster period lookup failed; using three-RP legality fallback')
  }

  const anchor = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString()
  try {
    const current = await fastify.pgPool.query<RosterPeriod>(
      `select rp_start, rp_end from roster_period
       where rp_start <= $1 and rp_end >= $1 order by rp_start desc limit 1`, [anchor])
    if (current.rows[0]) {
      const [previous, next] = await Promise.all([
        fastify.pgPool.query<RosterPeriod>(
          `select rp_start, rp_end from roster_period where rp_end < $1 order by rp_end desc limit 1`,
          [current.rows[0].rp_start]),
        fastify.pgPool.query<RosterPeriod>(
          `select rp_start, rp_end from roster_period where rp_start > $1 order by rp_start limit 1`,
          [current.rows[0].rp_end]),
      ])
      const fallback = [previous.rows[0], current.rows[0], next.rows[0]].filter(Boolean)
      if (fallback.length > 0) {
        return {
          from: isoDate(Math.min(...fallback.map((p) => new Date(p.rp_start).getTime()))),
          to: isoDate(Math.max(...fallback.map((p) => new Date(p.rp_end).getTime()))),
        }
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, 'three-RP legality fallback lookup failed')
  }

  // A period table that is temporarily unavailable still gets a bounded check.
  const fallbackStart = (timestamps.length ? Math.min(...timestamps) : Date.now()) - 31 * day
  const fallbackEnd = (timestamps.length ? Math.max(...timestamps) : Date.now()) + 31 * day
  return { from: isoDate(fallbackStart), to: isoDate(fallbackEnd) }
}

/**
 * Recheck the complete selected Rust ruleset after a live roster mutation.
 * The padded window (−31 / +31 days) catches violations anchored on adjacent
 * duties and month-start RP rows after a create, update, move, swap, or delete.
 */
export async function recheckLiveRosterMutation(
  fastify: FastifyInstance,
  rulesetId: number | string | undefined,
  dates: Array<Date | string | null | undefined>,
  crewIds: string[] = [],
): Promise<void> {
  const requested = Number(rulesetId)
  let resolved = Number.isInteger(requested) && requested > 0 ? requested : null
  let resolvedIds: number[]
  if (resolved != null) {
    const active = await fastify.pgPool.query<{ id: number }>(
      `select id from workset where id = $1 and category = 'RULE' and type like '%LIVE%' and enabled = true`, [resolved])
    if (!active.rows[0]) return
    resolvedIds = [resolved]
  } else {
    // 只重查受影响 crew 所在 division 的 enabled LIVE workset（P 法规集只查 P crew，C 法规集只查 C crew）。
    let divisions: string[] | null = null
    const crewIdList = [...new Set(crewIds.map(String).filter(Boolean))]
    if (crewIdList.length > 0) {
      const dres = await fastify.pgPool.query<{ division: string }>(
        `select distinct division from crew
          where crew_id = any($1::text[]) and division in ('P', 'C')`, [crewIdList])
      const ds = dres.rows.map((r) => r.division)
      if (ds.length > 0) divisions = ds
    }
    const active = divisions != null
      ? await fastify.pgPool.query<{ id: number }>(
          `select id from workset
           where category = 'RULE' and type like '%LIVE%' and enabled = true and division = any($1::text[])
           order by division, id`, [divisions])
      : await fastify.pgPool.query<{ id: number }>(
          `select id from workset
           where category = 'RULE' and type like '%LIVE%' and enabled = true
           order by division, id`)
    resolvedIds = active.rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0)
  }
  if (resolvedIds.length === 0) return

  const timestamps = dates
    .filter((value): value is Date | string => value != null)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
  const focusCrewIds = [...new Set(crewIds.map(String).filter(Boolean))]
  const focus = focusCrewIds.length > 0 && timestamps.length > 0
    ? {
        focusStartSecs: Math.floor(Math.min(...timestamps) / 1000),
        focusEndSecs: Math.floor(Math.max(...timestamps) / 1000),
        focusCrewIds,
      }
    : null
  if (focus && focus.focusEndSecs === focus.focusStartSecs) focus.focusEndSecs += 1

  const window = await mutationRefreshWindow(fastify, timestamps)

  // No ruleCodes argument means every rule belonging to this workset.
  for (const rulesetId of resolvedIds) {
    spawnLiveRecheck(
      fastify,
      String(rulesetId),
      window.from,
      window.to,
      null,
      focus,
    )
  }
}

async function spawnLiveRecheckResolved(
  fastify: FastifyInstance, groupCode: string, from: string, to: string, ruleCodes?: string[] | null,
  focus?: { focusStartSecs: number; focusEndSecs: number; focusCrewIds: string[] } | null,
): Promise<void> {
  const filiale = await resolveFiliale(fastify)
  const script = path.resolve(process.cwd(), 'scripts/live-legality.mjs')
  const args = [script, '--group', groupCode, '--from', from, '--to', to, '--airline', filiale]
  // Resolve the workset's own division (103 = Pilot 'P', 637 = Cabin 'C') and pass it through —
  // live-legality defaults to 'P', which would wrongly skip cabin crew when the gantt rechecks
  // the Cabin (637) ruleset.
  const division = await resolveWorksetDivision(fastify, groupCode)
  if (division) args.push('--division', division)
  if (ruleCodes && ruleCodes.length) args.push('--rules', ruleCodes.join(','))
  if (focus) {
    args.push(
      '--focus-start-secs',
      String(focus.focusStartSecs),
      '--focus-end-secs',
      String(focus.focusEndSecs),
      '--focus-crew-ids',
      focus.focusCrewIds.join(','),
    )
  }

  // Observability inputs (rule count: 0 = whole group; range span in days).
  const ruleCount = ruleCodes?.length ?? 0
  const rangeDays = rangeDaysBetween(from, to)
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const metaKey = withPrefix(`legality:recheck:${filiale}:${groupCode}:meta`)
  const statusKey = withPrefix(`legality:recheck:${filiale}:${groupCode}:status`)

  // Status-detail record (additive — the existing string status key is left to the child + backstop).
  const writeMeta = (status: 'computing' | 'done' | 'failed', durationSec?: number) =>
    void fastify.redis
      .set(metaKey, JSON.stringify({
        status,
        startedAt,
        finishedAt: status === 'computing' ? null : new Date().toISOString(),
        ...(durationSec != null ? { durationSec } : {}),
        ruleCodes: ruleCodes ?? null,
        ruleCount,
        rangeDays,
      }))
      .catch(() => undefined)

  recheckTotal.inc({ group: groupCode, status: 'started' })
  recheckRuleCount.observe({ group: groupCode }, ruleCount)
  recheckRangeDays.observe({ group: groupCode }, rangeDays)
  writeMeta('computing')
  // Mark Redis status computing before the child starts so clients polling
  // /recheck-status after draft Save can wait for computing → done (not a stale prior "done").
  await fastify.redis.set(statusKey, 'computing', { EX: 1800 })

  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' })
  child.on('error', (err) => {
    fastify.log.error({ err, groupCode }, 'live legality recheck spawn failed')
    recheckTotal.inc({ group: groupCode, status: 'failed' })
    writeMeta('failed')
    void fastify.redis.set(statusKey, 'failed')
  })
  // Backstop: a child that starts then dies non-zero (e.g. DB connect fails before the script
  // can write its own 'failed' status) would otherwise leave status pinned at 'computing' until
  // the 30-min TTL — the "spins forever" failure mode. Flip to 'failed' on any non-zero exit
  // that didn't already settle to done/failed.
  child.on('exit', (code) => {
    const durationSec = (Date.now() - startedMs) / 1000
    const status = code === 0 ? 'done' : 'failed'
    recheckDuration.observe({ group: groupCode }, durationSec)
    recheckTotal.inc({ group: groupCode, status })
    writeMeta(status, durationSec)
    if (code === 0) {
      // Parent-side publish (same Redis the WS pSubscribe uses). Child also publishes
      // after DB commit; this covers races / older child scripts without the publish.
      void fastify.redis
        .publish(`violations:${liveSchemaName()}:${groupCode}`, String(Date.now()))
        .catch((err) => {
          fastify.log.warn({ err, groupCode }, 'violations.updated publish after recheck failed')
        })
      return
    }
    void fastify.redis.get(statusKey).then((s) => {
      if (s === 'computing') {
        fastify.log.error({ code, groupCode }, 'live legality recheck exited non-zero')
        return fastify.redis.set(statusKey, 'failed')
      }
    })
  })
  child.unref()
}
