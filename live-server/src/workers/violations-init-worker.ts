import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { createHash } from 'node:crypto'
import { Worker, Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { computeWindowSums } from '../services/rule-check/flight-history.js'

// ---------------------------------------------------------------------------
// Local type mirror (avoids importing @rois/rule-engine at module load time)
// ---------------------------------------------------------------------------

interface ResolvedRule {
  templateCode: string
  instanceCode: string
  name: string
  category: string
  checkType: string
  severity: string
  overridable: boolean
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  constraintType: string | null
  reference: string | null
  sortOrder: number
  messageTemplate: string | null
}

interface CrewInfo {
  crewId: string
  division: string
  rank: string
  fleetQuals: string[]
  airportQuals: string[]
  recentFlightHours: {
    last24h: number
    last7d: number
    last28d: number
    last90d: number
    last365d: number
  }
  recentLandings90d?: number
  totalHours?: number
}

interface CheckResult {
  ruleCode: string
  ruleName: string
  passed: boolean
  severity: number
  actualValue: number
  limitValue: number
  unit: string
  message: string
  overridable?: boolean
}

interface EngineResult {
  calcResults: Array<{ ruleCode: string; ruleName: string; value: number; unit: string }>
  checkResults: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}

type PairingInput = {
  pairingId: number
  crewBase: string
  duties: Array<{
    dutySeq: number
    reportUtc: Date
    releaseUtc: Date
    segments: Array<{
      fltNo: string
      depPort: string
      arrPort: string
      stdUtc: Date
      staUtc: Date
      blockMinutes: number
      isNight: boolean
      fleetCode?: string | null
    }>
    restAfterMinutes?: number
    reportLocal?: string
    baseUtcOffset?: number
  }>
}

interface RosterInput {
  ruleGroupCode: string
  crew: CrewInfo
  pairings: PairingInput[]
  periodStart: Date
  periodEnd: Date
}

interface RosterEngineResult {
  pairingResults: Map<number, EngineResult>
  rosterViolations: CheckResult[]
  passedAll: boolean
  highestSeverity: number
}

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface ViolationsInitStartData {
  airline: string         // schema name, e.g. 'f8'
  ruleGroupCode: string   // e.g. 'ccar121_gantt'
  yearsBack: number       // 3 for historical init, 1 for nightly refresh
  resetProgress: boolean  // false = resume; true = start fresh (nightly)
}

export interface ViolationsInitCrewData {
  airline: string
  ruleGroupCode: string
  crewId: string
  dateFrom: string  // YYYY-MM-DD
  dateTo: string
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const KEYS = {
  status:    (a: string, g: string) => `violations:init:${a}:${g}:status`,
  doneCount: (a: string, g: string) => `violations:init:${a}:${g}:done_count`,
  total:     (a: string, g: string) => `violations:init:${a}:${g}:total_count`,
  processed: (a: string, g: string) => `violations:init:${a}:${g}:processed`,
}

// ---------------------------------------------------------------------------
// Input hash helpers  (P2-5 deduplication)
// ---------------------------------------------------------------------------

/** Redis key for per-crew input hash */
const hashKey = (airline: string, groupCode: string, crewId: string) =>
  `violations:hash:${airline}:${groupCode}:${crewId}`

/**
 * Compute a stable 64-char SHA-256 hex over the set of pairing IDs.
 * Sorted so that insertion order differences don't produce false cache misses.
 */
function computeInputHash(crewId: string, pairingIds: number[]): string {
  const payload = JSON.stringify({ crewId, ids: [...pairingIds].sort((a, b) => a - b) })
  return createHash('sha256').update(payload).digest('hex')
}

async function isCacheHit(
  fastify: FastifyInstance,
  airline: string,
  ruleGroupCode: string,
  crewId: string,
  newHash: string,
): Promise<boolean> {
  const cached = await fastify.redis.get(hashKey(airline, ruleGroupCode, crewId))
  return cached === newHash
}

async function storeHash(
  fastify: FastifyInstance,
  airline: string,
  ruleGroupCode: string,
  crewId: string,
  hash: string,
): Promise<void> {
  // 32-day TTL — nightly refresh will refresh the key; if a crew has no pairings
  // for 32 days the stale key expires naturally
  await fastify.redis.set(hashKey(airline, ruleGroupCode, crewId), hash, { EX: 32 * 24 * 3600 })
}

// ---------------------------------------------------------------------------
// Helpers (mirrors batch-crew-worker patterns)
// ---------------------------------------------------------------------------

function subDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

function toYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function monthBounds(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
  return { start, end }
}

/** Rule engine module cache (ESM-only, loaded once) */
let _reModule: Record<string, unknown> | undefined
const importRuleEngine = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<Record<string, unknown>>

async function loadRE() {
  if (!_reModule) _reModule = await importRuleEngine('@rois/rule-engine')
  return _reModule
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

interface RuleViolationRow {
  crew_id: string
  pairing_id: number | null
  duty_seq: number | null
  rule_group_code: string
  rule_code: string
  rule_instance: string | null
  start_dt: Date
  end_dt: Date
  severity: number
  actual_value: number | null
  limit_value: number | null
  unit: string | null
  message: string
  input_hash: string
}

/**
 * Resolve the rule INSTANCE (e.g. '006') for a violation whose engine result only
 * carries the TEMPLATE/function code (e.g. '8002'). When exactly one loaded instance
 * uses that template we can attribute it unambiguously; otherwise return null rather
 * than guess (the engine result doesn't tie a violation to a specific instance).
 */
function resolveInstanceCode(
  ruleCode: string,
  rules: Array<{ templateCode: string; instanceCode: string }>,
): string | null {
  const matches = rules.filter((r) => r.templateCode === ruleCode)
  return matches.length === 1 ? matches[0].instanceCode : null
}

async function deleteCrewViolations(
  fastify: FastifyInstance,
  crewId: string,
  ruleGroupCode: string,
): Promise<void> {
  await fastify.pgPool.query(
    `DELETE FROM rule_violation WHERE crew_id = $1 AND rule_group_code = $2`,
    [crewId, ruleGroupCode],
  )
}

async function bulkInsertViolations(
  fastify: FastifyInstance,
  rows: RuleViolationRow[],
): Promise<void> {
  if (rows.length === 0) return

  const BATCH = 500
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const batch = rows.slice(offset, offset + BATCH)
    const values: unknown[] = []
    const placeholders: string[] = []

    batch.forEach((row, idx) => {
      const b = idx * 14
      placeholders.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},now(),'violations_init','violations_init')`,
      )
      values.push(
        row.crew_id,
        row.pairing_id,
        row.duty_seq,
        row.rule_group_code,
        row.rule_code,
        row.rule_instance,
        row.start_dt,
        row.end_dt,
        row.severity,
        row.actual_value,
        row.limit_value,
        row.unit,
        row.message,
        row.input_hash,
      )
    })

    await fastify.pgPool.query(
      `INSERT INTO rule_violation
         (crew_id, pairing_id, duty_seq, rule_group_code, rule_code, rule_instance,
          start_dt, end_dt, severity, actual_value, limit_value, unit, message, input_hash,
          computed_at, created_by, updated_by)
       VALUES ${placeholders.join(',')}`,
      values,
    )
  }
}

// ---------------------------------------------------------------------------
// Orchestrator handler
// ---------------------------------------------------------------------------

async function handleOrchestrate(
  fastify: FastifyInstance,
  queue: Queue,
  data: ViolationsInitStartData,
): Promise<void> {
  const { airline, ruleGroupCode, yearsBack, resetProgress } = data
  const statusKey   = KEYS.status(airline, ruleGroupCode)
  const processedKey = KEYS.processed(airline, ruleGroupCode)

  const currentStatus = await fastify.redis.get(statusKey)
  if (currentStatus === 'running') {
    fastify.log.info({ airline, ruleGroupCode }, 'Violations init already running — skip')
    return
  }

  // Mark running with 4h safety TTL (covers worst-case 50-min 5k-crew run)
  await fastify.redis.set(statusKey, 'running', { EX: 14_400 })

  if (resetProgress) {
    await fastify.redis.del(processedKey)
    await fastify.redis.set(KEYS.doneCount(airline, ruleGroupCode), '0')
  }

  // Load all distinct crew IDs in this schema
  const crewResult = await fastify.pgPool.query<{ crew_id: string }>(
    `SELECT DISTINCT crew_id FROM roster_flight WHERE is_deleted = 0 ORDER BY crew_id`,
  )
  const allCrewIds = crewResult.rows.map(r => r.crew_id)

  // Resumability: skip already-processed crews
  const processedIds = new Set(await fastify.redis.sMembers(processedKey))
  const remaining    = allCrewIds.filter(id => !processedIds.has(id))

  await fastify.redis.set(KEYS.total(airline, ruleGroupCode), String(allCrewIds.length))
  if (!resetProgress) {
    await fastify.redis.set(KEYS.doneCount(airline, ruleGroupCode), String(processedIds.size))
  }

  const now      = new Date()
  const dateTo   = isoDate(now)
  const dateFrom = isoDate(subDays(now, yearsBack * 365))

  fastify.log.info(
    { airline, ruleGroupCode, total: allCrewIds.length, remaining: remaining.length, dateFrom, dateTo },
    'Violations init fan-out starting',
  )

  // Enqueue in batches to avoid oversized Redis pipelines
  const ENQUEUE_BATCH = 500
  for (let i = 0; i < remaining.length; i += ENQUEUE_BATCH) {
    const chunk = remaining.slice(i, i + ENQUEUE_BATCH)
    await queue.addBulk(
      chunk.map(crewId => ({
        name: 'violationsInit:crew',
        data: { airline, ruleGroupCode, crewId, dateFrom, dateTo } satisfies ViolationsInitCrewData,
      })),
    )
  }

  fastify.log.info({ enqueued: remaining.length }, 'Violations init jobs enqueued')
}

// ---------------------------------------------------------------------------
// Per-crew handler
// ---------------------------------------------------------------------------

async function handleCrew(
  fastify: FastifyInstance,
  ruleLoader: { loadRules(groupCode: string, division: string): Promise<ResolvedRule[]> },
  data: ViolationsInitCrewData,
): Promise<void> {
  const { airline, ruleGroupCode, crewId, dateFrom, dateTo } = data

  // 1. Load pairings in the date range
  const pairs = await ruleCheckDataService.loadCrewPairingsForPeriod(fastify, crewId, dateFrom, dateTo)

  if (pairs.length === 0) {
    await markProcessed(fastify, airline, ruleGroupCode, crewId)
    return
  }

  // P2-5: Skip recompute if pairing set is unchanged
  const inputHash = computeInputHash(crewId, pairs.map(p => p.pairingId))
  if (await isCacheHit(fastify, airline, ruleGroupCode, crewId, inputHash)) {
    fastify.log.debug({ crewId, ruleGroupCode }, 'Violations init cache hit — skipping recompute')
    await markProcessed(fastify, airline, ruleGroupCode, crewId)
    return
  }

  // 2. Load flight history with 365-day lookback from first pairing
  const firstStart  = pairs[0].pairingStart
  const historyFrom = subDays(firstStart, 365)
  const periodEnd   = new Date(dateTo + 'T23:59:59Z')
  const allFlightRows = await ruleCheckDataService.loadCrewFlightRows(
    fastify, crewId, historyFrom, periodEnd,
  )

  // 3. Load crew info
  const crewInfoData = await ruleCheckDataService.loadCrewInfo(fastify, crewId)
  const crewBase: CrewInfo = {
    crewId,
    division:   crewInfoData.division,
    rank:       crewInfoData.rank,
    fleetQuals: crewInfoData.fleetQuals,
    airportQuals: crewInfoData.airportQuals,
    recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
  }

  // 4. Load rule group, filtered by crew division
  const rules = await ruleLoader.loadRules(ruleGroupCode, crewBase.division)
  const mod   = await loadRE()
  const ruleEngine   = new (mod.RuleEngine as new () => { checkWithRules(...args: unknown[]): EngineResult })()
  const rosterEngine = new (mod.RosterEngine as new () => { checkWithRules(...args: unknown[]): RosterEngineResult })()

  // 5. Pairing-level violations
  const violations: RuleViolationRow[] = []
  const pairingInputCache = new Map<number, PairingInput | null>()

  for (const pair of pairs) {
    const pairingInput = await ruleCheckDataService.loadPairingInput(fastify, pair.pairingId)
    pairingInputCache.set(pair.pairingId, pairingInput)
    if (!pairingInput) continue

    const firstDuty = pairingInput.duties[0]
    if (!firstDuty?.reportUtc) continue

    const pairingHistory = computeWindowSums(firstDuty.reportUtc, allFlightRows)
    const crew: CrewInfo = { ...crewBase, recentFlightHours: pairingHistory }

    const result: EngineResult = ruleEngine.checkWithRules(
      { ruleGroupCode, pairing: pairingInput, crew },
      rules,
    )

    const lastDuty  = pairingInput.duties[pairingInput.duties.length - 1]
    const startDt   = firstDuty.reportUtc
    const endDt     = lastDuty?.releaseUtc ?? startDt

    for (const cr of result.checkResults) {
      if (!cr.passed) {
        violations.push({
          crew_id:         crewId,
          pairing_id:      pair.pairingId,
          duty_seq:        null,
          rule_group_code: ruleGroupCode,
          rule_code:       cr.ruleCode,
          rule_instance:   resolveInstanceCode(cr.ruleCode, rules),
          start_dt:        startDt,
          end_dt:          endDt,
          severity:        cr.severity,
          actual_value:    cr.actualValue ?? null,
          limit_value:     cr.limitValue ?? null,
          unit:            cr.unit ?? null,
          message:         cr.message,
          input_hash:      inputHash,
        })
      }
    }
  }

  // 6. Roster-level violations — group pairings by month
  const monthMap = new Map<string, PairingInput[]>()
  for (const pair of pairs) {
    const pi = pairingInputCache.get(pair.pairingId)
    if (!pi) continue
    const month = toYearMonth(pair.pairingStart)
    const list  = monthMap.get(month) ?? []
    list.push(pi)
    monthMap.set(month, list)
  }

  for (const [month, monthPairings] of monthMap) {
    const { start: periodStart, end: periodEnd } = monthBounds(month)
    const rosterInput: RosterInput = {
      ruleGroupCode,
      crew:     crewBase,
      pairings: monthPairings,
      periodStart,
      periodEnd,
    }

    const rosterResult: RosterEngineResult = rosterEngine.checkWithRules(rosterInput, rules)

    for (const cr of rosterResult.rosterViolations) {
      if (!cr.passed) {
        violations.push({
          crew_id:         crewId,
          pairing_id:      null,
          duty_seq:        null,
          rule_group_code: ruleGroupCode,
          rule_code:       cr.ruleCode,
          rule_instance:   resolveInstanceCode(cr.ruleCode, rules),
          start_dt:        periodStart,
          end_dt:          periodEnd,
          severity:        cr.severity,
          actual_value:    cr.actualValue ?? null,
          limit_value:     cr.limitValue ?? null,
          unit:            cr.unit ?? null,
          message:         cr.message,
          input_hash:      inputHash,
        })
      }
    }
  }

  // 7. Replace violations for this crew + rule group atomically
  await deleteCrewViolations(fastify, crewId, ruleGroupCode)
  await bulkInsertViolations(fastify, violations)

  // 8. Cache new input hash so the next run can skip unchanged crews
  await storeHash(fastify, airline, ruleGroupCode, crewId, inputHash)

  // 9. Track progress
  await markProcessed(fastify, airline, ruleGroupCode, crewId)

  fastify.log.debug(
    { crewId, ruleGroupCode, violations: violations.length },
    'Violations init crew done',
  )
}

async function markProcessed(
  fastify: FastifyInstance,
  airline: string,
  ruleGroupCode: string,
  crewId: string,
): Promise<void> {
  await Promise.all([
    fastify.redis.sAdd(KEYS.processed(airline, ruleGroupCode), crewId),
    fastify.redis.incr(KEYS.doneCount(airline, ruleGroupCode)),
  ])
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startViolationsInitWorker(
  fastify: FastifyInstance,
  ruleLoader: { loadRules(groupCode: string, division: string): Promise<ResolvedRule[]> },
): { worker: Worker; queue: Queue } {
  const connection = getBullmqRedisConnection()

  const queue = new Queue<ViolationsInitCrewData | ViolationsInitStartData>(withBullmqPrefix('violations-init'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 50 },
      attempts:         3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  })
  attachBullmqErrorLogger(queue, fastify.log, 'violations-init worker queue')

  const worker = new Worker<ViolationsInitCrewData | ViolationsInitStartData>(withBullmqPrefix('violations-init'),
    async (job) => {
      if (job.name === 'violationsInit:start') {
        await handleOrchestrate(fastify, queue, job.data as ViolationsInitStartData)
      } else if (job.name === 'violationsInit:crew') {
        await handleCrew(fastify, ruleLoader, job.data as ViolationsInitCrewData)
      }
    },
    {
      connection,
      concurrency: 5,
      // Rate limit: 100 crew-level jobs per minute across all concurrent workers
      limiter: { max: 100, duration: 60_000 },
    },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error(
      { jobId: job?.id, jobName: job?.name, crewId: (job?.data as ViolationsInitCrewData)?.crewId, err: err.message },
      'Violations init worker failed',
    )
  })
  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'Violations init worker error')
  })

  return { worker, queue }
}
