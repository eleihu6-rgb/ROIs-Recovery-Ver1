import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { liveSchema } from '../../utils/db-schema.js'

export type SchedulerScheduleType = 'fixed_delay' | 'cron'
export type SchedulerJobStatus = 'success' | 'failed' | 'running' | 'skipped'
export type SchedulerTriggerType = 'schedule' | 'manual'

export interface SchedulerJobDefinition {
  jobCode: string
  jobName: string
  jobType: 'interval' | 'cron' | 'bullmq_repeat'
  scheduleType: SchedulerScheduleType
  intervalSeconds?: number
  cronExpr?: string
  handler: () => Promise<{ message?: string } | void>
}

export interface SchedulerJobRow {
  id: string
  job_code: string
  job_name: string
  job_type: string
  enabled: number
  schedule_type: SchedulerScheduleType
  interval_seconds: number | null
  cron_expr: string | null
  last_run_at: Date | null
  last_finished_at: Date | null
  last_status: SchedulerJobStatus | null
  last_error: string | null
  last_duration_ms: number | null
  next_run_at: Date | null
  locked_at: Date | null
  locked_by: string | null
  config_json: Record<string, unknown>
}

export interface SchedulerRunRow {
  id: string
  job_code: string
  trigger_type: SchedulerTriggerType
  started_at: Date
  finished_at: Date | null
  status: SchedulerJobStatus
  duration_ms: number | null
  message: string | null
  error: string | null
}

export interface SchedulerScheduleInput {
  scheduleType: SchedulerScheduleType
  intervalSeconds?: number
  cronExpr?: string
}

export interface SchedulerService {
  ensureJobs(): Promise<void>
  listJobs(): Promise<SchedulerJobRow[]>
  listRuns(jobCode: string, limit?: number): Promise<SchedulerRunRow[]>
  setEnabled(jobCode: string, enabled: boolean, username: string): Promise<SchedulerJobRow | null>
  updateSchedule(jobCode: string, input: SchedulerScheduleInput, username: string): Promise<SchedulerJobRow | null>
  runNow(jobCode: string, username: string): Promise<SchedulerRunRow>
  tick(): Promise<number>
  start(): void
}

declare module 'fastify' {
  interface FastifyInstance {
    schedulerService: SchedulerService
  }
}

const quote = (): string => liveSchema()

const instanceId = (): string => `${process.pid}-${crypto.randomUUID()}`

const toDate = (value: Date | string | null): Date | null => {
  if (value == null) return null
  return value instanceof Date ? value : new Date(value)
}

export const computeNextRunAt = (
  scheduleType: SchedulerScheduleType,
  intervalSeconds: number | null | undefined,
  cronExpr: string | null | undefined,
  from = new Date(),
): Date => {
  if (scheduleType === 'fixed_delay') {
    const seconds = Number(intervalSeconds)
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new Error('intervalSeconds must be a positive integer')
    }
    return new Date(from.getTime() + seconds * 1000)
  }

  const parts = String(cronExpr ?? '').trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error('cronExpr must be a simple five-field expression')
  }
  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts
  if (monthRaw !== '*' || weekdayRaw !== '*') {
    throw new Error('Only simple daily/monthly cron expressions are supported')
  }
  const minute = Number(minuteRaw)
  const hour = Number(hourRaw)
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('cronExpr minute/hour must be numeric')
  }

  if (dayRaw === '*') {
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hour, minute, 0, 0))
    if (next <= from) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }

  const day = Number(dayRaw)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('cronExpr day-of-month must be numeric or *')
  }
  let next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day, hour, minute, 0, 0))
  if (next <= from || next.getUTCMonth() !== from.getUTCMonth()) {
    next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, day, hour, minute, 0, 0))
  }
  return next
}

const mapJobRow = (row: SchedulerJobRow): SchedulerJobRow => ({
  ...row,
  last_run_at: toDate(row.last_run_at),
  last_finished_at: toDate(row.last_finished_at),
  next_run_at: toDate(row.next_run_at),
  locked_at: toDate(row.locked_at),
})

const normalizeSchedule = (input: SchedulerScheduleInput): Required<Pick<SchedulerScheduleInput, 'scheduleType'>> & Pick<SchedulerScheduleInput, 'intervalSeconds' | 'cronExpr'> => {
  if (input.scheduleType === 'fixed_delay') {
    const intervalSeconds = Number(input.intervalSeconds)
    if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
      throw new Error('intervalSeconds must be a positive integer')
    }
    return { scheduleType: 'fixed_delay', intervalSeconds, cronExpr: undefined }
  }
  computeNextRunAt('cron', null, input.cronExpr)
  return { scheduleType: 'cron', intervalSeconds: undefined, cronExpr: input.cronExpr }
}

