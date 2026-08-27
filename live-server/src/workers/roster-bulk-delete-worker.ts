import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Job, Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { rosterService } from '../services/roster/roster-service.js'
import { recomputeMandayAndNotify } from '../services/manday/manday-operation-service.js'
import { mandayMutationWindow } from '../services/manday/manday-mutation-window.js'
import { recheckLiveRosterMutation } from '../services/rule/legality-recheck.js'
import { notifyRosterTasksChanged } from '../services/roster/roster-change-notifier.js'
import { mutationExclusiveService, type MutationLeaseRef } from '../services/lock/mutation-exclusive-service.js'
import { refreshPairingCompositionFillBulk } from '../utils/composition-fill.js'
import { invalidate } from '../utils/cache.js'

export const ROSTER_BULK_DELETE_QUEUE = 'roster-bulk-delete'

export interface RosterBulkDeleteJobData {
  ids: number[]
  pairingCrewKeys: Array<{ pairingId: number; crewId: string }>
  username: string
  schema: string
  mutationLeaseToken: string
  rulesetId?: number
}

export interface RosterBulkDeleteJobResult {
  deleted: number
  crewIds: string[]
  durationMs: number
}

type ProgressStage = 'deleting' | 'rechecking' | 'recomputing-manday' | 'broadcasting' | 'completed' | 'failed'
type StageStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed'

type StageKey = Exclude<ProgressStage, 'completed' | 'failed'>

export interface RosterBulkDeleteStageTiming {
  stage: StageKey
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  elapsedMs: number
  message?: string
}

export interface RosterBulkDeleteProgress {
  stage: ProgressStage
  percent: number
  startedAt: string
  elapsedMs: number
  deleted?: number
  crewCount?: number
  message?: string
  stages?: RosterBulkDeleteStageTiming[]
}

const updateProgress = async (
  job: Job<RosterBulkDeleteJobData>,
  startedAtMs: number,
  stage: ProgressStage,
  percent: number,
  extra: Omit<RosterBulkDeleteProgress, 'stage' | 'percent' | 'startedAt' | 'elapsedMs'> = {},
): Promise<void> => {
  await job.updateProgress({
    stage,
    percent,
    startedAt: new Date(startedAtMs).toISOString(),
    elapsedMs: Date.now() - startedAtMs,
    ...extra,
  } satisfies RosterBulkDeleteProgress)
}

const cloneStageTimings = (stages: RosterBulkDeleteStageTiming[]): RosterBulkDeleteStageTiming[] =>
  stages.map((stage) => ({ ...stage }))

const createStageTimings = (): Record<StageKey, RosterBulkDeleteStageTiming> => ({
  deleting: { stage: 'deleting', status: 'pending', elapsedMs: 0 },
  rechecking: { stage: 'rechecking', status: 'pending', elapsedMs: 0 },
  'recomputing-manday': { stage: 'recomputing-manday', status: 'pending', elapsedMs: 0 },
  broadcasting: { stage: 'broadcasting', status: 'pending', elapsedMs: 0 },
})

