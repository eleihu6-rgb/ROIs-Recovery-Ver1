# Live Server Scheduler Admin

## Requirement

Provide an XXL-JOB-style lightweight scheduler management layer inside `live-server`.

The first version must support:

- Listing scheduled jobs.
- Enabling and disabling jobs.
- Updating the run cadence, especially fixed interval step length.
- Running a job manually.
- Recording latest status and run history.
- Preventing overlapping runs for the same job.

## Scope

- Add `scheduler_job` and `scheduler_job_run` live-schema tables.
- Add a registry that maps known `job_code` values to in-process handlers.
- Add a polling scheduler loop that claims due jobs from `scheduler_job`.
- Add Admin API endpoints under `/api/admin/scheduler`.
- Migrate these jobs into the registry:
  - `roster_publish_outbound`
  - `partition_manager`
  - `scenario_legality_sweep`

## Design

- `scheduler_job.enabled = 0/1` controls stop/start.
- `schedule_type = fixed_delay` uses `interval_seconds`.
- `schedule_type = cron` supports the simple five-field cron shapes currently needed by live-server:
  - `m h * * *`
  - `m h d * *`
- A due job is claimed by setting `last_status = running`, `locked_at`, and `locked_by`.
- On success, the scheduler updates `last_status = success`, records duration, clears the lock, and computes `next_run_at`.
- On failure, the scheduler records the error, clears the lock, and computes the next retry time from the same schedule.
- Manual runs insert a `scheduler_job_run` row with `trigger_type = manual`.

## Initial Jobs

| Job Code | Default Schedule | Handler |
| --- | --- | --- |
| `roster_publish_outbound` | fixed delay, 300 seconds | Flush pending `roster_publish_adjust` batches |
| `partition_manager` | cron `0 1 1 * *` | Enqueue partition manager BullMQ job |
| `scenario_legality_sweep` | cron `0 3 * * *` | Enqueue scenario legality sweep BullMQ job |

## Verification

- Focused Vitest coverage for schedule computation, due-job execution, manual run, and admin routes.
- `npm run build` for `live-server`.
- Execute migration in `f8`, `f8_sit_live`, and `f8_uat_live`.
