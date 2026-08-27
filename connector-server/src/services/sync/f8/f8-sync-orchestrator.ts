import { FlowProducer, QueueEvents, type FlowJob, type Job, type Queue } from 'bullmq'
import { withPrefix, withBullmqPrefix } from '../../../utils/redis-key-prefix.js'
import { randomUUID } from 'node:crypto'
import { format, addDays } from 'date-fns'
import type { FastifyInstance } from 'fastify'
import type { ConnectorConfig } from '../../../models/index.js'
import { queueBaseOptions } from '../../../plugins/bullmq.js'
import { connectorConfigService } from '../../connector/index.js'
import { f8TokenAuth } from '../../auth/index.js'
import { chunkDateRange, chunkByMonth, fetchWithChunkRetry } from '../../../utils/chunk-date.js'
import { getNextBatchDir, saveRawJson, type RawJsonTraceOptions } from '../../../utils/json-store.js'
import { saveRejectedRecords } from '../../../utils/rejection-store.js'
import { loadCrewSet } from '../../../utils/db-lookup.js'
import { publishImportProgress } from '../../../utils/import-progress-bus.js'
import { transformF8Flights } from '../../../transform/f8/db/transform-flight.js'
import { transformF8Crew } from '../../../transform/f8/db/transform-crew.js'
import { transformF8Pairings } from '../../../transform/f8/db/transform-pairing.js'
import { transformF8RosterFlight } from '../../../transform/f8/db/transform-roster.js'
import { transformF8RosterGround } from '../../../transform/f8/db/transform-roster-ground.js'
import { ALL_ROSTER_GROUND_ASSIGNMENTS } from '../../../transform/f8/db/normalize.js'
import { transformF8MandayFd, transformF8MandayCcAm } from '../../../transform/f8/db/transform-manday.js'
import type {
  FlightImportJob, CrewImportJob, PairingImportJob, RosterImportJob, RosterGroundImportJob,
  MandayImportJob,
} from '../../../types/import-jobs.js'
import type { ImportMaterial, ImportStage, ImportProgressEvent } from '../../../types/import-progress.js'

const DEFAULT_CHUNK_DAYS = 10
const DEFAULT_CHUNK_CONCURRENCY = 5
const DEFAULT_MAX_ROWS_PER_RESPONSE = 1000
const DEFAULT_SINGLE_DAY_RETRY_ATTEMPTS = 12
const DEFAULT_SINGLE_DAY_RETRY_DELAY_MS = 5000
const DEFAULT_SINGLE_DAY_RETRY_MAX_DELAY_MS = 60000
// rosterFlight/rosterGround responses are heavy and the upstream Lambda caps
// responses at ~6MB with a ~29s API-Gateway timeout. 30-day windows exceed both;
// 6-day windows let a 30-day roster period fan out across 5 concurrent requests
// while staying safely below the payload/timeout caps.
const ROSTER_CHUNK_DAYS = 6
const ROSTER_GROUND_FETCH_END_BUFFER_DAYS = 1
const DEFAULT_ROSTER_GROUND_CONCURRENCY = 4
const BATCH_SIZE = 200
const UTC_DAY_MS = 24 * 60 * 60 * 1000
const EARLY_WRITE_WAIT_TIMEOUT_MS = 30 * 60 * 1000

const QUEUE_NAME: Record<ImportMaterial, string> = {
  crew: withBullmqPrefix('connector.crew.inbound'),
  flight: withBullmqPrefix('connector.flight.inbound'),
  pairing: withBullmqPrefix('connector.pairing.inbound'),
  roster: withBullmqPrefix('connector.roster.inbound'),
  rosterGround: withBullmqPrefix('connector.roster_ground.inbound'),
}

const MATERIAL_WRITE_ORDER: Record<ImportMaterial, number> = {
  crew: 0,
  flight: 1,
  pairing: 2,
  roster: 3,
  rosterGround: 4,
}

const emitStage = async (
  importId: string | undefined,
  material: ImportMaterial,
  stage: ImportStage,
  status: 'running' | 'done' | 'fail',
  extra?: Partial<Pick<Extract<ImportProgressEvent, { type: 'stage' }>,
    'message' | 'recordsIn' | 'recordsOut' | 'processed' | 'total' | 'added' | 'updated' | 'deleted' | 'success' | 'failed' | 'skipped'
  >>,
): Promise<void> => {
  if (!importId) return
  await publishImportProgress({
    type: 'stage',
    importId,
    material,
    stage,
    status,
    at: new Date().toISOString(),
    ...extra,
  })
}

const summarizeF8Error = (value: unknown): string => {
  if (typeof value === 'string') return value.slice(0, 500)
  if (value instanceof Error) return value.message.slice(0, 500)
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value).slice(0, 500)
  }
}

const logF8RequestFailure = (
  startedAt: string,
  url: string,
  body: Record<string, unknown>,
  code: string | number,
  message: unknown,
): void => {
  console.warn(`[f8-request-failed] ${JSON.stringify({
    requestedAt: startedAt,
    url,
    body,
    code,
    message: summarizeF8Error(message),
  })}`)
}

async function f8Post(url: string, token: string, body: Record<string, unknown>): Promise<unknown[]> {
  const requestedAt = new Date().toISOString()
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', AuthorizationToken: token },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logF8RequestFailure(requestedAt, url, body, 'FETCH_ERROR', err)
    throw err
  }
  if (res.status === 401 || res.status === 403) {
    logF8RequestFailure(requestedAt, url, body, res.status, `F8 auth error: ${res.status}`)
    const err = new Error(`F8 auth error: ${res.status}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  if (!res.ok) {
    logF8RequestFailure(requestedAt, url, body, res.status, `F8 HTTP ${res.status}: ${url}`)
    const err = new Error(`F8 HTTP ${res.status}: ${url}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  const json = await res.json()
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const j = json as { errorMessage?: string; errorType?: string; statusCode?: number; body?: unknown }
    // Lambda function error (HTTP 200 w/ errorMessage), e.g. payload > 6MB.
    if (j.errorMessage || j.errorType) {
      throw new Error(`F8 upstream error: ${(j.errorType ?? '')} ${(j.errorMessage ?? '')}`.trim())
    }
    // API-Gateway-wrapped upstream error, e.g. { statusCode: 502, body: "{error: Navblue 500}" }.
    if (typeof j.statusCode === 'number' && j.statusCode >= 400) {
      const detail = typeof j.body === 'string' ? j.body : JSON.stringify(j.body)
      logF8RequestFailure(requestedAt, url, body, j.statusCode, detail)
      throw new Error(`F8 upstream ${j.statusCode}: ${String(detail).slice(0, 160)}`)
    }
  }
  return extractList(json)
}

