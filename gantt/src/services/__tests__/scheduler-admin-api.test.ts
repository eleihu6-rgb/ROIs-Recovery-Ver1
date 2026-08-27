import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import {
  disableSchedulerJob,
  enableSchedulerJob,
  fetchSchedulerJobRuns,
  fetchSchedulerJobs,
  runSchedulerJobNow,
  updateSchedulerJobSchedule,
} from '../scheduler-admin-api'

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

describe('scheduler admin api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses live-server scheduler admin endpoints', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ jobs: [] })
    await fetchSchedulerJobs()
    expect(api.get).toHaveBeenCalledWith('/api/admin/scheduler/jobs')

    vi.mocked(api.post).mockResolvedValue({ job: { job_code: 'demo_job' } })
    await disableSchedulerJob('demo_job')
    expect(api.post).toHaveBeenCalledWith('/api/admin/scheduler/jobs/demo_job/disable')

    await enableSchedulerJob('demo_job')
    expect(api.post).toHaveBeenCalledWith('/api/admin/scheduler/jobs/demo_job/enable')

    vi.mocked(api.patch).mockResolvedValue({ job: { job_code: 'demo_job' } })
    await updateSchedulerJobSchedule('demo_job', { scheduleType: 'fixed_delay', intervalSeconds: 300 })
    expect(api.patch).toHaveBeenCalledWith(
      '/api/admin/scheduler/jobs/demo_job/schedule',
      { scheduleType: 'fixed_delay', intervalSeconds: 300 },
    )

    vi.mocked(api.post).mockResolvedValue({ run: { id: '1' } })
    await runSchedulerJobNow('demo_job')
    expect(api.post).toHaveBeenCalledWith('/api/admin/scheduler/jobs/demo_job/run')

    vi.mocked(api.get).mockResolvedValueOnce({ runs: [] })
    await fetchSchedulerJobRuns('demo_job', 25)
    expect(api.get).toHaveBeenCalledWith('/api/admin/scheduler/jobs/demo_job/runs?limit=25')
  })
})