const errorMessage = (err: unknown): string => err instanceof Error ? err.message : String(err)

export const createSchedulerService = (
  fastify: FastifyInstance,
  definitions: SchedulerJobDefinition[],
  pollIntervalMs = 30_000,
): SchedulerService => {
  const handlers = new Map(definitions.map((definition) => [definition.jobCode, definition]))
  const workerId = instanceId()
  let timer: NodeJS.Timeout | null = null
  let running = false

  const executeJob = async (row: SchedulerJobRow, triggerType: SchedulerTriggerType, username: string): Promise<SchedulerRunRow> => {
    const definition = handlers.get(row.job_code)
    const startedAt = new Date()
    const run = await fastify.pgPool.query<SchedulerRunRow>(
      `insert into ${quote()}.scheduler_job_run (
         created_by, updated_by, job_code, trigger_type, started_at, status
       ) values ($1, $1, $2, $3, $4, 'running')
       returning *`,
      [username, row.job_code, triggerType, startedAt],
    )
    const runId = run.rows[0].id

    if (!definition) {
      const message = `No handler registered for scheduler job ${row.job_code}`
      await fastify.pgPool.query(
        `update ${quote()}.scheduler_job_run
            set status = 'skipped', finished_at = now(), duration_ms = 0, message = $2, updated_by = $3, updated_at = now()
          where id = $1::bigint`,
        [runId, message, username],
      )
      throw new Error(message)
    }

    try {
      const result = await definition.handler()
      const finishedAt = new Date()
      const durationMs = finishedAt.getTime() - startedAt.getTime()
      const updated = await fastify.pgPool.query<SchedulerRunRow>(
        `update ${quote()}.scheduler_job_run
            set status = 'success',
                finished_at = $2,
                duration_ms = $3,
                message = $4,
                updated_by = $5,
                updated_at = now()
          where id = $1::bigint
          returning *`,
        [runId, finishedAt, durationMs, result?.message ?? null, username],
      )
      return updated.rows[0]
    } catch (err) {
      const finishedAt = new Date()
      const durationMs = finishedAt.getTime() - startedAt.getTime()
      const updated = await fastify.pgPool.query<SchedulerRunRow>(
        `update ${quote()}.scheduler_job_run
            set status = 'failed',
                finished_at = $2,
                duration_ms = $3,
                error = $4,
                updated_by = $5,
                updated_at = now()
          where id = $1::bigint
          returning *`,
        [runId, finishedAt, durationMs, errorMessage(err), username],
      )
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { run: updated.rows[0] })
    }
  }

  const finishJob = async (row: SchedulerJobRow, status: SchedulerJobStatus, run: SchedulerRunRow | null, err: unknown): Promise<void> => {
    const nextRunAt = computeNextRunAt(row.schedule_type, row.interval_seconds, row.cron_expr)
    await fastify.pgPool.query(
      `update ${quote()}.scheduler_job
          set last_finished_at = now(),
              last_status = $2,
              last_error = $3,
              last_duration_ms = $4,
              next_run_at = $5,
              locked_at = null,
              locked_by = null,
              updated_by = 'scheduler',
              updated_at = now()
        where job_code = $1`,
      [row.job_code, status, err == null ? null : errorMessage(err), run?.duration_ms ?? null, nextRunAt],
    )
  }

  const service: SchedulerService = {
    async ensureJobs() {
      for (const definition of definitions) {
        const nextRunAt = computeNextRunAt(definition.scheduleType, definition.intervalSeconds, definition.cronExpr)
        await fastify.pgPool.query(
          `insert into ${quote()}.scheduler_job (
             created_by, updated_by, job_code, job_name, job_type, enabled,
             schedule_type, interval_seconds, cron_expr, next_run_at, config_json
           ) values (
             'system', 'system', $1, $2, $3, 1, $4, $5, $6, $7, '{}'::jsonb
           )
           on conflict (job_code) do update
             set job_name = excluded.job_name,
                 job_type = excluded.job_type,
                 updated_at = now(),
                 updated_by = 'system'`,
          [
            definition.jobCode,
            definition.jobName,
            definition.jobType,
            definition.scheduleType,
            definition.intervalSeconds ?? null,
            definition.cronExpr ?? null,
            nextRunAt,
          ],
        )
      }
    },

    async listJobs() {
      const result = await fastify.pgPool.query<SchedulerJobRow>(
        `select * from ${quote()}.scheduler_job order by job_code`,
      )
      return result.rows.map(mapJobRow)
    },

    async listRuns(jobCode: string, limit = 50) {
      const result = await fastify.pgPool.query<SchedulerRunRow>(
        `select * from ${quote()}.scheduler_job_run
          where job_code = $1
          order by started_at desc
          limit $2::int`,
        [jobCode, Math.min(Math.max(limit, 1), 200)],
      )
      return result.rows
    },

    async setEnabled(jobCode: string, enabled: boolean, username: string) {
      const result = await fastify.pgPool.query<SchedulerJobRow>(
        `update ${quote()}.scheduler_job
            set enabled = $2::smallint,
                next_run_at = case when $2::smallint = 1 and next_run_at is null then now() else next_run_at end,
                locked_at = case when $2::smallint = 0 then null else locked_at end,
                locked_by = case when $2::smallint = 0 then null else locked_by end,
                updated_by = $3,
                updated_at = now()
          where job_code = $1
          returning *`,
        [jobCode, enabled ? 1 : 0, username],
      )
      return result.rows[0] ? mapJobRow(result.rows[0]) : null
    },

    async updateSchedule(jobCode: string, input: SchedulerScheduleInput, username: string) {
      const schedule = normalizeSchedule(input)
      const nextRunAt = computeNextRunAt(schedule.scheduleType, schedule.intervalSeconds, schedule.cronExpr)
      const result = await fastify.pgPool.query<SchedulerJobRow>(
        `update ${quote()}.scheduler_job
            set schedule_type = $2,
                interval_seconds = $3,
                cron_expr = $4,
                next_run_at = $5,
                updated_by = $6,
                updated_at = now()
          where job_code = $1
          returning *`,
        [jobCode, schedule.scheduleType, schedule.intervalSeconds ?? null, schedule.cronExpr ?? null, nextRunAt, username],
      )
      return result.rows[0] ? mapJobRow(result.rows[0]) : null
    },

    async runNow(jobCode: string, username: string) {
      const claim = await fastify.pgPool.query<SchedulerJobRow>(
        `update ${quote()}.scheduler_job
            set last_run_at = now(),
                last_status = 'running',
                last_error = null,
                locked_at = now(),
                locked_by = $2,
                updated_by = $2,
                updated_at = now()
          where job_code = $1
            and (locked_at is null or locked_at < now() - interval '30 minutes')
          returning *`,
        [jobCode, username],
      )
      const job = claim.rows[0] ? mapJobRow(claim.rows[0]) : null
      if (!job) {
        const exists = await fastify.pgPool.query<{ exists: boolean }>(
          `select exists(select 1 from ${quote()}.scheduler_job where job_code = $1)`,
          [jobCode],
        )
        if (exists.rows[0]?.exists) {
          throw new Error(`Scheduler job ${jobCode} is already running`)
        }
        throw new Error(`Scheduler job ${jobCode} not found`)
      }

      try {
        const run = await executeJob(job, 'manual', username)
        await finishJob(job, 'success', run, null)
        return run
      } catch (err) {
        const run = typeof err === 'object' && err != null && 'run' in err ? (err as { run?: SchedulerRunRow }).run ?? null : null
        await finishJob(job, 'failed', run, err)
        throw err
      }
    },

    async tick() {
      if (running) return 0
      running = true
      try {
        const claim = await fastify.pgPool.query<SchedulerJobRow>(
          `update ${quote()}.scheduler_job
              set last_run_at = now(),
                  last_status = 'running',
                  last_error = null,
                  locked_at = now(),
                  locked_by = $1,
                  updated_by = 'scheduler',
                  updated_at = now()
            where job_code = (
              select job_code
              from ${quote()}.scheduler_job
              where enabled = 1
                and next_run_at <= now()
                and (locked_at is null or locked_at < now() - interval '30 minutes')
              order by next_run_at
              limit 1
            )
            returning *`,
          [workerId],
        )
        const job = claim.rows[0] ? mapJobRow(claim.rows[0]) : null
        if (!job) return 0

        try {
          const run = await executeJob(job, 'schedule', 'scheduler')
          await finishJob(job, 'success', run, null)
          return 1
        } catch (err) {
          const run = typeof err === 'object' && err != null && 'run' in err ? (err as { run?: SchedulerRunRow }).run ?? null : null
          await finishJob(job, 'failed', run, err)
          fastify.log.error({ err, jobCode: job.job_code }, 'scheduler job failed')
          return 1
        }
      } finally {
        running = false
      }
    },

    start() {
      if (timer) return
      void service.ensureJobs().then(() => service.tick()).catch((err) => {
        fastify.log.error({ err }, 'scheduler startup failed')
      })
      timer = setInterval(() => {
        void service.tick()
      }, pollIntervalMs)
      timer.unref()
      fastify.addHook('onClose', async () => {
        if (timer) clearInterval(timer)
        timer = null
      })
      fastify.log.info({ pollIntervalMs }, 'scheduler started')
    },
  }

  return service
}