/**
 * Normalize an F8 response into a list. Endpoints are inconsistent:
 * some return a top-level array, some wrap it API-Gateway-style in
 * `{ statusCode, body }` where `body` may be a (double-encoded) JSON string.
 */
function extractList(data: unknown): unknown[] {
  let payload = data
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'body' in payload) {
    payload = (payload as { body: unknown }).body
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch { return [] }
    }
  }
  if (Array.isArray(payload)) return payload
  const obj = payload as Record<string, unknown> | null
  return (obj?.['data'] as unknown[]) ?? (obj?.['list'] as unknown[]) ?? []
}

async function getToken(config: ConnectorConfig): Promise<string> {
  return f8TokenAuth.getAccessToken(config)
}

type BodyBuilder = (startDt: string, endDt: string) => Record<string, unknown>

const defaultBody: BodyBuilder = (s, e) => ({ startDt: s, endDt: e })

const addUtcDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

// The pairing endpoint treats endDt as exclusive, unlike the other F8 date APIs.
// Keep the connector's sync range inclusive and expand only the upstream request.
const pairingBody: BodyBuilder = (s, e) => ({ startDt: s, endDt: addUtcDays(e, 1) })

const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length) as R[]
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index]!, index)
    }
  }))

  return results
}

export interface F8ImportScope {
  flight?: boolean
  pairing?: boolean
  roster?: boolean
  rosterGround?: boolean
  crew?: boolean
  manday?: boolean
}

export interface F8ImportTiming {
  material: string
  fetchMs: number
  transformMs: number
  enqueueMs: number
  recordsIn: number
  recordsOut: number
  rejected: number
}

export interface F8ImportQueuedJob {
  material: string
  queueName: string
  jobId: string
}

export interface F8ImportSyncResult {
  syncId: string
  filteredCount: number
  rejectionFile: string | null
  timings: F8ImportTiming[]
  queueJobs: F8ImportQueuedJob[]
}

const hasExplicitScope = (scope?: F8ImportScope): scope is F8ImportScope =>
  Boolean(scope && Object.values(scope).some(Boolean))

const rowCapOptions = (config: ConnectorConfig) => {
  const ep = config.endpointConfig as {
    maxRowsPerResponse?: number
    singleDayRetryAttempts?: number
    singleDayRetryDelayMs?: number
    singleDayRetryMaxDelayMs?: number
  }
  return {
    maxRowsPerResponse: ep.maxRowsPerResponse ?? DEFAULT_MAX_ROWS_PER_RESPONSE,
    splitOnCap: true,
    failOnSingleDayCap: true,
    failOnRepeatedFailure: true,
    singleDayRetryAttempts: ep.singleDayRetryAttempts ?? DEFAULT_SINGLE_DAY_RETRY_ATTEMPTS,
    singleDayRetryDelayMs: ep.singleDayRetryDelayMs ?? DEFAULT_SINGLE_DAY_RETRY_DELAY_MS,
    singleDayRetryMaxDelayMs: ep.singleDayRetryMaxDelayMs ?? DEFAULT_SINGLE_DAY_RETRY_MAX_DELAY_MS,
  }
}

async function fetchChunked(
  config: ConnectorConfig,
  url: string,
  startDt: string,
  endDt: string,
  filiale: string,
  entity: string,
  buildBody: BodyBuilder = defaultBody,
  chunkDaysOverride?: number,
  rawJsonTrace?: RawJsonTraceOptions,
): Promise<unknown[]> {
  const ep = config.endpointConfig as { chunkDays?: number; chunkConcurrency?: number }
  const chunkDays = chunkDaysOverride ?? ep.chunkDays ?? DEFAULT_CHUNK_DAYS
  const chunkConcurrency = ep.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY
  const chunks = chunkDateRange(startDt, endDt, chunkDays)
  const chunkResults = await runWithConcurrency(chunks, chunkConcurrency, async (chunk) => {
    const token = await getToken(config)
    const fetchFn = async (s: string, e: string) => {
      return f8Post(url, token, buildBody(s, e))
    }
    const raw = await fetchWithChunkRetry(fetchFn, chunk.startDt, chunk.endDt, chunkDays, rowCapOptions(config))
    await saveRawJson(entity, filiale, chunk.startDt, chunk.endDt, raw, rawJsonTrace)
    return raw
  })

  return chunkResults.flat()
}

interface RosterGroundRaw {
  groundRaw: unknown[]
  singleLegRaw: unknown[]
  ignoredPaired: number
  ignoredPairedRecords: unknown[]
}

const dateOnlyUtcMs = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

const f8UtcMs = (value: unknown): number => {
  if (typeof value !== 'string' || value.trim().length === 0) return Number.NaN
  return Date.parse(value.replace(' ', 'T'))
}

const isBeforeRosterGroundEndCutoff = (record: unknown, endDt: string): boolean => {
  const startMs = f8UtcMs((record as Record<string, unknown>)?.['startTimeUtc'])
  if (!Number.isFinite(startMs)) return true
  return startMs < dateOnlyUtcMs(endDt) + UTC_DAY_MS
}

/**
 * Fetch all rosterGround assignment types. Records with pairingId > 0 are
 * already covered by the pairing/roster syncs and must be ignored regardless
 * of assignment type (Transport/DHD can also carry a pairingId). Only Flight
 * records with pairingId=0 are materialized later as single legs; unpaired
 * non-Flight records are ground duties.
 */
