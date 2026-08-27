import type { FastifyInstance } from 'fastify'
import { Queue, QueueEvents } from 'bullmq'
import { liveSchema, liveSchemaName } from '../../utils/db-schema.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../../utils/bullmq-redis.js'

type PublishAction = 'ADD' | 'UPDATE' | 'DELETE'
type CallbackAction = 'Add' | 'Update' | 'Delete'

export interface RosterPublishAdjustRow {
  id: string | number
  batch_id: string | number
  rp_start: Date | string | null
  rp_end: Date | string | null
  action_type: PublishAction | string | null
  crew_id: string | null
  old_roster_flight_id: string | number | null
  old_pairing_id: string | number | null
  old_pair_interface_id: string | null
  old_base: string | null
  old_sch_str_dt_utc: Date | string | null
  old_sch_end_dt_utc: Date | string | null
  old_assignment_group: string | null
  old_assignment: string | null
  old_roster_acting_rank: string | null
  new_roster_flight_id: string | number | null
  new_pairing_id: string | number | null
  new_pair_interface_id: string | null
  new_base: string | null
  new_sch_str_dt_utc: Date | string | null
  new_sch_end_dt_utc: Date | string | null
  new_assignment_group: string | null
  new_assignment: string | null
  new_roster_acting_rank: string | null
  old_source: string | null
  new_source: string | null
}

const isImpImportedRow = (row: RosterPublishAdjustRow): boolean =>
  row.old_source === 'IMP' || row.new_source === 'IMP'

export interface RosterPublishCallbackRoster {
  action: CallbackAction
  uniqueId: string
  crewId: string
  pairingId?: string | number
  actingRank?: string
  base?: string
  startUtc?: string
  endUtc?: string
  assignmentGroup?: string
  assignment?: string
}

export interface RosterPublishCallbackPayload {
  requestId: string
  rpStart: string | null
  rpEnd: string | null
  rosters: RosterPublishCallbackRoster[]
}

interface RosterPublishOutboundLogInput {
  payload: RosterPublishCallbackPayload
  responseStatus: number | null
  responseBody: string | null
  errorMessage: string | null
  durationMs: number
  success: boolean
}

interface RosterPublishOutboundJobData {
  schema: string
  publishedBy: string
  publishedAt: string
  payload: RosterPublishCallbackPayload
}

interface RosterPublishOutboundConnectorResult {
  connectorCode: string
  status: 'success' | 'fail' | 'partial'
  responseStatus?: number
  responseBody?: string
  errorMessage?: string
}

interface RosterPublishOutboundJobResult {
  pushed: number
  results: RosterPublishOutboundConnectorResult[]
}

const failurePriority = (result: RosterPublishOutboundConnectorResult): number => {
  if (result.responseStatus != null) return 3
  if (result.responseBody) return 2
  if (result.errorMessage) return 1
  return 0
}

const connectorFailureMessage = (result: RosterPublishOutboundConnectorResult): string =>
  result.errorMessage
  ?? (result.responseStatus != null ? `External API returned ${result.responseStatus}` : undefined)
  ?? result.responseBody
  ?? 'Roster publish connector failed'

const quote = (): string => liveSchema()
const CONNECTOR_ROSTER_OUTBOUND_QUEUE = 'connector.roster.outbound'
const CONNECTOR_OUTBOUND_WAIT_TIMEOUT_MS = 120_000
const LOGGED_CONNECTOR_FAILURE_PREFIX = 'Roster publish callback failed after connector response:'
const DEFAULT_ROSTER_PUBLISH_RETRY_COOLDOWN_MS = 3_600_000

export const resetRosterPublishOutboundAuthCacheForTest = (): void => {
  // Backward-compatible test hook. Auth is owned by connector-server.
}

