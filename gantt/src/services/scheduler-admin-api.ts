import { api } from './api'

export type SchedulerScheduleType = 'fixed_delay' | 'cron'
export type SchedulerJobStatus = 'success' | 'failed' | 'running' | 'skipped'
export type SchedulerTriggerType = 'schedule' | 'manual'

export interface SchedulerJob {
  id: string
  service_code?: string
  service_name?: string
  job_code: string
  job_name: string
  job_type: string
  enabled: number
  schedule_type: SchedulerScheduleType
  interval_seconds: number | null
  cron_expr: string | null
  next_run_at: string | null
  last_run_at: string | null
  last_status: SchedulerJobStatus | null
  last_error: string | null
  last_duration_ms: number | null
  locked_at: string | null
  locked_by: string | null
  updated_by: string
  updated_at: string
}

export interface SchedulerRun {
  id: string
  job_code: string
  trigger_type: SchedulerTriggerType
  started_at: string
  finished_at: string | null
  status: SchedulerJobStatus
  duration_ms: number | null
  message: string | null
  error: string | null
  created_by: string
}

export interface SchedulerScheduleInput {
  scheduleType: SchedulerScheduleType
  intervalSeconds?: number
  cronExpr?: string
}

export const fetchSchedulerJobs = (): Promise<{ jobs: SchedulerJob[] }> =>
  api.get('/api/admin/scheduler/jobs') as Promise<{ jobs: SchedulerJob[] }>

export const enableSchedulerJob = (jobCode: string): Promise<{ job: SchedulerJob }> =>
  api.post(`/api/admin/scheduler/jobs/${encodeURIComponent(jobCode)}/enable`) as Promise<{ job: SchedulerJob }>

export const disableSchedulerJob = (jobCode: string): Promise<{ job: SchedulerJob }> =>
  api.post(`/api/admin/scheduler/jobs/${encodeURIComponent(jobCode)}/disable`) as Promise<{ job: SchedulerJob }>

export const updateSchedulerJobSchedule = (
  jobCode: string,
  input: SchedulerScheduleInput,
): Promise<{ job: SchedulerJob }> =>
  api.patch(`/api/admin/scheduler/jobs/${encodeURIComponent(jobCode)}/schedule`, input) as Promise<{ job: SchedulerJob }>

export const runSchedulerJobNow = (jobCode: string): Promise<{ run: SchedulerRun }> =>
  api.post(`/api/admin/scheduler/jobs/${encodeURIComponent(jobCode)}/run`) as Promise<{ run: SchedulerRun }>

export const fetchSchedulerJobRuns = (jobCode: string, limit = 50): Promise<{ runs: SchedulerRun[] }> =>
  api.get(`/api/admin/scheduler/jobs/${encodeURIComponent(jobCode)}/runs?limit=${limit}`) as Promise<{ runs: SchedulerRun[] }>
