import { randomUUID } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { z } from 'zod'
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify'
import { Job, Queue, QueueEvents } from 'bullmq'
import { createClient } from 'redis'
import { env } from '../../config/index.js'
import { success, error, fail } from '../../utils/response.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../../utils/bullmq-redis.js'
import { resolveFilialeLower } from '../../utils/filiale.js'
import {
  importProgressChannel,
  type ImportMaterial,
  type ImportProgressEvent,
} from '../../types/import-progress.js'
import {
  publishImportProgress,
  readImportProgressSnapshot,
} from '../../utils/import-progress-bus.js'
import {
  mutationConflictMessage,
  mutationExclusiveService,
  type MutationLease,
} from '../../services/lock/mutation-exclusive-service.js'

const importScopeSchema = z.object({
  flight: z.boolean().optional().default(false),
  pairing: z.boolean().optional().default(false),
  roster: z.boolean().optional().default(false),
  rosterGround: z.boolean().optional().default(false),
  crew: z.boolean().optional().default(false),
}).refine((scope) => Object.values(scope).some(Boolean), {
  message: 'Select at least one material type.',
})

const importBodySchema = z.object({
  rosterPeriodId: z.coerce.number().int().positive(),
  scope: importScopeSchema,
})

const importIdParamSchema = z.object({
  importId: z.string().uuid(),
})

