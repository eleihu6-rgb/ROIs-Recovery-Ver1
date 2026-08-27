import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
})

import {
  computeNextRunAt,
  createSchedulerService,
  type SchedulerJobRow,
} from '../../../services/scheduler/scheduler-service.js'

const jobRow = (overrides: Partial<SchedulerJobRow> = {}): SchedulerJobRow => ({
  id: '1',
  job_code: 'demo_job',
  job_name: 'Demo Job',
  job_type: 'interval',
  enabled: 1,
  schedule_type: 'fixed_delay',
  interval_seconds: 300,
  cron_expr: null,
  last_run_at: null,
  last_finished_at: null,
  last_status: null,
  last_error: null,
  last_duration_ms: null,
  next_run_at: new Date('2026-08-01T00:00:00Z'),
  locked_at: null,
  locked_by: null,
  config_json: {},
  ...overrides,
})

describe('scheduler service', () => {
  afterEach(() => vi.restoreAllMocks())

  it('computes fixed delay, daily cron, and monthly cron next runs in UTC', () => {
    expect(computeNextRunAt('fixed_delay', 300, null, new Date('2026-08-01T00:00:00Z')).toISOString())
      .toBe('2026-08-01T00:05:00.000Z')
    expect(computeNextRunAt('cron', null, '0 3 * * *', new Date('2026-08-01T04:00:00Z')).toISOString())
      .toBe('2026-08-02T03:00:00.000Z')
    expect(computeNextRunAt('cron', null, '0 1 1 * *', new Date('2026-08-02T00:00:00Z')).toISOString())
      .toBe('2026-09-01T01:00:00.000Z')
  })

  it('claims one due job, executes its handler, records a run, and releases the lock', async () => {
    const handler = vi.fn(async () => ({ message: 'ok' }))
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [jobRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '10' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '10', status: 'success', duration_ms: 5 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })

    const fastify = {
      pgPool: { query },
      log: { info: vi.fn(), error: vi.fn() },
      addHook: vi.fn(),
    } as never

    const service = createSchedulerService(fastify, [{
      jobCode: 'demo_job',
      jobName: 'Demo Job',
      jobType: 'interval',
      scheduleType: 'fixed_delay',
      intervalSeconds: 300,
      handler,
    }])

    const count = await service.tick()

    expect(count).toBe(1)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('set last_run_at = now()'))
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('scheduler_job_run'))
    expect(query.mock.calls[3]?.[0]).toEqual(expect.stringContaining('locked_at = null'))
  })
})
