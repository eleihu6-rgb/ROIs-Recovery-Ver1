import { afterEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import schedulerAdminRoutes from './scheduler.js'

const buildApp = async () => {
  const app = Fastify()
  const schedulerService = {
    listJobs: vi.fn(async () => [{ job_code: 'demo_job' }]),
    listRuns: vi.fn(async () => [{ id: '1', job_code: 'demo_job' }]),
    setEnabled: vi.fn(async (jobCode: string, enabled: boolean) => ({ job_code: jobCode, enabled: enabled ? 1 : 0 })),
    updateSchedule: vi.fn(async (jobCode: string, input: unknown) => ({ job_code: jobCode, ...(input as Record<string, unknown>) })),
    runNow: vi.fn(async (jobCode: string) => ({ id: '2', job_code: jobCode, status: 'success' })),
  }
  app.decorate('schedulerService', schedulerService as never)
  app.addHook('onRequest', async (request) => {
    request.authUser = { userCode: 'admin', userName: 'Admin', schema: 'f8', isAdmin: 1, tokenVersion: 1 }
  })
  await app.register(schedulerAdminRoutes, { prefix: '/api/admin' })
  return { app, schedulerService }
}

describe('scheduler admin routes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists jobs and supports enable, disable, schedule update, manual run, and run history', async () => {
    const { app, schedulerService } = await buildApp()

    const list = await app.inject({ method: 'GET', url: '/api/admin/scheduler/jobs' })
    expect(list.statusCode).toBe(200)
    expect(JSON.parse(list.body).data.jobs).toEqual([{ job_code: 'demo_job' }])

    await app.inject({ method: 'POST', url: '/api/admin/scheduler/jobs/demo_job/disable' })
    expect(schedulerService.setEnabled).toHaveBeenLastCalledWith('demo_job', false, 'admin')

    await app.inject({ method: 'POST', url: '/api/admin/scheduler/jobs/demo_job/enable' })
    expect(schedulerService.setEnabled).toHaveBeenLastCalledWith('demo_job', true, 'admin')

    const schedule = await app.inject({
      method: 'PATCH',
      url: '/api/admin/scheduler/jobs/demo_job/schedule',
      payload: { scheduleType: 'fixed_delay', intervalSeconds: 600 },
    })
    expect(schedule.statusCode).toBe(200)
    expect(schedulerService.updateSchedule).toHaveBeenCalledWith('demo_job', { scheduleType: 'fixed_delay', intervalSeconds: 600 }, 'admin')

    const run = await app.inject({ method: 'POST', url: '/api/admin/scheduler/jobs/demo_job/run' })
    expect(run.statusCode).toBe(200)
    expect(schedulerService.runNow).toHaveBeenCalledWith('demo_job', 'admin')

    const runs = await app.inject({ method: 'GET', url: '/api/admin/scheduler/jobs/demo_job/runs?limit=10' })
    expect(runs.statusCode).toBe(200)
    expect(schedulerService.listRuns).toHaveBeenCalledWith('demo_job', 10)

    await app.close()
  })
})