const asSafeIdentifier = (value: string): string => {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid database schema identifier: ${value}`)
  }
  return value.toLowerCase()
}

const asDateOnly = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

interface RosterPeriodRow {
  id: string | number
  roster_period: string
  rp_start: string | Date
  rp_end: string | Date
  is_current?: boolean
}

interface ConnectorListItem {
  id: number | string
  connectorCode?: string
  connector_code?: string
  isEnabled?: number
  isDeleted?: number
}

interface ConnectorApiResponse<T> {
  code: number
  data: T
  message: string
}

interface ImportTiming {
  material: ImportMaterial
  fetchMs: number
  transformMs: number
  enqueueMs: number
  databaseMs?: number
  totalMs?: number
  recordsIn: number
  recordsOut: number
  rejected: number
}

interface QueuedImportJob {
  material: ImportMaterial
  queueName: string
  jobId: string
}

interface QueuedWriteResult {
  material: ImportMaterial
  databaseMs: number
  result: unknown
}

interface ImportMaterialStats {
  material: ImportMaterial
  status: 'success' | 'partial' | 'failed'
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  rejected: number
  recordsIn: number
  recordsOut: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
  timings: {
    fetchMs: number
    transformMs: number
    enqueueMs: number
    databaseMs: number
    totalMs: number
  }
}

interface ConnectorTriggerResult {
  syncId: string
  filteredCount: number
  rejectionFile: string | null
  status: 'success' | 'fail'
  timings?: ImportTiming[]
  queueJobs?: QueuedImportJob[]
}

interface TriggerResult extends ConnectorTriggerResult {
  connectorCode: string
  timings: ImportTiming[]
  writeResults: QueuedWriteResult[]
}

interface TriggerDescriptor {
  connectorCode: string
  materials: ImportMaterial[]
  promise: Promise<TriggerResult>
}

type ImportStageEvent = Extract<ImportProgressEvent, { type: 'stage' }>

interface BackgroundImportInput {
  importId: string
  lease: MutationLease
  redis: FastifyInstance['redis']
  authorization: string
  materials: ImportMaterial[]
  filiale: string
  startDt: string
  endDt: string
  rosterPeriodId: number
  rosterPeriod: string
  scope: z.infer<typeof importScopeSchema>
  log: FastifyBaseLogger
}

const IMPORT_JOB_WAIT_TIMEOUT_MS = 30 * 60 * 1000
const CONNECTOR_REQUEST_TIMEOUT_MS = 30 * 60 * 1000
const SSE_HEARTBEAT_MS = 15_000

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const materialTotalMs = (timing: ImportTiming, databaseMs: number): number =>
  typeof timing.totalMs === 'number'
    ? timing.totalMs
    : timing.fetchMs + timing.transformMs + timing.enqueueMs + databaseMs

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const asErrors = (value: unknown): Array<{ id: string; reason: string }> => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return [{
      id: String(record.id ?? ''),
      reason: String(record.reason ?? ''),
    }]
  })
}

const normalizeMaterialStats = (
  timing: ImportTiming,
  writeResult: QueuedWriteResult | undefined,
): ImportMaterialStats => {
  const raw = (writeResult?.result && typeof writeResult.result === 'object')
    ? writeResult.result as Record<string, unknown>
    : {}
  const errors = asErrors(raw.errors)
  const warnings = asStringArray(raw.warnings)
  const added = asNumber(raw.added)
  const updated = asNumber(raw.updated)
  const deleted = asNumber(raw.deleted)
  const failed = asNumber(raw.failed) || errors.length
  const operationSuccess = added + updated + deleted
  const success = operationSuccess || asNumber(raw.success) || asNumber(raw.imported) || Math.max(0, timing.recordsOut - failed)
  const status: ImportMaterialStats['status'] = failed > 0
    ? success > 0 ? 'partial' : 'failed'
    : 'success'
  const databaseMs = writeResult?.databaseMs ?? timing.databaseMs ?? 0

  return {
    material: timing.material,
    status,
    added,
    updated,
    deleted,
    success,
    failed,
    skipped: asNumber(raw.skipped) || warnings.length,
    rejected: timing.rejected,
    recordsIn: timing.recordsIn,
    recordsOut: timing.recordsOut,
    warnings,
    errors,
    timings: {
      fetchMs: timing.fetchMs,
      transformMs: timing.transformMs,
      enqueueMs: timing.enqueueMs,
      databaseMs,
      totalMs: materialTotalMs(timing, databaseMs),
    },
  }
}

const terminalStageDurationMs = (
  events: ImportStageEvent[],
  material: ImportMaterial,
  stage: ImportStageEvent['stage'],
): number => {
  let runningAt: string | null = null
  let total = 0
  for (const event of events) {
    if (event.material !== material || event.stage !== stage) continue
    if (event.status === 'running') {
      runningAt = event.at
      continue
    }
    if (!runningAt) continue
    const startedMs = Date.parse(runningAt)
    const finishedMs = Date.parse(event.at)
    if (Number.isFinite(startedMs) && Number.isFinite(finishedMs)) {
      total += Math.max(0, finishedMs - startedMs)
    }
    runningAt = null
  }
  return total
}

const lastStageEvent = (
  events: ImportStageEvent[],
  material: ImportMaterial,
  stage: ImportStageEvent['stage'],
  status?: ImportStageEvent['status'],
): ImportStageEvent | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.material === material && event.stage === stage && (!status || event.status === status)) {
      return event
    }
  }
  return undefined
}

const statsFromProgressHistory = (
  events: ImportProgressEvent[] | null | undefined,
): Map<ImportMaterial, ImportMaterialStats> => {
  const stageEvents = (events ?? []).filter((event): event is ImportStageEvent => event.type === 'stage')
  const materials = new Set(stageEvents.map((event) => event.material))
  const stats = new Map<ImportMaterial, ImportMaterialStats>()

  for (const material of materials) {
    const doneWrites = stageEvents.filter((event) =>
      event.material === material && event.stage === 'write' && event.status === 'done'
    )
    const latestFail = lastStageEvent(stageEvents, material, 'write', 'fail')
    if (doneWrites.length === 0 && !latestFail) continue

    const latestFetchDone = lastStageEvent(stageEvents, material, 'fetch', 'done')
    const latestTransformDone = lastStageEvent(stageEvents, material, 'transform', 'done')
    const added = doneWrites.reduce((sum, event) => sum + asNumber(event.added), 0)
    const updated = doneWrites.reduce((sum, event) => sum + asNumber(event.updated), 0)
    const deleted = doneWrites.reduce((sum, event) => sum + asNumber(event.deleted), 0)
    const skipped = doneWrites.reduce((sum, event) => sum + asNumber(event.skipped), 0)
    const doneSuccess = doneWrites.reduce((sum, event) => sum + asNumber(event.success), 0)
    const failed = latestFail ? Math.max(1, asNumber(latestFail.failed)) : doneWrites.reduce((sum, event) => sum + asNumber(event.failed), 0)
    const success = doneSuccess || added + updated + deleted
    const status: ImportMaterialStats['status'] = latestFail
      ? success > 0 ? 'partial' : 'failed'
      : failed > 0 ? success > 0 ? 'partial' : 'failed' : 'success'
    const fetchMs = terminalStageDurationMs(stageEvents, material, 'fetch')
    const transformMs = terminalStageDurationMs(stageEvents, material, 'transform')
    const enqueueMs = terminalStageDurationMs(stageEvents, material, 'enqueue')
    const databaseMs = terminalStageDurationMs(stageEvents, material, 'write')

    stats.set(material, {
      material,
      status,
      added,
      updated,
      deleted,
      success,
      failed,
      skipped,
      rejected: 0,
      recordsIn: asNumber(latestFetchDone?.recordsIn),
      recordsOut: asNumber(latestTransformDone?.recordsOut),
      warnings: [],
      errors: latestFail
        ? [{ id: material, reason: latestFail.message || 'Import failed' }]
        : [],
      timings: {
        fetchMs,
        transformMs,
        enqueueMs,
        databaseMs,
        totalMs: fetchMs + transformMs + enqueueMs + databaseMs,
      },
    })
  }

  return stats
}

const buildMaterialStats = (
  results: TriggerResult[],
  progressEvents?: ImportProgressEvent[] | null,
): ImportMaterialStats[] => {
  const progressStats = statsFromProgressHistory(progressEvents)
  return results.flatMap((result) => result.timings.map((timing) => {
    const stat = normalizeMaterialStats(
      timing,
      result.writeResults.find((item) => item.material === timing.material),
    )
    if (result.status !== 'fail') return stat
    return progressStats.get(timing.material) ?? stat
  }))
}

const zeroTiming = (material: ImportMaterial): ImportTiming => ({
  material,
  fetchMs: 0,
  transformMs: 0,
  enqueueMs: 0,
  databaseMs: 0,
  totalMs: 0,
  recordsIn: 0,
  recordsOut: 0,
  rejected: 0,
})

const failedWriteResult = (material: ImportMaterial, message: string): QueuedWriteResult => ({
  material,
  databaseMs: 0,
  result: {
    imported: 0,
    success: 0,
    failed: 1,
    skipped: 0,
    errors: [{ id: material, reason: message }],
  },
})

const buildFailedTriggerResult = (
  connectorCode: string,
  materials: ImportMaterial[],
  reason: unknown,
): TriggerResult => {
  const message = reason instanceof Error ? reason.message : String(reason)
  return {
    connectorCode,
    syncId: '',
    filteredCount: 0,
    rejectionFile: null,
    status: 'fail',
    timings: materials.map(zeroTiming),
    queueJobs: [],
    writeResults: materials.map((material) => failedWriteResult(material, message)),
  }
}

const connectorUrl = (path: string): string =>
  `${env.CONNECTOR_SERVER_URL.replace(/\/$/, '')}${path}`

const bearerHeader = (request: FastifyRequest): string | undefined => {
  const auth = request.headers.authorization
  return typeof auth === 'string' && auth.startsWith('Bearer ') ? auth : undefined
}

const materialsFromScope = (scope: z.infer<typeof importScopeSchema>): ImportMaterial[] => {
  const materials: ImportMaterial[] = []
  if (scope.crew) materials.push('crew')
  if (scope.flight) materials.push('flight')
  if (scope.pairing) materials.push('pairing')
  if (scope.roster) materials.push('roster')
  if (scope.rosterGround) materials.push('rosterGround')
  return materials
}

const fetchConnectorJson = async <T>(
  path: string,
  authorization: string,
  init?: RequestInit,
): Promise<ConnectorApiResponse<T>> => {
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Missing authorization token for connector trigger')
  }

  const url = new URL(connectorUrl(path))
  const client = url.protocol === 'https:' ? https : http
  const method = init?.method ?? 'GET'
  const body = typeof init?.body === 'string' ? init.body : undefined
  const headers: Record<string, string | number> = {
    Authorization: authorization,
    ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
  }

  return await new Promise<ConnectorApiResponse<T>>((resolve, reject) => {
    const req = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      timeout: CONNECTOR_REQUEST_TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: ConnectorApiResponse<T>
        try {
          json = JSON.parse(text) as ConnectorApiResponse<T>
        } catch (err) {
          reject(new Error(`Connector request returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`))
          return
        }
        const statusCode = res.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300 || json.code !== 200) {
          reject(new Error(json.message || `Connector request failed: HTTP ${statusCode}`))
          return
        }
        resolve(json)
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error(`Connector request timed out after ${CONNECTOR_REQUEST_TIMEOUT_MS}ms`))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const waitForQueuedImportJob = async (
  queuedJob: QueuedImportJob,
  log: FastifyBaseLogger,
): Promise<{ databaseMs: number; result: unknown }> => {
  const connection = getBullmqRedisConnection()
  const queue = new Queue(queuedJob.queueName, { connection })
  const queueEvents = new QueueEvents(queuedJob.queueName, { connection })
  attachBullmqErrorLogger(queue, log, `${queuedJob.queueName} import queue`)
  attachBullmqErrorLogger(queueEvents, log, `${queuedJob.queueName} import queue events`)
  try {
    await queueEvents.waitUntilReady()
    const job = await Job.fromId(queue, queuedJob.jobId)
    if (!job) throw new Error(`Import queue job ${queuedJob.queueName}/${queuedJob.jobId} was not found`)

    const initialState = await job.getState()
    let result: unknown
    if (initialState === 'completed') {
      result = job.returnvalue
    } else if (initialState === 'failed') {
      throw new Error(job.failedReason || `Import queue job ${queuedJob.jobId} failed`)
    } else {
      result = await job.waitUntilFinished(queueEvents, IMPORT_JOB_WAIT_TIMEOUT_MS)
    }

    const finishedJob = await Job.fromId(queue, queuedJob.jobId)
    const processedOn = finishedJob?.processedOn ?? job.processedOn ?? Date.now()
    const finishedOn = finishedJob?.finishedOn ?? Date.now()
    return { databaseMs: Math.max(0, finishedOn - processedOn), result }
  } finally {
    await queue.close()
    await queueEvents.close()
  }
}

const triggerConnector = async (
  authorization: string,
  connectorCode: string,
  startDt: string,
  endDt: string,
  scope: Record<string, boolean>,
  importId: string,
  log: FastifyBaseLogger,
): Promise<TriggerResult> => {
  const connectors = await fetchConnectorJson<ConnectorListItem[]>('/api/admin/connectors', authorization)
  const connector = connectors.data.find((item) =>
    (item.connectorCode ?? item.connector_code) === connectorCode &&
    item.isEnabled !== 0 &&
    item.isDeleted !== 1
  )
  if (!connector) throw new Error(`Connector ${connectorCode} is not enabled or was not found`)

  const query = new URLSearchParams({ startDt, endDt, importId })
  for (const [key, enabled] of Object.entries(scope)) {
    if (enabled) query.set(key, 'true')
  }
  const result = await fetchConnectorJson<ConnectorTriggerResult>(
    `/api/admin/connectors/${connector.id}/trigger?${query.toString()}`,
    authorization,
    { method: 'POST' },
  )
  if (result.data.status === 'fail') {
    throw new Error(`Connector ${connectorCode} import failed`)
  }

  const timings = [...(result.data.timings ?? [])]
  const writeResults: QueuedWriteResult[] = []
  for (const queuedJob of result.data.queueJobs ?? []) {
    const { databaseMs, result: writeResult } = await waitForQueuedImportJob(queuedJob, log)
    writeResults.push({ material: queuedJob.material, databaseMs, result: writeResult })
    const timing = timings.find((item) => item.material === queuedJob.material)
    if (timing) {
      timing.databaseMs = databaseMs
      timing.totalMs = materialTotalMs(timing, databaseMs)
    }
  }

  return {
    connectorCode,
    ...result.data,
    timings,
    writeResults,
  }
}

const runImportPbsMaterialBackground = async (input: BackgroundImportInput): Promise<void> => {
  const {
    importId,
    lease,
    redis,
    authorization,
    materials,
    filiale,
    startDt,
    endDt,
    rosterPeriodId,
    rosterPeriod,
    scope,
    log,
  } = input

  let leaseFailure: Error | null = null
  const heartbeat = mutationExclusiveService.startRenewal(
    redis,
    lease,
    (error) => { leaseFailure = error },
  )
  const ensureLease = async (): Promise<void> => {
    if (leaseFailure) throw leaseFailure
    await mutationExclusiveService.assertOwned(redis, lease)
  }

  try {
    await ensureLease()
    await publishImportProgress({
      type: 'started',
      importId,
      rosterPeriodId,
      rosterPeriod,
      startDt,
      endDt,
      materials,
      at: new Date().toISOString(),
    })

    const triggers: TriggerDescriptor[] = []
    const requiresOrderedMaterialWrite = scope.roster || scope.rosterGround || (scope.flight && scope.pairing)
    if (materials.length > 1 && requiresOrderedMaterialWrite) {
      const connectorCode = `${filiale}-roster-flight`
      triggers.push({
        connectorCode,
        materials,
        promise: triggerConnector(authorization, connectorCode, startDt, endDt, scope, importId, log),
      })
    } else {
      if (scope.crew) {
        const connectorCode = `${filiale}-crew`
        triggers.push({
          connectorCode,
          materials: ['crew'],
          promise: triggerConnector(authorization, connectorCode, startDt, endDt, { crew: true }, importId, log),
        })
      }
      if (scope.flight) {
        const connectorCode = `${filiale}-flight`
        triggers.push({
          connectorCode,
          materials: ['flight'],
          promise: triggerConnector(authorization, connectorCode, startDt, endDt, { flight: true }, importId, log),
        })
      }
      if (scope.pairing) {
        const connectorCode = `${filiale}-pairing`
        triggers.push({
          connectorCode,
          materials: ['pairing'],
          promise: triggerConnector(authorization, connectorCode, startDt, endDt, { pairing: true }, importId, log),
        })
      }
      if (scope.roster) {
        const connectorCode = `${filiale}-roster-flight`
        triggers.push({
          connectorCode,
          materials: ['roster'],
          promise: triggerConnector(authorization, connectorCode, startDt, endDt, { roster: true }, importId, log),
        })
      }
      if (scope.rosterGround) {
        const connectorCode = `${filiale}-roster-flight`
        triggers.push({
          connectorCode,
          materials: ['rosterGround'],
          promise: triggerConnector(authorization, connectorCode, startDt, endDt, { rosterGround: true }, importId, log),
        })
      }
    }

    const settled = await Promise.allSettled(triggers.map((trigger) => trigger.promise))
    await ensureLease()
    const results = settled.map((item, index) => {
      if (item.status === 'fulfilled') return item.value
      const trigger = triggers[index]
      log.error(
        { err: item.reason, importId, connectorCode: trigger.connectorCode },
        'Import PBS material connector trigger failed',
      )
      return buildFailedTriggerResult(trigger.connectorCode, trigger.materials, item.reason)
    })
    const progressEvents = await readImportProgressSnapshot(importId).catch((err: unknown) => {
      log.warn({ err, importId }, 'Failed to read import progress history for result aggregation')
      return null
    })
    const materialStats = buildMaterialStats(results, progressEvents)
    await ensureLease()
    await publishImportProgress({
      type: 'complete',
      importId,
      result: {
        rosterPeriodId,
        rosterPeriod,
        startDt,
        endDt,
        results,
        materialStats,
      },
      at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import PBS material'
    log.error({ err, importId }, 'Failed to import PBS material in background')
    await publishImportProgress({
      type: 'error',
      importId,
      message,
      at: new Date().toISOString(),
    })
  } finally {
    heartbeat.stop()
    await mutationExclusiveService.release(redis, lease).catch((err: unknown) => {
      log.warn({ err, importId }, 'Failed to release PBS material import mutation lease')
    })
  }
}

export default async function importPbsMaterialRoutes(fastify: FastifyInstance) {
  fastify.post('/import-pbs-material', async (request, reply) => {
    // Permission: SCENARIO_IMPORT_PBS ctl under SCENARIO_ALL — enforced globally
    // by plugins/permission.ts via api_uris='/api/scenario/import*'. No per-route
    // isAdmin gate: non-admin users with the ctl can import; admins still pass.
    const authUser = request.authUser
    if (!authUser) return fail(reply, 401, 'Not authenticated')

    const parsed = importBodySchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, parsed.error.message)

    const authorization = bearerHeader(request)
    if (!authorization) return fail(reply, 401, 'Missing authorization token for connector trigger')

    const liveSchema = asSafeIdentifier(authUser.schema ?? env.LIVE_SCHEMA)
    const client = await fastify.pgPool.connect()
    try {
      const period = await client.query<RosterPeriodRow>(
        `select id, roster_period, rp_start, rp_end
         from ${liveSchema}.roster_period
         where id = $1
         limit 1`,
        [parsed.data.rosterPeriodId],
      )
      const row = period.rows[0]
      if (!row) return fail(reply, 404, 'Roster period not found.')

      const filiale = asSafeIdentifier(await resolveFilialeLower(fastify))
      const startDt = asDateOnly(row.rp_start)
      const endDt = asDateOnly(row.rp_end)
      const scope = parsed.data.scope
      const materials = materialsFromScope(scope)
      const userCode = request.authUser?.userCode ?? 'unknown'
      const leaseResult = await mutationExclusiveService.tryAcquire(
        fastify.redis,
        liveSchema,
        'import-pbs-material',
        userCode,
      )
      if (!leaseResult.acquired) {
        return error(reply, 409, mutationConflictMessage('import-pbs-material', leaseResult.owner, userCode))
      }
      const importId = randomUUID()
      const rosterPeriodId = Number(row.id)
      const rosterPeriod = row.roster_period

      void runImportPbsMaterialBackground({
        importId,
        lease: leaseResult.lease,
        redis: fastify.redis,
        authorization,
        materials,
        filiale,
        startDt,
        endDt,
        rosterPeriodId,
        rosterPeriod,
        scope,
        log: fastify.log,
      }).catch((err: unknown) => {
        fastify.log.error({ err, importId }, 'background import failed')
      })

      return success(reply, {
        importId,
        rosterPeriodId,
        rosterPeriod,
        startDt,
        endDt,
        materials,
      })
    } catch (err) {
      fastify.log.error({ err }, 'Failed to start PBS material import')
      return fail(reply, 500, err instanceof Error ? err.message : 'Failed to start PBS material import')
    } finally {
      client.release()
    }
  })

  fastify.get('/import-pbs-material/:importId/events', async (request, reply) => {
    // Permission: same SCENARIO_IMPORT_PBS ctl as POST. Anyone who can start an
    // import can subscribe to its progress stream.

    const parsed = importIdParamSchema.safeParse(request.params)
    if (!parsed.success) return fail(reply, 400, 'Invalid importId')

    const { importId } = parsed.data
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    })
    reply.raw.flushHeaders?.()

    let cleaned = false
    const sub = createClient({ url: env.BULLMQ_REDIS_URL })
    sub.on('error', () => undefined)

    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      clearInterval(heartbeat)
      request.raw.off('close', cleanup)
      void sub.unsubscribe(importProgressChannel(importId))
        .catch(() => undefined)
        .finally(() => {
          void sub.quit().catch(() => undefined)
        })
      if (!reply.raw.writableEnded) reply.raw.end()
    }

    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(': heartbeat\n\n')
      }
    }, SSE_HEARTBEAT_MS)

    request.raw.on('close', cleanup)

    try {
      const snapshotEvents = await readImportProgressSnapshot(importId)
      if (snapshotEvents && !reply.raw.writableEnded) {
        for (const snapshot of snapshotEvents) {
          reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`)
        }
        const terminal = snapshotEvents.at(-1)
        if (terminal?.type === 'complete' || terminal?.type === 'error') {
          cleanup()
          return
        }
      }

      await sub.connect()
      await sub.subscribe(importProgressChannel(importId), (message) => {
        if (reply.raw.writableEnded) return
        reply.raw.write(`data: ${message}\n\n`)
        try {
          const parsedMessage = JSON.parse(message) as Pick<ImportProgressEvent, 'type'>
          if (parsedMessage.type === 'complete' || parsedMessage.type === 'error') {
            cleanup()
          }
        } catch {
          // ignore malformed bus payloads
        }
      })
    } catch (err) {
      fastify.log.error({ err, importId }, 'Failed to open import progress SSE stream')
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'error',
          importId,
          message: err instanceof Error ? err.message : 'Failed to subscribe to import progress',
          at: new Date().toISOString(),
        } satisfies ImportProgressEvent)}\n\n`)
      }
      cleanup()
    }
  })
}
