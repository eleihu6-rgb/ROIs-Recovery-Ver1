-- ============================================================
-- connector-server — 外部系统对接服务
-- ============================================================

-- ------------------------------------------------------------
-- connector_config — 外部系统连接器配置
-- ------------------------------------------------------------
create table connector_config (
    id               bigint       generated always as identity primary key,
    connector_code   varchar(50)  not null,
    connector_name   varchar(100) not null,
    direction        varchar(20)  not null,
    protocol         varchar(20)  not null,
    data_domain      varchar(20)  not null,
    auth_type        varchar(20)  not null,
    auth_config      jsonb        not null,
    endpoint_config  jsonb        not null,
    schedule_cron    varchar(50),
    transform_plugin varchar(100),
    is_enabled       smallint     not null default 1,
    is_deleted       smallint     not null default 0,
    created_by       varchar(50)  not null,
    created_at       timestamptz  not null default now(),
    updated_by       varchar(50)  not null,
    updated_at       timestamptz  not null default now()
);

create unique index connector_config_connector_code_key on connector_config (connector_code);

comment on table  connector_config                is '外部系统连接器配置，定义与外部系统的连接方式和数据交换规则';
comment on column connector_config.connector_code is '连接器编码，唯一标识一个外部系统连接';
comment on column connector_config.direction      is '数据方向：INBOUND=外部系统→ROIS OUTBOUND=ROIS→外部系统 BIDIRECTIONAL=双向';
comment on column connector_config.protocol       is '通信协议：REST/SOAP/SFTP/FILE/DB/JMS';
comment on column connector_config.data_domain    is '数据域：CREW/PAIRING/FLIGHT/MANDAY/ROSTER/CERTIFICATE';
comment on column connector_config.auth_type      is '认证方式：BASIC/OAUTH2/API_KEY/CERTIFICATE/NONE';
comment on column connector_config.is_deleted     is '取消状态标记：0=正常 1=已取消';

-- ------------------------------------------------------------
-- connector_log — 连接器执行日志
-- ------------------------------------------------------------
create table connector_log (
    id               bigint       generated always as identity primary key,
    connector_id     bigint       not null,
    direction        varchar(20)  not null,
    status           varchar(20)  not null,
    records_in       integer      not null default 0,
    records_out      integer      not null default 0,
    error_message    text,
    duration_ms      integer,
    executed_at      timestamptz  not null default now(),
    sync_id          varchar(36),
    filtered_count   integer      not null default 0,
    rejection_file   varchar(500)
);

create index idx_connector_log_executed_at on connector_log (executed_at);
create index idx_connector_log_sync_id on connector_log (sync_id);

alter table connector_log
    add constraint connector_log_connector_id_fkey
    foreign key (connector_id) references connector_config(id);

comment on table  connector_log                is '外部系统连接器执行日志，记录每次数据同步的详细信息';
comment on column connector_log.connector_id   is '关联 connector_config.id';
comment on column connector_log.status         is '执行状态：SUCCESS/FAILED/PARTIAL/IN_PROGRESS';
comment on column connector_log.records_in     is '从外部系统接收的原始记录数';
comment on column connector_log.records_out    is '处理后写入本系统的记录数';
comment on column connector_log.rejection_file is '被拒绝记录的保存路径（CSV/JSON 格式）';

-- ------------------------------------------------------------
-- scheduler_job — live-server 定时任务配置
-- ------------------------------------------------------------
create table scheduler_job (
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

create index idx_scheduler_job_due
    on scheduler_job (enabled, next_run_at)
    where enabled = 1;

comment on table scheduler_job is 'Central live-server scheduled job registry and runtime state';
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

-- ------------------------------------------------------------
-- scheduler_job_run — 定时任务运行日志
-- ------------------------------------------------------------
create table scheduler_job_run (
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

create index idx_scheduler_job_run_code_started
    on scheduler_job_run (job_code, started_at desc);

comment on table scheduler_job_run is 'Scheduled job execution history';

-- ============================================================
-- end of connector ddl
-- ============================================================