export const processRosterBulkDelete = async (
  fastify: FastifyInstance,
  job: Job<RosterBulkDeleteJobData>,
): Promise<RosterBulkDeleteJobResult> => {
  const startedAtMs = Date.now()
  const { ids, pairingCrewKeys, username, schema, mutationLeaseToken, rulesetId } = job.data
  let result: Awaited<ReturnType<typeof rosterService.bulkRemove>> | null = null
  const stages = createStageTimings()
  const lease: MutationLeaseRef = { schema, token: mutationLeaseToken }
  let leaseFailure: Error | null = null
  const heartbeat = mutationExclusiveService.startRenewal(
    fastify.redis,
    lease,
    (error) => { leaseFailure = error },
  )
  const ensureLease = async (): Promise<void> => {
    if (leaseFailure) throw leaseFailure
    await mutationExclusiveService.assertOwned(fastify.redis, lease)
  }
  let progressWrite: Promise<void> = Promise.resolve()
  const publishProgress = (
    stage: ProgressStage,
    percent: number,
    extra: Omit<RosterBulkDeleteProgress, 'stage' | 'percent' | 'startedAt' | 'elapsedMs' | 'stages'> = {},
  ): Promise<void> => {
    const stageSnapshot = cloneStageTimings(Object.values(stages))
    progressWrite = progressWrite.then(() => updateProgress(job, startedAtMs, stage, percent, {
      ...extra,
      stages: stageSnapshot,
    }))
    return progressWrite
  }
  try {
    if (!mutationLeaseToken) throw new Error('Roster bulk-delete task is missing its mutation lease.')
    await ensureLease()
    stages.deleting.status = 'active'
    stages.deleting.startedAt = new Date(startedAtMs).toISOString()
    await publishProgress('deleting', 5)

    result = await rosterService.bulkRemove(fastify, ids, pairingCrewKeys, username)
    await ensureLease()
    if (result.pairingIds.length > 0) {
      await refreshPairingCompositionFillBulk(fastify.db, result.pairingIds, username)
      await invalidate(
        fastify.redis,
        ...result.pairingIds.flatMap((pairingId) => [
          `pairing:${pairingId}`,
          `pairing:comp:${pairingId}`,
          `pairing:crewids:${pairingId}`,
          `pairing:crewdetail:${pairingId}`,
        ]),
      )
    }
    stages.deleting.status = 'completed'
    stages.deleting.finishedAt = new Date().toISOString()
    stages.deleting.elapsedMs = Date.now() - startedAtMs
    await publishProgress('deleting', 35, {
      deleted: result.deleted,
      crewCount: result.crewIds.length,
    })

    let firstError: unknown = null
    let mandayRecomputed = false
    const recheckPromise = (async () => {
      await ensureLease()
      stages.rechecking.status = 'active'
      stages.rechecking.startedAt = new Date().toISOString()
      await publishProgress('rechecking', 50, {
        deleted: result?.deleted,
        crewCount: result?.crewIds.length,
      })
      try {
        await recheckLiveRosterMutation(
          fastify,
          rulesetId,
          [result!.firstSchStrDtUtc, result!.lastSchStrDtUtc],
          result!.crewIds,
        )
        stages.rechecking.status = 'completed'
        stages.rechecking.finishedAt = new Date().toISOString()
        stages.rechecking.elapsedMs = Date.now() - new Date(stages.rechecking.startedAt).getTime()
        await publishProgress('rechecking', 55, {
          deleted: result?.deleted,
          crewCount: result?.crewIds.length,
        })
      } catch (err) {
        stages.rechecking.status = 'failed'
        stages.rechecking.finishedAt = new Date().toISOString()
        stages.rechecking.elapsedMs = Date.now() - new Date(stages.rechecking.startedAt ?? new Date(startedAtMs).toISOString()).getTime()
        stages.rechecking.message = err instanceof Error ? err.message : 'Recheck failed'
        await publishProgress('rechecking', 55, {
          deleted: result?.deleted,
          crewCount: result?.crewIds.length,
          message: stages.rechecking.message,
        })
        throw err
      }
    })()

    const mandayPromise = (async () => {
      await ensureLease()
      stages['recomputing-manday'].status = 'active'
      stages['recomputing-manday'].startedAt = new Date().toISOString()
      await publishProgress('recomputing-manday', 60, {
        deleted: result?.deleted,
        crewCount: result?.crewIds.length,
      })
      try {
        if (result!.crewIds.length === 0 || !result!.firstSchStrDtUtc || !result!.lastSchStrDtUtc) {
          stages['recomputing-manday'].status = 'skipped'
          stages['recomputing-manday'].finishedAt = new Date().toISOString()
          stages['recomputing-manday'].elapsedMs = Date.now() - new Date(stages['recomputing-manday'].startedAt).getTime()
          await publishProgress('recomputing-manday', 65, {
            deleted: result?.deleted,
            crewCount: result?.crewIds.length,
          })
          return null
        }
        const window = await mandayMutationWindow(fastify, result!.crewIds, [
          result!.firstSchStrDtUtc,
          result!.lastSchStrDtUtc,
        ], { backDays: 2, forwardDays: 10 })
        if (!window) {
          stages['recomputing-manday'].status = 'skipped'
          stages['recomputing-manday'].finishedAt = new Date().toISOString()
          stages['recomputing-manday'].elapsedMs = Date.now() - new Date(stages['recomputing-manday'].startedAt).getTime()
          await publishProgress('recomputing-manday', 65, {
            deleted: result?.deleted,
            crewCount: result?.crewIds.length,
          })
          return null
        }
        const recomputeResult = await recomputeMandayAndNotify(fastify, {
          crewIds: result!.crewIds,
          startDt: window.startDt,
          endDt: window.endDt,
          updatedBy: username,
          notify: false,
        })
        mandayRecomputed = true
        stages['recomputing-manday'].status = 'completed'
        stages['recomputing-manday'].finishedAt = new Date().toISOString()
        stages['recomputing-manday'].elapsedMs = Date.now() - new Date(stages['recomputing-manday'].startedAt).getTime()
        await publishProgress('recomputing-manday', 75, {
          deleted: result?.deleted,
          crewCount: result?.crewIds.length,
        })
        return recomputeResult
      } catch (err) {
        stages['recomputing-manday'].status = 'failed'
        stages['recomputing-manday'].finishedAt = new Date().toISOString()
        stages['recomputing-manday'].elapsedMs = Date.now() - new Date(stages['recomputing-manday'].startedAt ?? new Date(startedAtMs).toISOString()).getTime()
        stages['recomputing-manday'].message = err instanceof Error ? err.message : 'Manday recompute failed'
        await publishProgress('recomputing-manday', 75, {
          deleted: result?.deleted,
          crewCount: result?.crewIds.length,
          message: stages['recomputing-manday'].message,
        })
        throw err
      }
    })()

    await Promise.allSettled([recheckPromise, mandayPromise]).then((outcomes) => {
      const rejection = outcomes.find((item): item is PromiseRejectedResult => item.status === 'rejected')
      if (rejection) {
        firstError = rejection.reason
      }
    })
    if (firstError) throw firstError

    stages.broadcasting.status = 'active'
    await ensureLease()
    stages.broadcasting.startedAt = new Date().toISOString()
    await publishProgress('broadcasting', 90, {
      deleted: result!.deleted,
      crewCount: result!.crewIds.length,
    })
    if (result!.crewIds.length > 0) {
      await notifyRosterTasksChanged(fastify, { schema, crewIds: result!.crewIds, pairingIds: result!.pairingIds })
      // Manday was recomputed into the DB, but roster-updated only refreshes roster items —
      // the frontend refreshes crew stats (RpCred/RpDO/RpBH) on manday-updated. Without this
      // broadcast, open gantt clients keep showing pre-delete credit until a manual reload.
      // (Same contract as the scenario publish path; see scenario.ts:1612.)
      if (mandayRecomputed) {
        fastify.wsBroadcastAll(schema, { type: 'manday-updated', crewIds: result!.crewIds })
      }
    }
    stages.broadcasting.status = 'completed'
    stages.broadcasting.finishedAt = new Date().toISOString()
    stages.broadcasting.elapsedMs = Date.now() - new Date(stages.broadcasting.startedAt).getTime()

    const durationMs = Date.now() - startedAtMs
    await publishProgress('completed', 100, {
      deleted: result.deleted,
      crewCount: result.crewIds.length,
    })
    return { deleted: result.deleted, crewIds: result.crewIds, durationMs }
  } catch (err) {
    if (result?.crewIds.length) {
      await notifyRosterTasksChanged(fastify, { schema, crewIds: result.crewIds, pairingIds: result.pairingIds })
    }
    stages.broadcasting.status = stages.broadcasting.status === 'active' ? 'failed' : stages.broadcasting.status
    await publishProgress('failed', 100, {
      deleted: result?.deleted,
      crewCount: result?.crewIds.length,
      message: err instanceof Error ? err.message : 'Bulk delete failed',
    }).catch(() => undefined)
    throw err
  } finally {
    heartbeat.stop()
    await mutationExclusiveService.release(fastify.redis, lease).catch((err: unknown) => {
      fastify.log.warn({ err, taskId: job.id }, 'Failed to release roster bulk-delete mutation lease')
    })
  }
}

export function startRosterBulkDeleteWorker(fastify: FastifyInstance): Worker<RosterBulkDeleteJobData, RosterBulkDeleteJobResult> {
  const connection = getBullmqRedisConnection()
  const worker = new Worker<RosterBulkDeleteJobData, RosterBulkDeleteJobResult>(withBullmqPrefix(ROSTER_BULK_DELETE_QUEUE),
    async (job) => processRosterBulkDelete(fastify, job),
    { connection, concurrency: 1 },
  )
  worker.on('error', (err) => fastify.log.error({ err: err.message }, 'roster bulk delete worker error'))
  attachBullmqErrorLogger(worker, fastify.log, 'roster bulk delete worker')
  return worker
}