async function fetchRosterGround(
  config: ConnectorConfig,
  url: string,
  startDt: string,
  endDt: string,
  filiale: string,
  rawJsonTrace?: RawJsonTraceOptions,
): Promise<RosterGroundRaw> {
  const ep = config.endpointConfig as { rosterGroundConcurrency?: number; chunkConcurrency?: number }
  const chunkDays = ROSTER_CHUNK_DAYS
  const fetchEndDt = format(addDays(new Date(`${endDt}T00:00:00Z`), ROSTER_GROUND_FETCH_END_BUFFER_DAYS), 'yyyy-MM-dd')
  const chunks = chunkDateRange(startDt, fetchEndDt, chunkDays)
  const concurrency = ep.rosterGroundConcurrency ?? ep.chunkConcurrency ?? DEFAULT_ROSTER_GROUND_CONCURRENCY
  const groundRaw: unknown[] = []
  const singleLegRaw: unknown[] = []
  const ignoredPairedRecords: unknown[] = []
  let ignoredPaired = 0

  const tasks = ALL_ROSTER_GROUND_ASSIGNMENTS.flatMap((assignment) =>
    chunks.map((chunk) => ({ assignment, chunk })),
  )

  const results = await runWithConcurrency(tasks, concurrency, async ({ assignment, chunk }) => {
    const token = await getToken(config)
    const fetchFn = async (s: string, e: string) =>
      f8Post(url, token, { startDt: s, endDt: e, assignment })
    const raw = await fetchWithChunkRetry(fetchFn, chunk.startDt, chunk.endDt, chunkDays, rowCapOptions(config))
    await saveRawJson('roster_ground', filiale, chunk.startDt, chunk.endDt, raw, {
      ...rawJsonTrace,
      suffix: assignment,
    })
    return {
      assignment,
      raw: raw.filter((record) => isBeforeRosterGroundEndCutoff(record, endDt)),
    }
  })

  for (const { assignment, raw } of results) {
    for (const rec of raw) {
      const pairingId = Number((rec as Record<string, unknown>)['pairingId'] ?? 0)
      if (pairingId > 0) {
        ignoredPaired++
        ignoredPairedRecords.push(rec)
      } else if (assignment === 'Flight') {
        singleLegRaw.push(rec)
      } else {
        groundRaw.push(rec)
      }
    }
  }

  return { groundRaw, singleLegRaw, ignoredPaired, ignoredPairedRecords }
}

function computeRange(config: ConnectorConfig): { startDt: string; endDt: string } {
  const ep = config.endpointConfig as { pollBodyDays?: number }
  const days = ep.pollBodyDays ?? 30
  const today = new Date()
  return {
    startDt: format(today, 'yyyy-MM-dd'),
    endDt: format(addDays(today, days), 'yyyy-MM-dd'),
  }
}

/** Map BullMQ queue name → import material for flow-job collection. */
const materialFromQueueName = (queueName: string): ImportMaterial | null => {
  for (const [material, name] of Object.entries(QUEUE_NAME) as Array<[ImportMaterial, string]>) {
    if (name === queueName) return material
  }
  return null
}

interface FlowJobNode {
  job: { id?: string; queueName: string }
  children?: FlowJobNode[]
}

/** Walk a FlowProducer JobNode tree and append queued job entries. */
const collectFlowQueueJobs = (node: FlowJobNode, queueJobs: F8ImportQueuedJob[]): void => {
  const material = materialFromQueueName(node.job.queueName)
  if (material && node.job.id) {
    queueJobs.push({
      material,
      queueName: node.job.queueName,
      jobId: String(node.job.id),
    })
  }
  for (const child of node.children ?? []) {
    collectFlowQueueJobs(child, queueJobs)
  }
}