const formatDate = (value: Date | string | null): string | null => {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const formatUtcTimestamp = (value: Date | string | null): string | undefined => {
  if (value == null) return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

const normalizeAction = (action: string | null): CallbackAction | null => {
  if (action === 'ADD') return 'Add'
  if (action === 'UPDATE') return 'Update'
  if (action === 'DELETE') return 'Delete'
  return null
}

const activeValue = <T>(row: RosterPublishAdjustRow, oldValue: T, newValue: T): T =>
  row.action_type === 'DELETE' ? oldValue : newValue

const normalizeOutboundAssignment = (assignment: string | null): string | undefined => {
  if (assignment == null) return undefined
  return assignment === 'DO' ? 'GDO' : assignment
}

const normalizeExternalId = (value: string | null): string | number | null => {
  if (!value) return null
  return /^\d+$/.test(value) ? Number(value) : value
}

const isPositiveId = (value: string | number | null): boolean => {
  if (value == null) return false
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

export const buildRosterPublishCallbackPayload = (rows: RosterPublishAdjustRow[]): RosterPublishCallbackPayload | null => {
  const first = rows[0]
  if (!first) return null

  const rosters: RosterPublishCallbackRoster[] = []
  const flyingKeys = new Set<string>()

  for (const row of rows) {
    const action = normalizeAction(row.action_type)
    if (!action || !row.crew_id) continue
    if (row.old_source === 'IMP' || row.new_source === 'IMP') continue

    const pairingId = activeValue(row, row.old_pairing_id, row.new_pairing_id)
    const pairInterfaceId = activeValue(row, row.old_pair_interface_id, row.new_pair_interface_id)
    const rosterFlightId = activeValue(row, row.old_roster_flight_id, row.new_roster_flight_id)
    const assignmentGroup = activeValue(row, row.old_assignment_group, row.new_assignment_group)
    const assignment = activeValue(row, row.old_assignment, row.new_assignment)

    // Reserve duties can be stored with a pairing_id, but the external
    // callback expects them in the ground-task shape.
    if (isPositiveId(pairingId) && assignmentGroup !== 'RES') {
      const externalPairingId = normalizeExternalId(pairInterfaceId)
      if (externalPairingId == null) continue
      const key = `${row.crew_id}|${externalPairingId}|${action}`
      if (flyingKeys.has(key)) continue
      flyingKeys.add(key)
      rosters.push({
        action,
        uniqueId: `${row.crew_id}_${externalPairingId}`,
        crewId: row.crew_id,
        pairingId: externalPairingId,
        actingRank: activeValue(row, row.old_roster_acting_rank, row.new_roster_acting_rank) ?? undefined,
      })
      continue
    }

    const groundId = rosterFlightId == null ? row.id : rosterFlightId
    rosters.push({
      action,
      uniqueId: `${row.crew_id}_${groundId}`,
      crewId: row.crew_id,
      base: activeValue(row, row.old_base, row.new_base) ?? undefined,
      startUtc: formatUtcTimestamp(activeValue(row, row.old_sch_str_dt_utc, row.new_sch_str_dt_utc)),
      endUtc: formatUtcTimestamp(activeValue(row, row.old_sch_end_dt_utc, row.new_sch_end_dt_utc)),
      assignmentGroup: assignmentGroup ?? undefined,
      assignment: normalizeOutboundAssignment(assignment),
    })
  }

  return {
    requestId: String(first.batch_id),
    rpStart: formatDate(first.rp_start),
    rpEnd: formatDate(first.rp_end),
    rosters,
  }
}

export const claimNextRosterPublishAdjustBatch = async (
  fastify: FastifyInstance,
  retryCooldownMs = DEFAULT_ROSTER_PUBLISH_RETRY_COOLDOWN_MS,
): Promise<RosterPublishAdjustRow[]> => {
  const result = await fastify.pgPool.query<RosterPublishAdjustRow>(`
    with next_batch as (
      select batch_id
      from ${quote()}.roster_publish_adjust rpa
      where published = 0
        and not exists (
          select 1
          from ${quote()}.roster_publish_outbound_log rpol
          where rpol.batch_id = rpa.batch_id
            and rpol.success = 0
            and rpol.created_at > now() - ($1::bigint * interval '1 millisecond')
        )
      group by batch_id
      order by min(created_at)
      limit 1
    )
    select *
    from ${quote()}.roster_publish_adjust rpa
    where batch_id = (select batch_id from next_batch)
      and published = 0
    order by crew_id, coalesce(new_pairing_id, old_pairing_id) nulls last, id
  `, [retryCooldownMs])
  return result.rows
}

const markBatchPublished = async (
  fastify: FastifyInstance,
  ids: Array<string | number>,
  published: 0 | 1 | 2,
): Promise<void> => {
  if (ids.length === 0) return
  await fastify.pgPool.query(
    `update ${quote()}.roster_publish_adjust
        set published = $1::smallint,
            updated_by = 'outbound-worker',
            updated_at = now()
      where id = any($2::bigint[])`,
    [published, ids],
  )
}

const insertOutboundLog = async (fastify: FastifyInstance, input: RosterPublishOutboundLogInput): Promise<void> => {
  await fastify.pgPool.query(
    `insert into ${quote()}.roster_publish_outbound_log (
        batch_id,
        request_id,
        request_payload,
        response_status,
        response_body,
        error_message,
        duration_ms,
        success
      ) values (
        $1::bigint,
        $2::varchar,
        $3::jsonb,
        $4::int,
        $5::text,
        $6::text,
        $7::int,
        $8::smallint
      )`,
    [
      input.payload.requestId,
      input.payload.requestId,
      JSON.stringify(input.payload),
      input.responseStatus,
      input.responseBody,
      input.errorMessage,
      input.durationMs,
      input.success ? 1 : 0,
    ],
  )
}

const runConnectorRosterOutboundJob = async (
  fastify: FastifyInstance,
  payload: RosterPublishCallbackPayload,
): Promise<RosterPublishOutboundConnectorResult> => {
  const connection = getBullmqRedisConnection()
  const queue = new Queue<RosterPublishOutboundJobData, RosterPublishOutboundJobResult>(CONNECTOR_ROSTER_OUTBOUND_QUEUE, { connection })
  const queueEvents = new QueueEvents(CONNECTOR_ROSTER_OUTBOUND_QUEUE, { connection })
  attachBullmqErrorLogger(queue, fastify.log, `${CONNECTOR_ROSTER_OUTBOUND_QUEUE} queue`)
  attachBullmqErrorLogger(queueEvents, fastify.log, `${CONNECTOR_ROSTER_OUTBOUND_QUEUE} queue events`)

  try {
    await queueEvents.waitUntilReady()
    const job = await queue.add(
      'roster-publish',
      {
        schema: liveSchemaName(),
        publishedBy: 'live-server',
        publishedAt: new Date().toISOString(),
        payload,
      },
      {
        // A failed batch is retried after the cooldown. Each retry must create
        // a new BullMQ job instead of reusing the completed job by request ID.
        jobId: `roster-publish-${payload.requestId}-${Date.now()}`,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
        attempts: 1,
      },
    )

    const result = await job.waitUntilFinished(queueEvents, CONNECTOR_OUTBOUND_WAIT_TIMEOUT_MS)
    const failures = result.results.filter((item) => item.status !== 'success')
    const firstFailure = failures
      .sort((left, right) => failurePriority(right) - failurePriority(left))[0]
    if (firstFailure) return firstFailure

    const firstSuccess = result.results.find((item) => item.status === 'success')
    if (firstSuccess) return firstSuccess

    return {
      connectorCode: 'connector.roster.outbound',
      status: 'fail',
      errorMessage: 'No enabled roster publish outbound connector',
    }
  } finally {
    await queue.close()
    await queueEvents.close()
  }
}

export const flushOneRosterPublishAdjustBatch = async (
  fastify: FastifyInstance,
  retryCooldownMs = DEFAULT_ROSTER_PUBLISH_RETRY_COOLDOWN_MS,
): Promise<{ sent: boolean; rowCount: number; requestId: string | null }> => {
  const rows = await claimNextRosterPublishAdjustBatch(fastify, retryCooldownMs)
  if (rows.length === 0) return { sent: false, rowCount: 0, requestId: null }

  const impIds = rows.filter(isImpImportedRow).map((row) => row.id)
  const outboundRows = rows.filter((row) => !isImpImportedRow(row))
  const outboundIds = outboundRows.map((row) => row.id)
  if (impIds.length > 0) {
    await markBatchPublished(fastify, impIds, 2)
  }

  const payload = buildRosterPublishCallbackPayload(outboundRows)
  if (!payload || payload.rosters.length === 0) {
    await markBatchPublished(fastify, outboundIds, 1)
    return { sent: false, rowCount: rows.length, requestId: payload?.requestId ?? null }
  }

  const startedAt = Date.now()
  try {
    const result = await runConnectorRosterOutboundJob(fastify, payload)
    const success = result.status === 'success'
    await insertOutboundLog(fastify, {
      payload,
      responseStatus: result.responseStatus ?? null,
      responseBody: result.responseBody ?? null,
      errorMessage: success ? null : connectorFailureMessage(result),
      durationMs: Date.now() - startedAt,
      success,
    })
    if (!success) {
      throw new Error(`${LOGGED_CONNECTOR_FAILURE_PREFIX} ${connectorFailureMessage(result)}`)
    }
    await markBatchPublished(fastify, outboundIds, 1)
    fastify.log.info({
      requestId: payload.requestId,
      rosterCount: payload.rosters.length,
      connectorCode: result.connectorCode,
      responseStatus: result.responseStatus,
    }, 'roster publish callback sent')
    return { sent: true, rowCount: rows.length, requestId: payload.requestId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.startsWith(LOGGED_CONNECTOR_FAILURE_PREFIX)) {
      await insertOutboundLog(fastify, {
        payload,
        responseStatus: null,
        responseBody: null,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        success: false,
      }).catch((logErr: unknown) => {
        fastify.log.error({ err: logErr, requestId: payload.requestId }, 'failed to write roster publish callback log')
      })
    }
    await markBatchPublished(fastify, outboundIds, 0)
    fastify.log.error({ err, requestId: payload.requestId }, 'roster publish callback failed')
    throw err
  }
}

export const flushRosterPublishAdjustBatches = async (
  fastify: FastifyInstance,
  maxBatches = 10,
  retryCooldownMs = DEFAULT_ROSTER_PUBLISH_RETRY_COOLDOWN_MS,
): Promise<number> => {
  let sent = 0
  for (let i = 0; i < maxBatches; i += 1) {
    const result = await flushOneRosterPublishAdjustBatch(fastify, retryCooldownMs)
    if (result.rowCount === 0) break
    if (result.sent) sent += 1
  }
  return sent
}
