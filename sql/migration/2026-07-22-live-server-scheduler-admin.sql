-- Date: 2026-07-22
-- Purpose: Add live-server scheduler admin tables.
-- Background: Centralize scheduled jobs so operators can view, enable/disable,
-- change interval/cron cadence, and run jobs manually.
-- Usage: Run under the target live schema search_path, for example f8.

create table if not exists scheduler_job (
    id bigint generated always as identity primary key,
    created_by varchar(30) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamp not null default now(),
    job_code varchar(80) not null,
    job_name varchar(120) not null,
    job_type varchar(30) not null,
    enabled smallint not null default 1,
    schedule_type varchar(20) not null,
    interval_seconds int,
    cron_expr varchar(80),
    last_run_at timestamp,
    last_finished_at timestamp,
    last_status varchar(20),
    last_error text,
    last_duration_ms int,
    next_run_at timestamp,
    locked_at timestamp,
    locked_by varchar(80),
    config_json jsonb not null default '{}'::jsonb,
    constraint uq_scheduler_job_code unique (job_code),
    constraint chk_scheduler_job_enabled check (enabled in (0, 1)),
    constraint chk_scheduler_job_schedule_type check (schedule_type in ('fixed_delay', 'cron')),
    constraint chk_scheduler_job_status check (last_status is null or last_status in ('success', 'failed', 'running', 'skipped')),
    constraint chk_scheduler_job_interval check (schedule_type <> 'fixed_delay' or interval_seconds is not null),
    constraint chk_scheduler_job_cron check (schedule_type <> 'cron' or cron_expr is not null)
);

create index if not exists idx_scheduler_job_due
    on scheduler_job (enabled, next_run_at)
    where enabled = 1;

create table if not exists scheduler_job_run (
    id bigint generated always as identity primary key,
    created_by varchar(30) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamp not null default now(),
    job_code varchar(80) not null,
    trigger_type varchar(20) not null,
    started_at timestamp not null,
    finished_at timestamp,
    status varchar(20) not null,
    duration_ms int,
    message text,
    error text,
    constraint chk_scheduler_job_run_trigger check (trigger_type in ('schedule', 'manual')),
    constraint chk_scheduler_job_run_status check (status in ('success', 'failed', 'running', 'skipped'))
);

create index if not exists idx_scheduler_job_run_code_started
    on scheduler_job_run (job_code, started_at desc);

comment on table scheduler_job is 'Central live-server scheduled job registry and runtime state';
comment on table scheduler_job_run is 'Scheduled job execution history';
comment on column scheduler_job.enabled is '1=enabled, 0=disabled';
comment on column scheduler_job.schedule_type is 'fixed_delay or cron';
comment on column scheduler_job.interval_seconds is 'Fixed delay cadence in seconds';
comment on column scheduler_job.cron_expr is 'Simple five-field cron expression';

insert into scheduler_job (
    job_code, job_name, job_type, enabled, schedule_type, interval_seconds, cron_expr, next_run_at
) values
    (
      'roster_publish_outbound',
      'Roster Publish Outbound Callback',
      'interval',
      1,
      'fixed_delay',
      300,
      null,
      now() + interval '5 minutes'
    ),
    (
      'partition_manager',
      'Partition Manager',
      'bullmq_repeat',
      1,
      'cron',
      null,
      '0 1 1 * *',
      case
        when date_trunc('month', now()) + interval '1 hour' > now()
          then date_trunc('month', now()) + interval '1 hour'
        else date_trunc('month', now() + interval '1 month') + interval '1 hour'
      end
    ),
    (
      'scenario_legality_sweep',
      'Scenario Legality Sweep',
      'bullmq_repeat',
      1,
      'cron',
      null,
      '0 3 * * *',
      case
        when date_trunc('day', now()) + interval '3 hours' > now()
          then date_trunc('day', now()) + interval '3 hours'
        else date_trunc('day', now() + interval '1 day') + interval '3 hours'
      end
    )
on conflict (job_code) do nothing;