export async function runF8ImportSync(
  fastify: FastifyInstance,
  config: ConnectorConfig,
  overrideStartDt?: string,
  overrideEndDt?: string,
  scope?: F8ImportScope,
  importId?: string,
): Promise<F8ImportSyncResult> {
  const syncId = randomUUID()
  const filiale = config.connectorCode.split('-')[0].toUpperCase()
  const batchDir = await getNextBatchDir(filiale)
  const rawJsonTrace: RawJsonTraceOptions = {
    syncId,
    importId,
    timestamp: new Date().toISOString(),
    batchDir,
  }
  const { startDt, endDt } = overrideStartDt
    ? { startDt: overrideStartDt, endDt: overrideEndDt! }
    : computeRange(config)

  const ep = config.endpointConfig as {
    url: string; rosterGroundUrl?: string; chunkDays?: number
  }

  const flow = new FlowProducer(queueBaseOptions)
  const meta = {
    syncId,
    filiale,
    syncRangeDt: [startDt, endDt] as [string, string],
    ...(importId ? { importId } : {}),
  }
  const timings: F8ImportTiming[] = []
  const queueJobs: F8ImportQueuedJob[] = []
  const explicitScope = hasExplicitScope(scope)
  const jobOpts = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  }

  // Manday API requires startUtc/endUtc (not startDt/endDt like other endpoints)
  const mandayBody = (s: string, e: string): Record<string, unknown> => ({
    startUtc: `${s} 00:00:00`,
    endUtc:   `${e} 23:59:59`,
  })

  // Manday connectors are handled before flight fetch — they don't need flight data
  // and share the same F8 endpoint regardless of FD/CC type.
  if (config.connectorCode === `${filiale.toLowerCase()}-manday-fd`) {
    const months = chunkByMonth(startDt, endDt)
    const jobOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    }
    for (const month of months) {
      const token = await getToken(config)
      const fetchFn = async (s: string, e: string) =>
        f8Post(ep.url, token, mandayBody(s, e))
      const raw = await fetchWithChunkRetry(fetchFn, month.startDt, month.endDt, 10, rowCapOptions(config))
      await saveRawJson('manday_fd', filiale, month.startDt, month.endDt, raw, rawJsonTrace)
      const records = transformF8MandayFd(raw)
      if (records.length === 0) continue
      const job: MandayImportJob = { ...meta, tableType: 'fd', records, syncRangeDt: [month.startDt, month.endDt] }
      await fastify.queues.mandayInbound.add(`manday-fd-${month.startDt}`, job, jobOpts)
    }
    return { syncId, filteredCount: 0, rejectionFile: null, timings, queueJobs }
  }

  if (config.connectorCode === `${filiale.toLowerCase()}-manday-cc-am`) {
    const months = chunkByMonth(startDt, endDt)
    const jobOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    }
    for (const month of months) {
      const token = await getToken(config)
      const fetchFn = async (s: string, e: string) =>
        f8Post(ep.url, token, mandayBody(s, e))
      const raw = await fetchWithChunkRetry(fetchFn, month.startDt, month.endDt, 10, rowCapOptions(config))
      await saveRawJson('manday_cc_am', filiale, month.startDt, month.endDt, raw, rawJsonTrace)
      const records = transformF8MandayCcAm(raw)
      if (records.length === 0) continue
      const job: MandayImportJob = { ...meta, tableType: 'cc_am', records, syncRangeDt: [month.startDt, month.endDt] }
      await fastify.queues.mandayInbound.add(`manday-cc-am-${month.startDt}`, job, jobOpts)
    }
    return { syncId, filteredCount: 0, rejectionFile: null, timings, queueJobs }
  }

  if (explicitScope) {
    let filteredCount = 0
    let rejectionFile: string | null = null
    const waitForQueuedJob = async (queueName: string, job: Job): Promise<void> => {
      const queueEvents = new QueueEvents(queueName, queueBaseOptions)
      try {
        await queueEvents.waitUntilReady()
        await job.waitUntilFinished(queueEvents, EARLY_WRITE_WAIT_TIMEOUT_MS)
      } finally {
        await queueEvents.close()
      }
    }

    const queueForMaterial = (material: ImportMaterial): Queue => {
      switch (material) {
        case 'crew':
          return fastify.queues.crewInbound
        case 'flight':
          return fastify.queues.flightInbound
        case 'pairing':
          return fastify.queues.pairingInbound
        case 'roster':
          return fastify.queues.rosterInbound
        case 'rosterGround':
          return fastify.queues.rosterGroundInbound
      }
    }

    const waitForQueuedEntries = async (entries: F8ImportQueuedJob[]): Promise<void> => {
      await Promise.all(entries.map(async (entry) => {
        const job = await queueForMaterial(entry.material as ImportMaterial).getJob(entry.jobId)
        if (!job) throw new Error(`Queued import job ${entry.jobId} was not found in ${entry.queueName}`)
        await waitForQueuedJob(entry.queueName, job)
      }))
    }

    const enqueueImmediateWriteJob = async (
      material: ImportMaterial,
      name: string,
      data: CrewImportJob | FlightImportJob | RosterImportJob | RosterGroundImportJob,
      queue: Queue,
    ): Promise<Promise<void>> => {
      const queueName = QUEUE_NAME[material]
      await emitStage(importId, material, 'enqueue', 'running')
      let queuedJob: Job
      try {
        queuedJob = await queue.add(name, data, jobOpts)
      } catch (err) {
        throw err
      }
      if (queuedJob.id) {
        queueJobs.push({
          material,
          queueName,
          jobId: String(queuedJob.id),
        })
      }
      await emitStage(importId, material, 'enqueue', 'done')
      return waitForQueuedJob(queueName, queuedJob)
    }

    const enqueueDependentWriteJobs = async (
      items: Array<{ material: ImportMaterial; node: FlowJob; sequence: number }>,
    ): Promise<F8ImportQueuedJob[]> => {
      if (items.length === 0) return []
      let tail: FlowJob | null = null
      const sortedWriteJobs = [...items].sort((a, b) => {
        const materialDelta = MATERIAL_WRITE_ORDER[a.material] - MATERIAL_WRITE_ORDER[b.material]
        return materialDelta !== 0 ? materialDelta : a.sequence - b.sequence
      })
      for (const item of sortedWriteJobs) {
        await emitStage(importId, item.material, 'enqueue', 'running')
      }
      for (const item of sortedWriteJobs) {
        tail = {
          ...item.node,
          children: tail ? [tail] : undefined,
        }
      }
      if (!tail) return []
      try {
        const flowResult = await flow.add(tail) as unknown as FlowJobNode
        const collectedQueueJobs: F8ImportQueuedJob[] = []
        collectFlowQueueJobs(flowResult, collectedQueueJobs)
        queueJobs.push(...collectedQueueJobs)
        for (const item of sortedWriteJobs) {
          await emitStage(importId, item.material, 'enqueue', 'done')
        }
        return collectedQueueJobs
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        for (const item of sortedWriteJobs) {
          await emitStage(importId, item.material, 'enqueue', 'fail', { message })
        }
        throw err
      }
    }

    const crewTask = scope.crew ? (async (): Promise<void> => {
      let currentStage: ImportStage = 'fetch'
      try {
        const crewConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-crew`)
        const crewEndpoint = (crewConfig?.endpointConfig as { url?: string } | undefined)?.url ?? ep.url
        const fetchStartedAt = Date.now()
        await emitStage(importId, 'crew', 'fetch', 'running')
        const rawCrew = await fetchChunked(crewConfig ?? config, crewEndpoint, startDt, endDt, filiale, 'crew', defaultBody, undefined, rawJsonTrace)
        const fetchMs = Date.now() - fetchStartedAt
        await emitStage(importId, 'crew', 'fetch', 'done', { recordsIn: rawCrew.length })
        const transformStartedAt = Date.now()
        currentStage = 'transform'
        await emitStage(importId, 'crew', 'transform', 'running')
        const crewRecords = transformF8Crew(rawCrew, filiale)
        const transformMs = Date.now() - transformStartedAt
        await emitStage(importId, 'crew', 'transform', 'done', { recordsOut: crewRecords.length })
        const enqueueStartedAt = Date.now()
        currentStage = 'enqueue'
        const crewJob: CrewImportJob = { ...meta, records: crewRecords }
        const writePromise = await enqueueImmediateWriteJob('crew', 'crew-import', crewJob, fastify.queues.crewInbound)
        const enqueueMs = Date.now() - enqueueStartedAt
        timings.push({
          material: 'crew',
          fetchMs,
          transformMs,
          enqueueMs,
          recordsIn: rawCrew.length,
          recordsOut: crewRecords.length,
          rejected: 0,
        })
        currentStage = 'write'
        await writePromise
      } catch (err) {
        if (currentStage !== 'write') {
          await emitStage(importId, 'crew', currentStage, 'fail', {
            message: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    })() : Promise.resolve()
    crewTask.catch(() => undefined)

    const flightTask = scope.flight ? (async (): Promise<void> => {
      let currentStage: ImportStage = 'fetch'
      try {
        const flightConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-flight`)
        const flightUrl = (flightConfig?.endpointConfig as { url?: string } | undefined)?.url ?? ep.url
        const fetchStartedAt = Date.now()
        await emitStage(importId, 'flight', 'fetch', 'running')
        const rawFlights = await fetchChunked(flightConfig ?? config, flightUrl, startDt, endDt, filiale, 'flight', defaultBody, undefined, rawJsonTrace)
        const fetchMs = Date.now() - fetchStartedAt
        await emitStage(importId, 'flight', 'fetch', 'done', { recordsIn: rawFlights.length })
        const transformStartedAt = Date.now()
        currentStage = 'transform'
        await emitStage(importId, 'flight', 'transform', 'running')
        const flightRecords = transformF8Flights(rawFlights, filiale)
        const transformMs = Date.now() - transformStartedAt
        await emitStage(importId, 'flight', 'transform', 'done', { recordsOut: flightRecords.length })
        const enqueueStartedAt = Date.now()
        currentStage = 'enqueue'
        const flightJob: FlightImportJob = { ...meta, records: flightRecords }
        const writePromise = await enqueueImmediateWriteJob('flight', 'flight-import', flightJob, fastify.queues.flightInbound)
        const enqueueMs = Date.now() - enqueueStartedAt
        timings.push({
          material: 'flight',
          fetchMs,
          transformMs,
          enqueueMs,
          recordsIn: rawFlights.length,
          recordsOut: flightRecords.length,
          rejected: 0,
        })
        currentStage = 'write'
        await writePromise
      } catch (err) {
        if (currentStage !== 'write') {
          await emitStage(importId, 'flight', currentStage, 'fail', {
            message: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    })() : Promise.resolve()
    flightTask.catch(() => undefined)

    const pairingTask = scope.pairing ? (async (): Promise<Array<{ material: ImportMaterial; node: FlowJob; sequence: number }>> => {
      try {
        const pairingConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-pairing`)
        const pairingUrl = (pairingConfig?.endpointConfig as { url?: string } | undefined)?.url ?? ep.url
        const fetchStartedAt = Date.now()
        await emitStage(importId, 'pairing', 'fetch', 'running')
        const rawPairings = await fetchChunked(pairingConfig ?? config, pairingUrl, startDt, endDt, filiale, 'pairing', pairingBody, undefined, rawJsonTrace)
        const fetchMs = Date.now() - fetchStartedAt
        await emitStage(importId, 'pairing', 'fetch', 'done', { recordsIn: rawPairings.length })
        const transformStartedAt = Date.now()
        await emitStage(importId, 'pairing', 'transform', 'running')
        const pairingRecords = transformF8Pairings(rawPairings)
        const transformMs = Date.now() - transformStartedAt
        await emitStage(importId, 'pairing', 'transform', 'done', { recordsOut: pairingRecords.length })
        const enqueueStartedAt = Date.now()
        const snapshotPairingInterfaceIds = [...new Set(pairingRecords.map((pairing) => pairing.interfaceId).filter(Boolean))]
        const jobs: Array<{ material: ImportMaterial; node: FlowJob; sequence: number }> = []
        let sequence = 0
        for (let i = 0; i < pairingRecords.length; i += BATCH_SIZE) {
          const pairingJob: PairingImportJob = {
            ...meta,
            pairings: pairingRecords.slice(i, i + BATCH_SIZE),
            purgeStalePairings: i === 0,
            snapshotPairingInterfaceIds: i === 0 ? snapshotPairingInterfaceIds : undefined,
          }
          jobs.push({
            material: 'pairing',
            sequence: sequence++,
            node: {
              name: 'pairing-import',
              queueName: QUEUE_NAME.pairing,
              data: pairingJob,
              opts: jobOpts,
            },
          })
        }
        if (pairingRecords.length === 0) {
          const pairingJob: PairingImportJob = { ...meta, pairings: [], purgeStalePairings: true, snapshotPairingInterfaceIds: [] }
          jobs.push({
            material: 'pairing',
            sequence: sequence++,
            node: {
              name: 'pairing-import',
              queueName: QUEUE_NAME.pairing,
              data: pairingJob,
              opts: jobOpts,
            },
          })
        }
        const enqueueMs = Date.now() - enqueueStartedAt
        timings.push({
          material: 'pairing',
          fetchMs,
          transformMs,
          enqueueMs,
          recordsIn: rawPairings.length,
          recordsOut: pairingRecords.length,
          rejected: 0,
        })
        return jobs
      } catch (err) {
        await emitStage(importId, 'pairing', 'fetch', 'fail', {
          message: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    })() : Promise.resolve([])

    const crewSetTask = (scope.roster || scope.rosterGround)
      ? loadCrewSet(fastify.db)
      : Promise.resolve(new Set<string>())
    crewSetTask.catch(() => undefined)

    const rosterTask = scope.roster ? (async (): Promise<{ material: ImportMaterial; node: FlowJob; sequence: number } | null> => {
          try {
            const crewSet = await crewSetTask
            const fetchStartedAt = Date.now()
            await emitStage(importId, 'roster', 'fetch', 'running')
            const rawRoster = await fetchChunked(
              config, ep.url, startDt, endDt, filiale, 'roster_flight',
              (s, e) => ({ startUtc: `${s} 00:00:00`, endUtc: `${e} 23:59:59`, owner: filiale }),
              ROSTER_CHUNK_DAYS,
              rawJsonTrace,
            )
            const fetchMs = Date.now() - fetchStartedAt
            await emitStage(importId, 'roster', 'fetch', 'done', { recordsIn: rawRoster.length })
            const transformStartedAt = Date.now()
            await emitStage(importId, 'roster', 'transform', 'running')
            const { records: rosterRecords, rejected } = transformF8RosterFlight(rawRoster, crewSet, filiale)
            const transformMs = Date.now() - transformStartedAt
            await emitStage(importId, 'roster', 'transform', 'done', { recordsOut: rosterRecords.length })
            if (rejected.length > 0) {
              rejectionFile = await saveRejectedRecords('roster_flight', filiale, rejected)
            }
            filteredCount += rejected.length
            const enqueueStartedAt = Date.now()
            const rosterJob: RosterImportJob = {
              ...meta,
              records: rosterRecords,
              filteredCount: rejected.length,
              rejectionFile,
            }
            const enqueueMs = Date.now() - enqueueStartedAt
            timings.push({
              material: 'roster',
              fetchMs,
              transformMs,
              enqueueMs,
              recordsIn: rawRoster.length,
              recordsOut: rosterRecords.length,
              rejected: rejected.length,
            })
            return {
              material: 'roster',
              sequence: 0,
              node: {
                name: 'roster-import',
                queueName: QUEUE_NAME.roster,
                data: rosterJob,
                opts: jobOpts,
              },
            }
          } catch (err) {
            await emitStage(importId, 'roster', 'fetch', 'fail', {
              message: err instanceof Error ? err.message : String(err),
            })
            throw err
          }
        })() : Promise.resolve(null)

    const rosterGroundTask = scope.rosterGround ? (async (): Promise<{ material: ImportMaterial; node: FlowJob; sequence: number } | null> => {
          try {
            const crewSet = await crewSetTask
            const rosterGroundUrl = ep.rosterGroundUrl
            if (!rosterGroundUrl) {
              throw new Error('F8 rosterGroundUrl is not configured for roster-ground import')
            }
            const fetchStartedAt = Date.now()
            await emitStage(importId, 'rosterGround', 'fetch', 'running')
            const { groundRaw, singleLegRaw, ignoredPairedRecords } = await fetchRosterGround(
              config, rosterGroundUrl, startDt, endDt, filiale, rawJsonTrace,
            )
            const fetchMs = Date.now() - fetchStartedAt
            await emitStage(importId, 'rosterGround', 'fetch', 'done', {
              recordsIn: groundRaw.length + singleLegRaw.length,
            })
            const transformStartedAt = Date.now()
            await emitStage(importId, 'rosterGround', 'transform', 'running')
            const { groundRecords, singleLegRecords, rejected } =
              transformF8RosterGround(groundRaw, singleLegRaw, crewSet, filiale)
            rejected.push(...ignoredPairedRecords.map((raw) => ({
              crewId: String((raw as Record<string, unknown>)['crewId'] ?? ''),
              reason: 'roster_ground: pairingId > 0 ignored; covered by roster import',
              raw,
            })))
            const transformMs = Date.now() - transformStartedAt
            await emitStage(importId, 'rosterGround', 'transform', 'done', {
              recordsOut: groundRecords.length + singleLegRecords.length,
            })
            const rgRejectionFile = rejected.length > 0
              ? await saveRejectedRecords('roster_ground', filiale, rejected)
              : null
            filteredCount += rejected.length
            const rosterGroundJob: RosterGroundImportJob = {
              ...meta,
              groundRecords,
              singleLegRecords,
              filteredCount: rejected.length,
              rejectionFile: rgRejectionFile,
            }
            const enqueueStartedAt = Date.now()
            const enqueueMs = Date.now() - enqueueStartedAt
            timings.push({
              material: 'rosterGround',
              fetchMs,
              transformMs,
              enqueueMs,
              recordsIn: groundRaw.length + singleLegRaw.length,
              recordsOut: groundRecords.length + singleLegRecords.length,
              rejected: rejected.length,
            })
            return {
              material: 'rosterGround',
              sequence: 0,
              node: {
                name: 'roster-ground-import',
                queueName: QUEUE_NAME.rosterGround,
                data: rosterGroundJob,
                opts: jobOpts,
              },
            }
          } catch (err) {
            await emitStage(importId, 'rosterGround', 'fetch', 'fail', {
              message: err instanceof Error ? err.message : String(err),
            })
            throw err
          }
        })() : Promise.resolve(null)

    const pairingWriteTask = (async (): Promise<void> => {
      const pairingJobs = await pairingTask
      if (pairingJobs.length === 0) return
      await flightTask
      const entries = await enqueueDependentWriteJobs(pairingJobs)
      await waitForQueuedEntries(entries)
    })()
    pairingWriteTask.catch(() => undefined)

    const rosterWriteTask = (async (): Promise<void> => {
      const [rosterJobNode, rosterGroundJobNode] = await Promise.all([rosterTask, rosterGroundTask])
      if (!rosterJobNode) return
      await Promise.all([crewTask, pairingWriteTask])
      const rosterJob = rosterJobNode.node.data as RosterImportJob
      const writePromise = await enqueueImmediateWriteJob(
        'roster',
        'roster-import',
        rosterGroundJobNode
          ? { ...rosterJob, deferMandayRecompute: true }
          : rosterJob,
        fastify.queues.rosterInbound,
      )
      await writePromise
    })()
    rosterWriteTask.catch(() => undefined)

    const rosterGroundWriteTask = (async (): Promise<void> => {
      const rosterGroundJobNode = await rosterGroundTask
      if (!rosterGroundJobNode) return
      await Promise.all([
        crewTask,
        flightTask,
        scope.roster ? rosterWriteTask : pairingWriteTask,
      ])
      const writePromise = await enqueueImmediateWriteJob(
        'rosterGround',
        'roster-ground-import',
        rosterGroundJobNode.node.data as RosterGroundImportJob,
        fastify.queues.rosterGroundInbound,
      )
      await writePromise
    })()

    await Promise.all([
      crewTask,
      flightTask,
      pairingWriteTask,
      rosterWriteTask,
      rosterGroundWriteTask,
    ])

    await flow.close()
    timings.sort((a, b) =>
      MATERIAL_WRITE_ORDER[a.material as ImportMaterial] - MATERIAL_WRITE_ORDER[b.material as ImportMaterial],
    )
    return { syncId, filteredCount, rejectionFile, timings, queueJobs }
  }

  // Always fetch flight data (non-manday connectors only).
  // Crew-only path still fetches flights (legacy) but does not enqueue them.
  const emitFlightStages = config.connectorCode !== `${filiale.toLowerCase()}-crew`
  let flightJob: FlightImportJob
  try {
    const flightConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-flight`)
    const flightUrl = flightConfig?.endpointConfig ? (flightConfig.endpointConfig as { url: string }).url : ep.url
    if (emitFlightStages) {
      await emitStage(importId, 'flight', 'fetch', 'running')
    }
    const rawFlights = await fetchChunked(flightConfig ?? config, flightUrl, startDt, endDt, filiale, 'flight', defaultBody, undefined, rawJsonTrace)
    if (emitFlightStages) {
      await emitStage(importId, 'flight', 'fetch', 'done', { recordsIn: rawFlights.length })
      await emitStage(importId, 'flight', 'transform', 'running')
    }
    const flightRecords = transformF8Flights(rawFlights, filiale)
    if (emitFlightStages) {
      await emitStage(importId, 'flight', 'transform', 'done', { recordsOut: flightRecords.length })
    }
    flightJob = { ...meta, records: flightRecords }
  } catch (err) {
    if (emitFlightStages) {
      await emitStage(importId, 'flight', 'fetch', 'fail', {
        message: err instanceof Error ? err.message : String(err),
      })
    }
    throw err
  }

  if (config.connectorCode === `${filiale.toLowerCase()}-crew`) {
    // Crew-only sync
    try {
      await emitStage(importId, 'crew', 'fetch', 'running')
      const rawCrew = await fetchChunked(config, ep.url, startDt, endDt, filiale, 'crew', defaultBody, undefined, rawJsonTrace)
      await emitStage(importId, 'crew', 'fetch', 'done', { recordsIn: rawCrew.length })
      await emitStage(importId, 'crew', 'transform', 'running')
      const crewRecords = transformF8Crew(rawCrew, filiale)
      await emitStage(importId, 'crew', 'transform', 'done', { recordsOut: crewRecords.length })
      await emitStage(importId, 'crew', 'enqueue', 'running')
      const crewJob: CrewImportJob = { ...meta, records: crewRecords }
      const queuedJob = await fastify.queues.crewInbound.add('crew-import', crewJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      })
      await emitStage(importId, 'crew', 'enqueue', 'done')
      if (queuedJob.id) {
        queueJobs.push({
          material: 'crew',
          queueName: QUEUE_NAME.crew,
          jobId: String(queuedJob.id),
        })
      }
      await flow.close()
      return { syncId, filteredCount: 0, rejectionFile: null, timings, queueJobs }
    } catch (err) {
      await emitStage(importId, 'crew', 'fetch', 'fail', {
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  if (config.connectorCode === `${filiale.toLowerCase()}-flight`) {
    // Flight-only sync — enqueue just the flight job (own date range).
    try {
      await emitStage(importId, 'flight', 'enqueue', 'running')
      const queuedJob = await fastify.queues.flightInbound.add('flight-import', flightJob, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      })
      await emitStage(importId, 'flight', 'enqueue', 'done')
      if (queuedJob.id) {
        queueJobs.push({
          material: 'flight',
          queueName: QUEUE_NAME.flight,
          jobId: String(queuedJob.id),
        })
      }
      await flow.close()
      return { syncId, filteredCount: 0, rejectionFile: null, timings, queueJobs }
    } catch (err) {
      await emitStage(importId, 'flight', 'enqueue', 'fail', {
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  // Fetch pairing data
  let pairingRecords
  try {
    const pairingConfig = await connectorConfigService.getConfig(`${filiale.toLowerCase()}-pairing`)
    const pairingUrl = pairingConfig ? (pairingConfig.endpointConfig as { url: string }).url : ep.url
    await emitStage(importId, 'pairing', 'fetch', 'running')
    const rawPairings = await fetchChunked(pairingConfig ?? config, pairingUrl, startDt, endDt, filiale, 'pairing', pairingBody, undefined, rawJsonTrace)
    await emitStage(importId, 'pairing', 'fetch', 'done', { recordsIn: rawPairings.length })
    await emitStage(importId, 'pairing', 'transform', 'running')
    pairingRecords = transformF8Pairings(rawPairings)
    await emitStage(importId, 'pairing', 'transform', 'done', { recordsOut: pairingRecords.length })
  } catch (err) {
    await emitStage(importId, 'pairing', 'fetch', 'fail', {
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  // Chunk pairings into batches
  const pairingBatches: PairingImportJob[] = []
  const snapshotPairingInterfaceIds = [...new Set(pairingRecords.map((pairing) => pairing.interfaceId).filter(Boolean))]
  for (let i = 0; i < pairingRecords.length; i += BATCH_SIZE) {
    pairingBatches.push({
      ...meta,
      pairings: pairingRecords.slice(i, i + BATCH_SIZE),
      purgeStalePairings: i === 0,
      snapshotPairingInterfaceIds: i === 0 ? snapshotPairingInterfaceIds : undefined,
    })
  }
  if (pairingBatches.length === 0) {
    pairingBatches.push({ ...meta, pairings: [], purgeStalePairings: true, snapshotPairingInterfaceIds: [] })
  }

  // Nested flight→pairing chain so ALL pairing batches are enqueued
  // (FlowProducer runs the deepest child first: flight, then each batch).
  const buildPairingChain = (): FlowJob => {
    let node: FlowJob = {
      name: 'flight-import', queueName: 'connector.flight.inbound', data: flightJob, opts: jobOpts,
    }
    for (const batch of pairingBatches) {
      node = {
        name: 'pairing-import', queueName: 'connector.pairing.inbound', data: batch, opts: jobOpts,
        children: [node],
      }
    }
    return node
  }

  if (config.connectorCode === `${filiale.toLowerCase()}-pairing`) {
    // flight -> pairing(all batches) chain
    try {
      await emitStage(importId, 'flight', 'enqueue', 'running')
      await emitStage(importId, 'pairing', 'enqueue', 'running')
      const flowResult = await flow.add(buildPairingChain()) as unknown as FlowJobNode
      collectFlowQueueJobs(flowResult, queueJobs)
      await emitStage(importId, 'flight', 'enqueue', 'done')
      await emitStage(importId, 'pairing', 'enqueue', 'done')
      await flow.close()
      return { syncId, filteredCount: 0, rejectionFile: null, timings, queueJobs }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await emitStage(importId, 'flight', 'enqueue', 'fail', { message })
      await emitStage(importId, 'pairing', 'enqueue', 'fail', { message })
      throw err
    }
  }

  // roster-flight sync (API requires startUtc/endUtc/owner, not startDt/endDt)
  const crewSet = await loadCrewSet(fastify.db)
  let rosterJob: RosterImportJob
  let rejected: ReturnType<typeof transformF8RosterFlight>['rejected']
  try {
    await emitStage(importId, 'roster', 'fetch', 'running')
    const rawRoster = await fetchChunked(
      config, ep.url, startDt, endDt, filiale, 'roster_flight',
      (s, e) => ({ startUtc: `${s} 00:00:00`, endUtc: `${e} 23:59:59`, owner: filiale }),
      ROSTER_CHUNK_DAYS,
      rawJsonTrace,
    )
    await emitStage(importId, 'roster', 'fetch', 'done', { recordsIn: rawRoster.length })
    await emitStage(importId, 'roster', 'transform', 'running')
    const rosterResult = transformF8RosterFlight(rawRoster, crewSet, filiale)
    rejected = rosterResult.rejected
    await emitStage(importId, 'roster', 'transform', 'done', { recordsOut: rosterResult.records.length })

    let rejectionFile: string | null = null
    if (rejected.length > 0) {
      rejectionFile = await saveRejectedRecords('roster_flight', filiale, rejected)
    }

    rosterJob = {
      ...meta,
      records: rosterResult.records,
      filteredCount: rejected.length,
      rejectionFile,
    }
  } catch (err) {
    await emitStage(importId, 'roster', 'fetch', 'fail', {
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  // Optional roster_ground sync (ground tasks + single-leg flights).
  let rosterGroundJob: RosterGroundImportJob | null = null
  let rgRejectionFile: string | null = null
  if (ep.rosterGroundUrl) {
    try {
      await emitStage(importId, 'rosterGround', 'fetch', 'running')
      const { groundRaw, singleLegRaw, ignoredPairedRecords } = await fetchRosterGround(
        config, ep.rosterGroundUrl, startDt, endDt, filiale, rawJsonTrace,
      )
      await emitStage(importId, 'rosterGround', 'fetch', 'done', {
        recordsIn: groundRaw.length + singleLegRaw.length,
      })
      await emitStage(importId, 'rosterGround', 'transform', 'running')
      const { groundRecords, singleLegRecords, rejected: rgRejected } =
        transformF8RosterGround(groundRaw, singleLegRaw, crewSet, filiale)
      const ignoredRejected = ignoredPairedRecords.map((raw) => ({
        crewId: String((raw as Record<string, unknown>)['crewId'] ?? ''),
        reason: 'roster_ground: pairingId > 0 ignored; covered by roster import',
        raw,
      }))
      rgRejected.push(...ignoredRejected)
      await emitStage(importId, 'rosterGround', 'transform', 'done', {
        recordsOut: groundRecords.length + singleLegRecords.length,
      })
      if (rgRejected.length > 0) {
        rgRejectionFile = await saveRejectedRecords('roster_ground', filiale, rgRejected)
      }
      rosterGroundJob = {
        ...meta,
        groundRecords,
        singleLegRecords,
        filteredCount: rgRejected.length,
        rejectionFile: rgRejectionFile,
      }
    } catch (err) {
      await emitStage(importId, 'rosterGround', 'fetch', 'fail', {
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  if (rosterJob && rosterGroundJob) {
    rosterJob.deferMandayRecompute = true
  }

  // flight -> pairing -> roster (-> roster_ground) chain.
  // Children complete before parents, so roster_ground (top) runs last,
  // after flights/pairings it depends on are persisted.
  const rosterNode: FlowJob = {
    name: 'roster-import',
    queueName: 'connector.roster.inbound',
    data: rosterJob,
    opts: jobOpts,
    children: [buildPairingChain()],
  }

  try {
    await emitStage(importId, 'flight', 'enqueue', 'running')
    await emitStage(importId, 'pairing', 'enqueue', 'running')
    await emitStage(importId, 'roster', 'enqueue', 'running')
    if (rosterGroundJob) {
      await emitStage(importId, 'rosterGround', 'enqueue', 'running')
    }

    let flowResult: FlowJobNode
    if (rosterGroundJob) {
      flowResult = await flow.add({
        name: 'roster-ground-import',
        queueName: 'connector.roster_ground.inbound',
        data: rosterGroundJob,
        opts: jobOpts,
        children: [rosterNode],
      }) as unknown as FlowJobNode
    } else {
      flowResult = await flow.add(rosterNode) as unknown as FlowJobNode
    }
    collectFlowQueueJobs(flowResult, queueJobs)

    await emitStage(importId, 'flight', 'enqueue', 'done')
    await emitStage(importId, 'pairing', 'enqueue', 'done')
    await emitStage(importId, 'roster', 'enqueue', 'done')
    if (rosterGroundJob) {
      await emitStage(importId, 'rosterGround', 'enqueue', 'done')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitStage(importId, 'roster', 'enqueue', 'fail', { message })
    throw err
  }

  await flow.close()
  return {
    syncId,
    filteredCount: rejected.length + (rosterGroundJob?.filteredCount ?? 0),
    rejectionFile: rosterJob.rejectionFile,
    timings,
    queueJobs,
  }
}
